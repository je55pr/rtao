# PAL native BGM runtime boundary

This note retains the evidence boundary used by `rtao/src/audio/nativeBgm.ts`.
Authority is the supplied PAL `SLES_513.56`, `SNDMOD.IRX`, and local `SOUND`
data. No retail audio payload is committed.

## Activity / race common selector

The common handler at `0x0022F3F8` is activity/race-owned. The launcher at
`0x00210704` reads activity descriptor byte 0 and `0x0021070C` stores it to
`scene+0x22`. All 51 retained references to the handler lie in activity/race
descriptor data (`0x002BFE50..0x002C02B8`).

The selector table at `0x002A4B10` resolves to the retained BGM_01..BGM_12
mapping in `nativeBgm.ts`. Ordinary race setup may therefore use the existing
activity `sceneId` as this selector. Native music start is delayed until PAL
race update 250.
## Ordinary free-roam boundary

The outdoor path falsifies the earlier assumption that `scene+0x22` supplies
free-roam BGM identity. `0x00210E10` stores authored area identity in
`scene+0x23`. Normal outdoor initialization writes `scene+0x22 = -1` at
`0x00210E8C`; the area-8/22 special path writes `0x22` at `0x00210E6C`.
The outdoor controller does not replace that value with the activity selector.

Therefore authored `areaIndex`, physical field number, area code, display name,
and entry selector must not be converted into a common BGM selector. Ordinary
free-roam music remains owned by a separate unrecovered native audio path.

## Q's Factory

Fixed-room callback `0x0022C398` is installed by `0x0022DAA0..0x0022DAC4`.
For `areaIndex < 10` and local fixed slot 0, `0x0022C650..0x0022C688` constructs
packed selector `0x0A0B0101`. Descriptor `0x0B` is `SOUND/ROOM_1.TSQ`, so the
proved Q's Factory program is `ROOM_1.TSQ`, sequence 1.
Sequences 2..4 are real sibling fixed-room paths. They are not assigned to
browser room identities without separate evidence.

## Transport and sequencer boundary

SNDMOD command-14 subcommands prove select, start, hard-stop/reset, mute,
unmute, fade-out, and fade-in. Ordinary transitions use fade-out, hard stop,
select, then start. Fade ramps span 64 native audio updates.

`NativeTsqSequencer` now preserves per-channel native countdown timing and
signed post-immediate `F8` loops. Its retained archaeology explicitly leaves
SPU2 voice allocation, tone/key pitch conversion, volume/pan scaling, ADSR and
browser wall-clock cadence unrecovered. Those semantics are required before a
browser host can claim audible native BGM rather than an approximation.

Accordingly the current implementation retains exact scene selection and
transport intent, but does not fabricate free-roam tracks or an audible TSQ
voice host from incomplete SPU2 semantics.
