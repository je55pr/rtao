# PAL race-start presentation — 2026-09-11

Authority: European PAL `SLES_513.56`, supplied locally by the developer. No original-game bytes are committed here.

## Proven start scheduler

The ordinary-race start callback at `0x0022F068` owns the pre-race timer. The existing PAL oracle covers 1,260 countdown cases across the native 50 Hz and 60 Hz branches. PAL boots this title at 50 Hz.

At 50 Hz the callback requests UI states 2, 3, 4 and 5 at one-second intervals. At update 200 it requests state 6 and sets scene flag `0x4`. Existing reconstructed vehicle force/control consumers already obey that flag, so `0x4` is the native staged-grid to active-driving boundary rather than a host-side input lock.

State 6 remains selected through the final phase. At normal update 300 the callback sets the final scene flags and makes ordered UI calls `[6, 0]`, then deletes itself. Cue 45 is requested at update 50; `0x0025B3A8` is called at update 250. Their exact original audible assets/semantics remain unresolved.

## Proven start-widget state

The state host at `0x002340C0` initializes a 108-byte widget object and dispatches states 1–6. A PAL scalar-oracle regression now pins the eight primary 32-bit slots at `widget + 0x8018`:

| state | slots 0–3 | slots 4–7 |
| --- | --- | --- |
| 1 | `7 7 7 7` | `9 9 9 9` |
| 2 | `6 6 6 6` | `9 9 9 9` |
| 3 | `7 6 6 6` | `9 9 9 9` |
| 4 | `7 7 6 6` | `9 9 9 9` |
| 5 | `7 7 7 6` | `9 9 9 9` |
| 6 | `7 7 7 7` | `8 8 8 8` |

This proves two groups of four and their progressive/release sequence. It does **not** yet prove what sprite IDs 6/7/8/9 looked like on screen. The browser therefore presents the sequence as a readable two-bank signal, but its red/green colours, lamp geometry and glow are host presentation policy rather than recovered PAL artwork.

## Browser implementation boundary

`raceStartPresentation.ts` consumes only the native state index stream. The race session exposes `isRaceReleased` from scene flag `0x4`; the HUD uses that boundary instead of waiting for scheduler cleanup. No prize, physics, AI-release or timer rule is duplicated in presentation code.

A real PAL-backed browser run at 1280×960 captured the staged signal, the native release frame and post-release motion. The staged capture showed two first-bank slots active with the HUD still reading `Starting grid`; the release capture showed both four-slot banks active with the HUD reading `Lap 1/3`; the widget then disappeared on native cleanup while the field continued moving.

Retained local captures (not committed because they contain original-game-derived visuals):

- `C:\ChatGPT\RTAO\captures\race-countdown-staged.png`
- `C:\ChatGPT\RTAO\captures\race-countdown-release.png`
- `C:\ChatGPT\RTAO\captures\race-countdown-after.png`

Still unresolved: exact original start-widget sprites/colours, playback meaning/assets for cue 45 and the update-250 audio transition, and the exact visual semantics of the separate 64-update fade host. These remain gated rather than guessed.
