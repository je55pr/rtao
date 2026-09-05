# RTA transactional Body Shop commerce — 2026-09-01

Later Parts Shop archaeology advanced the shared recovered save to schema 4 so
equipment copy quantities can persist. Body ownership remains the same
single-bit namespace-0 behavior documented below; schema-3 saves migrate.

## Result

The active Three.js/TypeScript runtime now persists executable-backed Cake and
indexed ownership state and makes the Peach/Fuji Body Shop catalogues genuinely
transactional. A successful purchase records namespace-0 body ownership and
debits the original 500-Cake price. Unaffordable and duplicate purchases leave
both stores unchanged.

## Native evidence applied

- Cake is the signed 32-bit field at per-slot save offset `+0x654`.
- PAL helper `0x0023f7b8(amount, slot)` rejects a positive debit above the
  balance, accepts negative credits, and caps successful credits at 999,999.
- Indexed bank helpers use the persistent store at `+0xc30`; Body Shop host
  `0x0026c8f8` directly proves namespace 0 as body ownership.
- The confirmed purchase path at `0x0026cae0` sets `(0, bodyIndex)` through
  `0x0023ee20`, then debits the 500-Cake result through `0x0023f7b8`.
- That complete confirmed-purchase path contains no write to the saved
  configuration block at `+0x0c`. It returns through the host/UI path after
  ownership, debit and feedback. Therefore purchase is not treated as equip.
- `0x0022b568` is a separately identified body/configuration initializer: it
  sets namespace-0 ownership and writes the chosen starting body to save offsets
  `+0x0c` and `+0x04`. Its only six callers at `0x002705b8`–`0x00270608` are the
  new-game starter-body cases (IDs 43, 0, 117, 140, 114 and 93). It is not called
  by the Body Shop purchase host and is not reused as a speculative shop equip
  callback.
- The new-game setup `0x0022b5d0` calls the full per-slot initializer
  `0x00228c40` for slots 0 and 1, then writes exactly 1,000 to slot-0 offset
  `+0x654` at `0x0022b5fc`. The starter-body selection path calls this setup at
  `0x00270570` before dispatching to the six `0x0022b568` cases. This directly
  proves a fresh player's starting balance is 1,000 Cake.

## Web implementation

- Added `RecoveredCommerceState`, mirroring the proven Cake debit/credit/cap
  behavior with its own persistence revision.
- Added atomic `purchaseIndexedItem` behavior for an evidence-selected indexed
  namespace and item ID.
- Upgraded `save/recovered-dialogue-state.json` from schema 2 to schema 3. The
  file now stores `cake` beside the already proven `indexedFlags` and `stamps`.
  Schemas 1 and 2 still migrate without inventing a balance.
- Body Shop shows current Cake, owned status, insufficient-funds feedback and a
  purchase control. A successful purchase saves immediately through the same
  serialized OPFS queue as quest/stamp progress.
- Body preview remains live, but purchase deliberately does not alter the
  equipped body. Parts Shop purchasing/trade remains deferred because its
  category/exchange callback `0x002456e8` and opposite-slot semantics are not
  yet named confidently.

A new schema-3 browser state therefore starts at the executable-proven 1,000
Cake. Schema-1/2 saves predate browser Cake persistence and retain that same
native new-game default during migration; schema-3 reloads use their recorded
balance. Existing/future evidence-backed rewards can credit the same state
through the signed Cake helper semantics.

## Automated validation

- Vitest: 26/26 files, 100/100 tests passed.
- TypeScript project check: passed.
- Vite production build: passed (42 modules; main JS 78.55 kB, CSS 21.03 kB).
- Sandbox capture bundle: passed (1,465.17 kB).
- Regression coverage includes Cake debit/credit/rejection/cap, insufficient
  funds without partial ownership, namespace-0 ownership, duplicate no-charge,
  schema migration, executable-proven 1,000-Cake initialization, and
  ownership/Cake reload persistence.

## Browser / visual validation

Chrome Headless Shell 151.0.7922.34 launched through the supplied offline Python
Playwright environment. A fresh FLD/223 fixture persisted at the complete
6,514,849-byte size. The cached `peach-day-ground` capture produced a valid
1280x960 PNG (1,568,898 bytes, 29,091 triangles), SHA-256
`8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`.
That matches the canonical known-good capture exactly. Visual inspection passed:
Peach geometry, scenery textures, sky/fog and camera composition were coherent,
with no blank or catastrophic rendering failure.

The supplied Playwright wheel's bundled 123,656,816-byte Node executable was
truncated to 29,360,128 bytes by pip extraction in this Work container. Replacing
that installed file from the verified wheel and selecting the Work runtime Node
through `PLAYWRIGHT_NODEJS_PATH` restored Playwright operation. This is an
environment setup limitation, not a project-source or Chrome failure.
