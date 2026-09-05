using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace Rta.Game;

/// <summary>
/// Tiny runtime bitmap font used by the archaeology build so dialogue/prompt UI does
/// not depend on external font assets or the MonoGame content pipeline.
/// </summary>
internal sealed class PixelTextRenderer : IDisposable
{
    private readonly SpriteBatch _spriteBatch;
    private readonly Texture2D _pixel;

    private static readonly Dictionary<char, string[]> Glyphs = BuildGlyphs();

    public PixelTextRenderer(GraphicsDevice graphicsDevice)
    {
        _spriteBatch = new SpriteBatch(graphicsDevice);
        _pixel = new Texture2D(graphicsDevice, 1, 1, false, SurfaceFormat.Color);
        _pixel.SetData(new[] { Color.White });
    }

    public void Begin(bool linearSampling = false) => _spriteBatch.Begin(
        SpriteSortMode.Deferred,
        BlendState.NonPremultiplied,
        linearSampling ? SamplerState.LinearClamp : SamplerState.PointClamp,
        DepthStencilState.None,
        RasterizerState.CullNone);
    public void End() => _spriteBatch.End();

    public void Fill(Rectangle rectangle, Color color) => _spriteBatch.Draw(_pixel, rectangle, color);

    public void DrawTexture(Texture2D texture, Rectangle destination, Color color) =>
        _spriteBatch.Draw(texture, destination, color);

    public void DrawLine(Vector2 start, Vector2 end, Color color, float thickness = 2f)
    {
        Vector2 delta = end - start;
        float length = delta.Length();
        if (length <= 0.001f)
            return;
        float angle = MathF.Atan2(delta.Y, delta.X);
        _spriteBatch.Draw(_pixel, start, null, color, angle, Vector2.Zero, new Vector2(length, thickness), SpriteEffects.None, 0f);
    }

    public void DrawString(string text, Vector2 position, Color color, int scale = 2)
    {
        int x = (int)position.X;
        int y = (int)position.Y;
        int startX = x;
        foreach (char raw in text)
        {
            if (raw == '\n')
            {
                x = startX;
                y += 8 * scale;
                continue;
            }
            char ch = char.ToUpperInvariant(raw);
            if (!Glyphs.TryGetValue(ch, out string[]? rows))
                rows = Glyphs['?'];
            DrawGlyph(rows, x, y, color, scale);
            x += 6 * scale;
        }
    }

    public int DrawWrappedString(string text, Rectangle bounds, Color color, int scale = 2)
    {
        int maxChars = Math.Max(1, bounds.Width / (6 * scale));
        IReadOnlyList<string> lines = Wrap(text, maxChars);
        int y = bounds.Y;
        foreach (string line in lines)
        {
            DrawString(line, new Vector2(bounds.X, y), color, scale);
            y += 8 * scale;
            if (y + 7 * scale > bounds.Bottom)
                break;
        }
        return y - bounds.Y;
    }

    public static IReadOnlyList<string> Wrap(string text, int maxChars)
    {
        var lines = new List<string>();
        foreach (string paragraph in text.Replace("\r", string.Empty).Split('\n'))
        {
            if (paragraph.Length == 0)
            {
                lines.Add(string.Empty);
                continue;
            }

            string[] words = paragraph.Split(' ', StringSplitOptions.None);
            string current = string.Empty;
            foreach (string word in words)
            {
                if (word.Length > maxChars)
                {
                    if (current.Length > 0)
                    {
                        lines.Add(current);
                        current = string.Empty;
                    }
                    for (int offset = 0; offset < word.Length; offset += maxChars)
                        lines.Add(word.Substring(offset, Math.Min(maxChars, word.Length - offset)));
                    continue;
                }

                string candidate = current.Length == 0 ? word : current + " " + word;
                if (candidate.Length <= maxChars)
                    current = candidate;
                else
                {
                    lines.Add(current);
                    current = word;
                }
            }
            if (current.Length > 0)
                lines.Add(current);
        }
        return lines;
    }

    public void Dispose()
    {
        _spriteBatch.Dispose();
        _pixel.Dispose();
    }

    private void DrawGlyph(string[] rows, int x, int y, Color color, int scale)
    {
        for (int row = 0; row < rows.Length; row++)
        {
            string bits = rows[row];
            for (int col = 0; col < bits.Length; col++)
            {
                if (bits[col] == '1')
                    _spriteBatch.Draw(_pixel, new Rectangle(x + col * scale, y + row * scale, scale, scale), color);
            }
        }
    }

