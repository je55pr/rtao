# HG2 / Road Trip Adventure format notes — clean-room working evidence

These notes record observations validated against the supplied European `SLES_513.56` disc image. They are intentionally phrased as testable format facts rather than copied implementation details.

## Disc

The supplied image is one `MODE2/2352` track. ISO9660 Form-1 user data is the 2048-byte slice beginning at raw-sector offset 24. `Rta.Disc` reads this directly; no converted ISO is required.

## Field container

A field starts with little-endian 32-bit section offsets. The first offset is also the byte length available to the offset table. Non-zero entries are strictly increasing and the final entry is EOF.

For `FLD/223.BIN` (Peach Town):

- texture data: `0x00000020 .. 0x0007AFFF`
- render meshes: `0x0007B000 .. 0x0042A86F`
- collision: `0x0042A870 .. 0x0053ACFF`
- extra 0: `0x0053AD00 .. 0x0053FC5F` (signature `0x30`)
- extra 1: `0x0053FC60 .. 0x0054EFDF` (signature `0x20`)
- EOF: `0x0054EFE0`

SHA-256 of this exact PAL `FLD/223.BIN` is `3531bf916e54013cd60a58fd770b8ddabfebc08ffc5f2f15986993c0ec372b09`.

## Render spatial directory

Peach Town render meshes begin with an 8×8 spatial directory plus one global chunk:

- 65 little-endian `u32` relative offsets = 260 bytes
- 65 little-endian `u16` declared counts = 130 bytes
- 10 bytes alignment/padding
- first chunk begins at relative `0x190`

The 65 chunk starts are monotonic. Chunk length is the next relative offset minus the current one; the global chunk runs to the end of the render section.

## Collision spatial directory

Collision is a pure 16×16 grid (no 257th global entry):

- 256 little-endian `u32` relative offsets = 1024 bytes
- 256 little-endian `u16` declared counts = 512 bytes
- 8 bytes alignment/padding
- first collision chunk begins at relative `0x608`

This distinction was established directly from the field bytes: treating a 257th value as an offset produces `0x00010001`, which is actually the first pair of count values.

## Render DMA chains

Each Peach Town render chunk is self-contained as an inline DMA chain:

- 64 chunks contain one `CNT` packet followed by `RET`
- 1 chunk contains two `CNT` packets followed by `RET`
- every chain consumes exactly its chunk length

The texture section consists of 282 `CNT` packets followed by one `END`; the chain consumes `0x7AD90` bytes of the `0x7AFE0`-byte texture section, leaving `0x250` bytes of trailing padding/alignment.

## First render VIF packet

The first spatial render chunk's first `CNT` packet decodes completely as:

1. `STCYCL` (`0x01000101`)
2. `UNPACK V3-32`, count 4 (`0x68048192`) — 48 payload bytes
3. `UNPACK V4-32`, count 1 (`0x6C018000`) — 16 payload bytes
4. `UNPACK V3-32`, count 20 (`0x68148001`) — 240 payload bytes
5. `MSCALF`, immediate/entry `8` (`0x15000008`)
6. `NOP`

The complete 320-byte DMA payload is therefore accounted for without heuristic byte searching. All 66 `CNT` packets across Peach Town's 65 render chunks currently parse to known VIF commands and consume their payloads exactly.

## My City (`FLD/023.BIN`)

The top-level container has 84 non-zero offsets total: three primary section starts, 80 post-collision sections, and EOF. The first section starts at `0x160`, making the unusually large header itself independently visible before interpreting any of the embedded content.

## Peach Town fixed overworld interactions

The PAL executable contains a fixed-interaction table for each field. Peach Town has 28 convex X/Z quadrilaterals, matching the first 28 Peach Town fixed resident/activity definitions exactly by local index. The game's executable tests the player point against all four directed polygon edges using cross products; a successful polygon records the corresponding area/local interaction index.

Runtime code keeps the authored polygon as the source of truth but permits a 2 m outside-edge proximity margin for the PC interaction prompt. The format reader also preserves disabled/sentinel geometry. Peach Town's Grandpa Tal entry has repeated `(-1,-1)` vertices and fails the strict polygon test, while the cave entrance is a separate active interaction at the same general location.

## SHOP fixed-slot packages

`SHOP/T00.BIN` (Peach Town) is exactly 28 fixed-size slots of `0x3F000` bytes, one per fixed interaction. Other `SHOP/Txx.BIN` slot counts correlate with their area's fixed-interaction count.

