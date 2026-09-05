using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input;

namespace Rta.Game;

/// <summary>
/// Intentionally simple arcade controller for proving the reconstructed world is
/// traversable. This is not an attempt at RTA handling fidelity yet.
/// </summary>
internal sealed class DebugCarController
{
    private readonly WorldDrivingContext _world;
    private const float ForwardAcceleration = 9.5f;
    private const float ReverseAcceleration = 6f;
    private const float BrakeAcceleration = 18f;
    private const float CoastDrag = 2.8f;
    private const float MaxForwardSpeed = 28f;
    private const float MaxReverseSpeed = 9f;
    private const float WheelRadius = 0.355f;
    private const float MaxSteeringAngle = 0.48f;
    private const float SteeringVisualSpeed = 3.4f;
    private const float FrontTrackHalf = 0.741544f;
    private const float RearTrackHalf = 0.724481f;
    private const float FrontAxleZ = 0.680000f;
    private const float RearAxleZ = -0.660000f;
    private const float ChassisAttitudeSpeed = 5.5f;
    private const float DeveloperSpeedBoostMultiplier = 5f;

    public DebugCarController(WorldDrivingContext world, Vector3 position, float yaw)
    {
        _world = world;
        Position = position;
        Yaw = yaw;
    }

    public Vector3 Position { get; private set; }
    public float Yaw { get; private set; }
    public float Speed { get; private set; }
    public float SteeringAngle { get; private set; }
    public float WheelSpin { get; private set; }
    public float Pitch { get; private set; }
    public float Roll { get; private set; }
    public uint CurrentSurfaceFlags { get; private set; }
    public DrivingSurfaceKind CurrentDrivingSurface { get; private set; } = DrivingSurfaceKind.PavedRoad;
    public int CurrentFieldNumber => _world.CurrentFieldNumber;

    public Matrix World =>
        Matrix.CreateRotationZ(Roll) *
        Matrix.CreateRotationX(-Pitch) *
        Matrix.CreateRotationY(Yaw) *
        Matrix.CreateTranslation(Position.X, Position.Y + 0.02f, Position.Z);

    public Vector3 Forward => new(MathF.Sin(Yaw), 0f, MathF.Cos(Yaw));

    public void Teleport(Vector3 position, float yaw) => Teleport(CurrentFieldNumber, position, yaw);

    public void Teleport(int fieldNumber, Vector3 position, float yaw)
    {
        _world.CommitField(fieldNumber);
        Position = position;
        Yaw = yaw;
        Speed = 0f;
        SteeringAngle = 0f;
        WheelSpin = 0f;
        Pitch = 0f;
        Roll = 0f;
        UpdateDrivingSurface();
    }

