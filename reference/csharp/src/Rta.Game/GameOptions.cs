using Microsoft.Xna.Framework;

namespace Rta.Game;

internal sealed record GameOptions(
    string DiscPath,
    int FieldNumber,
    string? ScreenshotPath,
    int ScreenshotFrame,
    Vector3? CameraPosition,
    float? CameraYaw,
    float? CameraPitch,
    string? DebugDialogueResident,
    int? DebugDialogueCloseFrame,
    string? DebugNearResident,
    bool DebugInteractionZones,
    string? DebugNearFixedInteraction,
    int? DebugInteriorIndex,
    bool DebugInteriorChangeParts,
    int? DebugViewField,
    float DebugWorldFastForwardSeconds,
    bool DebugSeamCrossing,
    bool DebugFujiRouteSeams,
    bool DebugRenderWholeWorld,
    bool DebugGrid)
{
    public static GameOptions Parse(string[] args)
    {
        string? disc = null;
        string? screenshot = null;
        int field = 223;
        int screenshotFrame = 2;
        Vector3? cameraPosition = null;
        float? cameraYaw = null;
        float? cameraPitch = null;
        string? debugDialogueResident = null;
        int? debugDialogueCloseFrame = null;
        string? debugNearResident = null;
        bool debugInteractionZones = false;
        string? debugNearFixedInteraction = null;
        int? debugInteriorIndex = null;
        bool debugInteriorChangeParts = false;
        int? debugViewField = null;
        float debugWorldFastForwardSeconds = 0f;
        bool debugSeamCrossing = false;
        bool debugFujiRouteSeams = false;
        bool debugRenderWholeWorld = false;
        bool debugGrid = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--disc" when i + 1 < args.Length:
                    disc = args[++i];
                    break;
                case "--field" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out field) || field is < 0 or > 999)
                        throw new ArgumentException("--field must be a number from 000 to 999.");
                    break;
                case "--screenshot" when i + 1 < args.Length:
                    screenshot = Path.GetFullPath(args[++i]);
                    break;
                case "--screenshot-frame" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out screenshotFrame) || screenshotFrame < 1)
                        throw new ArgumentException("--screenshot-frame must be a positive integer.");
                    break;
                case "--camera" when i + 3 < args.Length:
                    if (!float.TryParse(args[++i], out float camX) ||
                        !float.TryParse(args[++i], out float camY) ||
                        !float.TryParse(args[++i], out float camZ))
                    {
                        throw new ArgumentException("--camera requires three floating-point values: x y z.");
                    }
                    cameraPosition = new Vector3(camX, camY, camZ);
                    break;
                case "--yaw" when i + 1 < args.Length:
                    if (!float.TryParse(args[++i], out float yaw))
                        throw new ArgumentException("--yaw must be a floating-point value in radians.");
                    cameraYaw = yaw;
                    break;
                case "--pitch" when i + 1 < args.Length:
                    if (!float.TryParse(args[++i], out float pitch))
                        throw new ArgumentException("--pitch must be a floating-point value in radians.");
                    cameraPitch = pitch;
                    break;
                case "--debug-dialogue" when i + 1 < args.Length:
                    debugDialogueResident = args[++i];
                    break;
                case "--debug-dialogue-close-frame" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out int closeFrame) || closeFrame < 1)
                        throw new ArgumentException("--debug-dialogue-close-frame must be a positive integer.");
                    debugDialogueCloseFrame = closeFrame;
                    break;
                case "--debug-near-resident" when i + 1 < args.Length:
                    debugNearResident = args[++i];
                    break;
                case "--debug-interaction-zones":
                    debugInteractionZones = true;
                    break;
                case "--debug-near-fixed" when i + 1 < args.Length:
                    debugNearFixedInteraction = args[++i];
                    break;
                case "--debug-interior" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out int interior) || interior < 0)
                        throw new ArgumentException("--debug-interior must be a non-negative slot index.");
                    debugInteriorIndex = interior;
                    break;
                case "--debug-interior-change-parts":
                    debugInteriorChangeParts = true;
                    break;
                case "--debug-view-field" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out int viewField) || !IsWorldFieldNumber(viewField))
                        throw new ArgumentException("--debug-view-field must be a three-digit base-4 FLD number (000..333).");
                    debugViewField = viewField;
                    break;
                case "--debug-world-fast-forward" when i + 1 < args.Length:
                    if (!float.TryParse(args[++i], out debugWorldFastForwardSeconds) || debugWorldFastForwardSeconds < 0f)
                        throw new ArgumentException("--debug-world-fast-forward must be a non-negative number of seconds.");
                    break;
                case "--debug-seam-crossing":
                    debugSeamCrossing = true;
                    break;
                case "--debug-fuji-route-seams":
                    debugFujiRouteSeams = true;
                    break;
                case "--debug-render-whole-world":
                    debugRenderWholeWorld = true;
                    break;
                case "--debug-grid":
                    debugGrid = true;
                    break;
                default:
                    throw new ArgumentException($"Unknown or incomplete option '{args[i]}'.");
            }
        }

        if (string.IsNullOrWhiteSpace(disc))
            throw new ArgumentException("--disc is required.");
        if (debugSeamCrossing && debugFujiRouteSeams)
            throw new ArgumentException("--debug-seam-crossing and --debug-fuji-route-seams are mutually exclusive.");

        return new GameOptions(
            Path.GetFullPath(disc), field, screenshot, screenshotFrame,
            cameraPosition, cameraYaw, cameraPitch,
            debugDialogueResident, debugDialogueCloseFrame, debugNearResident,
            debugInteractionZones, debugNearFixedInteraction, debugInteriorIndex, debugInteriorChangeParts, debugViewField, debugWorldFastForwardSeconds,
            debugSeamCrossing, debugFujiRouteSeams, debugRenderWholeWorld, debugGrid);
    }

    private static bool IsWorldFieldNumber(int value)
    {
        if (value is < 0 or > 333)
            return false;
        int a = value / 100;
        int b = (value / 10) % 10;
        int c = value % 10;
        return a <= 3 && b <= 3 && c <= 3;
    }
}
