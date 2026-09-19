# PAL fixed-interaction world census â€” 2026-09-10

## Scope

GitHub issue #45 asks for the Peach fixed-interaction evidence to be generalized across every authored outdoor area. This tranche is archaeology/tooling only: it does not change production runtime behavior and does not commit PAL payloads or full coordinate dumps.

The reusable probe is `tools/interactions/fixed_interaction_world_census.py`. It reads the developer-supplied PAL executable plus the MODE2/2352 disc image, writes a full local JSON census when requested, and prints a compact payload-free summary suitable for retention.

## Executable evidence chain

The PAL tables used by the probe are:

- area descriptors: `0x002C04B0`, 8 bytes per authored area;
- per-area fixed polygon pointers: `0x002C2710`, 32 bytes per local fixed interaction;
- per-area resident-definition pointers: `0x002C4340`, 16 bytes per resident definition;
- dialogue hierarchy root: `0x002A4620`.

For every backed authored area `1..21`, local fixed index `N` addresses all four related records without a name guess:

`polygon N -> resident definition N -> dialogue entity N -> SHOP/T(area-1).BIN slot N`.

This is stronger than text matching. Resident labels and dialogue entity names legitimately differ, for example `Q's Factory Staff` versus `Q's Factory`, and generic `Quick-Pic Shop Staff` versus numbered Quick-Pic dialogue entities.

The English dialogue table provides an independent structural cross-check: in all 21 backed areas, the entity count is exactly `fixedInteractionCount + outdoorResidentCount`. Fixed hosts occupy the prefix; roaming residents follow it.

### Retained PAL polygon-consumer routine anchor

**Decoded semantics.** The PAL routine beginning at `0x0025B5B0` walks authored area descriptors, matches the current field code, forms the per-area polygon pointer through `0x002C2710`, reads the descriptor byte at `+6` as the local-record count, and advances each candidate by `0x20` bytes. Four floating-point 2D cross-product tests gate a candidate. A surviving record stores the matched area index to state byte `+0x23` and the local record index to state byte `+0x21` before later interaction-state handling.

**Executable-address validation witness.** This was re-decoded directly from PAL `SLES_513.56` with SHA-256 `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`: the descriptor-table construction is at `0x0025B618..0x0025B620`, the `0x002C2710` pointer-table construction and `+6` count load are at `0x0025B638..0x0025B644`, the four rejection branches converge on the next-record path at `0x0025B728/0x0025B760/0x0025B798/0x0025B7C4`, the hit stores are at `0x0025B848/0x0025B854`, and the `0x20` record stride is at `0x0025B95C`. `rtao/tests/referenceEvidence.pal.test.ts` checks these decoded instruction fields without retaining executable bytes.

**Historical interpretation boundary.** The retired C# reader described this as the fixed-interaction polygon consumer. The maintained same-index census independently supports that interpretation by tying polygon record `N` to resident definition, dialogue entity and SHOP slot `N`. The routine itself does not prove that every geometric hit is progression-available, nor does it assign meaning to later state flags beyond the stores decoded above.

### Peach validation anchors retained from the legacy C# probe

These are now regression witnesses in `rtao/tests/referenceEvidence.pal.test.ts`; the old C# reader is no longer their authority.

**Decoded facts.** Area 1 declares 28 fixed interactions and 11 outdoor residents. Its resident-definition pointer resolves so that the outdoor suffix begins at `0x002C2950`; the route pointer table is `0x002DBA28`. James's first route record spans `0x002C8170..0x002C8950` (84 24-byte points).

**Validation witnesses.** Q's Factory Staff local slot 0 starts at corner approximately `(512.10,432.10)` and has polygon centre `(508.57,432.94)`; local slot 17 (Entrance to the cave) centres at approximately `(1189.0,528.78)`. Grandpa Tal at local slot 13 preserves two leading `(-1,-1)` sentinel corners. The eleven outdoor bodies/names and all eleven non-empty PAL route-record lengths are locked by the PAL test: `84,36,25,18,17,16,19,36,25,29,71` in resident-table order, together with James/Kevin spawn and first-route anchors. Across all authored areas the same test retains 81 outdoor residents, 77 with at least two route points, and 3,208 decoded route points.

**Historical/provisional interpretation.** The retired C# helper separately hard-coded a six-name `PeachTownRoamingNames` subset (`James`, `Klien`, `Barthou`, `Pillow`, `Kevin`, `Newman`). No native discriminator establishing that six-name class is retained here, so that helper classification is not promoted as decoded PAL semantics. A non-empty route record is retained only as authored route geometry, not proof that a resident actively roams, nor proof of a particular runtime schedule, speed law, or interaction availability. Those behaviours require separate executable/runtime evidence.

## World-wide result

