# RTA native Parts trade composite score — 2026-09-01

## Result

The PAL executable helper at `0x0023ebb8` is now reconstructed as exact,
offset-labelled integer arithmetic in the Three.js/TypeScript commerce module.
Together with the previously recovered transfer helper at `0x002456e8`, this
removes the arithmetic uncertainty from teammate Parts Shop exchange.

The browser does **not** yet expose the trade UI. Several score inputs still
need their native producers and gameplay meanings mapped, and the selected
teammate/save-slot state is not yet represented. The implementation deliberately
uses save offsets as names rather than inventing meanings.

## Exact native score

For one save slot (stride `0x3448`, rooted at `0x01824f80`), helper
`0x0023ebb8` reads:

| Input | Interpretation currently safe to claim |
| --- | --- |
| signed byte `+0x651` | offset-labelled signed contribution |
| signed bytes `+0x674`, `+0x676` | nonzero bonuses |
| unsigned halfword `+0x12da` | ten low-bit tests |
| 128-bit bitset `+0x548` | population count used against a 100-item baseline |
| 25 bytes from `+0xff0` | state values constrained to `0..5` |
| 128-bit bitsets `+0x518`, `+0x508` | population-count bonuses |

With `pop128` denoting population count and state weights
`[8, 4, 4, 3, 2, 1]`, the result is:

```text
10 * (+0x674 != 0)
+ 10 * (+0x676 != 0)
+ 2 * count(clear bits among low 10 bits of +0x12da)
+ 20 * signed(+0x651)
+ pop128(+0x548) + 2 * (100 - pop128(+0x548))
+ sum(stateWeights[byte] for the 25 bytes at +0xff0)
+ 2 * pop128(+0x518)
+ 2 * pop128(+0x508)
```

The state weights come from the executable jump table at `0x00301480`.

## Transfer arithmetic

With `difference = selectedCarScore - otherCarScore`, helper `0x002456e8`
computes:

- seller credit: `basePrice * (difference + 3000) / 4000`;
- recipient debit: `basePrice * (2000 - difference) / 2000`.

Both divisions truncate toward zero. Direct Parts Shop purchase remains a
separate host and continues to charge base price without equipping.

## Implementation and validation

- `web/src/game/commerceProgress.ts` contains
  `calculateNativePartTradeContextScore` with range validation for every
  recovered input shape.
- `web/src/game/commerceProgress.test.ts` locks a zeroed baseline, a mixed
  contribution case and invalid-state rejection.
- Vitest: 27/27 files and 116/116 tests passed.
- TypeScript, Vite production and capture-bundle validation passed through
  `npm run check`.

## Remaining boundary

Before exposing teammate trade, map the native producers and stable browser
representation for the offset-labelled score fields, then recover the exact
selected teammate/save-slot transition and exchange confirmation flow. Do not
substitute the player's current development statistics or a guessed flat trade
value merely because the final arithmetic is now exact.
