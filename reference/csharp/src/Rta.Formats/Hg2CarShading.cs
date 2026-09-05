using System.Numerics;

namespace Rta.Formats;

/// <summary>
/// Inputs retained by HG2's high-detail car VU1 program after its matrix setup.
/// Basis vectors transform a source normal; the four colour vectors supply two
/// directional terms, the glossy highlight colour, and ambient light.
/// </summary>
public readonly record struct Hg2CarLighting(
    Vector3 NormalBasisX,
    Vector3 NormalBasisY,
    Vector3 NormalBasisZ,
    Vector3 DirectionalX,
    Vector3 DirectionalY,
    Vector3 HighlightColor,
    Vector3 AmbientColor);

/// <summary>
/// Clean-room scalar equivalent of the colour path in PAL SLES_513.56's VU1
/// MSCALF-4 routine (microinstructions 0x2D3-0x2F8).
/// </summary>
public static class Hg2CarShading
{
    // Live PAL EE block 0x01824E00, sampled while the original rendered its
    // 3D title sequence. These are the two fixed world-space diffuse axes;
    // the third axis is a camera-dependent Blinn half-vector.
    public static readonly Vector3 PalPrimaryLightDirection =
        new(-0.707106769f, 0.707106769f, -0f);
    public static readonly Vector3 PalSecondaryLightDirection =
        new(0.447221488f, 0.447221488f, -0.774587572f);

    /// <summary>
    /// Reproduces MSCALF-4's colour selector. Zero leaves authored colours
    /// untouched; odd values select VU memory 24 and non-zero even values
    /// select VU memory 25.
    /// </summary>
    public static Vector3 SelectPaintFactor(
        byte colorSelection,
        Vector3 primaryPaint,
        Vector3 secondaryPaint) => colorSelection switch
        {
            0 => Vector3.One,
            _ when (colorSelection & 1) != 0 => primaryPaint,
            _ => secondaryPaint
        };

    /// <summary>
    /// Creates the neutral daylight setup derived from SLES_513.56 0x2A2910.
    /// The adjacent 0x2A2950 and 0x2A2990 blocks are the warm transition and
    /// blue night palettes and can be blended when the host clock is implemented.
    /// The stable daytime path applies its 1.1 intensity weight before upload.
    /// </summary>
    public static Hg2CarLighting CreatePalDaylight(
        Vector3 normalBasisX,
        Vector3 normalBasisY,
        Vector3 normalBasisZ) => new(
            normalBasisX,
            normalBasisY,
            normalBasisZ,
            DirectionalX: new Vector3(0.66f),
            DirectionalY: new Vector3(0.275f),
            HighlightColor: new Vector3(0.66f),
            AmbientColor: new Vector3(0.44f));

    /// <param name="authoredColor">Raw car vertex colour, normally in the 0..255 domain.</param>
    /// <param name="paintFactor">Selected primary/secondary paint vector, normally in the 0..1 domain.</param>
    /// <param name="surfaceParameter">Authored per-vertex highlight scale from TextureData.Z.</param>
    /// <returns>Final raw RGB value clamped to the PS2 routine's 0..255 output domain.</returns>
    public static Vector3 Shade(
        Vector3 normal,
        Vector3 authoredColor,
        Vector3 paintFactor,
        float surfaceParameter,
        in Hg2CarLighting lighting)
    {
        Vector3 transformedNormal =
            lighting.NormalBasisX * normal.X +
            lighting.NormalBasisY * normal.Y +
            lighting.NormalBasisZ * normal.Z;
        transformedNormal = Vector3.Max(transformedNormal, Vector3.Zero);

        Vector3 diffuse =
            lighting.DirectionalX * transformedNormal.X +
            lighting.DirectionalY * transformedNormal.Y +
            lighting.AmbientColor;

        float z2 = transformedNormal.Z * transformedNormal.Z;
        float z4 = z2 * z2;
        float z8 = z4 * z4;
        Vector3 baseColor = authoredColor * paintFactor;
        Vector3 highlight = lighting.HighlightColor * (surfaceParameter * z8);
        return Vector3.Clamp(baseColor * diffuse + highlight, Vector3.Zero, new Vector3(255f));
    }
}