    private static Dictionary<char, string[]> BuildGlyphs()
    {
        var d = new Dictionary<char, string[]>();
        void G(char c, params string[] rows) => d[c] = rows;
        G(' ', "00000","00000","00000","00000","00000","00000","00000");
        G('A', "01110","10001","10001","11111","10001","10001","10001");
        G('B', "11110","10001","10001","11110","10001","10001","11110");
        G('C', "01111","10000","10000","10000","10000","10000","01111");
        G('D', "11110","10001","10001","10001","10001","10001","11110");
        G('E', "11111","10000","10000","11110","10000","10000","11111");
        G('F', "11111","10000","10000","11110","10000","10000","10000");
        G('G', "01111","10000","10000","10111","10001","10001","01111");
        G('H', "10001","10001","10001","11111","10001","10001","10001");
        G('I', "11111","00100","00100","00100","00100","00100","11111");
        G('J', "00111","00010","00010","00010","10010","10010","01100");
        G('K', "10001","10010","10100","11000","10100","10010","10001");
        G('L', "10000","10000","10000","10000","10000","10000","11111");
        G('M', "10001","11011","10101","10101","10001","10001","10001");
        G('N', "10001","11001","10101","10011","10001","10001","10001");
        G('O', "01110","10001","10001","10001","10001","10001","01110");
        G('P', "11110","10001","10001","11110","10000","10000","10000");
        G('Q', "01110","10001","10001","10001","10101","10010","01101");
        G('R', "11110","10001","10001","11110","10100","10010","10001");
        G('S', "01111","10000","10000","01110","00001","00001","11110");
        G('T', "11111","00100","00100","00100","00100","00100","00100");
        G('U', "10001","10001","10001","10001","10001","10001","01110");
        G('V', "10001","10001","10001","10001","10001","01010","00100");
        G('W', "10001","10001","10001","10101","10101","11011","10001");
        G('X', "10001","10001","01010","00100","01010","10001","10001");
        G('Y', "10001","10001","01010","00100","00100","00100","00100");
        G('Z', "11111","00001","00010","00100","01000","10000","11111");
        G('0', "01110","10001","10011","10101","11001","10001","01110");
        G('1', "00100","01100","00100","00100","00100","00100","01110");
        G('2', "01110","10001","00001","00010","00100","01000","11111");
        G('3', "11110","00001","00001","01110","00001","00001","11110");
        G('4', "00010","00110","01010","10010","11111","00010","00010");
        G('5', "11111","10000","10000","11110","00001","00001","11110");
        G('6', "01110","10000","10000","11110","10001","10001","01110");
        G('7', "11111","00001","00010","00100","01000","01000","01000");
        G('8', "01110","10001","10001","01110","10001","10001","01110");
        G('9', "01110","10001","10001","01111","00001","00001","01110");
        G('.', "00000","00000","00000","00000","00000","00110","00110");
        G(',', "00000","00000","00000","00000","00110","00110","00100");
        G('!', "00100","00100","00100","00100","00100","00000","00100");
        G('?', "01110","10001","00001","00010","00100","00000","00100");
        G(':', "00000","00110","00110","00000","00110","00110","00000");
        G(';', "00000","00110","00110","00000","00110","00110","00100");
        G('-', "00000","00000","00000","11111","00000","00000","00000");
        G('+', "00000","00100","00100","11111","00100","00100","00000");
        G('/', "00001","00010","00010","00100","01000","01000","10000");
        G('\\', "10000","01000","01000","00100","00010","00010","00001");
        G('(', "00010","00100","01000","01000","01000","00100","00010");
        G(')', "01000","00100","00010","00010","00010","00100","01000");
        G('\'', "00100","00100","00000","00000","00000","00000","00000");
        G('"', "01010","01010","00000","00000","00000","00000","00000");
        G('=', "00000","11111","00000","11111","00000","00000","00000");
        G('>', "10000","01000","00100","00010","00100","01000","10000");
        G('<', "00001","00010","00100","01000","00100","00010","00001");
        G('_', "00000","00000","00000","00000","00000","00000","11111");
        G('#', "01010","11111","01010","01010","11111","01010","00000");
        G('&', "01100","10010","10100","01000","10101","10010","01101");
        G('%', "11001","11010","00100","01000","10110","10011","00000");
        G('*', "00000","10101","01110","11111","01110","10101","00000");
        G('?', "01110","10001","00001","00010","00100","00000","00100");
        return d;
    }
}
