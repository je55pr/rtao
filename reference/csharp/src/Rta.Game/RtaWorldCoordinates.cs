using Microsoft.Xna.Framework;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// HG2 field coordinates use the opposite X handedness from the MonoGame world we
/// render into. Field 223 spans 0..1600, so reflect X around the field centre while
/// leaving Y/Z unchanged. Keeping this conversion explicit prevents ad-hoc camera,
/// steering, road and billboard sign fixes from drifting apart.
/// </summary>
internal static class RtaWorldCoordinates
{
    public const float FieldExtent = 1600f;

    public static Vector3 Position(NumVector3 source) =>
        new(FieldExtent - source.X, source.Y, source.Z);

    public static Vector3 Position(float x, float y, float z) =>
        new(FieldExtent - x, y, z);

    public static Vector3 LocalVector(NumVector3 source) =>
        new(-source.X, source.Y, source.Z);

    public static float Yaw(float sourceYaw) => -sourceYaw;
}