For a normal Peach slot, the beginning is an inline PS2 DMA chain. The first `CNT` packet contains a GS host-to-local image upload with:

- destination format PSMT8 (`PSM = 0x13`)
- transfer dimensions 640×384
- 245,760 bytes of indexed pixel data

The next `CNT` packet uploads a 16×16 PSMCT32 palette (1,024 bytes). Applying the GS CSM1 indexed-palette permutation and PS2 alpha expansion produces the authored straight-alpha RGBA backdrop. The normal chain then terminates with `END`; the Peach Paint Shop slot contains additional packets after the shared backdrop transfers.

The Q's Factory backdrop (slot 0) is therefore not reconstructed geometry: it is an authored 640×384 screen supplied by the original disc at runtime. Transparent/black regions are available for dynamic UI/car/text layers handled separately by the game.

As a regression fingerprint, the decoded RGBA bytes for PAL Peach Town slot 0 have SHA-256 `7813917f1854038264193bbb4ef545fe2f1b8f73e13048678a7a2808fdb50165`.

## High-detail car VU1 shading

The high-detail car path executes VU1 `MSCALF 4`. Its setup routine at microinstruction `0x287` combines the object transform with a shared three-vector normal basis from VU memory 16–18 and retains four lighting colours from memory 20–23. The vertex loop at `0x2C4` consumes position, normal, authored RGB and the third texture-data component as a glossy-surface parameter.

For a transformed normal `N`, the PAL routine's scalar-equivalent RGB path is:

```text
N       = max(transform(localNormal), 0)
diffuse = lightX * N.x + lightY * N.y + ambient
spec    = highlight * surfaceParameter * N.z^8
RGB     = clamp(authoredRGB * selectedPaint * diffuse + spec, 0, 255)
```

Paint selection is also explicit in the microcode: selector zero retains `(1,1,1)`, odd selectors use VU memory 24, and non-zero even selectors use VU memory 25. This matters for unpainted authored details such as Q28's yellow/black hazard stripes; multiplying selector-zero geometry by the body paint destroys those colours.

The neutral source palette at `SLES_513.56` `0x002A2910` is `(0.60, 0.25, 0.60, 0.40)` for the two diffuse terms, highlight and ambient respectively. The stable daylight path applies a `1.1` weight, producing live VU colours `(0.66, 0.275, 0.66, 0.44)`. Adjacent tables `0x002A2950` and `0x002A2990` are the warm-transition and night palettes.

The shared normal block at EE `0x01824E00` is not the view matrix. Live PAL samples show two stable source-space light directions:

```text
L0 = (-0.707106769,  0.707106769,  0)
L1 = ( 0.447221488,  0.447221488, -0.774587572)
```

Function `0x00227128` updates only the third column as `normalize(L0 - cameraForward)`, equivalent to the Blinn half-vector for the camera's opposing view direction. The MonoGame renderer reflects source X once, combines those three columns with each object's rotation, and runs the decoded colour equation on retained source normals/colours before drawing. The full world/view matrix is not used as a substitute normal basis.

## PAL dialogue / interaction bytecode

The PAL executable's dialogue hierarchy is rooted at virtual address `0x002A4620`. Dialogue entries are pointer-table slots rather than plain C strings: control operands can legally contain `0x00` or printable ASCII values, so a variant must be tokenized according to the VM before its logical end can be determined.

Q's Factory exposes 72 English pointer-table slots/streams. Tracing the executable shows two phase-sensitive dispatchers:

- pre-text dispatcher at `0x0023C870`
- post-text/action dispatcher at `0x0023D078`

The same control byte can therefore have different semantics depending on whether it is encountered before visible text or at the terminal action boundary. For example, pre-text `0x01` is a conditional branch on a flag, while action-phase `0x01` presents a Yes/No choice with two dialogue targets. Action-phase `0x02` is the corresponding Yes/No selector with the opposite default cursor choice.

Q's Factory uses action `0x09` for a variable-length menu encoded as:

```text
09
<option text 1> 00
<option text 2> 00
...
09
<target slot 1> <target slot 2> ...
```

Its normal slot-04 menu resolves directly from executable data to five options whose target slots are `05`, `07`, `06`, `08` and `0B` respectively. The World Grand Prix and Q's Rally menus use the same structure with different labels/targets.

Traced Q's Factory action behavior currently includes:

- action `0x01` / `0x02`: Yes/No selection with two target slots and different default choice
- action `0x03`: start race; operand selects the current or explicit race ID
- action `0x08`: Q's Factory race-selection handoff with selected/cancel targets
- action `0x09`: variable-length menu
- action `0x0E`: Save Data handoff with a return target
- action `0x14`: area/interaction transition

