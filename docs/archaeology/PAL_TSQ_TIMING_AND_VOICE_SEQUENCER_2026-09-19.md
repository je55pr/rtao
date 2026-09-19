# PAL TSQ timing and voice sequencer

This slice recovers the TSQ control-flow clock needed by native BGM playback.
Authority is the user-supplied PAL `SNDMOD.IRX` plus `SOUND/BGM_01.TSQ`.
No retail module, TSQ, TVB or audio payload is committed.

## SNDMOD timing contract

The PAL IRX is an ELF whose loadable text begins at file offset `0xA0`.
Addresses below are module virtual addresses.

`0x5294` is the per-channel interpreter recovered by the earlier TSQ parser
work. At `0x52BC..0x52DC` it loads the 16-bit countdown at channel `+0x14`,
subtracts one, writes it back, sign-extends it and parses another opcode only
when the result is `-1`.

For opcodes below `0x80`, `0x5360..0x5384` calls step helper `0x47F0` with the
opcode byte and then returns from the interpreter. The helper performs:

- `0x4808`: load the supplied step value.
- `0x4810`: `addiu a0, v1, -1`.
- `0x4814`: store the low 16 bits to channel countdown `+0x14`.

Therefore step values `1..127` defer the next parse by exactly that many native
SNDMOD update invocations. Step byte `0` stores `0xFFFF`; the next parse occurs
only after the 16-bit countdown wraps, exactly `65,536` updates later.
Non-step voice/control opcodes continue parsing in the same update. The common
handler return path at `0x5658` jumps back to `0x5328`, while a step returns via
`0x5660`.

## F8 control flow

The `F8` dispatch at `0x55F8..0x5614` calls helper `0x482C`.

That helper reads two bytes from the current program counter, incrementing the
counter after each byte (`0x4844..0x4888`). It then loads those bytes as a
signed 16-bit displacement at `0x4894` and adds the displacement to the already
advanced program counter at `0x48A0`.

The reusable contract is therefore:

`target = postImmediatePc + signedLe16(displacement)`

Each channel owns its program counter independently. An `F8` on one channel
must not rewind or otherwise alter another channel.

## E3 timing result

Opcode `E3` dispatches to helper `0x5110`. The helper consumes exactly two
immediate bytes and advances the channel program counter twice. It makes no
external call and does not mutate the countdown or another channel timing
field. PAL `E3` is therefore a sequencing no-op, not a browser tempo/BPM
conversion point.

The browser sequencer deliberately does not invent milliseconds, BPM, or an
audio-clock rate. Its public clock is the recovered native SNDMOD update count;
the transport/runtime layer must supply the wall-clock cadence separately.
## PAL BGM_01 numeric witness

Request index `1` in PAL `SOUND/BGM_01.TSQ` has sequence offset `0xD0` and 36
music descriptors. All 36 descriptors carry state byte `0x80`.

Descriptor bytecode starts resolve as:

`channelStart = request.sequenceOffset + descriptor.relativeBytecodeOffset`

The first three starts are `0x190`, `0x354`, and `0x517`. Following channel 0
lexically reaches its first `F8` at `0x34F` after exactly `7,367` recovered step
updates. Its signed displacement resolves to `0x193`, which is channel start
plus three bytes and therefore skips the one-time opening control. Channels 1
and 2 show the same `7,367`-update loop duration and also jump to start plus
three.

Running all 36 PAL channels through the reusable sequencer to native update
`10,000` produced exactly one backward `F8` on every channel, with no channel
ended and no unsupported opcode or out-of-range branch.
## Browser boundary and validation

`src/audio/nativeTsqSequencer.ts` owns only recovered sequencing truth:
descriptor-relative starts, native update countdowns, same-update control
dispatch, per-channel program counters, signed post-immediate `F8`, and channel
end state. Its host receives raw recovered voice/control tokens. It does not
guess SPU2 voice allocation, pan law, volume scaling, pitch conversion, ADSR,
or browser wall-clock timing.

Synthetic tests cover countdown timing including byte-zero wrap, independent
loops, same-update ordering, reset, invalid branches and zero-time control-flow
guards. `tests/audioFormats.pal.test.ts` pins the PAL SNDMOD instruction words,
the BGM_01 descriptor starts, the `7,367`-update loop witness, and the 36-channel
runtime trace when `RTA_PAL_BIN` is available.
