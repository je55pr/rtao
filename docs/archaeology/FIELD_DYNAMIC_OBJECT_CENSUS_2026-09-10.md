# PAL field dynamic / extra object census — 2026-09-10

## Scope and authority

This pass censuses the 64 ordinary `FLD/NNN.BIN` sectors in the European PAL disc image, using the local original game data as authority. The executable read from that image is `SLES_513.56`, SHA-256 `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

The retained evidence is payload-free metadata only: field numbers, section sizes, SHA-256 fingerprints, decoded mesh/VU structure, radius and decoded texture dimensions. No original field/object bytes are committed.

Reproduce with `tools/dynamic-objects/field_dynamic_object_census.pal.test.ts`; the generated report is `docs/evidence/dynamic-objects/field-dynamic-object-census-2026-09-10.json`.

## Result

All 64 ordinary sectors were enumerated directly from the PAL `FLD` directory. Fifty sectors have only Extra[0] and therefore no Extra[1] candidate object container. Fourteen sectors have Extra[1]; twelve of those decode to one or more MSCALF-4 object meshes through the same clean-room HG2 object grammar already proven for palm crowns and the Mushroom Road rotor.

Extra[1] sectors: `011, 012, 023, 111, 113, 202, 203, 210, 211, 213, 220, 221, 223, 233`.

Scanning **every** Extra[n], rather than assuming objects always live at index 1, finds one additional MSCALF-4 container: `FLD/023 Extra[79]`. Therefore the complete ordinary-world census contains 13 MSCALF mesh extras across 13 fields. `023:79` is the only object-bearing extra outside index 1.

The only repeated decoded mesh structure across different sectors is the palm crown in `220` and `221`: three mesh sections with `1/2/3` strips, `4/8/12` vertices and `2/4/6` strip triangles. Their complete Extra[1] hashes differ, consistent with field-local texture/material packaging, while the mesh structure and decoded radius match.
## Object-bearing extra structures

| FLD:Extra | Mesh shape (`primitives/vertices/strip-tris`) | Radius | Texture | Evidence-level identification |
|---:|---|---:|---|---|
| 011:1 | `16/64/32 + 2/38/34` | 90.554 | 128×128, alpha | decoded prop; prior visual read: distant scenery band + small prop |
| 012:1 | `44/236/148 + 8/24/8` | 2.836 | 128×128 | decoded prop; prior visual read: crossed-billboard shrub / small tree |
| 023:79 | `30/396/336 + 31/194/132 + 259/1342/824` | 28.708 | 128×128, alpha | **new decoded candidate** in My City's special extra layout; identity/placement/animation unresolved |
| 113:1 | `56/460/348` | 10.221 | no embedded decoded texture | decoded prop; prior visual read: Fuji moat bridge |
| 202:1 | `12/40/16` | 6.328 | 128×128 | decoded prop; prior visual read: ski-area marker/sign |
| 203:1 | `28/124/68 + 21/64/22` | 3.441 | 128×128 | decoded prop; prior visual read: ski-area markers/signs |
| 210:1 | `42/234/150 + 25/140/90` | 3.058 | 128×128 | decoded prop; prior visual read: decorative potted tree |
| 211:1 | `20/74/34` | 3.939 | 128×128 | decoded prop; prior visual read: ski-area marker/sign |
| 213:1 | `25/86/36` | 41.966 | 128×128 | **known wind-turbine rotor** |
| 220:1 | `1/4/2 + 2/8/4 + 3/12/6` | 3.925 | 64×32, alpha | **known palm crown** |
| 221:1 | same as 220 | 3.925 | 64×32, alpha | **known palm crown** |
| 223:1 | `74/308/160 + 49/298/200 + 42/220/136` | 2.040 | 128×128, alpha | decoded prop; prior visual read: giant peach landmark |
| 233:1 | `59/334/216 + 26/112/60 + 89/402/224` | 5.009 | 128×128, alpha | decoded prop; prior visual read: giant papaya landmark |

Every mesh above executes MSCALF 4 in the primary object copy. This is a transform/shading kernel, not evidence of animation by itself.
## Non-object Extra[1] cases

Two sectors have an Extra[1] but do not decode through the MSCALF-4 object-container path:

- `FLD/023` has **80** extra sections in its field header. Extra[1] is 6,208 bytes and is not a valid HG2 object container. The field is structurally special, but the all-extra scan separately finds a valid object container at Extra[79].
- `FLD/111` has two extras; Extra[1] is a valid two-section HG2-style container, but neither section decodes as an MSCALF-4/10 mesh. It remains unresolved rather than being labelled as an object.

All remaining 50 sectors have exactly one extra section, Extra[0], and no Extra[1]. The existing Extra[0] minimap interpretation is therefore still the common ordinary-field baseline.

## Animation-family boundary

**Decoded fact:** all thirteen object-bearing extras, including My City's `023:79`, use the shared MSCALF-4 primary mesh path. The mesh packet itself carries geometry/normal/colour/UV data and receives a per-object transform. This structural fact only establishes a common draw path.

**Previously observed fact:** the `220/221` palm family sways in the shipped game. Its identical mesh structure across both fields makes it the strongest reusable animation-family exemplar. The current runtime's sway constants remain a host approximation.

**Previously observed fact:** `213` is the Mushroom Road wind-turbine rotor. Its current spin rate, scale and facing are still host approximations until the native object-update matrix is decoded.

**Candidate only:** `011:1, 012:1, 023:79, 113:1, 202:1, 203:1, 210:1, 211:1, 223:1, 233:1` share MSCALF-4 but each has a unique structural key in this 64-field census. The census provides no evidence that any of them animate, nor that any should reuse palm or rotor timing. Treat them as transform-driven object candidates, not animation implementations. `023:79` is newly exposed by this census and remains unidentified.

**Unresolved:** `FLD/111 Extra[1]`, My City's non-object extras, and the identity/placement/animation of `023:79` require separate format/loader tracing before they can be assigned further behavior.

## What the census does not prove

No placement table, facing, scale, pivot, animation phase, angular speed, sway amplitude or time source is recovered here. Similar radius, texture size or MSCALF program is not sufficient evidence for shared behavior. Exact Extra[1] byte identity is also not required for a family: the two palm fields deliberately demonstrate that equivalent mesh structure can be packaged with different field-local bytes.

The next evidence-producing step is to trace the PAL field-extra loader into the per-instance object records and follow the matrix values entering the shared MSCALF-4 submission path. Correlating those records with `fieldNumber + Extra index + structuralKey` from this census should let future probes distinguish static transforms from time-varying families without guessing from appearance.

## Reproduction / review

Run the dedicated opt-in PAL test with `RTA_PAL_BIN` pointing at the local MODE2/2352 image and `DYNAMIC_OBJECT_CENSUS_OUTPUT` pointing at a JSON destination. The probe asserts that exactly 64 numeric ordinary FLD files are present, locks the known `213`, `220` and `221` Extra[1] cases, and locks the new `023:79` object signature plus its status as the sole non-Extra[1] MSCALF mesh extra.

The JSON is intended for diffable archaeology. A changed field hash with the same structural key means packaging bytes changed while the decoded shape did not; a changed structural key means the decoded primitive/vertex topology itself changed and deserves review.