Traced pre-text behavior includes conditional flag branches, result/team/rally/progression gates, set/clear flag operations, rally-stage writes and current-area branching. Runtime execution is intentionally limited to semantics established from executable control flow; untraced controls remain represented as raw tokens.

Action widths are not globally fixed by byte value alone. In roaming-resident streams, actions `0x08` and `0x09` also occur in short forms with a single zero sentinel. The tokenizer therefore preserves these context-dependent forms rather than applying Q's Factory's richer payload interpretation to every entity.

The engine-neutral `PalDialogueFlow` executes the proven branch/state/menu/Yes-No subset and exposes gameplay-owned operations such as parts selection, race selection, saving and race launch as explicit external actions. This lets the MonoGame runtime follow original dialogue targets without fabricating unreconstructed host systems.

## PAL race/activity catalogue and rewards

The activity launcher at `0x002106B8` selects 39 16-byte descriptors from two
tables: IDs 0–34 at `0x002BFE48`, then IDs 35–38 at `0x002C0090`. Names come
from the pointer table at `0x002C0410`. Selection code at `0x00238D50` proves
that IDs 0–23 are the ordinary-race range.

For ordinary races, descriptor byte 0 selects the course package and byte 3 is
the licence/prize class. Descriptor `+4` points to a 24-byte settings record;
settings `+0` points to a `(areaIndex,residentIndex)` byte-pair list terminated
by `(0,0)`. The area-indexed resident blocks at `0x002C4340` resolve the name,
body and packed paint for every participant. Descriptor bytes 1–2 and settings
bytes 4–23 remain raw.

The selector table at `0x002C0078` is twelve `(firstActivityId,count)` pairs:
`(0,0) (0,3) (3,3) (6,4) (10,4) (14,4) (18,2) (20,4) (25,1)
(24,1) (0,0) (0,0)`. The ordinary descriptors contain six class-C, nine
class-B and nine class-A races. Their fifteen unique course IDs are 0–14 and
map to `COURSE/C00.BIN`–`COURSE/C14.BIN` only under the ordinary handler.

Prize function `0x00237A00` indexes the 4×6 dword Cake table at `0x002A5218`
for up to three team finish bytes; indices 6 and above earn zero. Rows are C
`800,500,400,300,200,100`; B `1500,1200,1000,800,600,500`; A
`2500,2000,1600,1200,1000,800`; Super A
`80000,60000,40000,30000,20000,10000`. `0x00239440` retains the lower player
finish index in the 24 bytes at save `+0xFF0`. `0x00238D00` advances licence
byte `+0x651` only after every race in the current class has a top-six result.

See `PAL_RACE_ARCHAEOLOGY_2026-09-05.md` for deterministic PAL course compiler
totals and the current implementation boundary.

## Ordinary outdoor sector topology — multi-seam evidence

The 64 ordinary `FLD/000`–`FLD/333` files map to an 8×8 source grid with 1600-unit sectors. The established filename mapping is:

```text
column = 2*b + (c & 1)
row    = 2*a + (c >> 1)
```

for field digits `abc`. Odd source rows begin at `column*1600 + 800`; even rows begin at `column*1600`. Source X is cyclic over 12,800 units. This is kept separate from the MonoGame local-X reflection and from fixed map/debug unwrapping.

Field-local source X uses half-open ownership: `[0,1600)`. Therefore a point exactly at local X=1600 belongs to the next cyclic sector at local X=0. This matters in runtime normalization: accepting X=1600 in the current candidate and merely rewriting it to 0 changes its canonical position by one complete 1600-unit sector.

A broader PAL-disc check now validates this against authored minimap road geometry rather than relying on one Peach Town boundary. Same-row road ribbons overlap across these eight independent E/W boundaries:

```text
023 <-> 022
111 <-> 110
121 <-> 120
203 <-> 202
213 <-> 212
221 <-> 220
222 <-> 213
223 <-> 222
```

Eight independent Z-row crossings also coincide after converting each raw boundary vertex through the canonical topology, which makes the alternating +/-800 relationship part of the assertion rather than a fixture correction:

```text
103 <-> 110
111 <-> 012
113 <-> 120
121 <-> 023
203 <-> 210
210 <-> 103
220 <-> 113
223 <-> 221
```

The same seam evidence exposes a concrete authored road-field chain from Peach Town toward Fuji City:

```text
223 -> 221 -> 220 -> 113
Peach    ...   Bridge   Fuji
```

The minimap road triangles in each of those four fields form one connected road polygon, and the ordinary render mesh exposes coincident edge heights at all three route seams (223/221 at Y=30, 221/220 at Y=5, and the principal 220/113 road surface at Y=25). A deterministic Q62 runtime probe now also drives across all three boundaries with the real vehicle controller/collision sampler, preserving speed and simulation state. It also means a visually surprising all-world (`F4`) camera view is not sufficient evidence for changing the canonical row transform: the raw authored boundaries agree across several unrelated parts of the world.

## Field material state block widths

Ordinary HG2 `MSCALF 8` field geometry uses two common VIF `V3-32` material update shapes. The first vector is **not** a mysterious GS state register after all: its 64-bit payload is the low word of a compact material GIF tag, and the third dword is the low part of the tag's register-descriptor word (`0x0E`, meaning the tag emits A+D packets). The two observed payloads are:

```text
0x1000000000008003  => GIF_TAG(NLOOP=3, EOP=1, FLG=PACKED, NREG=1, REG0=A+D)
0x1000000000008004  => GIF_TAG(NLOOP=4, EOP=1, FLG=PACKED, NREG=1, REG0=A+D)
```

Those tags are followed by the actual per-material state writes:

```text
0x15  TEX1_2
0x07  TEX0_2
0x09  CLAMP_2
```

A very common mipmapped form appends:

```text
0x35  MIPTBP1_2
```

A PAL world scan found 9,275 four-vector blocks (material GIF tag + TEX1/TEX0/CLAMP) and **7,433 five-vector blocks across 60/64 outdoor FLDs**. The parser must recognise both. Ignoring the five-vector form does not merely lose mip information: it leaves the previous material active for the following primitive. In FLD/221 chunk 26, a yellow warning-sign material (TBP 12178) is followed by a five-vector update selecting TBP 12201, a 128x64 asphalt texture. Missing that update paints broad road strips with the sign/grass state and can make the road appear transparent/corrupt even though collision and geometry are correct.

This discovery also removes one previously plausible rabbit hole: that first slot is **not hidden night-state or blend-state data**. It is just the compact GIF tag announcing whether the material update carries three or four following A+D register writes.

The current renderer still uses mip level 0 only, but `FieldMaterial` preserves decoded `MIPTBP1_2` so full PS2 mip filtering can be implemented later without redoing the parser archaeology.


## Day/night field colour channels and alpha-tested field cards

The five V3-32 vectors per HG2 field vertex include distinct `DayColor` and `NightColor` vectors. FLD/113 contains 100 untextured primitives whose DayColor is exactly black while NightColor is warm/non-zero. Early Fuji window comparisons made these look like a single "night-only overlay" class, but later shop-door ground truth refined that interpretation: some members are authored black interior/backing volumes by day and become warm-lit at night, while others sit behind ordinary facade layers and are naturally hidden by depth/geometry. `FieldRenderPrimitive.IsDayBlackNightLitLayer` therefore classifies the data without imposing visibility, and the daytime renderer no longer blanket-discards this static family.

A separate billboard family is unambiguously day-hidden. FLD/220 has exactly 62 camera-facing light sprites whose average authored NightColor is at least 180 while DayColor is at most 110: 8 soft yellow glows (TBP 10505), 48 green suspension-cable coronas (TBP 10525), and 6 orange/yellow tower coronas (TBP 10534). A full-world scan found no other outdoor billboards matching that signature, and original daytime/nighttime bridge captures show these exact effects absent by day and bright at night. `IsNightLightBillboard` captures that evidence-driven family so the daytime renderer omits only those sprites while preserving their original data for a later clock renderer.

The small FLD/221 hole reported at render-local X193/Z1443 also has authored render/collision coverage. Its disappearance under draw-order experiments established a depth/alpha issue: alpha-bearing fringe textures were submitted with blending while fully transparent texels could still write depth. The renderer separates opaque from alpha-bearing texture groups and uses MonoGame `AlphaTestEffect` with `AlphaFunction=Greater` / `ReferenceAlpha=0` for the latter. Fully transparent texels are discarded before depth output, while visible foliage/edge texels continue to write depth and therefore occlude farther cards.

