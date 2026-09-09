# Native seven-probe contact producer

Author: Codex, local Windows checkout, branch `codex/pal-race-contact-producer`.
Scope: GitHub #3. This document retains the isolated scalar evidence boundary.
The subsequent #4 composition is recorded in
[`PAL_NATIVE_RACE_MATH_2026-09-05.md`](PAL_NATIVE_RACE_MATH_2026-09-05.md).

## Evidence and boundary

`rtao/src/game/nativeRaceContact.ts` implements the scalar caller at
**0x0021C280–0x0021C864**, including the seven collision queries, the existing
0x0021BDD8 support solver, retained contact state, and the scalar inputs to the
orientation stage. It exports the caller's return flags from 0x0021C8E0.

Authority is the supplied PAL `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
All **424 instruction words** in the retained
[`contact_matrix.txt`](evidence/races/2026-09-05/traces/contact_matrix.txt)
were checked against that executable, with zero mismatches. The BIN-backed
test also checks that `SLES_513.56` read from the disc matches the supplied ELF.
The inspected CUE specifies one MODE2/2352 track with INDEX 01 at sector zero.

The **VU boundary is explicit and required**: `transformProbe` supplies the
result of 0x00275770 followed by 0x00275990 using the pre-update vehicle matrix.
There is no production identity transform or invented ground model. The API
returns two edge vectors, signed yaw radians and the adjustment mode for the
next orientation stage. It does not compute the cross product, normalization,
0x0021A368 adjustment, orientation matrices or inverse. Those helpers remain
unverified. The first playable race and moving trajectory comparison remain
gated; no renderer, driving loop or race launch UI was changed.

## Recovered inputs and writes

| Native source | API meaning |
| --- | --- |
| 0x002A1DD0 + i*16, i=0..6 | Seven authored probe records, read from the local ELF in original order |
| car +0xA0/+0xA4/+0xA8 | Signed fixed-point position used to extract translation and sector |
| car +0x94 | Previously stored reference Y, distinct from newly extracted position Y |
| car +0x184 → +8 | This vehicle's equipment flags |
| global 0x01824270 → +8 | Separate equipment flags used by the extra-height threshold branch |
| a2 +0/+8 | Local X/Z supplied to the support solver |
| a3 +8/+12 | Separate response Z/W; W contributes to support impulse unless equipment bit 8 is set |
| t0 / t1 | Base vertical impulse / adjustment commands |
| scene +0x0B, +0x2C/+0x2E | Command enable and the two car-flag-selected command channels |
| car +0x1DC..+0x1F0, +0x1C0..+0x1C8 | Three supports, support deltas and impulses retained through updates |
| car +0x1F4/+0x1F8/+0x213 | Unsupported-update counter, runtime flags and signed special-state byte |

Translation uses GP−32492 with float32 integer conversion/division and the
native staggered X/Z masks. Sector extraction uses signed truncation toward
zero before masking, including negative positions. Translation W is 1.

For each probe the caller transforms, translates, records the **pre-query** Y
as `trunc(float32(Y*32768))`, then invokes the selected collision function at
GP−15968. It stores all seven result words at car +0x19C + i*4. Exactly −1
sets that probe's miss bit. Ordinary courses use the existing
`NativeRaceCollisionSampler.query`; no packet or probe reordering is allowed.
The support solver consumes the modified Y values and returned auxiliary
heights, preserves probe X/Z/W, and supplies clamp bits and bit 0x100.

The new position Y is the native signed-integer calculation:

```text
rear = trunc((h1 + h2) / 2)
weighted = trunc((33*h0 + 34*rear) / 67)
positionY = trunc((weighted << 4) / 25)
```

Adds, multiplies and shifts preserve 32-bit wrapping. When permitted by the
support flag and scene/car flags, the selected scene command applies −4096
for 0x1000, otherwise +20971 for 0x4000. The former has precedence.

The extra-height branches preserve strict float comparisons, the separate
global equipment lookup, special-state transitions, runtime bit 0x40, and
sound request 40 with its native player/replay gates. Equipment bit 0x100
selects the response-Z branch, including its strict 8192 boundary; other
equipment may halve retained impulses using signed truncation. Surface words
0..2 can become `(surface0 & 0x3000) | 0x100651`. Physical interpretations of
these raw surface/state values are deliberately not inferred.

With all three supports zero the unsupported counter increments. The
**previous** counter must be at least 65 to set runtime bit 1 and replace all
three impulses with their signed integer average. Any support resets the
counter. Adjustment mode starts from runtime bit 1 or contact bits 0x78;
equipment bit 8 permits command 0x8000 → 64, then 0x2000 → 128, with 128 winning.

Orientation receives edges point2−point0 and point1−point2, using the updated
height-word differences divided by 32768 for Y. Signed 16-bit yaw is multiplied
by GP−32484 and then 1/32768, with float32 rounding at each step. The native
caller then crosses the edges, flips a negative normal Y, normalizes, optionally
adjusts, builds a basis at 0x2086C0, applies yaw at 0x208738, and builds the inverse
at 0x2758B8. Tests observe these calls; **they do not execute these helpers**.

## Verification

- **8,192 prescribed-transform PAL executions** compare all scalar state,
  seven points, heights, auxiliary heights, surfaces, effects, return flags,
  query arguments, authored probe order and orientation arguments/call order.
  Branch coverage assertions require misses, clamps, auxiliary-height flags,
  landing/sound requests, special state, unsupported equalization and modes
  64/128 to execute. Transforms and orientation are hooked; support is executed.
- **600 updates** independently retain PAL and TypeScript state across a
  prescribed contact sequence. This is not a moving vehicle trajectory.
- **360 grid-position cases / 2,520 queries across all 15 original courses**
  execute the caller, course wrapper, strip walker and support solver together.
  The VU hooks prescribe identity-transformed authored probes followed by a
  float32 translation. They do not validate native grid yaw or VU arithmetic.
- **Five CI-safe tests**, using synthetic probes and no original inputs,
  cover flat support, global equipment/strict thresholds, command precedence,
  the 65-update boundary and signed yaw/adjustment modes.

Original-course scalar output SHA-256:
`82b4b755ab4f205404aa8b82219f8d1f4abe18d94965933a6aa6df553a9ba119`.
The existing collision-only capture was also regenerated and retained its
previous `61e221249833e771c1d7a2043fd1a6ef5bd4c5933100706fdb9b24598ab9cfd2` hash.

The bounded test machine adds the contact address range and float-argument
observation. The composed contact test permits 160,000 instructions for seven
queries plus support; existing single-routine runs retain their 20,000 limit.
As before, scalar floating-point operations use host float32, not a hardware
PS2 emulator or proof of exceptional-value behavior.

Reproduce from `rtao/` in PowerShell with the supplied local inputs:

```powershell
$env:RTA_PAL_EXECUTABLE = '<local game-data directory>\SLES_513.56'
$env:RTA_PAL_BIN = '<local game-data directory>\Road Trip Adventure (Europe) (En,Fr,De).bin'
npm run test:pal
npm run check
```

`RTA_RACE_CONTACT_REPORT` optionally writes the original-course output report.
The PAL script now allows 60 seconds per test: its initial five-second default
timed out in existing large collision/support tests under parallel CPU load.
No comparisons or case counts were removed. The CI-safe timeout is unchanged.

Retained evidence: [PAL log](evidence/races/2026-09-05/native-contact-pal.log),
[CI-safe check log](evidence/races/2026-09-05/native-contact-check.log),
[course report](evidence/races/2026-09-05/native-contact-report.json), and
[trace verification](evidence/races/2026-09-05/native-contact-trace-verification.json).

Review focus: signed wrapping and division, distinct reference/global-equipment
inputs, command/flag precedence, probe write order, and the explicit mocked VU
boundary. Original game data and extracted assets remain local and untracked.
