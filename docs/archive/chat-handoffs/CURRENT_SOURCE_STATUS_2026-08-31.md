# Current source status — 2026-08-31

This tree is the **live reconstructed source state after the Aug-31 recovery pass**. It supersedes the older `RTA_ThreeJS_RESTORED_checkpoint_2026-08-31.zip` and the Aug-30 night-work snapshot.

## Restored and present in source

- Q28 raw executable yaw restored; do not re-add a blanket `+π` to the staff truck.
- Three.js car UV convention restored via `carTextureUv`: authored V is used directly rather than inheriting MonoGame/XNA's `1 - V` correction.
- Q's Factory compositing restored: world/floor -> authored SHOP scenery -> clear depth -> live cars -> UI.
- Compiled field cache is **v8 / `RTAFLD8!`**; batches preserve HG2's authored ordinary-field memory-20 vs memory-21 visibility selector.
- Field batches retain Day/Warm/Night RGB plus GS TEX0 `TCC` and `TFX` state.
- The disproven `Unknown.x = opacity` interpretation is removed.
- PAL outdoor clock is **216,000 units/day; 9,000 units/hour**.
- Stable field-VU endpoints use the executable-proven **1.1** coefficient, with the 0.1 overlap during transitions.
- Executable-derived FOGCOL/background curves are present, including correct sRGB/display-byte -> Three linear conversion.
- Field atmosphere composition now also round-trips through GS display-byte/sRGB space before applying the recovered fog×alpha source factor; this darkens authentic night captures toward the PAL original instead of leaving distant geometry too vivid.
- Visibility policies are first-class: **Original PS2 / Extended / Unlimited**.
- Ordinary MSCALF-8 authentic atmosphere is now selected per authored primitive. Stable VU memory 21 stays at ~290 fog-full / ~544 alpha-full / 800 far; dynamic VU memory 20 contracts with time of day to ~45 / ~172 / 300 at deep night. Billboard MSCALF-6 remains separate/unresolved.
- Deterministic matched Peach/Fuji/bridge capture definitions are present.
- C# archaeology tooling reports world TEX0 state.
- The former per-material `UnknownRegister` is now correctly decoded as a compact material GIF tag (`NLOOP=3/4`, `REG0=A+D`), ruling that slot out as hidden blend/night state.

## Latest GS colour-domain correction (post-checkpoint)

The earlier neon-bright "exact GS MODULATE" experiment was found to have applied the PS2 `/128` modulation scale **twice**.

The compiler's `fieldColorByte(raw)` already maps the GS 0..128 domain into a normalized Three vertex attribute such that `vColor ≈ raw / 128`. Therefore:

- textured `TFX=MODULATE` geometry should multiply the encoded/sRGB texture by `vColor` directly — **no additional `255/128` multiplier**;
- the same GS colour-space rule also applies to fog/alpha composition: blend source vs atmosphere in encoded/display space, then decode once for final output.
- untextured `TME=0` geometry uses the VU RGB as a direct GS display value, so the shader converts the normalized `raw/128` attribute back to `raw/255` before sRGB->linear conversion.

This logic is implemented in `web/src/game/worldView.ts` and has dependency-free regressions in:

- `web/src/game/fieldGsColor.ts`
- `web/src/game/fieldGsColor.test.ts`

The C# whole-world census also distinguishes texture-enable state. Latest known results from the recovery session:

- **423,182 / 423,182 field primitives use TFX=0 (MODULATE)**
- **423,182 / 423,182 use TCC=1 (RGBA)**
- **418,115 textured primitives**
- **5,067 explicitly untextured (TME=0) primitives**

This corrected colour-domain shader is the current active implementation. The npm dependency tree and PAL BIN/CUE are both available locally; deterministic Chromium captures now run directly against `SLES_513.56`.

## Validation state

Completed during the recovery pass:

- `Rta.Tools` Release build: 0 warnings / 0 errors.
- Actual PAL BIN/CUE C# regression suite: **39/39 passed** before the final GS-colour-domain source edits (those edits affect the browser side plus diagnostic reporting, not the C# parsers themselves).
- PAL field census above completed successfully.
- Dependency-free TypeScript lighting/cache/GS-colour equations were checked during recovery.

Completed after restoring the offline dependency tree:

```bash
cd web
npm run check
```

Current result: **21/21 Vitest files, 64/64 tests, Vite production build and sandbox capture bundle all pass locally.**

Deterministic PAL Chromium closure captures have now been regenerated. Key results:

- Peach 22:00 authentic now uses the recovered short memory-20 night profile and visually collapses medium-distance countryside/town geometry into the original-style darkness.
- Fuji 22:00 authentic remains coherent under the same profile.
- The bridge regression camera was moved from a high aerial overview to the bridge road itself; the old camera was mostly beyond HG2's recovered 300 m deep-night far distance and therefore ceased to be a meaningful night test. The new bridge day/night pair preserves the road/tower while showing the 62 authored night coronas correctly.
- Peach noon remains healthy after the v8 batch split.
- Peach 22:00 Extended is **byte-for-byte identical** to the pre-v8 capture (`32b4ac65...`), proving the authored authentic-profile recovery did not alter the convenience mode.

## Current forward-development frontier

The **ordinary outdoor day/night milestone is closed for now**. Do not reopen broad night archaeology without a concrete visual/gameplay discrepancy. Remaining specialised follow-ups are intentionally deferred: exact SORA night-strip geometry/timing, MSCALF-6 billboard atmosphere, any residual GS draw-order edge cases, and later equipment-specific headlight beams.

The active next milestone is **generalising the Three.js interior pipeline beyond Q's Factory**: separate reusable SHOP/interior decoding, scene composition, camera/background layers and host/session behaviour from QFactory-specific gameplay so additional fixed-camera interiors can be brought online one by one against original-game references.


## Generic SHOP interior entry — 2026-09-01

The active web runtime now has a truthful generic fallback for fixed interiors:

- authored area `N` maps to `SHOP/T(N-1).BIN`; this mapping has a web regression test;
- every non-QFactory fixed interaction can pause the overworld, decode its authored
  `localIndex` slot, and render the shared fixed-camera SHOP room composition;
- the common room layer uses the same recovered projection as QFactory, repeats
  the authored floor swatch, then overlays the authored scenery cutout;
- exiting resumes the same driving/resident simulation state;
- Q's Factory remains on its richer specialised renderer with tiled floor, live
  player/staff cars, rotating platform and dialogue/Change Parts composition.

This architecture agrees with the historical MonoGame archaeology, whose generic
interior implementation also mapped fixed interaction index -> SHOP slot -> decoded
640x384 backdrop while pausing/resuming the overworld. The richer composition of
individual rooms should therefore be layered on top rather than baked into the
common decoder.

Validation after this step: **21/21 web test files, 65/65 tests**, production Vite
build and sandbox-capture bundle all pass.

A lightweight `shop_census.py` / `shop_room_capture.py` / sandbox-capture API can render every authored
slot in one `SHOP/Txx.BIN` package as a labelled PNG contact sheet. This avoids
loading fields/world geometry and is the preferred way to choose the next room.

Runtime visual validation against PAL Peach slots confirms the shared composition:
Bartender (slot 04), Policeman (05), and Kevin's mom (08) all assemble into coherent
rooms with the same floor/scenery base. The executable-labelled Peach census shows
28 slots, with QFactory/Parts/Body/Paint shops plus many house/activity rooms. Scene-
specific dynamic layers (cars, menus, cursor, NPC/UI, Paint Shop extras) remain
separate follow-up work rather than blockers for basic room visibility.

## Low-memory sandbox capture fixture (2026-09-01 source pass)

Routine deterministic screenshots are being decoupled from the full PAL disc:

- `.dev-cache/` is untracked and reserved for user-derived local fixtures;
- the sandbox capture bundle can load `fixture.json`, `SORA.GSL` and serialized
  `field-###.mesh` files directly, skipping ISO/BIN parsing and field compilation;
- the one-time builder exports sky/fields one at a time as browser downloads to
  avoid giant Playwright return values;
- the capture bundle embeds an SHA-256 fingerprint of the field compiler source
  and rejects fixtures whose fingerprint/cache version/PAL executable no longer
  match;
- `sandbox_fixture.py refresh ...` is the expensive PAL path;
  `sandbox_fixture.py capture ...` is intended to be the cheap routine path.

This source plumbing is intentionally **not yet marked validated**: it was written
during a low-memory control period without running Chromium, Vite or the PAL BIN.
The next controlled heavy step should validate one fixture build and one cached
capture, then compare memory/time against the direct-disc path.



## Additional post-restore sandbox capture cleanup

- `sandboxCaptureRunner.ts` no longer imports the ZIP/OPFS import path for the blank-page injected capture bundle.
- New `web/src/importer/directSource.ts` keeps sandbox capture focused on the documented direct ISO/BIN/CUE workflow.
- This removes the previous `import.meta`/zip.js warning during `npm run build:capture` and shrinks the capture bundle from roughly **1.63 MB to 1.41 MB** (gzip **353 KB -> 287 KB**).
- The supplied PAL archive has been extracted locally to a working CUE/BIN and deterministic capture now runs against it directly.