HumanEyes later exposed a second alpha mismatch as white/cyan outlines around trees and bunting. The source textures contain arbitrary RGB in transparent/near-transparent indexed palette entries and request linear filtering. Straight-alpha bilinear interpolation lets that hidden RGB contaminate edge samples before blending. Alpha-bearing field textures are now premultiplied on upload and drawn with premultiplied `BlendState.AlphaBlend`; interpolation is therefore alpha-weighted while the alpha-test/depth behavior above remains intact. This is still an approximation of HG2's exact GS TEST/ALPHA pipeline, but it matches the observed foliage/bunting edges without raising the alpha cutoff and destroying authored soft pixels.

### Ordinary MSCALF-8 visibility selector

The primitive GIF-tag register descriptor contains a deliberate HG2-only selector bit at `0x0000000200000000`. The actual three packed GS descriptors still occupy the low nibbles, but VU program 8 inspects this high bit: **clear selects VU memory 20; set selects VU memory 21**. A whole-field census shows memory 20 is the dominant path (roughly 96% of Peach, 93% of Fuji and 84% of FLD/220 bridge primitives in the inspected PAL fields).

Memory 21 is stable `[128,255,0.5,800]`, producing fog-full ~290, alpha-full ~544 and far 800. Above water, memory 20 is time-dependent: daytime reaches the same vector, while deep night reaches approximately `[128,255,1.0,300]`, producing fog-full ~45, alpha-full ~172 and far 300. Dawn/dusk interpolate continuously using the same recovered time envelope. The TypeScript cache v8 preserves this selector per batch; Authentic visibility uses it, while Extended/Unlimited remain deliberate browser-port policies.

This discovery explains the former apparent near-field night-brightness problem: most geometry 50–300 m from the camera had incorrectly been left on the long 800 m profile. No arbitrary global darkness multiplier is needed to account for that range. Billboard MSCALF-6 remains a separate visibility path.

A later Chromium comparison exposed one more colour-space trap: the recovered fog/alpha source factors were correct, but compositing them in linear light left authentic-night captures too vivid, especially at medium/far range (for example Fuji's horizon grass and the bridge-water vista). The PS2 GS blends in display-byte space, so the modern shader now round-trips both the already-decoded source colour and the executable-derived atmosphere colour back to encoded sRGB/display space, applies the combined fog×alpha source factor there, and decodes once for final presentation. This sits alongside the existing display-space `TFX=MODULATE` fix; both are required to avoid the browser renderer looking materially brighter than the original PAL game.

## Fuji layered-static repeats

HumanEyes camera movement around FLD/113 X875/Z733 exposed shimmer on some wall/window layers. HG2 intentionally contains coplanar backing/detail surfaces, so this must not be treated as a generic "deduplicate coplanar triangles" problem. A much narrower class is measurable: inside one spatial chunk/material/TME group, 100 Fuji triangles repeat the same renderer-visible packed day colour and normalized UVs while source positions differ only below one millimetre. A world scan found 475 of these repeats (~0.052% of decoded field triangles). The modern renderer submits the global backing chunk first and suppresses only this renderer-indistinguishable repeat key; no global vertex welding or polygon offset is applied.

## Dynamic palm crown object path

FLD/221's five clustered and one remote coastal trunks use TBP 11806 and line up with six palm-shaped ground-shadow cards using TBP 11986. Each trunk also has a tiny untextured horizontal top cap while the trunk material remains current; those six cap centroids provide authored attachment markers. Hidden frond material TBP 11762 is PSMT8 64x32 and is referenced by a small offstage Y=-50 primitive in the ordinary field stream.

The actual crown geometry lives in Extra[1]. Its first three nested object sections contain 1, 2 and 3 textured triangle-strip primitives respectively, for six radial fronds / 24 source vertices around one local attachment origin. The primary copies execute `MSCALF 4`; equivalent later copies use `MSCALF 10`. FLD/220 contains the same Extra[1] crown object, supporting a reusable dynamic-object path rather than a field-specific reconstruction. Original-game footage confirms the placed crown sways gently in wind. The current renderer preserves the authored 1+2+3 grouping and applies a small phase-shifted sway to those groups; geometry, texture and placement are data-driven, while the original VU routine's exact timing/amplitude constants are not yet decoded.

FLD/220 uses more than one authored top-cap shape. Some palms match FLD/221's zero-thickness untextured cap, while others use a shallow ~0.052 m bevelled cap or keep texture mapping enabled on the cap primitive. All retain the same trunk material state. Restricting attachment discovery to exactly horizontal, TME-disabled caps finds only 55 markers; accepting the thin/texture-enabled variants yields 106 markers in the dominant trunk-cap material family. One edge-case trunk cluster near the field boundary lacks this small-cap form and is left unresolved rather than inferred.