    public void Update(GameTime gameTime, KeyboardState keyboard)
    {
        float dt = Math.Min(0.05f, (float)gameTime.ElapsedGameTime.TotalSeconds);
        float throttle = (keyboard.IsKeyDown(Keys.W) || keyboard.IsKeyDown(Keys.Up) ? 1f : 0f) -
                         (keyboard.IsKeyDown(Keys.S) || keyboard.IsKeyDown(Keys.Down) ? 1f : 0f);
        float steering = (keyboard.IsKeyDown(Keys.D) || keyboard.IsKeyDown(Keys.Right) ? 1f : 0f) -
                         (keyboard.IsKeyDown(Keys.A) || keyboard.IsKeyDown(Keys.Left) ? 1f : 0f);
        bool developerBoost = keyboard.IsKeyDown(Keys.LeftShift) || keyboard.IsKeyDown(Keys.RightShift);
        float speedBoost = developerBoost ? DeveloperSpeedBoostMultiplier : 1f;

        UpdateDrivingSurface();
        (float forwardAcceleration, float reverseAcceleration, float coastDrag, float maxForwardSpeed) = CurrentDrivingSurface switch
        {
            DrivingSurfaceKind.Dirt => (8.4f, 5.5f, 3.4f, 23.5f),
            DrivingSurfaceKind.Grass => (6.2f, 4.5f, 5.8f, 16.0f),
            DrivingSurfaceKind.Other => (7.5f, 5.0f, 4.2f, 20.0f),
            _ => (ForwardAcceleration, ReverseAcceleration, CoastDrag, MaxForwardSpeed)
        };

        float boostedForwardAcceleration = forwardAcceleration * speedBoost;
        float boostedReverseAcceleration = reverseAcceleration * speedBoost;
        float boostedMaxForwardSpeed = maxForwardSpeed * speedBoost;
        float boostedMaxReverseSpeed = MaxReverseSpeed * speedBoost;

        if (throttle > 0f)
        {
            if (Speed < -0.5f)
                Speed = MoveTowards(Speed, 0f, BrakeAcceleration * speedBoost * dt);
            else if (Speed < boostedMaxForwardSpeed)
                Speed = Math.Min(boostedMaxForwardSpeed, Speed + boostedForwardAcceleration * dt);
        }
        else if (throttle < 0f)
        {
            if (Speed > 0.5f)
                Speed = MoveTowards(Speed, 0f, BrakeAcceleration * speedBoost * dt);
            else if (Speed > -boostedMaxReverseSpeed)
                Speed = Math.Max(-boostedMaxReverseSpeed, Speed - boostedReverseAcceleration * dt);
        }
        else
        {
            Speed = MoveTowards(Speed, 0f, coastDrag * speedBoost * dt);
        }

        // Releasing the developer boost should not snap a 140 m/s car straight back
        // to normal speed. Bleed any excess off quickly but continuously instead.
        if (!developerBoost)
        {
            if (Speed > maxForwardSpeed)
                Speed = MoveTowards(Speed, maxForwardSpeed, BrakeAcceleration * DeveloperSpeedBoostMultiplier * dt);
            else if (Speed < -MaxReverseSpeed)
                Speed = MoveTowards(Speed, -MaxReverseSpeed, BrakeAcceleration * DeveloperSpeedBoostMultiplier * dt);
        }

        float targetSteeringAngle = -steering * MaxSteeringAngle;
        SteeringAngle = MoveTowards(SteeringAngle, targetSteeringAngle, SteeringVisualSpeed * dt);
        WheelSpin -= Speed * dt / WheelRadius;
        if (WheelSpin > MathHelper.TwoPi || WheelSpin < -MathHelper.TwoPi)
            WheelSpin %= MathHelper.TwoPi;

        float speedFraction = Math.Clamp(MathF.Abs(Speed) / 12f, 0f, 1f);
        if (speedFraction > 0.02f && MathF.Abs(steering) > 0.01f)
        {
            float direction = Speed >= 0f ? 1f : -1f;
            float turnRate = MathHelper.Lerp(0.45f, 1.65f, speedFraction);
            // At boosted speeds scale yaw rate with the amount by which the car is
            // exceeding this surface's normal cap. That keeps Shift useful on curved
            // roads instead of turning the car into a 140 m/s train.
            float turnScale = Math.Clamp(MathF.Abs(Speed) / Math.Max(0.01f, maxForwardSpeed), 1f, DeveloperSpeedBoostMultiplier);
            Yaw -= steering * direction * turnRate * turnScale * dt;
        }

        Vector3 forward = Forward;
        float moveX = forward.X * Speed * dt;
        float moveZ = forward.Z * Speed * dt;
        Vector3 candidate = new(Position.X + moveX, Position.Y, Position.Z + moveZ);

        if (_world.TryResolveFootprint(candidate, Yaw, Position.Y, out Vector3 resolved, out uint surfaceFlags, out int targetField))
        {
            Position = resolved;
            CurrentSurfaceFlags = surfaceFlags;
            _world.CommitField(targetField);
        }
        else
        {
            // A light-weight slide fallback keeps the debug controller pleasant near
            // boundaries while still respecting the original allowed-driving mesh.
            Vector3 xOnly = new(Position.X + moveX, Position.Y, Position.Z);
            Vector3 zOnly = new(Position.X, Position.Y, Position.Z + moveZ);
            bool xValid = _world.TryResolveFootprint(xOnly, Yaw, Position.Y, out Vector3 xResolved, out uint xFlags, out int xField);
            bool zValid = _world.TryResolveFootprint(zOnly, Yaw, Position.Y, out Vector3 zResolved, out uint zFlags, out int zField);
            if (xValid && (!zValid || MathF.Abs(moveX) >= MathF.Abs(moveZ)))
            {
                Position = xResolved;
                CurrentSurfaceFlags = xFlags;
                _world.CommitField(xField);
            }
            else if (zValid)
            {
                Position = zResolved;
                CurrentSurfaceFlags = zFlags;
                _world.CommitField(zField);
            }
            else
            {
                Speed = 0f;
            }
        }

        UpdateGroundAttitude(dt);
    }


