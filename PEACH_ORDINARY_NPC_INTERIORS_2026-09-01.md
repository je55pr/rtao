# Peach ordinary NPC fixed-interior tranche — 2026-09-01

## Scope

This tranche continued the `RTA_WORK_IDEAS.md` ordinary-house/NPC queue using
only the canonical Three.js source and PAL disc evidence. It did not change
outdoor rendering, Q's Factory composition, or speculative quest/save state.

## Selected rooms and boundaries

| Area/slot | Entity | Initial PAL boundary | Implemented confidence | Deferred consequence |
| --- | --- | --- | --- | --- |
| 1/11 | Jousset | slot 01, greeting, no choice/action | room, cars, original entry dialogue, ordinary end | later quest/team-state branches |
| 1/15 | Fight | slot 01, greeting, no choice/action | room, cars, original entry dialogue, ordinary end | later quest/team-state branches |
| 1/13 | Grandpa Tal | slot 01, Yes/No, both targets 0 | full initial conversation and clean exit | none for this path |
| 1/09 | Wolf | slot 01, Yes/No teammate offer | room, dialogue and No path through `0x08 [0]` return | Yes path's action `0x10` team mutation |

Wolf, Best and Milton provide repeated executable evidence that one-byte
`0x08 [0]` terminates a teammate conversation. This is distinct from Q's
Factory's two-operand `0x08 [0x0f, 0x04]` race selector. The runtime now uses
operand shape to present the former as Return to town while preserving the
latter unchanged.

## Deterministic capture evidence

| Case | PNG bytes | SHA-256 |
| --- | ---: | --- |
| peach-jousset | 2,386,051 | `b42cd293fe1ba10ea27b605c4e113a4298d28537a46492c0f2c44283fe8359e1` |
| peach-fight | 2,403,684 | `fb047f522852d11a7e1d3ad1cf0bccb441550247354d185dcb49b877afefe348` |
| peach-grandpa-tal | 2,157,312 | `ea20c2031d1738ecdf432b6c6d0f9e116fa140f25a40588206b25789015599b9` |
| peach-wolf | 2,357,741 | `55d799147bd108ba3b8f4ae1cd65dc502efef5bc1b649caa5812ec4656798b63` |

Each capture is 1280×960, repeated byte-for-byte, and matched its recorded
Chrome 151/SwiftShader baseline. The regression helper also asserts the exact
PAL entity, slot-01 entry, initial choice count and absence of an initial
external action for these four cases. The dialogue inspector then follows
Wolf's explicit choice path `[1]` and asserts slot 06, zero remaining choices,
and external action `0x08 [0]` from the real PAL stream.

Visual inspection passed. The residential, brick/wood, cellar and kitchen
rooms all contain visible textured geometry/floors, coherent live staff/player
cars and sensible fixed-camera framing. No blank frame, missing texture layer,
or catastrophic composition failure was observed.

## Validation and limitation

- `npm run check`: 24/24 files and 80/80 tests passed; production and capture
  bundles passed.
- `shop_regression.py`: 8/8 cases passed two captures, PNG validation and exact
  hashes; four new PAL dialogue assertions passed.
- A cold full-world Vite import probe for Wolf was terminated after several
  minutes while the 64-sector first install was still compiling. It reported
  no Chrome, WebGL or page error. Direct PAL room capture remained fast and
  fully deterministic, so this is an environment timing limitation rather than
  evidence of a rendering regression.

## Next boundary

Do not implement Wolf's positive teammate selection until action `0x10` and its
team/save mutation are decoded. Continue with another high-confidence ordinary
interaction or targeted Cake/ownership archaeology instead of guessing.
