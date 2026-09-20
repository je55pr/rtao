# PAL native free-roam collision and unsupported recovery - 2026-09-20

## Authority

The recovered outdoor contract is from PAL `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

The enclosing outdoor sequence is:

1. vehicle frame at `0x21C920`;
2. seven-probe contact at `0x21C280`;
3. outdoor obstacle wrapper at `0x21AD88`;
4. standard collision response at `0x21A510`.

Outdoor free roam is signed scene kind `-1`. Scene kind `28` is a separate
unrecovered response and must not be substituted.

The retained verification matched 1,427 instruction words. The
`0x21A510..0x21AF38` range hashes to
`ebebaa5d04dc68197cc2614203c980ccc654e58af5d5487c51399ad8843b1505`,
the `0x21C920..0x21D4EC` range hashes to
`f62d5aa5787795483929453814a9d7f9ff287a57bef18741a4aad39b12f628db`,
and the aggregate trace hash is
`3f6272a763c7d62593cef858a8d580711305d07ab0ebdd25c5852a77919100da`.

## Outdoor obstacle and collision response
`0x21AD88` derives the same wrapped four-sector identity from fixed-point X/Z
used by contact. It runs the selected authored obstacle buffer through
`0x21AB60`. If the selected outdoor slot value is `11`, it additionally
iterates at most 26 runtime-enabled obstacle groups. Their PAL enables are the
bitset at `0x018255F0`, consumed through `0x23F990`; enabled group masks are
ORed with the authored mask. The browser does not currently reconstruct that
runtime bitset, so the implementation exposes the exact slot/group seam and
does not fabricate enabled groups.

`0x21AB60` transforms authored obstacle points into car-local coordinates and
returns low bits `1/2/4/8` for front/rear and left/right footprint regions.
Those bits are ORed with contact miss/clamp flags before `0x21A510`.

Any nonzero collision word first rolls fixed position back by
`trunc((-velocity << 5) / 25)` and restores the previous yaw. The low nibble
then applies the recovered response:

| Low mask | Response |
| --- | --- |
| 1, 7 | push `(+2048,-2048)`, local delta `(-X/4,-Z/16)`, yaw `+512` |
| 2, 11 | mirrored X push and yaw, same damping |
| 3, 12 | full `-Z` deflection and rear/front Z push |
| 4, 6, 13 | half-X/eighth-Z damping, `+X,+Z` push |
| 8, 9, 14 | half-X/eighth-Z damping, `-X,+Z` push |
| 5, 10 | pure signed X push |
| 15 | controlled-car diagnostic and scene flag `0x200`; opponent removal |

Push and damping vectors are transformed by the current contact matrix. Only
world X/Z velocity is rewritten. Collision impact requests retain native kinds
4, 3, or 5 at strength 255 subject to the existing car/scene suppression bits.
High collision bits still trigger rollback even when the low nibble is zero.
## Unsupported support, landing and recovery

Outdoor uses the same three retained support channels at car
`+0x1DC/+0x1E0/+0x1E4`, deltas at `+0x1E8/+0x1EC/+0x1F0`, and impulses at
`+0x1C0/+0x1C4/+0x1C8`. Support is damped and clamped to `0..8192`.

A probe that remains below its stored height accumulates the supplied vertical
impulse. On re-contact, impulse 178 remains below the impact threshold. Impulse
179 or greater requests native impact kind 1 with strength
`trunc(impulse / 16)`, folds the impulse into support delta, and clears it.

When all three supports are zero, `+0x1F4` counts unsupported updates. Prior
64 advances to 65 without recovery. Prior 65 advances to 66, pulses runtime bit
1, and replaces all three impulses with their signed integer average. Runtime
bit 1 feeds the recovered upright-normal adjustment at `0x21A368`; contact
bits `0x78` can request the same adjustment earlier. Runtime flags are cleared
at the next frame boundary, so this is a per-update recovery signal, not a
sticky airborne mode.

No executable edge was recovered from unsupported support to teleport, reset,
a browser ballistic mode, or a magic road snap. Native support/history/impulse
evolution is the recovered vertical behavior.

## Auxiliary height and water edge

Collision bit `0x10000000` contributes a separate auxiliary height rather than
ordinary ground. Relative to previous/reference Y, the exact states are deep
`+1` below `extraY-threshold`, shallow `-1` below `extraY`, otherwise
`0`. The ordinary threshold is `0.5`; Big Tyre's global gate is `1.35`.
Shallow contact and leaving a nonzero auxiliary state pulse runtime `0x40`.
First shallow entry can request sound 40. First deep entry without Water Ski
halves the three stored impulses and rewrites the first three surfaces to
`(surface0 & 0x3000) | 0x100651`.

With Water Ski flag `0x100`, and without ordinary support bit `0x100`,
response Z `<= 8192` contributes `responseZ / 8` to position Y. Values
`> 8192` contribute 1024 and collapse each nonzero stored impulse to 1.
The 8192/8193 boundary is therefore intentionally discontinuous in impulse
handling.

## Reset boundary

Scene flag `0x400` with controlled-car flags `2` enters a separate reset
branch at `0x21C97C` and invokes `0x219160`. That path reconstructs authored
spawn/grid position and yaw and reinitializes support/transient state. Nothing
in the recovered unsupported, auxiliary, terrain-edge, or ordinary obstacle
paths raises that reset flag.

Production free roam therefore does not synthesize reset or teleport from
collision failure. The scene-reset producer remains a separate integration
boundary.

## Browser integration

Standard-FLD driving now keeps post-contact state native: contact and authored
obstacle masks are combined, scene kind `-1` uses the recovered collision
response, and response velocity/yaw are retained by `NativeDrivingMotion` for
the next 50 Hz tick. The old full-footprint/X-only/Z-only/halt policy remains
only on compatibility paths whose native dispatch is still unrecovered.
The north/south browser topology extension also remains a fail-closed boundary.

Deterministic regressions cover high-only rollback, representative low masks,
terrain-edge response, repeated wall collisions, reverse recovery, support
loss/reacquisition, unsupported 64/65 boundaries, landing 178/179, auxiliary
equality, Big Tyre threshold 1.35, Water Ski 8192/8193, and slot-11 group
enable/cap behavior.
