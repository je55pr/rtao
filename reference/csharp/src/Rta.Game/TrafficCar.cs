using Microsoft.Xna.Framework;

namespace Rta.Game;

/// <summary>
/// First faithful overworld traffic mover. Positions follow the resident-specific
/// corridor centreline decoded from SLES_513.56; heading/steering are smoothed only
/// for presentation. Route points may intentionally cross grass, water or other
/// non-road terrain because HG2's roaming residents really do that.
/// </summary>
internal sealed class TrafficCar
{
    private readonly IReadOnlyList<Vector3> _route;
    private readonly FieldSurfaceSampler _surfaceSampler;
    private int _nextPointIndex;

    public TrafficCar(
        string name,
        IReadOnlyList<Vector3> route,
        Vector3 spawnPosition,
        float speed,
        int modelIndex,
        float interactionRadius,
        FieldSurfaceSampler surfaceSampler,
        int fieldNumber = 223,
        int areaIndex = -1)
    {
        Name = name;
        _route = route;
        _surfaceSampler = surfaceSampler;
        Speed = speed;
        ModelIndex = modelIndex;
        InteractionRadius = interactionRadius;
        FieldNumber = fieldNumber;
        AreaIndex = areaIndex;
        Position = spawnPosition;

        if (route.Count >= 2)
        {
            int nearestSegment = FindNearestSegment(route, spawnPosition);
            _nextPointIndex = (nearestSegment + 1) % route.Count;
            SnapHeadingTowardNextPoint();
        }
    }

    public string Name { get; }
    public int ModelIndex { get; }
    public float Speed { get; }
    public float InteractionRadius { get; }
    public int FieldNumber { get; }
    public int AreaIndex { get; }
    public bool HasRoamingRoute => _route.Count >= 2;
    public Vector3 Position { get; private set; }
    public float Yaw { get; private set; }
    public float WheelSpin { get; private set; }
    public float SteeringAngle { get; private set; }
    public int NextRoutePointIndex => _nextPointIndex;
    public Matrix World => Matrix.CreateRotationY(Yaw) * Matrix.CreateTranslation(Position.X, Position.Y + 0.02f, Position.Z);
    public Vector3 Forward => new(MathF.Sin(Yaw), 0f, MathF.Cos(Yaw));

    public void Update(float dt, bool sampleGround = true)
    {
        if (dt <= 0f)
            return;

        if (_route.Count < 2)
        {
            if (sampleGround && _surfaceSampler.TrySampleClosest(Position.X, Position.Z, Position.Y, out float staticGroundY))
                Position = new Vector3(Position.X, staticGroundY, Position.Z);
            SteeringAngle = 0f;
            return;
        }

        float travelRemaining = Speed * dt;
        int safety = _route.Count + 4;
        while (travelRemaining > 0.0001f && safety-- > 0)
        {
            Vector3 target = _route[_nextPointIndex];
            Vector3 toTarget = target - Position;
            toTarget.Y = 0f;
            float horizontalDistance = toTarget.Length();

            // Duplicate corridor gates occur in the original data. Consume them
            // without allowing a zero-length segment to stall a resident forever.
            if (horizontalDistance < 0.05f)
            {
                Position = new Vector3(target.X, target.Y, target.Z);
                AdvancePoint();
                continue;
            }

            Vector3 direction = toTarget / horizontalDistance;
            float desiredYaw = MathF.Atan2(direction.X, direction.Z);
            float yawDelta = WrapAngle(desiredYaw - Yaw);
            float turnStep = 2.8f * dt;
            Yaw += Math.Clamp(yawDelta, -turnStep, turnStep);
            SteeringAngle = Math.Clamp(-yawDelta * 0.8f, -0.42f, 0.42f);

            float step = Math.Min(horizontalDistance, travelRemaining);
            float fraction = step / horizontalDistance;
            Position = new Vector3(
                Position.X + direction.X * step,
                MathHelper.Lerp(Position.Y, target.Y, fraction),
                Position.Z + direction.Z * step);
            travelRemaining -= step;

            if (step >= horizontalDistance - 0.001f)
            {
                Position = target;
                AdvancePoint();
            }
        }

        if (sampleGround && _surfaceSampler.TrySampleClosest(Position.X, Position.Z, Position.Y, out float groundY))
            Position = new Vector3(Position.X, groundY, Position.Z);

        WheelSpin -= Speed * dt / 0.355f;
        if (MathF.Abs(WheelSpin) > MathHelper.TwoPi)
            WheelSpin %= MathHelper.TwoPi;
    }

    private void AdvancePoint() => _nextPointIndex = (_nextPointIndex + 1) % _route.Count;

    private void SnapHeadingTowardNextPoint()
    {
        for (int attempt = 0; attempt < _route.Count; attempt++)
        {
            Vector3 delta = _route[_nextPointIndex] - Position;
            delta.Y = 0f;
            if (delta.LengthSquared() > 0.0025f)
            {
                delta.Normalize();
                Yaw = MathF.Atan2(delta.X, delta.Z);
                return;
            }
            AdvancePoint();
        }
    }

    private static int FindNearestSegment(IReadOnlyList<Vector3> route, Vector3 point)
    {
        int bestIndex = 0;
        float bestDistanceSquared = float.PositiveInfinity;
        for (int i = 0; i < route.Count; i++)
        {
            Vector3 a = route[i];
            Vector3 b = route[(i + 1) % route.Count];
            float distanceSquared = DistanceSquaredToSegmentXZ(point, a, b);
            if (distanceSquared < bestDistanceSquared)
            {
                bestDistanceSquared = distanceSquared;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    private static float DistanceSquaredToSegmentXZ(Vector3 point, Vector3 a, Vector3 b)
    {
        float dx = b.X - a.X;
        float dz = b.Z - a.Z;
        float lengthSquared = dx * dx + dz * dz;
        if (lengthSquared < 0.0001f)
        {
            float px = point.X - a.X;
            float pz = point.Z - a.Z;
            return px * px + pz * pz;
        }

        float t = ((point.X - a.X) * dx + (point.Z - a.Z) * dz) / lengthSquared;
        t = Math.Clamp(t, 0f, 1f);
        float nearestX = a.X + dx * t;
        float nearestZ = a.Z + dz * t;
        float ex = point.X - nearestX;
        float ez = point.Z - nearestZ;
        return ex * ex + ez * ez;
    }

    private static float WrapAngle(float angle)
    {
        while (angle > MathF.PI) angle -= MathHelper.TwoPi;
        while (angle < -MathF.PI) angle += MathHelper.TwoPi;
        return angle;
    }
}
