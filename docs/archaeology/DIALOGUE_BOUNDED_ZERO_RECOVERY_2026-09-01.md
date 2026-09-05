# PAL dialogue bounded trailing-zero recovery — 2026-09-01

## Problem

The first complete fixed-interior census decoded 220/235 executable-mapped
entities. Fifteen entities failed with a fixed-width action reported as
truncated at the exact end of one variant.

## Raw evidence

Targeted pointer/address probes found 21 affected variants across those fifteen
entities. Every failure had the same structure:

- the variant ended exactly at the next distinct stream address;
- the final bytes were a page break, an action opcode, and one or more zero
  operands;
- the fixed action table expected additional operands;
- every supplied operand was zero, so the only omitted values were trailing
  zeros;
- successful streams using the same opcodes contained the full zero-filled
  width.

Affected action opcodes were `0x02`, `0x05`, `0x07`, `0x0b`, `0x11`, and
`0x16`. Affected entities included Peach Policeman and Peach FM Front Desk plus
King, Spirit Mediums, Natsuo, Johnny, Frank, Boss Rorke, Goddess, White Mountain
Policeman, Ski Jumping Registration, Keitel, Curling Registration, Romba and
Laz.

## Fix and safety boundary

The tokenizer now restores omitted trailing zeros only when decoding a variant
whose end is proven by the next executable stream address. Restoration requires
at least one supplied operand and requires every supplied operand to be zero.

Arbitrary byte buffers remain strict. A short action without the bounded option
still throws, and an incomplete payload containing any non-zero operand still
throws even at a bounded edge. The regression test covers all three cases.

## Result

- Fixed-interior census: **235/235 entities decoded**, zero deferrals.
- Entry classification: 16 ordinary dialogues, 72 choices, 147 immediate host
  boundaries.
- Web validation: 24/24 files and 82/82 tests passed; production and capture
  bundles passed.
- Deterministic interior suite: 11/11 cases passed repeated byte equality,
  exact SHA-256, PNG validation and PAL metadata/action-shape assertions.

Peach Policeman and Peach FM were promoted into the regression suite:

| Room | Bytes | SHA-256 |
| --- | ---: | --- |
| Peach Policeman | 2,367,448 | `9c86e27aa74cb2181c7655aa78887ca71230b5d9da51d6c37098ff3de06aaea9` |
| Peach FM | 2,596,156 | `f36c36ec89c738159082aa0fcab16168ae0a2349f31ae3ee5468bb560c1f4668` |

Visual inspection passed: the police office and radio studio have visible
textured scenery/floors, live cars, coherent fixed-camera staging and no blank
or catastrophic output.

## Remaining semantic boundary

This resolves action width and makes every entity structurally available. It
does not claim that every host action's gameplay meaning is understood. In
particular, action `0x05 [0,0,0]` remains a decoded but unreconstructed activity
boundary until original behaviour or executable dispatch evidence identifies
its UI/state effects.