The 22 contiguous authored descriptors declare 250 fixed records in total, but descriptor 0 (`My Garage`) is a bootstrap/special slot: it declares one fixed count while its resident pointer is null and it has no dialogue area table or corresponding `SHOP/T-1` package. The probe therefore preserves that raw descriptor fact but does not pretend it is a backed room.

Areas 1..21 contain **249 backed fixed interactions**. Of those, **235** belong to 20 standard-world sectors and **14** belong to Cloud Hill. Cloud Hill uses special area code `64`, outside the ordinary `0..63` field-code range, but still has a valid polygon block, resident block, `SHOP/T07.BIN` with 14 slots, and 25 dialogue entities (`14 fixed + 11 roaming`).

Every `SHOP/T00.BIN` through `SHOP/T20.BIN` is an exact multiple of `0x3F000`, and every package's slot count equals its area's executable fixed count.

| Area | Name | Field | Fixed | Roaming | Dialogue | SHOP slots | Sentinel |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Peach Town | 223 | 28 | 11 | 39 | 28 | 1 |
| 2 | Fuji City | 113 | 29 | 11 | 40 | 29 | 0 |
| 3 | Sandpolis | 013 | 33 | 9 | 42 | 33 | 0 |
| 4 | Chestnut Canyon | 103 | 17 | 11 | 28 | 17 | 1 |
| 5 | Mushroom Road | 210 | 11 | 0 | 11 | 11 | 0 |
| 6 | White Mountain | 203 | 27 | 10 | 37 | 27 | 0 |
| 7 | Papaya Island | 233 | 28 | 10 | 38 | 28 | 0 |
| 8 | Cloud Hill | special code 64 | 14 | 11 | 25 | 14 | 1 |
| 9 | My City | 023 | 23 | 6 | 29 | 23 | 0 |
| 10 | ??? | 213 | 4 | 0 | 4 | 4 | 0 |
| 11 | Bridge | 220 | 4 | 0 | 4 | 4 | 0 |
| 12 | UFO | 112 | 4 | 0 | 4 | 4 | 0 |
| 13 | Ruins | 011 | 5 | 1 | 6 | 5 | 0 |
| 14 | LightHouse | 012 | 4 | 0 | 4 | 4 | 0 |
| 15 | 022 | 022 | 6 | 0 | 6 | 6 | 0 |
| 16 | 110 | 110 | 2 | 0 | 2 | 2 | 0 |
| 17 | 120 | 120 | 1 | 0 | 1 | 1 | 0 |
| 18 | 202 | 202 | 3 | 1 | 4 | 3 | 0 |
| 19 | 212 | 212 | 4 | 0 | 4 | 4 | 0 |
| 20 | 221 | 221 | 1 | 0 | 1 | 1 | 0 |
| 21 | 232 | 232 | 1 | 0 | 1 | 1 | 0 |
| **Backed total** |  | **20 standard + Cloud Hill** | **249** | **81** | **330** | **249** | **3** |

## Sentinel / disabled geometry

The probe classifies 246 records as non-degenerate convex quadrilaterals. Exactly three records contain the same authored disabled/sentinel shape: corners 0 and 1 are both `(-1,-1)`, leaving only the final edge as real geometry.

| Area/local | Resident label | Geometry result |
| --- | --- | --- |
| `1/13` | Grandpa Tal | sentinel corners 0,1 |
| `4/06` | Mason | sentinel corners 0,1 |
| `8/09` | Forest | sentinel corners 0,1 |

No other repeated-corner or non-convex geometry was found across the 249 backed records. This generalizes the previously documented Peach Grandpa Tal case: sentinel coordinates must be preserved rather than normalized into a plausible trigger polygon.

## Reproduction

From the repository root, with the user's own PAL inputs:

```text
python tools/interactions/fixed_interaction_world_census.py   --executable <path-to-SLES_513.56>   --disc-bin <path-to-PAL-bin>   --json artifacts/fixed-interaction-world-census.json
```

The full `artifacts/` JSON contains each zone address, four X/Z corners, local index, resident-definition address/name/body/paint, same-index dialogue entity address/name, SHOP slot index, and geometry classification. It is intentionally ignored and must not be committed. The retained summary is `docs/evidence/interactions/fixed-interaction-world-census-summary.json`.

The executable used for this census has SHA-256 `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

## Boundary / follow-up

This closes the data census itself. It does **not** claim that all 246 non-sentinel polygons are unconditionally available in every progression state; dialogue/host state can still gate behavior after a geometric hit. It also does not invent a standard FLD mapping for Cloud Hill or a normal fixed-room interpretation for descriptor 0.

The current production `readOverworldCatalogue()` deliberately filters entries without a standard field mapping, so its normal world list remains the 235 standard-world interactions. Cloud Hill's 14 records are now explicitly documented by the archaeology probe instead of being conflated with that standard-sector count.
