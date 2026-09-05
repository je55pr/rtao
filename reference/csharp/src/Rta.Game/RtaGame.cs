using System.Diagnostics;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Rta.Disc;
using Rta.Formats;

namespace Rta.Game;

internal sealed class RtaGame : Microsoft.Xna.Framework.Game
{
    private readonly GraphicsDeviceManager _graphics;
    private readonly GameOptions _options;
    private readonly DebugCamera _camera = new();
    private readonly DebugGrid? _grid;
    private BasicEffect? _effect;
    private AlphaTestEffect? _fieldAlphaEffect;
    private SkyDome? _skyDome;
    private KeyboardState _previousKeyboard;
    private FieldHeader? _fieldHeader;
    private FieldChunkDirectory? _meshChunks;
    private FieldChunkDirectory? _collisionChunks;
    private FieldTexturedMesh? _fieldMesh;
    private FieldRoadMesh? _roadMesh;
    private FieldRoadNetwork? _roadNetwork;
    private CarDebugMesh? _carMesh;
    private WheelDebugMesh? _wheelMesh;
    private Matrix _carWorld = Matrix.Identity;
    private DebugCarController? _carController;
    private FieldSurfaceSampler? _surfaceSampler;
    private FieldCollisionSampler? _collisionSampler;
    private readonly List<TrafficCar> _trafficCars = new();
    private readonly List<CarDebugMesh> _trafficMeshes = new();
    private readonly Dictionary<string, DialogueScript> _residentDialogueScripts = new(StringComparer.OrdinalIgnoreCase);
    private IReadOnlyList<PalFixedInteractionZone> _fixedInteractionZones = Array.Empty<PalFixedInteractionZone>();
    private IReadOnlyList<PalFixedInteractionZone> _debugInteractionZones = Array.Empty<PalFixedInteractionZone>();
    private readonly DialogueFlagStore _dialogueFlags = new();
    private PixelTextRenderer? _ui;
    private DialogueMachine? _dialogue;
    private TrafficCar? _interactionTarget;
    private PalFixedInteractionZone? _fixedInteractionTarget;
    private PalFixedInteractionZone? _activeInterior;
    private Texture2D? _interiorBackdropTexture;
    private InteriorSceneRenderer? _interiorSceneRenderer;
    private CarDebugMesh? _interiorStaffMesh;
    private PalDialogueFlow? _interiorDialogueFlow;
    private readonly PalDialogueRuntimeState _palDialogueRuntimeState = new() { CurrentAreaIndex = PalDialogueDatabase.PeachTownAreaIndex };
    private WorldSimulationState _simulationState = WorldSimulationState.Driving;
    private int _dialogueChoiceIndex;
    private int _interiorChoiceIndex;
    private float _playerInteractionRadius = 1.5f;
    private bool _driveMode;
    private IGameDisc? _disc;
    private PersistentWorldRuntime? _world;
    private WorldDrivingContext? _drivingContext;
    private readonly Dictionary<int, IReadOnlyList<PalFixedInteractionZone>> _interactionZonesByField = new();
    private int _viewFieldNumber = 223;
    private int _drawCount;
    private bool _debugSeamCrossingComplete;
    private int _debugFujiSeamProbeIndex = -1;
    private bool _debugFujiSeamSequenceComplete;
    private bool _renderWholeWorld;

    private static readonly DebugSeamProbe[] FujiRouteSeamProbes =
    [
        // Source-road centres converted to the current reflected local-X convention.
        // Each probe starts 40m inside its source field and drives straight across.
        new(223, 221, new Vector3(960.15f, 31f, 40f), MathHelper.Pi, "Peach north road"),
        new(221, 220, new Vector3(1560f, 5f, 575f), MathHelper.PiOver2, "countryside -> Bridge west/east road"),
        new(220, 113, new Vector3(1389.90f, 25f, 40f), MathHelper.Pi, "Bridge north road -> Fuji")
    ];
    private readonly Stopwatch _performanceClock = Stopwatch.StartNew();
    private TimeSpan _performanceWindowStart;
    private int _performanceWindowFrames;
    private double _lastFramesPerSecond;
    private RenderFrameProfile _lastRenderProfile = new();
    private double _lastUpdateMilliseconds;
    private double _lastWorldDrawMilliseconds;

    public RtaGame(GameOptions options)
    {
        _options = options;
        if (_options.DebugGrid)
            _grid = new DebugGrid(halfExtent: 16, spacing: 100f);
        _renderWholeWorld = options.DebugRenderWholeWorld;
        _graphics = new GraphicsDeviceManager(this)
        {
            PreferredBackBufferWidth = 1280,
            PreferredBackBufferHeight = 720,
            // Xvfb/llvmpipe in the analysis environment exposes OpenGL but no usable
            // multisample framebuffer. Keep the first renderer maximally portable.
            PreferMultiSampling = false,
            SynchronizeWithVerticalRetrace = true
        };
        IsMouseVisible = true;
        Window.AllowUserResizing = true;
        Window.ClientSizeChanged += (_, _) => _camera.Resize(GraphicsDevice.Viewport);
    }

