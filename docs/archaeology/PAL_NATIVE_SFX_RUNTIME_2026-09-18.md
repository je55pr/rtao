# PAL native gameplay SFX runtime

This slice wires the representative common SFX contract recovered by the
`sfx-archaeology` pass into the browser audio foundation. Gameplay remains the
authority: audio consumes already-produced UI, dialogue, equipment and race
events and never owns progression, purchases, collision state, lap state or
race completion.

## Implemented one-shot identities

The runtime retains the recovered packed request, TSQ bank/index, directory
priority, tone slot and exact TVB ADPCM span. `NativeSfxRuntime.fromAssets`
validates all of those fields before exposing playback.

| Event | Request | Bank/index | Tone | TVB span |
| --- | ---: | --- | ---: | --- |
| confirm / accepted choice | `0x001A` | CQ_MAIN 26 | 5 | 41216..42640 |
| cancel / back | `0x001B` | CQ_MAIN 27 | 6 | 42640..43936 |
| navigation | `0x001D` | CQ_MAIN 29 | 8 | 44496..44928 |
| dialogue host open | `0x0025` | CQ_MAIN 37 | 16 | 69040..70096 |
| interaction advance | `0x0026` | CQ_MAIN 38 | 17 | 70096..71104 |
| vehicle contact transition | `0x0028` | CQ_MAIN 40 | 18 | 71104..78032 |
| equipment fitted | `0x0303` | ACTION 3 | 13 | 90608..103312 |
| race countdown | `0x002D` | CQ_MAIN 45 | 28 | 113264..115088 |
| normal lap result | `0x002E` | CQ_MAIN 46 | 30 | 116960..121792 |
| better finite best lap | `0x002F` | CQ_MAIN 47 | 30 | 116960..121792 |

All listed TSQ entries have recovered directory priority 144. The browser layer
preserves that value as evidence but does **not** invent a voice-preemption or
priority-arbitration algorithm that has not been recovered.

The importer now caches `SOUND/CQ_MAIN.TSQ`, `CQ_MAIN.TVB`, `ACTION.TSQ` and
`ACTION.TVB` into the browser install. If those assets are unavailable or fail
validation, native SFX is disabled and gameplay continues unchanged.

## Dispatch boundaries

Dialogue opening/advance, accepted choices, native fitting, menu/editor
navigation, race countdown and normal lap completion route through the common
one-shot table. Race contact request 40 is consumed directly from
`advanceNativeRaceFrame().soundRequests`, preserving the existing native
contact gating rather than reconstructing collision truth in audio code.
Equipment fitting retains the native two-step identity where the current UI
has both boundaries: generic accept (`0x001A`) followed by ACTION request
`0x0303` after an actual fitted-selector mutation.

Parts, Body and Paint debit/ownership mutations do not emit a fabricated
purchase-specific sound. Their accepted UI action may use the generic confirm,
matching the archaeology's negative evidence for a dedicated purchase cue.

The current race runtime has no reconstructed finite best-lap timing store.
Therefore it emits the ordinary lap-result request `0x002E` for completed
player laps and does not claim the stricter `0x002F` best-lap branch. Ordinary
race finish also adds no new one-shot. Native finish performs active per-car
request cancellation, but the browser race state does not yet expose the
car-local request byte needed to reproduce that cancellation without guessing.

## Deliberately unresolved

Boost start requests `0x0010/0x0011` and cancels `0x8010/0x8011` are
recognized, including packed `0x8000` cancellation semantics, but playback is
not synthesized. Their recovered TSQ path is a channel-specific looping
multi-tone sequence and exact sequencing/voice ownership is not yet available.

Hard ground impact kind 1 is also not mapped through TSQ/TVB. Its recovered
six-byte lower-audio-object effect envelope is a separate runtime path and must
not be replaced by the ordinary contact sample.
The common one-shot TSQ sequences expose no recovered pitch opcode. This slice
uses unity playback of their decoded TVB sample data and leaves any deeper
SPU2 pitch/ADSR/concurrency emulation to a separately evidenced audio task.

## Verification

`src/audio/nativeSfx.test.ts` pins event-to-request routing, packed bank/index
semantics, cancellation classification, boost non-emulation, priority and
sample-span invariants without retail payloads.

`tests/audioFormats.pal.test.ts` additionally resolves every implemented route
against the authorized PAL disc, checking TSQ priority/tone and the exact TVB
sample span. This keeps the runtime constants reproducible without committing
copyrighted audio payloads.
