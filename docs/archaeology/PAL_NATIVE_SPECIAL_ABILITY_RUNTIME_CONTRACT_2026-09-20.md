# PAL native special-ability runtime contract

This note freezes the browser handoff from persisted equipment selectors to the PAL-backed special-equipment consumers recovered so far. Flight Wing's recovered fitted/active transition and downstream contact behavior are implemented without guessing helper `0x0021E208`; unrecovered presentation remains outside the boundary.

## Persistence and fitting

The native save has three 15-byte selector blocks at offsets `+0x0C`, `+0x28`, and `+0x44`. Category zero is body and categories 1 through 14 follow the executable catalogue order. Browser persistence keeps those selector bytes as the durable state; equipment flag words are derived runtime state, not an additional saved browser authority.

PAL helper `0x0023DF78` is the fitting writer used by dialogue action `0x15` and Q's Factory. Purchasing does not imply fitting. Each category has one selector, so fitting another item in the same category replaces the previous choice.

Category 10 Special Parts clears `0x0040 | 0x2000` before applying its selected record flag. Category 11 Options clears `0x0004 | 0x0020 | 0x0100 | 0x0200` before applying its selected record flag and variant byte. The browser contract derives exactly those mutually exclusive fitted states from selectors rather than accumulating stale bits.

## Proven selector-to-flag setup

| Selector | Fitted configuration state | Runtime boundary |
| --- | ---: | --- |
| 9:1 Wing Set | `0x1000` | ordinary-race driving ready |
| 10:1 Propeller | `0x0040` | free-roam and race special-contact driving ready |
| 10:2 Jet Turbine | `0x2000` | ordinary-race boost/fuel/audio ready |
| 11:1 Water Ski | `0x0100` | free-roam and race contact/steering response ready |
| 11:2 Flight Wing | `0x0004` fitted, `0x0008` active | strict transition plus recovered contact/orientation consumers implemented behind exact `0x0021E208` scalar input; helper formula/rendering gated |
| 11:3 Police Light | `0x0020` | presentation gated |
| 11:4..8 Advertising Sign | `0x0200`, variants 0..4 | progression ready; vehicle visual gated |
| 8:1..2 Lights | `0x0010` | presentation gated |
| 12:1 Sticker | `0x4000` | presentation gated |

Horns and meters persist selectors without a recovered configuration flag. Their audio/HUD consumers remain gated.

## Consumer routing

Free-roam keeps its existing narrow behavior. Only Propeller and Water Ski enter the live special-contact path. Wing Set and Jet Turbine are not manufactured in free-roam from race-only evidence. With all relevant selectors zero, the derived special flag word is zero and ordinary driving is unchanged.

Ordinary race launch now derives the player's proven special flags from the same selector snapshot already used for scalar equipment. The race frame can therefore receive Wing Set `0x1000`, Propeller `0x0040`, Jet Turbine `0x2000`, and Water Ski `0x0100`. Lights, Police Light, signs, stickers, horns, and meters do not enter race physics.

Flight Wing remains fail-closed at browser ordinary-race launch. The lower race runtime now accepts selector-derived fitted `0x0004` only when a caller supplies the exact float returned by PAL helper `0x0021E208` for the car's world-velocity vector. It applies strict `> 300` activation and `< 300` retraction, with equality preserving the current bit, before later contact processing and carries the resulting `0x0004`/`0x0008` state across updates. No magnitude approximation is substituted for the unrecovered helper.

Contact owns the proven Propeller thrust, Water Ski auxiliary-contact response, and active Flight Wing support/orientation consumers. Shoreline sound request 40 is driven by auxiliary-contact transition state rather than Water Ski. Jet Turbine's recovered start/stop requests are owned by the ordinary race boost branch.

Active Flight Wing `0x0008` uses the already recovered contact path: it suppresses the ordinary `responseW` contribution to the seven-probe support solver, and commands `0x8000` / `0x2000` select orientation modes 64 / 128 with the latter taking precedence. Retraction restores ordinary support/orientation in the same frame. It does not gain Wing Set vertical-control or direct-yaw semantics.

No recovered Flight Wing deployment sound/effect call or special-equipment camera consumer exists, so no audio or camera hook is manufactured. Accessory meshes, Flight Wing geometry/effects, Police Light/lights, sticker presentation, horn sound selection, and meter HUD presentation remain outside this runtime contract.
## Implementation seam

`rtao/src/game/nativeSpecialAbilityRuntime.ts` is the shared selector/flag contract. `ArcadeCarController` uses the same category 10/11 setup mapping but masks it to its proven free-roam consumers. `startPeachRace` derives the ready ordinary-race flag subset before constructing the race runtime.

The contract deliberately distinguishes configuration bits from transient runtime state. The fitted selector persists as category 11 selector 2 / configuration `0x0004`; `0x0008` is only the transient result of the recovered PAL threshold transition. `OrdinaryRaceSession` retains that transient state between updates, while production browser launch still refuses Flight Wing until the exact `0x0021E208` scalar source is recovered.

## Verification

The focused browser suite covers selector-zero neutrality, category 10/11 exclusivity, strict Flight Wing threshold equality/precedence, same-frame activation/retraction, support-term suppression/restoration, orientation-mode consumption, exact-scalar fail-closed behavior, invalid selector rejection, and unchanged free-roam/race regressions. PAL arithmetic for the downstream contact and race-frame consumers remains covered by the retained executable-backed evidence and existing PAL gates; this integration adds no browser-authored flight arithmetic.
