# PAL UI primitives and menu feedback

Authority: local European `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
Original executable, disc, textures, audio and screenshots remain local only.

## Common menu feedback

The maintained native SFX archaeology already proves three shared requests used by
menu/dialogue hosts: accept `0x001A`, cancel/back `0x001B`, and navigation
`0x001D`. They resolve through `SOUND/CQ_MAIN.TSQ/TVB`; see
`PAL_NATIVE_SFX_RUNTIME_2026-09-18.md`. UI code consumes these requests through
`NativeSfxRuntime` rather than browser-generated replacement sounds.

## Shared PAL text/menu object

Executable callback `0x0023AA68`, used by the common two-choice dialogue path,
allocates a UI/text object through `0x00205F60`. The allocator initializes
signed halfwords `+0x00 = 320` and `+0x02 = 112`, clears its layout/state
fields, and returns the object. The callback then installs two strings through
`0x00205BE8` with flag `0x10`, sets byte `+0x5F = 2`, and applies mode
`5` through `0x00205E10`.

The layout helper at `0x00205E10` is shared rather than screen-specific. Its
low two mode bits select horizontal placement using constants `320`, `52`,
and `588`; the next two bits select vertical placement using constants
`112`, `24`, `168`, and a lower clamp at `216`. The helper derives some
placements from the object's measured width/height. These constants are retained
as executable evidence, but this pass does not assign friendly alignment names
to every bit pattern until all callers are classified.

The variable Q's Factory race callback `0x0023B2E0` uses the same object
allocator and string-install helper while iterating executable-backed entries.
This ties ordinary two-choice dialogue and race/activity selection to one native
UI primitive family instead of independent browser widgets.

## Browser adoption boundary

The browser now marks Q's Factory/fixed-interior choice lists, Q's Factory race
selection, and Pause > Warp destinations with shared `pal-menu-list` /
`pal-menu-row` semantics. Existing screen-specific CSS remains in force.
That is deliberate: the executable evidence above proves shared object/layout
machinery, but does not yet prove the exact retail cursor sprite, animation
period, colours, font atlas identity, or transition duration.

The generic `>` cursor and current host fonts therefore remain presentation
debt, not newly claimed PAL facts. No original font, cursor, texture, screenshot,
or audio payload is committed by this tranche.

## Reproduction

Use `tools/disasm_elf_context.py <SLES_513.56> <address>...`. The helper now
reads virtual addresses through ELF PT_LOAD mappings instead of assuming a
stale flat-file base. Useful anchors are `0x0023AA68`, `0x0023B2E0`,
`0x00205BE8`, `0x00205E10`, and `0x00205F60`.

## Action-05 numeric selector

Callback `0x0023BE00` provides a second concrete UI primitive. On its first
tick it initializes state byte `+0x26` to `1`. Subsequent ticks call
`0x00202760(64, 32, 60, 12, 2)`, then render the selected unsigned decimal
value through `0x00202258(112, 32, value, 10)`. The input guards at
`0x0023BE84..0x0023BEBC` clamp decrement/increment to `0..99`.

Confirmation checks pad bit `0x0040`, compares the selected value with operand
zero, routes to operand one on equality or operand two otherwise, and calls
native SFX request `0x001A` before returning. Unlike list navigation, the
increment/decrement paths contain no call to request `0x001D`. The browser
therefore must not emit the common menu-navigation sound merely because this
numeric value changed.

This extends the evidence boundary beyond semantics: action-05 has native
screen-space anchors for its panel and value. The identities of the low-level
panel and decimal renderer are retained by address and arguments; this pass
does not claim a font atlas, palette, border sprite, or browser-pixel transform
until those lower-level consumers are recovered.

## Change Parts adoption boundary

The browser Change Parts route now uses the shared `pal-menu-list` /
`pal-menu-row` structural seam for both category and owned-part lists. Its
feedback remains evidence-backed: category/item navigation emits recovered
request `0x001D`; applying or cancelling emits the common decision feedback,
and a successful native selector mutation additionally emits equipment-fit
request `0x0303`.

This is deliberately structural only. The current yellow selection fill,
`>` marker, ownership annotations, stat bars and browser typography are not
promoted to PAL-authentic primitives by this adoption.

## Shared renderer and text measurement

The common object is not merely a dialogue state container. Renderer
`0x00205690` loads its signed halfwords `+0x00/+0x02/+0x04/+0x06` and byte
`+0x5F`, then calls the same panel primitive `0x00202760` used directly by
action-05. This ties the recovered object coordinates and layout helper to an
actual native panel draw path.

String measurement at `0x00204218` is variable-width. Bytes `0x7E` (`~`),
`0x5E` (`^`), `0x2F` (`/`) and `0x60` (backtick) consume the following
byte and advance by 16 units. Nonnegative ordinary bytes use the signed width
table rooted at `0x0029F000`; negative bytes advance by 20 units. The
string-install helper uses this measured width when expanding/recentering the
shared object.

These facts justify native width-aware layout as a future reusable primitive,
but do not identify a browser-safe equivalent font, glyph atlas, palette or
selection cursor. Those remain evidence-gated rather than approximated.

## Row cadence and selected-entry rendering

The entry loop in `0x00205690` establishes a fixed native row cadence. Its
working Y coordinate starts at object Y minus 11 and advances by exactly 12
units for each installed entry (`0x00205938`, `0x00205994`). Horizontal
placement is selected from entry flag bits: the row can originate from object
X, object X plus width, or object X plus the stored inset plus 20
(`0x00205958..0x0020598C`).

Selection is not represented by inserting a textual `>`. The loop derives the
active visible row from the object's selection/window state
(`0x002059C4..0x002059DC`) and assigns it a distinct renderer mode before
dispatching the entry text through `0x002042A8`; ordinary rows use another
mode. Flagged entries can instead use `0x00204740` or `0x00202088`.

This proves 12-unit native row spacing and a renderer-level selected-row state.
It still does not prove the visual shape, colour, animation, or browser
equivalent of the selection decoration, so the host `>` marker remains
provisional rather than being labelled native.

## Selected-row mode boundary

For ordinary string entries the row loop passes its selected/ordinary mode as
the fourth argument to `0x002042A8`. That renderer preserves the mode in the
render-command header before iterating glyphs through `0x00201D70`; the
mode is therefore renderer state, not a character prepended to the label.

The shared loop supplies mode `0` for the active visible row
(`0x002059D8..0x002059DC`). Non-active ordinary rows receive mode `10`
when object byte `+0x5F == 2`; other object modes can suppress that override.
Entry flag bits `0x01/0x02` instead select modes `6/5` before the active-row
test, so those flags take precedence over ordinary selection styling.

The glyph routine `0x00201D70` uses executable glyph metrics and emits native
render commands, but this tranche does not establish the final PAL colour or
texture meaning of renderer modes 0/5/6/10. Browser colours must therefore not
be derived from those numeric mode values without further evidence.