    private void UpdateDrivingSurface()
    {
        RoadSurfaceKind road = _world.GetRoadSurface(Position);
        if (road == RoadSurfaceKind.Paved)
        {
            CurrentDrivingSurface = DrivingSurfaceKind.PavedRoad;
            return;
        }
        if (road == RoadSurfaceKind.Dirt)
        {
            CurrentDrivingSurface = DrivingSurfaceKind.Dirt;
            return;
        }

        if (_world.TrySampleSurface(Position, Position.Y, out _, out ushort textureBasePointer))
        {
            CurrentDrivingSurface = textureBasePointer switch
            {
                14515 => DrivingSurfaceKind.Grass,
                14634 => DrivingSurfaceKind.Dirt,
                _ => DrivingSurfaceKind.Other
            };
        }
        else
        {
            CurrentDrivingSurface = DrivingSurfaceKind.Other;
        }
    }

    private void UpdateGroundAttitude(float dt)
    {
        Matrix yaw = Matrix.CreateRotationY(Yaw);
        Vector3 frontLeft = Position + Vector3.Transform(new Vector3(-FrontTrackHalf, 0f, FrontAxleZ), yaw);
        Vector3 frontRight = Position + Vector3.Transform(new Vector3(FrontTrackHalf, 0f, FrontAxleZ), yaw);
        Vector3 rearLeft = Position + Vector3.Transform(new Vector3(-RearTrackHalf, 0f, RearAxleZ), yaw);
        Vector3 rearRight = Position + Vector3.Transform(new Vector3(RearTrackHalf, 0f, RearAxleZ), yaw);

        if (!TryGround(frontLeft, out float fl) ||
            !TryGround(frontRight, out float fr) ||
            !TryGround(rearLeft, out float rl) ||
            !TryGround(rearRight, out float rr))
        {
            return;
        }

        float frontHeight = (fl + fr) * 0.5f;
        float rearHeight = (rl + rr) * 0.5f;
        float leftHeight = (fl + rl) * 0.5f;
        float rightHeight = (fr + rr) * 0.5f;
        float wheelbase = FrontAxleZ - RearAxleZ;
        float track = FrontTrackHalf + RearTrackHalf;

        float targetPitch = MathF.Atan2(frontHeight - rearHeight, wheelbase);
        float targetRoll = MathF.Atan2(rightHeight - leftHeight, track);
        float attitudeStep = ChassisAttitudeSpeed * dt;
        Pitch = MoveTowards(Pitch, targetPitch, attitudeStep);
        Roll = MoveTowards(Roll, targetRoll, attitudeStep);

        // The authored wheel bottoms sit at local Y=0, so the chassis origin itself
        // lies on the fitted contact plane. With the nearly symmetric axle spacing,
        // the average of the four contacts is a stable centre-height estimate.
        float targetY = (fl + fr + rl + rr) * 0.25f;
        Position = new Vector3(Position.X, MoveTowards(Position.Y, targetY, 12f * dt), Position.Z);
    }

    private bool TryGround(Vector3 point, out float y)
    {
        return _world.TrySampleGround(point, Position.Y, out y);
    }

    private static float MoveTowards(float value, float target, float amount)
    {
        if (value < target)
            return Math.Min(target, value + amount);
        if (value > target)
            return Math.Max(target, value - amount);
        return target;
    }
}
