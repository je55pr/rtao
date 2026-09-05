# RTA browser port

Three.js and TypeScript browser implementation developed beside the C# reference projects.

```bash
npm install
npm run dev
npm run check
```

Open the local URL shown by Vite and choose a PAL Road Trip Adventure ISO or ZIP. Game data is processed locally in a worker and installed into the browser's private origin storage. It is not uploaded. All 64 ordinary outdoor sectors and their collision meshes are compiled once. Explore the complete world overview, use a named focus view, or select **Start driving Q62** and drive with WASD/arrow keys; hold Shift for the developer speed boost.

For deterministic visual comparisons after installation, append `?capture=world`, `?capture=peach`, `?capture=fuji`, `?capture=white-mountain`, `?capture=papaya`, or `?capture=qfactory`. The harness renders an exact 1280x960 PNG independent of viewport size and shows its SHA-256 alongside links to the other canonical scenes.

Fixed-interior probes use `?interiorProbe=AREA:SLOT` (for example `1:4` for
Peach Bartender); `?interiorProbe=qfactory` remains the specialised Q's Factory
shortcut. For a lightweight room-only 1280x960 PNG without loading the outdoor
world, run `python3 ../shop_room_capture.py AREA SLOT OUTPUT.png`. Both that
helper and `../shop_census.py` accept `RTA_GAME_DIR` and
`RTA_CHROMIUM_EXECUTABLE` environment overrides. Add
`--metadata OUTPUT.json` to persist the paired executable entity, entry slot,
pages, validated choices, and external-action boundary. Room captures include
the player Q62 and the fixed interaction's executable-defined staff body/paint;
if a dialogue stream is still deferred, the PNG is still produced and the
metadata sidecar records the decode error.

`python3 ../shop_readiness.py OUTPUT.json --markdown OUTPUT.md` reads the PAL
executable once and emits the complete 235-room interaction/dependency census,
including every paired dialogue entry, action shape/control opcode and exact
decoder deferral.

`python3 ../shop_regression.py OUTPUT_DIR [CASES...]` runs the representative
PAL fixed-interior regression set. Each named room is captured twice, must be a
valid 1280x960 PNG, must repeat byte-for-byte, and must match its verified
Chrome/SwiftShader SHA-256 baseline. The default set covers Peach Bartender,
Jousset, Fight, Grandpa Tal and Wolf plus Fuji Barkeeper, Echigoya sales
assistant and Dumpling Cake shop without loading the outdoor world. The four
new Peach cases also assert their PAL entry-dialogue metadata.
Wolf additionally follows the authored `No` choice and asserts the resulting
slot-06 `0x08 [0]` terminal boundary. Picarl adds a ninth, geographically
distinct ordinary conversation room with no post-text action opcode.
Peach Policeman and Peach FM add two recovered decoder-boundary cases whose
fixed-width actions omit only trailing zero operands at exact stream edges.

See [`../docs/WEB_PORT.md`](../docs/WEB_PORT.md) for supported source formats, storage layout, architecture, validation and the current parity boundary.

## Low-memory sandbox capture fixture

Routine visual-regression captures do not need to reopen the full PAL game image.
The repository-root `sandbox_fixture.py` helper maintains an untracked
`.dev-cache/capture-fixture/` containing `SORA.GSL`, serialized `RTAFLD*.mesh`
files, and a small `fixture.json` manifest.

Refresh the fixture only after the field compiler/cache changes or when adding a
new regression field:

```bash
xvfb-run -a python3 sandbox_fixture.py refresh 223 113 220
```

Then capture from the derived files without opening the BIN/CUE or recompiling
field geometry:

```bash
xvfb-run -a python3 sandbox_fixture.py capture peach-night-ground /tmp/peach.png
```

The capture bundle embeds an SHA-256 fingerprint of the field-compiler sources.
A stale fixture is rejected automatically even if a cache-version bump was
accidentally omitted. `.dev-cache/` is deliberately ignored and must never be
included in handoff/source archives because its contents are derived from the
user-supplied game.

The fixture path is validated for FLD/223: a 6,514,849-byte mesh can be exported
and reused for a deterministic 1280x960 Peach capture without reopening the PAL
source. Download Blob URLs remain leased until fixture-source disposal so
Chromium cannot truncate a multi-megabyte download while Playwright saves it.