    protected override void Initialize()
    {
        _graphics.ApplyChanges();
        _disc = GameDisc.Open(_options.DiscPath);
        RtaGameIdentity identity = RtaGameIdentity.Read(_disc);
        if (!identity.IsSupportedEuropeanRelease)
            throw new InvalidDataException($"Expected PAL {RtaGameIdentity.ExpectedEuropeanExecutable}; got {identity.BootExecutable}.");

        using (Stream sky = _disc.OpenFile("SYS/SORA.GSL"))
        {
            Hg2SkyTextureSet skyTextures = Hg2SkyTextureReader.Read(sky);
            _skyDome = new SkyDome(GraphicsDevice, skyTextures);
            Console.WriteLine(
                $"Loaded SYS/SORA.GSL: day {skyTextures.DayPanorama.Width}x{skyTextures.DayPanorama.Height} " +
                $"+ night {skyTextures.NightOverlay.Width}x{skyTextures.NightOverlay.Height} panorama assets.");
        }

        var worldLoadStart = DateTime.UtcNow;
        _world = PersistentWorldRuntime.LoadAll(GraphicsDevice, _disc);
        TimeSpan worldLoadTime = DateTime.UtcNow - worldLoadStart;
        _viewFieldNumber = _options.DebugViewField ?? _options.FieldNumber;
        BindCurrentSector(_options.FieldNumber);
        _drivingContext = new WorldDrivingContext(_world, _options.FieldNumber);
        Console.WriteLine($"Persistent outdoor world: {_world.SectorCount} FLD sectors resident, {_world.TotalRenderTriangles:N0} rendered field triangles, loaded in {worldLoadTime.TotalSeconds:0.00}s.");

        const string carPath = "CAR2/Q62.BIN";
        using (Stream car = _disc.OpenFile(carPath))
        {
            CarFileHeader carHeader = CarFile.ReadHeader(car);
            IReadOnlyList<CarRenderPrimitive> carPrimitives = CarRenderPrimitiveReader.ReadPrimaryBody(car, carHeader);
            IReadOnlyDictionary<ushort, FieldTextureUpload> carUploads = FieldTextureUploadReader.ReadUploads(car, carHeader.TextureOffset, carHeader.TextureLength);
            _carMesh = new CarDebugMesh(GraphicsDevice, carPrimitives, carUploads);
            _playerInteractionRadius = _carMesh.LocalRadiusXZ;

            const float sourceSpawnX = 448f;
            const float spawnZ = 555f;
            float spawnX = RtaWorldCoordinates.FieldExtent - sourceSpawnX;
            float spawnY = _surfaceSampler is not null && _surfaceSampler.TrySampleHighest(spawnX, spawnZ, out float roadY) ? roadY : 31f;
            _carController = new DebugCarController(_drivingContext, new Vector3(spawnX, spawnY, spawnZ), yaw: RtaWorldCoordinates.Yaw(0.10f));
            _carWorld = _carController.World;
            Console.WriteLine($"Loaded {carPath}: {carPrimitives.Count:N0} strips -> {_carMesh.TriangleCount:N0} triangles; spawn FLD/{_options.FieldNumber:D3} ({spawnX:0.0}, {spawnY:0.0}, {spawnZ:0.0}).");
        }

        const string tirePath = "CARS/TIRE.BIN";
        using (Stream tire = _disc.OpenFile(tirePath))
        {
            Hg2ObjectFileHeader tireHeader = Hg2ObjectFile.ReadHeader(tire);
            IReadOnlyList<CarRenderPrimitive> frontLeftWheel = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 0);
            IReadOnlyList<CarRenderPrimitive> frontRightWheel = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 1);
            IReadOnlyList<CarRenderPrimitive> rearPair = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 2);

            uint textureOffset = tireHeader.Offsets[^2];
            uint textureLength = tireHeader.EndOffset - textureOffset;
            IReadOnlyDictionary<ushort, FieldTextureUpload> tireUploads = FieldTextureUploadReader.ReadUploads(tire, textureOffset, textureLength);
            _wheelMesh = new WheelDebugMesh(GraphicsDevice, frontLeftWheel, frontRightWheel, rearPair, tireUploads);
            Console.WriteLine($"Loaded {tirePath}: original front/rear world-wheel meshes -> {_wheelMesh.TriangleCount:N0} triangles.");
        }

        LoadPersistentInteractionCatalogue();
        LoadPersistentResidentCatalogue();
        if (_options.DebugWorldFastForwardSeconds > 0f)
            FastForwardPersistentResidents(_options.DebugWorldFastForwardSeconds);
        BindCurrentSector(_options.FieldNumber);
        Console.WriteLine($"Persistent actors: {_trafficCars.Count:N0} standard-world outdoor definitions ({_trafficCars.Count(car => car.HasRoamingRoute):N0} ordinary moving routes) loaded from SLES_513.56.");

        if (_options.DebugSeamCrossing && _carController is not null && _drivingContext is not null)
        {
            // FLD/223 road ribbon #2 reaches local X=1600 at Z~637. FLD/222
            // continues the same authored ribbon from local X=0 at the same Z, making
            // this an unusually clean deterministic proof of seamless field traversal.
            const int seamField = 223;
            const float seamStartX = 1560f;
            const float seamZ = 637f;
            Vector3 seamStart = new(seamStartX, 31f, seamZ);
            if (_drivingContext.TrySampleGround(seamStart, seamStart.Y, out float seamY))
                seamStart.Y = seamY;
            _carController.Teleport(seamField, seamStart, MathHelper.PiOver2);
            BindCurrentSector(seamField);
            _viewFieldNumber = seamField;
            _carWorld = _carController.World;
            Console.WriteLine($"Debug seam drive armed: FLD/223 road ({seamStart.X:0.0}, {seamStart.Y:0.0}, {seamStart.Z:0.0}) -> FLD/222, automatic throttle.");
        }
        else if (_options.DebugFujiRouteSeams && _carController is not null && _drivingContext is not null)
        {
            _debugFujiSeamProbeIndex = 0;
            ArmFujiRouteSeamProbe();
        }

        if (!string.IsNullOrWhiteSpace(_options.DebugNearResident) && _carController is not null && _surfaceSampler is not null)
        {
            TrafficCar target = CurrentFieldTraffic().FirstOrDefault(car => string.Equals(car.Name, _options.DebugNearResident, StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidDataException($"Debug-near resident '{_options.DebugNearResident}' is not loaded in this field.");
            Vector3 player = target.Position - target.Forward * (_playerInteractionRadius + target.InteractionRadius + 1.0f);
            if (_surfaceSampler.TrySampleClosest(player.X, player.Z, target.Position.Y, out float playerY))
                player.Y = playerY;
            _carController.Teleport(target.FieldNumber, player, target.Yaw);
            BindCurrentSector(target.FieldNumber);
            _viewFieldNumber = target.FieldNumber;
            _carWorld = _carController.World;
            Console.WriteLine($"Debug player placed near {target.Name}: FLD/{target.FieldNumber:D3} ({player.X:0.0}, {player.Y:0.0}, {player.Z:0.0}).");
        }
        if (!string.IsNullOrWhiteSpace(_options.DebugNearFixedInteraction) && _carController is not null && _surfaceSampler is not null)
        {
            PalFixedInteractionZone target = _fixedInteractionZones.FirstOrDefault(zone =>
                string.Equals(zone.ResidentName, _options.DebugNearFixedInteraction, StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidDataException($"Debug fixed interaction '{_options.DebugNearFixedInteraction}' is not loaded in this field.");
            System.Numerics.Vector2 center = target.Center;
            Vector3 player = new(RtaWorldCoordinates.FieldExtent - center.X, 31f, center.Y);
            if (_surfaceSampler.TrySampleHighest(player.X, player.Z, out float playerY))
                player.Y = playerY;
            _carController.Teleport(_viewFieldNumber, player, _carController.Yaw);
            _carWorld = _carController.World;
            _fixedInteractionTarget = target;
            Console.WriteLine($"Debug player placed in fixed interaction {target.LocalResidentIndex:D2} {target.ResidentName}: ({player.X:0.0}, {player.Y:0.0}, {player.Z:0.0}).");
        }
        if (_options.DebugInteriorIndex is int debugInteriorIndex)
        {
            PalFixedInteractionZone? target = _fixedInteractionZones.FirstOrDefault(zone => zone.LocalResidentIndex == debugInteriorIndex);
            StartInterior(debugInteriorIndex, target, debugForced: true);
        }

        if (!string.IsNullOrWhiteSpace(_options.DebugDialogueResident))
        {
            TrafficCar target = CurrentFieldTraffic().FirstOrDefault(car => string.Equals(car.Name, _options.DebugDialogueResident, StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidDataException($"Debug dialogue resident '{_options.DebugDialogueResident}' is not loaded in this field.");
            StartDialogue(target, debugForced: true);
        }

        UpdateWindowTitle();
        base.Initialize();
        _camera.Resize(GraphicsDevice.Viewport);
        _driveMode = _options.CameraPosition is null && _options.DebugViewField is null;
        if (_options.CameraPosition is not null)
            _camera.SetPose(_options.CameraPosition.Value, _options.CameraYaw, _options.CameraPitch);
        else if (_options.DebugViewField is not null)
            _camera.SetPose(new Vector3(800f, 220f, 950f), yaw: 0f, pitch: -0.32f);
        else if (_carController is not null)
            UpdateChaseCamera();
        Console.WriteLine("Controls: W/S throttle/reverse, A/D steer, hold Shift for 5x developer speed boost, E talk/enter/advance, Escape leave dialogue/interior, arrows choose, F2 drive/free camera, F3 cycle Peach/Fuji/White/Papaya spectator, F4 toggle all-64-field rendering.");
    }

    protected override void LoadContent()
    {
        _effect = new BasicEffect(GraphicsDevice)
        {
            VertexColorEnabled = true,
            TextureEnabled = true,
            LightingEnabled = false,
            World = Matrix.Identity
        };
        _fieldAlphaEffect = new AlphaTestEffect(GraphicsDevice)
        {
            VertexColorEnabled = true,
            AlphaFunction = CompareFunction.Greater,
            ReferenceAlpha = 0,
            World = Matrix.Identity
        };
        _ui = new PixelTextRenderer(GraphicsDevice);
    }

    protected override void Update(GameTime gameTime)
    {
        long updateStart = Stopwatch.GetTimestamp();
        KeyboardState keyboard = Keyboard.GetState();

        if (_simulationState == WorldSimulationState.Interior)
        {
            if (Pressed(keyboard, Keys.Escape))
            {
                EndInterior();
            }
            else
            {
                UpdateInteriorInput(keyboard);
            }

            // Indoor/fixed-interaction screens replace the overworld. Preserve the
            // world exactly until the player returns.
            _previousKeyboard = keyboard;
            base.Update(gameTime);
            _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
            return;
        }

        if (_simulationState == WorldSimulationState.Dialogue)
        {
            if (keyboard.IsKeyDown(Keys.Escape))
            {
                EndDialogue();
            }
            else if (_options.DebugDialogueCloseFrame is int closeFrame && _drawCount >= closeFrame)
            {
                Console.WriteLine($"Debug dialogue auto-close at frame {_drawCount}.");
                EndDialogue();
            }
            else
            {
                UpdateDialogueInput(keyboard);
            }

            // Dialogue is a true global overworld pause: do not advance player,
            // roaming residents, wheel spin, route indices or free-camera simulation.
            _previousKeyboard = keyboard;
            base.Update(gameTime);
            _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
            return;
        }

        if (Pressed(keyboard, Keys.Escape))
        {
            Exit();
            _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
            return;
        }

        if (Pressed(keyboard, Keys.F1))
        {
            Console.WriteLine($"Camera: {_camera.Position}");
            Console.WriteLine($"Field sections: {_fieldHeader?.Sections.Count}, render chunks: {_meshChunks?.TotalChunkCount}, collision chunks: {_collisionChunks?.TotalChunkCount}");
            Console.WriteLine($"Decoded debug mesh: {_fieldMesh?.TriangleCount:N0} triangles");
            if (_carController is not null)
                Console.WriteLine($"Car: {_carController.Position}, yaw {_carController.Yaw:0.000}, speed {_carController.Speed:0.0} m/s, steer {_carController.SteeringAngle:0.00}, wheel {_carController.WheelSpin:0.00}, surface {_carController.CurrentDrivingSurface} / flags 0x{_carController.CurrentSurfaceFlags:X8}");
            Console.WriteLine($"Persistent actors: {_trafficCars.Count:N0} total; current FLD/{_carController?.CurrentFieldNumber ?? _viewFieldNumber:D3}:");
            foreach (TrafficCar traffic in CurrentFieldTraffic())
                Console.WriteLine($"Traffic {traffic.Name,-14}: {traffic.Position}, next route point {traffic.NextRoutePointIndex}, speed {traffic.Speed:0.0} m/s");
        }

        if (Pressed(keyboard, Keys.F2))
        {
            _driveMode = !_driveMode;
            if (_driveMode && _carController is not null)
            {
                _viewFieldNumber = _carController.CurrentFieldNumber;
                UpdateChaseCamera();
            }
            Console.WriteLine(_driveMode ? "Drive camera enabled." : $"Free camera enabled in FLD/{_viewFieldNumber:D3}.");
        }

        if (Pressed(keyboard, Keys.F3))
        {
            CycleWorldSpectator();
        }

        if (Pressed(keyboard, Keys.F4))
        {
            _renderWholeWorld = !_renderWholeWorld;
            Console.WriteLine(_renderWholeWorld
                ? "Whole-world rendering enabled: all 64 resident FLDs are candidates; camera-frustum culling remains active."
                : "Whole-world rendering disabled: nearby-sector rendering restored.");
            UpdateWindowTitle();
        }

        _interactionTarget = FindInteractionTarget();
        _fixedInteractionTarget = FindFixedInteractionTarget();
        if (Pressed(keyboard, Keys.E))
        {
            if (_interactionTarget is not null)
            {
                StartDialogue(_interactionTarget, debugForced: false);
                _previousKeyboard = keyboard;
                base.Update(gameTime);
                _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
                return;
            }
            if (_fixedInteractionTarget is not null)
            {
                StartInterior(_fixedInteractionTarget.LocalResidentIndex, _fixedInteractionTarget, debugForced: false);
                _previousKeyboard = keyboard;
                base.Update(gameTime);
                _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
                return;
            }
        }

        float dt = Math.Min(0.05f, (float)gameTime.ElapsedGameTime.TotalSeconds);
        foreach (TrafficCar trafficCar in _trafficCars)
            trafficCar.Update(dt, ShouldGroundResident(trafficCar.FieldNumber));

        if (_driveMode && _carController is not null)
        {
            int previousField = _carController.CurrentFieldNumber;
            float previousSpeed = _carController.Speed;
            bool automaticSeamThrottle =
                (_options.DebugSeamCrossing && !_debugSeamCrossingComplete) ||
                (_options.DebugFujiRouteSeams && !_debugFujiSeamSequenceComplete);
            KeyboardState drivingKeyboard = automaticSeamThrottle
                ? new KeyboardState(Keys.W)
                : keyboard;
            _carController.Update(gameTime, drivingKeyboard);
            int currentField = _carController.CurrentFieldNumber;
            if (currentField != previousField)
            {
                BindCurrentSector(currentField);
                _viewFieldNumber = currentField;
                UpdateWindowTitle();
                WorldSectorTopology.SectorAddress address = WorldSectorTopology.FromFieldNumber(currentField);
                Console.WriteLine($"Seamless sector crossing: FLD/{previousField:D3} -> FLD/{currentField:D3} [{address.Column},{address.Row}], local ({_carController.Position.X:0.0}, {_carController.Position.Z:0.0}), speed {previousSpeed:0.00}->{_carController.Speed:0.00} m/s.");
                if (_options.DebugSeamCrossing && previousField == 223 && currentField == 222)
                {
                    _debugSeamCrossingComplete = true;
                    Console.WriteLine("DEBUG SEAM PASS: Q62 crossed the authored Peach FLD/223 -> FLD/222 road seam without a load/reset.");
                }
                if (_options.DebugFujiRouteSeams && !_debugFujiSeamSequenceComplete)
                {
                    DebugSeamProbe probe = FujiRouteSeamProbes[_debugFujiSeamProbeIndex];
                    if (previousField == probe.FromField && currentField == probe.ToField)
                    {
                        Console.WriteLine($"DEBUG FUJI SEAM PASS {_debugFujiSeamProbeIndex + 1}/{FujiRouteSeamProbes.Length}: FLD/{probe.FromField:D3} -> FLD/{probe.ToField:D3} ({probe.Label}) without a load/reset.");
                        _debugFujiSeamProbeIndex++;
                        if (_debugFujiSeamProbeIndex >= FujiRouteSeamProbes.Length)
                        {
                            _debugFujiSeamSequenceComplete = true;
                            Console.WriteLine("DEBUG FUJI SEAM MATRIX PASS: all three Peach -> 221 -> Bridge -> Fuji route boundaries crossed under vehicle collision.");
                        }
                        else
                        {
                            ArmFujiRouteSeamProbe();
                            currentField = _carController.CurrentFieldNumber;
                        }
                    }
                    else if (previousField == probe.FromField)
                    {
                        throw new InvalidDataException(
                            $"Debug Fuji seam probe expected FLD/{probe.FromField:D3} -> FLD/{probe.ToField:D3}, but entered FLD/{currentField:D3}.");
                    }
                }
            }
            _viewFieldNumber = currentField;
            _carWorld = _carController.World;
            UpdateChaseCamera();
        }
        else
        {
            _camera.Update(gameTime);
        }

        _interactionTarget = FindInteractionTarget();
        _fixedInteractionTarget = FindFixedInteractionTarget();
        _previousKeyboard = keyboard;
        base.Update(gameTime);
        _lastUpdateMilliseconds = Stopwatch.GetElapsedTime(updateStart).TotalMilliseconds;
    }

    protected override void Draw(GameTime gameTime)
    {
        long worldDrawStart = Stopwatch.GetTimestamp();
        if (_drawCount == 0 && _performanceWindowFrames == 0)
            _performanceWindowStart = _performanceClock.Elapsed;

        var frameProfile = new RenderFrameProfile();
        GraphicsDevice.Clear(_simulationState == WorldSimulationState.Interior ? Color.Black : new Color(28, 31, 36));
        if (_simulationState != WorldSimulationState.Interior && _skyDome is not null)
            _skyDome.Draw(GraphicsDevice, _camera.View, _camera.Projection, _camera.Position);

        GraphicsDevice.DepthStencilState = DepthStencilState.Default;
        GraphicsDevice.BlendState = BlendState.NonPremultiplied;
        GraphicsDevice.RasterizerState = RasterizerState.CullNone;

        if (_simulationState == WorldSimulationState.Interior)
        {
            DrawInteriorBackdrop();
        }
        else if (_effect is not null)
        {
            _effect.View = _camera.View;
            _effect.Projection = _camera.Projection;
            if (_fieldAlphaEffect is not null)
            {
                _fieldAlphaEffect.View = _camera.View;
                _fieldAlphaEffect.Projection = _camera.Projection;
            }
            var frustum = new BoundingFrustum(_camera.View * _camera.Projection);
            if (_world is not null)
            {
                WorldSectorRuntime[] visibleSectors = (_renderWholeWorld
                    ? _world.Sectors.Values
                    : _world.VisibleFrom(_viewFieldNumber)).ToArray();
                frameProfile.CandidateSectors += visibleSectors.Length;
                var drawnSectorNumbers = new HashSet<int>();
                float animationTimeSeconds = (float)gameTime.TotalGameTime.TotalSeconds;

                // This ordering is frame-global, not sector-local. A transparent edge
                // may write depth, so every opaque hill/building from every visible FLD
                // must exist before the first cutout/translucent sample is submitted.
                // This matters especially near persistent-world seams where the card is
                // in one FLD and its visual background is authored in its neighbour.
                foreach (FieldRenderPhase phase in new[] { FieldRenderPhase.Opaque, FieldRenderPhase.Alpha })
                {
                    foreach (WorldSectorRuntime sector in visibleSectors)
                    {
                        FieldDrawStats fieldStats = sector.DrawPhase(
                            GraphicsDevice, _effect, _fieldAlphaEffect, _camera.Position, _viewFieldNumber, frustum,
                            animationTimeSeconds, phase);
                        frameProfile.FieldStats.Add(fieldStats);
                        if (fieldStats.DrawCalls > 0)
                            drawnSectorNumbers.Add(sector.FieldNumber);
                    }
                }
                frameProfile.DrawnSectors += drawnSectorNumbers.Count;
            }

            foreach (TrafficCar trafficCar in _trafficCars)
            {
                System.Numerics.Vector2 sectorOffset = ReflectedWorldSectorTopology.RelativeRenderTranslation(_viewFieldNumber, trafficCar.FieldNumber);
                if (!_renderWholeWorld && (MathF.Abs(sectorOffset.X) > 3400f || MathF.Abs(sectorOffset.Y) > 3400f))
                    continue;
                Matrix trafficWorld = trafficCar.World * Matrix.CreateTranslation(sectorOffset.X, 0f, sectorOffset.Y);
                CarDebugMesh trafficMesh = _trafficMeshes[trafficCar.ModelIndex];
                var trafficBounds = new BoundingSphere(trafficWorld.Translation, MathF.Max(2f, trafficMesh.LocalRadiusXZ + 1f));
                frameProfile.CandidateTrafficCars++;
                if (frustum.Contains(trafficBounds) == ContainmentType.Disjoint)
                    continue;
                frameProfile.DrawnTrafficCars++;
                trafficMesh.Draw(GraphicsDevice, _effect, trafficWorld);
                _wheelMesh?.Draw(GraphicsDevice, _effect, trafficWorld, trafficCar.SteeringAngle, trafficCar.WheelSpin);
                frameProfile.OtherDrawCalls += trafficMesh.DrawCallCount + (_wheelMesh?.DrawCallCount ?? 0);
            }

            if (_carController is not null)
            {
                System.Numerics.Vector2 playerOffset = ReflectedWorldSectorTopology.RelativeRenderTranslation(_viewFieldNumber, _carController.CurrentFieldNumber);
                Matrix playerWorld = _carWorld * Matrix.CreateTranslation(playerOffset.X, 0f, playerOffset.Y);
                float radius = MathF.Max(2f, (_carMesh?.LocalRadiusXZ ?? 1f) + 1f);
                if (frustum.Contains(new BoundingSphere(playerWorld.Translation, radius)) != ContainmentType.Disjoint)
                {
                    _carMesh?.Draw(GraphicsDevice, _effect, playerWorld);
                    _wheelMesh?.Draw(GraphicsDevice, _effect, playerWorld, _carController.SteeringAngle, _carController.WheelSpin);
                    frameProfile.OtherDrawCalls += (_carMesh?.DrawCallCount ?? 0) + (_wheelMesh?.DrawCallCount ?? 0);
                }
            }
            if (_grid is not null)
            {
                _grid.Draw(GraphicsDevice, _effect);
                frameProfile.OtherDrawCalls++;
            }
        }

        _lastRenderProfile = frameProfile;
        _lastWorldDrawMilliseconds = Stopwatch.GetElapsedTime(worldDrawStart).TotalMilliseconds;
        UpdatePerformanceProfile();
        DrawOverlay();
        base.Draw(gameTime);

        _drawCount++;
        if (_options.ScreenshotPath is not null && _drawCount >= _options.ScreenshotFrame)
        {
            Console.WriteLine($"  snapshot simulation state: {_simulationState}");
            foreach (TrafficCar traffic in _trafficCars.Where(car => car.FieldNumber == _viewFieldNumber))
                Console.WriteLine($"  snapshot FLD/{traffic.FieldNumber:D3} {traffic.Name,-14}: ({traffic.Position.X:0.0}, {traffic.Position.Y:0.0}, {traffic.Position.Z:0.0}) -> route[{traffic.NextRoutePointIndex}]");
            SaveScreenshot(_options.ScreenshotPath);
            Exit();
        }
    }

    private void UpdatePerformanceProfile()
    {
        _performanceWindowFrames++;
        TimeSpan now = _performanceClock.Elapsed;
        double elapsedSeconds = (now - _performanceWindowStart).TotalSeconds;
        if (elapsedSeconds < 1.0)
            return;

        _lastFramesPerSecond = _performanceWindowFrames / elapsedSeconds;
        Console.WriteLine(
            $"PERF {_lastFramesPerSecond,5:0.0} fps | sectors {_lastRenderProfile.DrawnSectors}/{_lastRenderProfile.CandidateSectors} | " +
            $"field batches {_lastRenderProfile.FieldStats.DrawCalls:N0}/{_lastRenderProfile.FieldStats.CandidateBatches:N0} " +
            $"({_lastRenderProfile.FieldStats.CulledBatches:N0} culled) | field tris {_lastRenderProfile.FieldStats.DrawnTriangles:N0} | " +
            $"cars {_lastRenderProfile.DrawnTrafficCars}/{_lastRenderProfile.CandidateTrafficCars} | " +
            $"draw calls ~{_lastRenderProfile.TotalDrawCalls:N0} | " +
            $"CPU update {_lastUpdateMilliseconds:0.00} ms / submit {_lastWorldDrawMilliseconds:0.00} ms");
        UpdateWindowTitle();

        _performanceWindowFrames = 0;
        _performanceWindowStart = now;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            foreach (CarDebugMesh mesh in _trafficMeshes) mesh.Dispose();
            _wheelMesh?.Dispose();
            _carMesh?.Dispose();
            _world?.Dispose();
            _skyDome?.Dispose();
            _interiorStaffMesh?.Dispose();
            _interiorSceneRenderer?.Dispose();
            _interiorBackdropTexture?.Dispose();
            _ui?.Dispose();
            _effect?.Dispose();
            _disc?.Dispose();
        }
        base.Dispose(disposing);
    }


    private void LoadPersistentInteractionCatalogue()
    {
        if (_disc is null)
            return;

        using Stream executable = _disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
        var zonesByField = new Dictionary<int, List<PalFixedInteractionZone>>();
        int totalZones = 0;
        for (int areaIndex = 1; areaIndex < PalOverworldInteractionZones.AuthoredAreaCount; areaIndex++)
        {
            PalOverworldAreaDescriptor descriptor = PalOverworldInteractionZones.ReadAreaDescriptor(executable, areaIndex);
            int fieldNumber = WorldSectorTopology.ResolveDescriptorFieldNumber(descriptor);
            if (fieldNumber < 0 || descriptor.FixedInteractionCount == 0)
                continue;

            IReadOnlyList<PalFixedInteractionZone> zones = PalOverworldInteractionZones.ReadZones(executable, areaIndex);
            if (!zonesByField.TryGetValue(fieldNumber, out List<PalFixedInteractionZone>? list))
            {
                list = new List<PalFixedInteractionZone>();
                zonesByField.Add(fieldNumber, list);
            }
            list.AddRange(zones);
            totalZones += zones.Count;
        }

        _interactionZonesByField.Clear();
        foreach ((int field, List<PalFixedInteractionZone> zones) in zonesByField)
            _interactionZonesByField[field] = zones;
        Console.WriteLine($"Persistent fixed interactions: {totalZones:N0} authored zones mapped into {_interactionZonesByField.Count:N0} standard world sectors.");
    }

    private void LoadPersistentResidentCatalogue()
    {
        if (_disc is null || _world is null)
            return;

        using Stream executable = _disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
        HashSet<string> peachInteractiveNames = PalOverworldRoamingRoutes.ReadPeachTownRoamingResidents(executable)
            .Select(resident => resident.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        for (int areaIndex = 0; areaIndex < PalOverworldInteractionZones.AuthoredAreaCount; areaIndex++)
        {
            PalOverworldAreaDescriptor descriptor = PalOverworldInteractionZones.ReadAreaDescriptor(executable, areaIndex);
            if (descriptor.OutdoorResidentCount == 0)
                continue;

            int fieldNumber = WorldSectorTopology.ResolveDescriptorFieldNumber(descriptor);
            if (fieldNumber < 0 || !_world.Sectors.ContainsKey(fieldNumber))
            {
                Console.WriteLine($"  resident area {areaIndex:D2} {descriptor.Name}: special field code {descriptor.AreaCode}; kept outside the 64-sector runtime for now.");
                continue;
            }

            WorldSectorRuntime sector = _world.GetSector(fieldNumber);
            IReadOnlyList<PalOutdoorResidentDefinition> residents = PalOverworldRoamingRoutes.ReadOutdoorResidents(executable, areaIndex);
            foreach (PalOutdoorResidentDefinition resident in residents)
            {
                string path = CarPath(resident.BodyId);
                using Stream car = _disc.OpenFile(path);
                CarFileHeader header = CarFile.ReadHeader(car);
                IReadOnlyList<CarRenderPrimitive> primitives = CarRenderPrimitiveReader.ReadPrimaryBody(car, header);
                IReadOnlyDictionary<ushort, FieldTextureUpload> uploads = FieldTextureUploadReader.ReadUploads(car, header.TextureOffset, header.TextureLength);
                var trafficMesh = new CarDebugMesh(
                    GraphicsDevice,
                    primitives,
                    uploads,
                    ToColor(resident.Paint.Primary),
                    ToColor(resident.Paint.Secondary));
                int modelIndex = _trafficMeshes.Count;
                _trafficMeshes.Add(trafficMesh);

                Vector3 sourceSpawn = new(resident.Spawn.Position.X, resident.Spawn.Position.Y, resident.Spawn.Position.Z);
                Vector3 spawn = RtaWorldCoordinates.Position(sourceSpawn.X, sourceSpawn.Y, sourceSpawn.Z);
                if (sector.Surface.TrySampleClosest(spawn.X, spawn.Z, spawn.Y, out float spawnY))
                    spawn.Y = spawnY;

                var route = new Vector3[resident.Route.Points.Count];
                int unresolved = 0;
                for (int pointIndex = 0; pointIndex < resident.Route.Points.Count; pointIndex++)
                {
                    System.Numerics.Vector2 center = resident.Route.Points[pointIndex].Center;
                    float worldX = RtaWorldCoordinates.FieldExtent - center.X;
                    float worldZ = center.Y;
                    if (!sector.Surface.TrySampleHighest(worldX, worldZ, out float y))
                    {
                        unresolved++;
                        y = spawn.Y;
                    }
                    route[pointIndex] = new Vector3(worldX, y, worldZ);
                }

                float speed = route.Length >= 2 ? 6.5f + (resident.LocalOutdoorIndex % 3) * 0.6f : 0f;
                _trafficCars.Add(new TrafficCar(
                    resident.Name, route, spawn, speed, modelIndex, trafficMesh.LocalRadiusXZ, sector.Surface, fieldNumber, areaIndex));

                if (areaIndex == PalOverworldRoamingRoutes.PeachTownRouteAreaIndex && peachInteractiveNames.Contains(resident.Name))
                {
                    PalDialogueEntity entity = PalDialogueDatabase.ReadPeachTownEntity(executable, resident.Name);
                    PalDialogueVariant greeting = entity.GetFallbackGreeting();
                    _residentDialogueScripts[resident.Name] = BuildTextScript(resident.Name, greeting.Pages);
                }

                Console.WriteLine($"  actor A{areaIndex:D2}/{resident.LocalOutdoorIndex:D2} {resident.Name,-14} FLD/{fieldNumber:D3} Q{resident.BodyId:D3}: {route.Length,3} route points, unresolved heights {unresolved}.");
            }
        }
    }

    private void FastForwardPersistentResidents(float seconds)
    {
        const float step = 0.05f;
        int iterations = (int)MathF.Ceiling(seconds / step);
        for (int i = 0; i < iterations; i++)
        {
            float dt = MathF.Min(step, seconds - i * step);
            if (dt <= 0f)
                break;
            foreach (TrafficCar traffic in _trafficCars)
                traffic.Update(dt, sampleGround: false);
        }
        Console.WriteLine($"Debug persistent simulation fast-forwarded {seconds:0.##} seconds before the first rendered frame.");
    }

    private bool ShouldGroundResident(int fieldNumber)
    {
        // Route progress is simulated for every resident in the world every update.
        // Fine terrain grounding is presentation detail: HG2's decoded route points
        // already carry sampled ground Y, so remote cars can interpolate those values
        // until an observer/player is near their sector. This keeps the persistent
        // world cheap even in Debug builds and maps naturally to future multiplayer
        // interest regions.
        if (IsNearField(_viewFieldNumber, fieldNumber))
            return true;
        int playerField = _carController?.CurrentFieldNumber ?? _viewFieldNumber;
        return playerField != _viewFieldNumber && IsNearField(playerField, fieldNumber);
    }

    private static bool IsNearField(int originFieldNumber, int targetFieldNumber, float radius = 500f)
    {
        System.Numerics.Vector2 offset = ReflectedWorldSectorTopology.RelativeRenderTranslation(originFieldNumber, targetFieldNumber);
        float nearestX = MathF.Max(0f, MathF.Abs(offset.X) - WorldSectorTopology.FieldExtent);
        float nearestZ = MathF.Max(0f, MathF.Abs(offset.Y) - WorldSectorTopology.FieldExtent);
        return nearestX * nearestX + nearestZ * nearestZ <= radius * radius;
    }

    private void BindCurrentSector(int fieldNumber)
    {
        if (_world is null)
            return;
        WorldSectorRuntime sector = _world.GetSector(fieldNumber);
        _fieldHeader = sector.Header;
        _meshChunks = sector.MeshChunks;
        _collisionChunks = sector.CollisionChunks;
        _surfaceSampler = sector.Surface;
        _collisionSampler = sector.Collision;
        _roadNetwork = sector.Roads;
        _fieldMesh = sector.Mesh;
        _roadMesh = sector.RoadMesh;
        _fixedInteractionZones = _interactionZonesByField.GetValueOrDefault(fieldNumber, Array.Empty<PalFixedInteractionZone>());
        _debugInteractionZones = _options.DebugInteractionZones ? _fixedInteractionZones : Array.Empty<PalFixedInteractionZone>();
    }

    private IEnumerable<TrafficCar> CurrentFieldTraffic()
    {
        int field = _carController?.CurrentFieldNumber ?? _viewFieldNumber;
        return _trafficCars.Where(car => car.FieldNumber == field);
    }

    private void UpdateWindowTitle()
    {
        int playerField = _carController?.CurrentFieldNumber ?? _viewFieldNumber;
        int field = _driveMode ? playerField : _viewFieldNumber;
        WorldSectorTopology.SectorAddress address = WorldSectorTopology.FromFieldNumber(field);
        string observer = field == playerField ? string.Empty : $" — player FLD/{playerField:D3}";
        string playerPosition = _carController is null
            ? string.Empty
            : $" — car X{_carController.Position.X:0} Z{_carController.Position.Z:0}";
        string drawMode = _renderWholeWorld ? " — ALL 64 FLDs" : string.Empty;
        string performance = _lastFramesPerSecond > 0 ? $" — {_lastFramesPerSecond:0} FPS" : string.Empty;
        Window.Title = $"Road Trip Adventure MonoGame — persistent world — view FLD/{field:D3} [{address.Column},{address.Row}]{observer}{playerPosition}{drawMode}{performance}";
    }

    private sealed class RenderFrameProfile
    {
        public int CandidateSectors { get; set; }
        public int DrawnSectors { get; set; }
        public int CandidateTrafficCars { get; set; }
        public int DrawnTrafficCars { get; set; }
        public int OtherDrawCalls { get; set; }
        public FieldDrawStats FieldStats { get; } = new();
        public int TotalDrawCalls => FieldStats.DrawCalls + OtherDrawCalls;
    }

    private void CycleWorldSpectator()
    {
        int[] showcaseFields = [223, 113, 203, 233];
        int index = Array.IndexOf(showcaseFields, _viewFieldNumber);
        _viewFieldNumber = showcaseFields[(index + 1 + showcaseFields.Length) % showcaseFields.Length];
        _driveMode = false;
        _camera.SetPose(new Vector3(800f, 220f, 950f), yaw: 0f, pitch: -0.32f);
        int residentCount = _trafficCars.Count(car => car.FieldNumber == _viewFieldNumber);
        Console.WriteLine($"Persistent-world spectator: FLD/{_viewFieldNumber:D3}, {residentCount} resident definitions currently simulating here. F2 returns to the player.");
        UpdateWindowTitle();
    }

    private static Color ToColor(PalRgb value) => new(value.R, value.G, value.B);

    private CarDebugMesh LoadCarMesh(int bodyId, Color primaryPaint, Color secondaryPaint)
    {
        if (_disc is null)
            throw new InvalidOperationException("Game disc is not loaded.");

        string path = CarPath(bodyId);
        using Stream car = _disc.OpenFile(path);
        CarFileHeader header = CarFile.ReadHeader(car);
        IReadOnlyList<CarRenderPrimitive> primitives = CarRenderPrimitiveReader.ReadPrimaryBody(car, header);
        IReadOnlyDictionary<ushort, FieldTextureUpload> uploads =
            FieldTextureUploadReader.ReadUploads(car, header.TextureOffset, header.TextureLength);
        return new CarDebugMesh(GraphicsDevice, primitives, uploads, primaryPaint, secondaryPaint);
    }

    private static string CarPath(int id) => id switch
    {
        < 30 => $"CAR0/Q{id:D2}.BIN",
        < 60 => $"CAR1/Q{id:D2}.BIN",
        < 90 => $"CAR2/Q{id:D2}.BIN",
        < 120 => $"CAR3/Q{id:D2}.BIN",
        < 150 => $"CAR4/Q{id:D3}.BIN",
        150 => "CARS/Q150.BIN",
        _ => throw new ArgumentOutOfRangeException(nameof(id))
    };

    private TrafficCar? FindInteractionTarget()
    {
        if (!_driveMode || _carController is null || MathF.Abs(_carController.Speed) > 5.6f)
            return null;

        TrafficCar? best = null;
        float bestDistance = float.PositiveInfinity;
        int currentField = _carController.CurrentFieldNumber;
        foreach (TrafficCar traffic in _trafficCars)
        {
            if (traffic.FieldNumber != currentField)
                continue;
            Vector2 delta = new(traffic.Position.X - _carController.Position.X, traffic.Position.Z - _carController.Position.Z);
            float distance = delta.Length();
            float allowed = _playerInteractionRadius + traffic.InteractionRadius + 1.75f;
            if (distance <= allowed && distance < bestDistance)
            {
                best = traffic;
                bestDistance = distance;
            }
        }
        return best;
    }

    private PalFixedInteractionZone? FindFixedInteractionTarget()
    {
        if (!_driveMode || _carController is null || MathF.Abs(_carController.Speed) > 5.6f || _fixedInteractionZones.Count == 0)
            return null;

        var sourcePoint = new System.Numerics.Vector2(
            RtaWorldCoordinates.FieldExtent - _carController.Position.X,
            _carController.Position.Z);
        PalFixedInteractionZone? best = null;
        float bestDistance = float.PositiveInfinity;
        foreach (PalFixedInteractionZone zone in _fixedInteractionZones)
        {
            float distance = zone.DistanceTo(sourcePoint);
            // Keep the authored entrance polygon authoritative, but add two metres
            // of QoL forgiveness so using a door does not require pixel-perfect parking.
            if (distance <= 2.0f && distance < bestDistance)
            {
                best = zone;
                bestDistance = distance;
            }
        }
        return best;
    }

    private void StartInterior(int slotIndex, PalFixedInteractionZone? target, bool debugForced)
    {
        if (_disc is null)
            return;

        int areaIndex = target?.AreaIndex ?? PalDialogueDatabase.PeachTownAreaIndex;
        if (areaIndex <= 0)
        {
            Console.WriteLine($"Interior area {areaIndex} uses a non-Txx shop package that is not wired yet.");
            return;
        }
        string shopPath = $"SHOP/T{areaIndex - 1:D2}.BIN";
        if (!_disc.FileExists(shopPath))
        {
            Console.WriteLine($"Interior package {shopPath} is not present on this disc.");
            return;
        }

        using Stream shop = _disc.OpenFile(shopPath);
        Hg2ShopInteriorBackdrop backdrop = Hg2ShopInteriorReader.ReadBackdrop(shop, slotIndex);
        var colors = new Color[checked(backdrop.Width * backdrop.Height)];
        for (int pixel = 0; pixel < colors.Length; pixel++)
        {
            int offset = pixel * 4;
            colors[pixel] = new Color(
                backdrop.RgbaPixels[offset],
                backdrop.RgbaPixels[offset + 1],
                backdrop.RgbaPixels[offset + 2],
                backdrop.RgbaPixels[offset + 3]);
        }

        _interiorStaffMesh?.Dispose();
        _interiorStaffMesh = null;
        _interiorSceneRenderer?.Dispose();
        _interiorSceneRenderer = null;
        _interiorBackdropTexture?.Dispose();
        _interiorBackdropTexture = new Texture2D(GraphicsDevice, backdrop.Width, backdrop.Height, false, SurfaceFormat.Color);
        _interiorBackdropTexture.SetData(colors);
        _activeInterior = target ?? _fixedInteractionZones.FirstOrDefault(zone => zone.LocalResidentIndex == slotIndex);

        // Q's Factory is the first fully reconstructed SHOP compositor. The first
        // indexed image is an atlas, not a finished frame: the runtime builds the
        // tiled floor and dynamic cars underneath its authored scenery cutout.
        if (areaIndex == PalDialogueDatabase.PeachTownAreaIndex && slotIndex == 0)
        {
            _interiorSceneRenderer = new InteriorSceneRenderer(
                GraphicsDevice, backdrop.Width, backdrop.Height, backdrop.RgbaPixels);
            if (_activeInterior is not null)
            {
                PalCarPaint staffPaint = PalCarPaint.Decode(_activeInterior.PackedPaint);
                _interiorStaffMesh = LoadCarMesh(
                    _activeInterior.BodyId,
                    ToColor(staffPaint.Primary),
                    ToColor(staffPaint.Secondary));
            }
        }

        _interactionTarget = null;
        _fixedInteractionTarget = null;
        _interiorDialogueFlow = null;
        _interiorChoiceIndex = 0;

        // First interactive interior slice: Q's Factory. Slot 04 is the original
        // normal factory menu. Its labels and target slots are read directly from
        // SLES_513.56; no menu content is duplicated in the MonoGame project.
        if (areaIndex == PalDialogueDatabase.PeachTownAreaIndex && slotIndex == 0)
        {
            using Stream executable = _disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
            PalDialogueEntity factory = PalDialogueDatabase.ReadPeachTownEntity(executable, "Q's Factory");
            _palDialogueRuntimeState.CurrentAreaIndex = areaIndex;
            _interiorDialogueFlow = new PalDialogueFlow(factory, _palDialogueRuntimeState, 0x04);
            ResetInteriorChoiceToDefault();
            LogInteriorDialogueState();
        }

        _simulationState = WorldSimulationState.Interior;
        string name = _activeInterior?.ResidentName ?? $"slot {slotIndex}";
        Console.WriteLine($"Interior start: {shopPath} area {areaIndex:D2} slot {slotIndex:D2} {name}, {backdrop.Width}x{backdrop.Height}, {backdrop.DmaPacketCount} DMA packets{(debugForced ? " [debug forced]" : string.Empty)}.");
    }

    private void EndInterior()
    {
        if (_simulationState != WorldSimulationState.Interior)
            return;
        string name = _activeInterior?.ResidentName ?? "interior";
        Console.WriteLine($"Interior end: {name}; overworld resumes from preserved state.");
        _interiorStaffMesh?.Dispose();
        _interiorStaffMesh = null;
        _interiorSceneRenderer?.Dispose();
        _interiorSceneRenderer = null;
        _interiorBackdropTexture?.Dispose();
        _interiorBackdropTexture = null;
        _interiorDialogueFlow = null;
        _interiorChoiceIndex = 0;
        _activeInterior = null;
        _simulationState = WorldSimulationState.Driving;
        _fixedInteractionTarget = FindFixedInteractionTarget();
    }

    private void StartDialogue(TrafficCar target, bool debugForced)
    {
        if (!_residentDialogueScripts.TryGetValue(target.Name, out DialogueScript? script))
            return;

        _interactionTarget = target;
        _dialogue = new DialogueMachine(script, _dialogueFlags);
        _dialogueChoiceIndex = 0;
        _simulationState = WorldSimulationState.Dialogue;
        Console.WriteLine($"Dialogue start: {target.Name} at ({target.Position.X:0.0}, {target.Position.Y:0.0}, {target.Position.Z:0.0}); player ({_carController?.Position.X:0.0}, {_carController?.Position.Y:0.0}, {_carController?.Position.Z:0.0}){(debugForced ? " [debug forced]" : string.Empty)}.");
    }

    private void EndDialogue()
    {
        if (_simulationState != WorldSimulationState.Dialogue)
            return;
        string name = _interactionTarget?.Name ?? "resident";
        Console.WriteLine($"Dialogue end: {name}; overworld simulation resumes from preserved state.");
        _dialogue = null;
        _simulationState = WorldSimulationState.Driving;
        _interactionTarget = null;
        _dialogueChoiceIndex = 0;
    }

    private void UpdateDialogueInput(KeyboardState keyboard)
    {
        if (_dialogue is null)
            return;

        if (_dialogue.CurrentChoice is DialogueChoiceNode choice)
        {
            if (Pressed(keyboard, Keys.Up) || Pressed(keyboard, Keys.W))
                _dialogueChoiceIndex = (_dialogueChoiceIndex - 1 + choice.Choices.Count) % choice.Choices.Count;
            if (Pressed(keyboard, Keys.Down) || Pressed(keyboard, Keys.S))
                _dialogueChoiceIndex = (_dialogueChoiceIndex + 1) % choice.Choices.Count;
            if (Pressed(keyboard, Keys.Enter) || Pressed(keyboard, Keys.Space) || Pressed(keyboard, Keys.E))
                _dialogue.Choose(_dialogueChoiceIndex);
        }
        else if (_dialogue.CurrentText is not null && (Pressed(keyboard, Keys.Enter) || Pressed(keyboard, Keys.Space) || Pressed(keyboard, Keys.E)))
        {
            _dialogue.Advance();
        }

        if (_dialogue.IsEnded)
            EndDialogue();
    }

    private void UpdateInteriorInput(KeyboardState keyboard)
    {
        if (_interiorDialogueFlow is null || _interiorDialogueFlow.IsEnded)
            return;

        IReadOnlyList<PalDialogueFlowChoice> choices = _interiorDialogueFlow.CurrentChoices;
        if (choices.Count > 0)
        {
            if (Pressed(keyboard, Keys.Up) || Pressed(keyboard, Keys.W))
                _interiorChoiceIndex = (_interiorChoiceIndex - 1 + choices.Count) % choices.Count;
            if (Pressed(keyboard, Keys.Down) || Pressed(keyboard, Keys.S))
                _interiorChoiceIndex = (_interiorChoiceIndex + 1) % choices.Count;

            if (Pressed(keyboard, Keys.Enter) || Pressed(keyboard, Keys.Space) || Pressed(keyboard, Keys.E))
            {
                PalDialogueFlowChoice selected = choices[_interiorChoiceIndex];
                Console.WriteLine($"Interior VM choose: slot 0x{_interiorDialogueFlow.CurrentSlot:X2} '{selected.Text}' -> 0x{selected.TargetSlot:X2}.");
                _interiorDialogueFlow.Choose(_interiorChoiceIndex);
                ResetInteriorChoiceToDefault();
                LogInteriorDialogueState();
                if (_interiorDialogueFlow.IsEnded)
                    EndInterior();
            }
            return;
        }

        PalDialogueActionToken? external = _interiorDialogueFlow.CurrentExternalAction;
        if (external is not null)
        {
            // Host subsystems are intentionally not fabricated. SaveData and RaceSelect
            // already expose proven return/cancel targets, so Backspace lets the debug
            // slice follow that original edge while the real subsystem remains pending.
            if (Pressed(keyboard, Keys.Back) && TryGetExternalReturnTarget(external, out byte targetSlot))
            {
                Console.WriteLine($"Interior VM external action {external.Opcode} cancelled/returned -> 0x{targetSlot:X2}.");
                _interiorDialogueFlow.ReturnFromExternalAction(targetSlot);
                ResetInteriorChoiceToDefault();
                LogInteriorDialogueState();
            }
            return;
        }

        if (Pressed(keyboard, Keys.Enter) || Pressed(keyboard, Keys.Space) || Pressed(keyboard, Keys.E))
        {
            _interiorDialogueFlow.Advance();
            if (_interiorDialogueFlow.IsEnded)
            {
                EndInterior();
                return;
            }
            LogInteriorDialogueState();
        }
    }

    private static bool TryGetExternalReturnTarget(PalDialogueActionToken action, out byte targetSlot)
    {
        switch (action.Opcode)
        {
            case PalDialogueActionOpcode.SaveData when action.Operands.Count >= 1:
                targetSlot = action.Operands[0];
                return true;
            case PalDialogueActionOpcode.RaceSelect when action.Operands.Count >= 2:
                targetSlot = action.Operands[1];
                return true;
            default:
                targetSlot = 0;
                return false;
        }
    }

    private void ResetInteriorChoiceToDefault()
    {
        if (_interiorDialogueFlow is null)
        {
            _interiorChoiceIndex = 0;
            return;
        }

        IReadOnlyList<PalDialogueFlowChoice> choices = _interiorDialogueFlow.CurrentChoices;
        int defaultIndex = -1;
        for (int i = 0; i < choices.Count; i++)
        {
            if (choices[i].IsDefault)
            {
                defaultIndex = i;
                break;
            }
        }
        _interiorChoiceIndex = defaultIndex >= 0 ? defaultIndex : 0;
    }

    private void LogInteriorDialogueState()
    {
        if (_interiorDialogueFlow is null || _interiorDialogueFlow.IsEnded)
            return;

        string page = _interiorDialogueFlow.CurrentPage?.Replace('\n', ' ') ?? string.Empty;
        Console.WriteLine($"Interior VM slot 0x{_interiorDialogueFlow.CurrentSlot:X2}: {page}");
        IReadOnlyList<PalDialogueFlowChoice> choices = _interiorDialogueFlow.CurrentChoices;
        for (int i = 0; i < choices.Count; i++)
            Console.WriteLine($"  [{i}] {choices[i].Text} -> 0x{choices[i].TargetSlot:X2}{(choices[i].IsDefault ? " [default]" : string.Empty)}");
        if (_interiorDialogueFlow.CurrentExternalAction is PalDialogueActionToken external)
            Console.WriteLine($"  external action {external.Opcode} ({string.Join(" ", external.Operands.Select(value => value.ToString("X2")))}) pending host integration.");
        foreach (PalDialogueControlToken ignored in _interiorDialogueFlow.IgnoredControls)
            Console.WriteLine($"  traced-width/unimplemented pre-control 0x{(byte)ignored.Opcode:X2} {ignored.Opcode} preserved.");
    }

    private void DrawInteriorDialogueOverlay(int width, int height, string speaker)
    {
        if (_ui is null || _interiorDialogueFlow is null || _interiorDialogueFlow.IsEnded || _interiorBackdropTexture is null)
            return;

        Rectangle backdrop = GetInteriorBackdropDestination();
        float sx = backdrop.Width / (float)_interiorBackdropTexture.Width;
        float sy = backdrop.Height / (float)_interiorBackdropTexture.Height;

        // The original 640x384 Q's Factory backdrop already contains its authored
        // orange name plate and green dialogue panel. Place reconstructed runtime text
        // into those regions instead of obscuring them with a modern debug window.
        Vector2 namePosition = new(backdrop.X + 28f * sx, backdrop.Y + 242f * sy);
        Rectangle panel = new(
            (int)MathF.Round(backdrop.X + 13f * sx),
            (int)MathF.Round(backdrop.Y + 270f * sy),
            Math.Max(1, (int)MathF.Round(174f * sx)),
            Math.Max(1, (int)MathF.Round(108f * sy)));

        _ui.DrawString(speaker, namePosition, new Color(20, 68, 52), 2);

        string prompt = _interiorDialogueFlow.CurrentPage ?? string.Empty;
        _ui.DrawWrappedString(prompt, new Rectangle(panel.X + 8, panel.Y + 6, panel.Width - 16, 42), Color.White, 2);

        IReadOnlyList<PalDialogueFlowChoice> choices = _interiorDialogueFlow.CurrentChoices;
        if (choices.Count > 0)
        {
            int y = panel.Y + 48;
            for (int i = 0; i < choices.Count; i++)
            {
                Color color = i == _interiorChoiceIndex ? new Color(255, 232, 102) : Color.White;
                _ui.DrawString((i == _interiorChoiceIndex ? "> " : "  ") + choices[i].Text, new Vector2(panel.X + 10, y + i * 18), color, 2);
            }
            _ui.DrawString("UP/DOWN  E SELECT", new Vector2(panel.X + 10, panel.Bottom - 18), new Color(210, 230, 220), 1);
            return;
        }

        if (_interiorDialogueFlow.CurrentExternalAction is PalDialogueActionToken external)
        {
            string action = external.Opcode switch
            {
                PalDialogueActionOpcode.RaceSelect => "RACE SELECTOR\nHOST INTEGRATION PENDING",
                PalDialogueActionOpcode.SelectTeamCar => "TEAM/PARTS SELECTOR\nHOST INTEGRATION PENDING",
                PalDialogueActionOpcode.SaveData => "SAVE DATA\nHOST INTEGRATION PENDING",
                PalDialogueActionOpcode.StartRace => "START RACE\nHOST INTEGRATION PENDING",
                PalDialogueActionOpcode.Transition => "AREA TRANSITION\nHOST INTEGRATION PENDING",
                _ => $"ACTION 0x{(byte)external.Opcode:X2}\nHOST INTEGRATION PENDING"
            };
            _ui.DrawWrappedString(action, new Rectangle(panel.X + 10, panel.Y + 54, panel.Width - 20, 65), new Color(255, 232, 102), 2);
            if (TryGetExternalReturnTarget(external, out _))
                _ui.DrawString("BACKSPACE RETURN", new Vector2(panel.X + 10, panel.Bottom - 18), new Color(210, 230, 220), 1);
            return;
        }

        _ui.DrawString("E / ENTER  CONTINUE", new Vector2(panel.X + 10, panel.Bottom - 18), new Color(210, 230, 220), 1);
    }

    private Rectangle GetInteriorBackdropDestination()
    {
        if (_interiorBackdropTexture is null)
            return Rectangle.Empty;

        int width = GraphicsDevice.PresentationParameters.BackBufferWidth;
        int height = GraphicsDevice.PresentationParameters.BackBufferHeight;
        // HG2 SHOP renders into a 640x384 logical surface but presents it through
        // the console's 4:3 display. Preserve that presentation aspect rather than
        // treating the logical texture pixels as square host pixels.
        const float presentationAspect = 4f / 3f;
        int logicalWidth = _interiorBackdropTexture.Width;
        int logicalHeight = (int)MathF.Round(logicalWidth / presentationAspect);
        float scale = MathF.Min(width / (float)logicalWidth, height / (float)logicalHeight);
        int drawWidth = Math.Max(1, (int)MathF.Round(logicalWidth * scale));
        int drawHeight = Math.Max(1, (int)MathF.Round(logicalHeight * scale));
        return new Rectangle((width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }

    private void DrawInteriorBackdrop()
    {
        if (_ui is null || _interiorBackdropTexture is null)
            return;

        Texture2D source = _interiorBackdropTexture;
        if (_interiorSceneRenderer is not null)
        {
            bool changeParts = _options.DebugInteriorChangeParts ||
                _interiorDialogueFlow?.CurrentExternalAction?.Opcode == PalDialogueActionOpcode.SelectTeamCar;
            source = _interiorSceneRenderer.Render(_interiorStaffMesh, _carMesh, _wheelMesh, changeParts);
        }

        Rectangle destination = GetInteriorBackdropDestination();
        _ui.Begin(linearSampling: true);
        _ui.DrawTexture(source, destination, Color.White);
        _ui.End();
    }

    private void DrawOverlay()
    {
        if (_ui is null)
            return;

        int width = GraphicsDevice.PresentationParameters.BackBufferWidth;
        int height = GraphicsDevice.PresentationParameters.BackBufferHeight;
        _ui.Begin();

        if (_debugInteractionZones.Count > 0 && _simulationState != WorldSimulationState.Interior &&
            (_carController is null || _viewFieldNumber == _carController.CurrentFieldNumber))
            DrawDebugInteractionZones(width, height);

        if (_simulationState == WorldSimulationState.Interior)
        {
            string name = DisplayFixedInteractionName(_activeInterior);
            Rectangle hint = new(18, 18, Math.Min(width - 36, Math.Max(260, name.Length * 12 + 190)), 40);
            _ui.Fill(hint, new Color(8, 10, 14, 190));
            _ui.DrawString($"{name}   ESC RETURN", new Vector2(hint.X + 14, hint.Y + 13), Color.White, 2);
            DrawInteriorDialogueOverlay(width, height, name);
        }
        else if (_simulationState == WorldSimulationState.Dialogue && _dialogue is not null)
        {
            Rectangle box = new(55, height - 225, width - 110, 185);
            _ui.Fill(box, new Color(10, 14, 20, 220));
            _ui.Fill(new Rectangle(box.X, box.Y, box.Width, 3), new Color(235, 210, 86, 255));

            if (_dialogue.CurrentText is DialogueTextNode text)
            {
                _ui.DrawString(text.Speaker, new Vector2(box.X + 22, box.Y + 18), new Color(255, 221, 91), 3);
                _ui.DrawWrappedString(text.Text, new Rectangle(box.X + 22, box.Y + 52, box.Width - 44, box.Height - 80), Color.White, 2);
                _ui.DrawString("E / ENTER  CONTINUE", new Vector2(box.Right - 250, box.Bottom - 25), new Color(180, 190, 205), 2);
            }
            else if (_dialogue.CurrentChoice is DialogueChoiceNode choice)
            {
                _ui.DrawString(choice.Speaker, new Vector2(box.X + 22, box.Y + 18), new Color(255, 221, 91), 3);
                _ui.DrawWrappedString(choice.Prompt, new Rectangle(box.X + 22, box.Y + 52, box.Width - 44, 50), Color.White, 2);
                for (int i = 0; i < choice.Choices.Count; i++)
                {
                    Color color = i == _dialogueChoiceIndex ? new Color(255, 221, 91) : Color.White;
                    _ui.DrawString((i == _dialogueChoiceIndex ? "> " : "  ") + choice.Choices[i].Text, new Vector2(box.X + 40, box.Y + 105 + i * 20), color, 2);
                }
            }
        }
        else if (_interactionTarget is not null)
        {
            string prompt = $"E  TALK TO {_interactionTarget.Name}";
            int promptWidth = Math.Min(width - 80, Math.Max(300, prompt.Length * 12 + 40));
            Rectangle promptBox = new((width - promptWidth) / 2, height - 88, promptWidth, 44);
            _ui.Fill(promptBox, new Color(10, 14, 20, 205));
            _ui.DrawString(prompt, new Vector2(promptBox.X + 20, promptBox.Y + 14), Color.White, 2);
        }
        else if (_fixedInteractionTarget is not null)
        {
            string name = DisplayFixedInteractionName(_fixedInteractionTarget);
            string prompt = $"E  ENTER {name}";
            int promptWidth = Math.Min(width - 80, Math.Max(320, prompt.Length * 12 + 40));
            Rectangle promptBox = new((width - promptWidth) / 2, height - 88, promptWidth, 44);
            _ui.Fill(promptBox, new Color(10, 14, 20, 205));
            _ui.DrawString(prompt, new Vector2(promptBox.X + 20, promptBox.Y + 14), Color.White, 2);
        }

        _ui.End();
    }

    private void DrawDebugInteractionZones(int width, int height)
    {
        if (_ui is null || _surfaceSampler is null)
            return;

        Color outline = new(50, 235, 255, 230);
        Color marker = new(255, 221, 91, 240);
        Color legendBackground = new(7, 11, 17, 220);

        foreach (PalFixedInteractionZone zone in _debugInteractionZones)
        {
            var projectedCorners = new List<Vector2>();
            foreach (System.Numerics.Vector2 sourceCorner in zone.Corners)
            {
                if (PalFixedInteractionZone.IsSentinel(sourceCorner))
                    continue;
                float worldX = RtaWorldCoordinates.FieldExtent - sourceCorner.X;
                float worldZ = sourceCorner.Y;
                float y = _surfaceSampler.TrySampleHighest(worldX, worldZ, out float surfaceY) ? surfaceY + 0.6f : 31f;
                Vector3 screen = GraphicsDevice.Viewport.Project(
                    new Vector3(worldX, y, worldZ),
                    _camera.Projection,
                    _camera.View,
                    Matrix.Identity);
                if (screen.Z is >= 0f and <= 1f)
                    projectedCorners.Add(new Vector2(screen.X, screen.Y));
            }

            if (projectedCorners.Count >= 2)
            {
                for (int i = 0; i + 1 < projectedCorners.Count; i++)
                    _ui.DrawLine(projectedCorners[i], projectedCorners[i + 1], outline, 2f);
                if (projectedCorners.Count >= 3 && !zone.HasSentinelCorner)
                    _ui.DrawLine(projectedCorners[^1], projectedCorners[0], outline, 2f);
            }

            System.Numerics.Vector2 sourceCenter = zone.Center;
            float centerX = RtaWorldCoordinates.FieldExtent - sourceCenter.X;
            float centerZ = sourceCenter.Y;
            float centerY = _surfaceSampler.TrySampleHighest(centerX, centerZ, out float sampledY) ? sampledY + 3.0f : 34f;
            Vector3 labelScreen = GraphicsDevice.Viewport.Project(
                new Vector3(centerX, centerY, centerZ),
                _camera.Projection,
                _camera.View,
                Matrix.Identity);
            if (labelScreen.Z is < 0f or > 1f || labelScreen.X < -30f || labelScreen.X > width + 30f || labelScreen.Y < -30f || labelScreen.Y > height + 30f)
                continue;

            Rectangle numberBox = new((int)labelScreen.X - 10, (int)labelScreen.Y - 8, 22, 16);
            _ui.Fill(numberBox, marker);
            _ui.DrawString(zone.LocalResidentIndex.ToString("D2"), new Vector2(numberBox.X + 5, numberBox.Y + 4), Color.Black, 1);
        }

        int legendLineHeight = 16;
        int legendWidth = 330;
        int legendHeight = Math.Min(height - 20, 20 + _debugInteractionZones.Count * legendLineHeight);
        Rectangle legend = new(10, 10, legendWidth, legendHeight);
        _ui.Fill(legend, legendBackground);
        for (int i = 0; i < _debugInteractionZones.Count; i++)
        {
            PalFixedInteractionZone zone = _debugInteractionZones[i];
            int y = legend.Y + 8 + i * legendLineHeight;
            if (y + 14 > legend.Bottom)
                break;
            _ui.DrawString($"{zone.LocalResidentIndex:D2} {zone.ResidentName}", new Vector2(legend.X + 8, y), Color.White, 2);
        }
    }

    private static string DisplayFixedInteractionName(PalFixedInteractionZone? zone)
    {
        if (zone is null)
            return "INTERIOR";
        return zone.ResidentName switch
        {
            "Q's Factory Staff" => "Q'S FACTORY",
            "Parts Shop Staff" => "PARTS SHOP",
            "Body Shop Staff" => "BODY SHOP",
            "Paint Shop Staff" => "PAINT SHOP",
            "Bartender" => "BAR",
            "Policeman" => "POLICE",
            "Peach FM Front Desk" => "PEACH FM",
            "Entrance to the cave" => "CAVE",
            "Quick-Pic Shop Staff" => "QUICK-PIC",
            _ => zone.ResidentName.ToUpperInvariant()
        };
    }

    private static DialogueScript BuildTextScript(string speaker, IReadOnlyList<string> pages)
    {
        var nodes = new Dictionary<int, DialogueNode>();
        for (int i = 0; i < pages.Count; i++)
            nodes[i] = new DialogueTextNode(i, speaker, pages[i], i + 1);
        nodes[pages.Count] = new DialogueEndNode(pages.Count);
        return new DialogueScript(0, nodes);
    }

    private void ArmFujiRouteSeamProbe()
    {
        if (_carController is null || _drivingContext is null || _debugFujiSeamProbeIndex < 0 || _debugFujiSeamProbeIndex >= FujiRouteSeamProbes.Length)
            return;

        DebugSeamProbe probe = FujiRouteSeamProbes[_debugFujiSeamProbeIndex];
        _drivingContext.CommitField(probe.FromField);
        BindCurrentSector(probe.FromField);
        Vector3 start = probe.Start;
        if (_drivingContext.TrySampleGround(start, start.Y, out float sampledY))
            start.Y = sampledY;
        _carController.Teleport(probe.FromField, start, probe.Yaw);
        _viewFieldNumber = probe.FromField;
        _carWorld = _carController.World;
        Console.WriteLine(
            $"Debug Fuji seam probe {_debugFujiSeamProbeIndex + 1}/{FujiRouteSeamProbes.Length} armed: " +
            $"FLD/{probe.FromField:D3} ({start.X:0.0}, {start.Y:0.0}, {start.Z:0.0}) -> FLD/{probe.ToField:D3} ({probe.Label}), automatic throttle.");
    }

    private void UpdateChaseCamera()
    {
        if (_carController is null)
            return;

        Vector3 forward = _carController.Forward;
        Vector3 car = _carController.Position;
        Vector3 cameraPosition = car - forward * 6.2f + Vector3.Up * 2.8f;
        Vector3 target = car + forward * 3.0f + Vector3.Up * 0.8f;
        _camera.SetLookAt(cameraPosition, target);
    }

    private void SaveScreenshot(string path)
    {
        int width = GraphicsDevice.PresentationParameters.BackBufferWidth;
        int height = GraphicsDevice.PresentationParameters.BackBufferHeight;
        var pixels = new Color[checked(width * height)];
        GraphicsDevice.GetBackBufferData(pixels);

        using var texture = new Texture2D(GraphicsDevice, width, height, false, SurfaceFormat.Color);
        texture.SetData(pixels);
        Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
        using FileStream output = File.Create(path);
        texture.SaveAsPng(output, width, height);
        Console.WriteLine($"Saved screenshot: {path}");
    }

    private readonly record struct DebugSeamProbe(int FromField, int ToField, Vector3 Start, float Yaw, string Label);

    private bool Pressed(KeyboardState current, Keys key) => current.IsKeyDown(key) && !_previousKeyboard.IsKeyDown(key);
}
