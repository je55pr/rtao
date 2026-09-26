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
