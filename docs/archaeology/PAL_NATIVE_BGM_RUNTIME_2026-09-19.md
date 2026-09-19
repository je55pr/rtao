# PAL native BGM runtime

This note retains the evidence boundary implemented by
`rtao/src/audio/nativeBgm.ts`, `nativeBgmRuntime.ts`, and
`nativeRadioRuntime.ts`. Authority is the supplied PAL `SLES_513.56`,
`SNDMOD.IRX`, and local `SOUND` data. No retail audio payload is committed.

## Activity and ordinary-race selector

The common handler at `0x0022F3F8` is activity/race-owned. The launcher at
`0x00210704` reads activity descriptor byte 0 and `0x0021070C` stores it to
`scene+0x22`. The selector table at `0x002A4B10` supplies the retained
BGM_01..BGM_12 mapping in `nativeBgm.ts`.

Ordinary races therefore use the existing activity `sceneId` directly.
The TSQ is selected during setup and native start remains delayed until race
update 250, five seconds at the PAL 50 Hz race cadence.

## Fixed interiors and Q's Factory

Fixed-room callback `0x0022C398` uses signed `scene+0x23` as authored
`areaIndex` and `scene+0x21` as local fixed index. All four routes use
`SOUND/ROOM_1.TSQ`.

The recovered standard-world routing is:

- sequence 1: local index 0 in ordinary areas below 10, including Q's Factory;
- sequence 3: area 1:{1,2,3}, 2:{1,2,3}, 3:{1,2,3}, 5:{1},
  6:{1,2,3}, 7:{1,2}, 9:{1,2,3,5,7};
- sequence 2: every other active standard-world fixed interaction;
- sequence 4: native context (8,9), the disabled Cloud Hill sentinel that the
  browser interaction finder does not expose during normal play.

The browser resolver uses only those numeric executable identities. It does not
derive music from room names or SHOP package numbering.

## Ordinary free-roam radio

Outdoor music is not the activity TSQ selector. Normal outdoor construction
calls radio owner `0x0025B528`, which sends SNDMOD RadioVols, RadioTune and
RadioPlay. Outdoor teardown issues RadioStop.

Global initialization sets radio state 2 and volume 90. Ordinary states are:

- 0: radio off;
- 1: native tune index 0, `1CH_L.VAG` + `1CH_R.VAG`;
- 2: native tune index 1, `3CH_L.VAG` + `3CH_R.VAG`.

The registered 2CH pair is tune index 2, but no recovered ordinary free-roam
selector can choose it, so the browser does not assign it to an area.

SNDMOD computes the synchronized program as
`tuneIndex * 120 + floor(playTime / 1800)`; `playTime` wraps at 216,000.
The browser keeps that global clock across outdoor stop/start rather than
restarting music per town. Large VAG files are decoded incrementally into
bounded scheduled stereo chunks, so normal playback does not expand an
hour-long stream into one giant AudioBuffer.

The retained PAL format test also preserves the genuine malformed-looking
`1CH_R.VAG` frames near frame 25,575. The browser does not normalize or invent
a repair for those frames. Current normal play starts in state 2/3CH, so that
unresolved state-1 decode edge cannot affect the default free-roam route.

## SNDMOD TSQ clock and voice host

SNDMOD schedules its worker at 16,666 microseconds, nominally 60.0024 Hz.
`NativeTsqSequencer` owns native countdown timing, independent per-channel
program counters, and signed post-immediate `F8` jumps.

The recovered host contract implemented above it includes:

- music voice ownership corresponding to native voices 8..43;
- exact 73-entry key-on pitch table from SNDMOD `0x8ACC`;
- E2 tone/sample selection, E4 pitch update, E5 full retrigger, EA Q12 pitch
  multiplier, and playback ratio `pitchWord / 4096`;
- E0 unsigned channel volume and E1 independent left/right coefficients;
- native per-side volume arithmetic `trunc(E0 * coefficient * masterQ8 / 256)`;
- BGM.TVB sample spans, transformed ADSR words, and PS-ADPCM loop flags;
- F0 release semantics rather than immediate source destruction;
- E8 effect-send state retained without fabricating a reverb algorithm.

PAL BGM_01 channel 0 provides a deterministic witness: at native tick 460,
E0=0x3A, E1=0x1F/0x40, tone slot 12, key index 0x14 and EA=0x10EC produce
volume words 1798/3712 and final pitch 0x035A. BGM.TVB slot 12 spans
[119344,129376), uses native ADSR 0x0D0D1EEE, and loops decoded samples
[12768,17556). F0 occurs at tick 470.

## Transport and scene lifecycle

SNDMOD command-14 subcommands prove select, start, hard-stop/reset, mute,
unmute, fade-out and fade-in. Fade changes master Q8 by four units per audio
update, so a full 256-unit fade takes exactly 64 SNDMOD updates.

The browser retains the ordinary transition ordering
fade-out -> hard stop/reset -> select -> start. A Q's Factory-to-race handoff
can queue the race start while the 64-update fade is still completing; the
queued start then applies to the newly selected race TSQ. Race start itself is
still gated by race update 250.

Outdoor radio uses its separate Tune/Play/Stop transport. The activity TSQ fade
contract is not applied to radio streams without evidence.

## Browser install and failure boundary

Cache schema 6 retains BGM.TVB, ROOM_1.TSQ and BGM_01..12.TSQ as small bootstrap
dependencies. The large ordinary 1CH/3CH VAG stream pairs are deferred until
the full install completes. If any audio asset or runtime validation fails,
the owning audio runtime disables itself and gameplay continues unchanged.

The browser host intentionally does not claim hardware-exact wet/reverb DSP,
physical transient-vs-music SPU2 voice stealing/priority arbitration, or
sample-perfect Web Audio rendering of every intermediate ADSR value. The
sequencer state, ADSR state machine, release duration, pitch, volume, sample
loop and scene lifecycle are evidence-backed; the Web Audio presentation is
the host for those recovered values.

## Verification

CI-safe unit coverage pins scene mappings, fixed-room routing, race update-250
start, 64-update transport fades, exact pitch/volume arithmetic, ADSR release,
TVB loop extraction, bounded radio chunk scheduling and synchronized radio
program arithmetic.

`tests/audioFormats.pal.test.ts` additionally checks the authorized PAL disc
without committing retail data. It pins the SNDMOD pitch table, BGM.TVB
slot-12 span/ADSR/loop and a real BGM_01 audible key-on vector alongside the
existing TSQ/VAG/TVB format witnesses.

Reproducibility hashes from the recovered host work are:

- SNDMOD.IRX: `9cb20bf4cd0a77605ddb80e0511621c072318bbb9bddd070c6771886265b9d55`
- BGM.TVB: `900fa480c28872a2b4f0a27a251aac928d8ba0fde104cb2c268bbb2da17343d2`
- BGM_01.TSQ: `bc772c12a12d10e6931f92fa44338b3624cc1282fd637788808a9a86f5b6768e`
