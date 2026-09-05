using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;

namespace Rta.Game;

internal sealed class DebugCamera
{
    private float _yaw;
    private float _pitch = -0.32f;
    private bool _mouseLookActive;
    private Point _lastMouse;

    public Vector3 Position { get; private set; } = new(800f, 220f, 950f);
    public Matrix View { get; private set; } = Matrix.Identity;
    public Matrix Projection { get; private set; } = Matrix.Identity;

    public void SetPose(Vector3 position, float? yaw = null, float? pitch = null)
    {
        Position = position;
        if (yaw is not null)
            _yaw = yaw.Value;
        if (pitch is not null)
            _pitch = pitch.Value;
        RebuildView();
    }


    public void SetLookAt(Vector3 position, Vector3 target)
    {
        Position = position;
        Vector3 direction = target - position;
        if (direction.LengthSquared() < 0.000001f)
            direction = Vector3.Forward;
        direction.Normalize();
        _pitch = MathF.Asin(MathHelper.Clamp(direction.Y, -1f, 1f));
        _yaw = MathF.Atan2(-direction.X, -direction.Z);
        View = Matrix.CreateLookAt(Position, target, Vector3.Up);
    }

    public void Resize(Viewport viewport)
    {
        float aspect = Math.Max(1f, viewport.AspectRatio);
        Projection = Matrix.CreatePerspectiveFieldOfView(MathHelper.ToRadians(65f), aspect, 1.0f, 20_000f);
        RebuildView();
    }

    public void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        KeyboardState keyboard = Keyboard.GetState();
        MouseState mouse = Mouse.GetState();

        bool mouseLook = mouse.RightButton == ButtonState.Pressed;
        if (mouseLook)
        {
            Point current = new(mouse.X, mouse.Y);
            if (_mouseLookActive)
            {
                int deltaX = current.X - _lastMouse.X;
                int deltaY = current.Y - _lastMouse.Y;
                _yaw -= deltaX * 0.004f;
                _pitch = MathHelper.Clamp(_pitch - deltaY * 0.004f, -1.54f, 1.54f);
            }
            _lastMouse = current;
        }
        _mouseLookActive = mouseLook;

        Matrix rotation = Matrix.CreateFromYawPitchRoll(_yaw, _pitch, 0f);
        Vector3 forward = Vector3.Transform(Vector3.Forward, rotation);
        Vector3 right = Vector3.Transform(Vector3.Right, rotation);
        Vector3 up = Vector3.Up;

        Vector3 movement = Vector3.Zero;
        if (keyboard.IsKeyDown(Keys.W)) movement += forward;
        if (keyboard.IsKeyDown(Keys.S)) movement -= forward;
        if (keyboard.IsKeyDown(Keys.D)) movement += right;
        if (keyboard.IsKeyDown(Keys.A)) movement -= right;
        if (keyboard.IsKeyDown(Keys.Space)) movement += up;
        if (keyboard.IsKeyDown(Keys.LeftControl) || keyboard.IsKeyDown(Keys.C)) movement -= up;

        if (movement.LengthSquared() > 0f)
        {
            movement.Normalize();
            float speed = keyboard.IsKeyDown(Keys.LeftShift) ? 600f : 150f;
            Position += movement * speed * dt;
        }

        RebuildView();
    }

    private void RebuildView()
    {
        Matrix rotation = Matrix.CreateFromYawPitchRoll(_yaw, _pitch, 0f);
        Vector3 forward = Vector3.Transform(Vector3.Forward, rotation);
        View = Matrix.CreateLookAt(Position, Position + forward, Vector3.Up);
    }
}
