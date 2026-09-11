# Native equipment complete catalogue — 2026-09-10

## Result

PAL categories **1–14 are now fully enumerated** from `SLES_513.56`: 104 selector records total, with exact item indices, record names, Cake prices, table addresses/strides, complete raw record bytes, and the configuration fields whose consumers are already proven.

The reproducible dump is `docs/evidence/equipment/native-equipment-catalogue-pal.json`; `tools/equipment/native_equipment_catalogue.py` regenerates it directly from either the PAL ELF or raw 2352-byte-sector BIN. The retained evidence contains no executable/disc payload. Authority ELF: 1,952,960 bytes, SHA-256 `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

This closes the catalogue census only. Raw fields without a traced consumer stay raw and are not assigned convenient gameplay semantics.

## Native table map

| Cat | Native category | Table | Stride | Count | Proven configuration role |
|---:|---|---:|---:|---:|---|
| 1 | Tyres | `0x00301630` | 28 | 13 | six surface-grip `u16`s; record `u16 +0x1a` drives cfg flag `0x0400` |
| 2 | Engine | `0x00301a90` | 24 | 12 | drive scalar `u32 +0x0c`; record code `u32 +0x14` drives cfg flags `0x0001/0x0002` |
| 3 | Chassis | `0x00301db8` | 16 | 5 | weight word `u32 +0x0c` |
| 4 | Transmission | `0x00301ee8` | 28 | 6 | eight signed gear/sentinel `s16`s from `+0x0c` |
| 5 | Steering | `0x003020a8` | 16 | 4 | steering scalar `u16 +0x0c`; trailing `u16` remains raw |
| 6 | Brakes | `0x00302190` | 44 | 4 | 32-byte brake-hold curve from `+0x0c` |
| 7 | Wheels | `0x00304b98` | 12 | 15 | selected item is also copied to configuration byte `+0x06` |
| 8 | Lights | `0x00304b00` | 16 | 3 | nonzero selector toggles cfg flag `0x0010`; record `u32 +0x0c` remains raw |
| 9 | Wing | `0x00304e40` | 12 | 2 | nonzero selector toggles cfg flag `0x1000` |
| 10 | Special Parts | `0x00304eb8` | 16 | 3 | selector writer clears `0x0040/0x2000`, then ORs record `u16 +0x0c` |
| 11 | Options | `0x00304fa0` | 20 | 9 | cfg flags from `u16 +0x0c`; record byte `+0x10` copied to cfg byte `+0x07`; other bytes stay raw |
| 12 | Stickers | `0x003053b8` | 12 | 2 | nonzero selector toggles cfg flag `0x4000` |
| 13 | Horns | `0x00304c60` | 16 | 15 | selector byte only in `0x0023df78`; trailing `u32` remains raw |
| 14 | Meters | `0x00305280` | 12 | 11 | selector byte only in `0x0023df78` |

Price helper `0x00245268` dispatches categories 0–14 through `0x0030ac20`; the table addresses/strides above reproduce every category 1–14 price. Selector-write helper `0x0023df78` writes the selector first, then dispatches categories 1–12 through `0x00301410`; 13–14 return without additional mutations in that helper.

## Complete selector/name/price census

### 1 Tyres

`0 Normal 200`; `1 Sports 1,000`; `2 Semi-Racing 2,000`; `3 Racing 5,000`; `4 HG Racing 10,000`; `5 Wet 2,000`; `6 HG Wet 3,000`; `7 Off-Road 500`; `8 HG Off-Road 3,000`; `9 Studless 1,000`; `10 HG Studless 3,000`; `11 Big 5,000`; `12 Devil 200,000`.

The six coefficient fields are the proven Dry / Off-road / Wet / Grass / Snow / Ice sequence. Only Big has a nonzero `u16 +0x1a` in this table and therefore sets `0x0400` through the selector writer. The remaining `u16 +0x18` is retained raw.

### 2 Engine

`0 Normal 200`; `1 Panther 500`; `2 Blue MAX 1,000`; `3 Blue MAX V2 1,500`; `4 MAD 2,000`; `5 MAD V2 4,000`; `6 Long MAD 8,000`; `7 Black MAX 12,000`; `8 RS Magnum 16,000`; `9 Speed MAX 20,000`; `10 Hyper MAX 80,000`; `11 Devil Engine 160,000`.

`u32 +0x0c` is the proven drive-force scalar. `u32 +0x10` remains raw. `u32 +0x14` is consumed by the fitting helper: code 1 selects cfg flag `0x0001`, code 2 selects `0x0002`, otherwise both are clear.

### 3 Chassis

`0 Normal 200`; `1 Light 500`; `2 Feather 1,000`; `3 Phantom 2,000`; `4 Hyper 4,000`.

Each 16-byte record is three pointers/price words plus `u32 +0x0c`. The latter is the proven live weight/inverse-mass divisor source: `25, 22, 20, 18, 15`. There is no additional category-3 mutation in selector helper `0x0023df78`.

### 4 Transmission

`0 Normal 200`; `1 Sports 1,000`; `2 Power 2,000`; `3 Speed 4,000`; `4 Wide 7,000`; `5 Hyper 10,000`.

Each record carries eight signed `s16` words from `+0x0c`. They are retained verbatim in the JSON. Existing consumer tracing proves reverse/forward gear endpoints and zero sentinels; it does not justify inventing an untraced browser shift schedule.

### 5 Steering

`0 Normal 200`; `1 Quick 500`; `2 X2 Quick 1,000`; `3 X3 Quick 2,000`.

The proven steering scalar is `u16 +0x0c`: `64, 96, 128, 160`. The trailing `u16 +0x0e` is preserved raw because no semantic consumer is established here.

### 6 Brakes

`0 Normal Pad 500`; `1 Soft Pad 1,000`; `2 Hard Pad 1,500`; `3 Metal Pad 2,000`.

Each 44-byte record contains the 32-byte native brake-hold curve at `+0x0c`. The complete byte sequences are retained in the evidence JSON; the already-recovered consumer advances one sample per held-brake update and saturates at sample 32.

### 7 Wheels

`0 Normal 500`; `1 Mesh 500`; `2 Spoke 1 500`; `3 Spoke 2 500`; `4 Flush 1 500`; `5 Spoke 3 500`; `6 Flush 2 500`; `7 Spoke 4 500`; `8 Spoke 5 500`; `9 Spoke 6 500`; `10 Flush 3 500`; `11 Flush 4 500`; `12 Flush 5 500`; `13 Spoke 7 500`; `14 Spoke 666 5,000`.

These are 12-byte name/description/price records with no extra record tail. Category-7 fitting duplicates the selected item into configuration byte `+0x06`; wheel rendering already consumes that selector.

### 8 Lights

`0 Headlights 0`; `1 Fog Lights 500`; `2 Beam Lights 500`.

The trailing `u32 +0x0c` is retained raw. The selector writer only proves that nonzero light selection sets configuration flag `0x0010` and zero clears it; no meaning is assigned to the trailing word.

### 9 Wing

`0 None 0`; `1 Wing Set 3,000`.

These are 12-byte name/description/price records. Nonzero selection sets configuration flag `0x1000`; zero clears it.

### 10 Special Parts

`0 None 0`; `1 Propeller 3,000`; `2 Jet Turbine 10,000`.

The selector writer clears configuration flags `0x0040` and `0x2000` then ORs record `u16 +0x0c`. The observed values are `0`, `0x0040`, `0x2000`; `u16 +0x0e` is zero in all three records but remains represented as a raw field rather than being given a role.

### 11 Options

English catalogue names are `0 None 0`; `1 Water Ski 3,000`; `2 Flight Wing 50,000`; `3 Police Light 1,000`; `4 Sign 0`; `5 Sign 0`; `6 Sign 0`; `7 Sign 0`; `8 Sign 0`.

The configuration records at `0x00304fa0` call selectors 4–8 `Billboard`; the English display records at `0x00307dc0` call the same five selectors `Sign`. This is a native naming split, not a remapping. The retained JSON deliberately reports the configuration-record name and address; this note records the English display label separately.

The writer clears flags `0x0004/0x0020/0x0100/0x0200`, ORs record `u16 +0x0c`, and copies record byte `+0x10` to configuration byte `+0x07`. Records 4–8 all use flag `0x0200` and variant bytes `0..4`. Record `u16 +0x0e` values and bytes `+0x11..+0x13` remain raw because this census does not establish their semantics.

### 12 Stickers

`0 None 0`; `1 Sticker 10,000`.

These are 12-byte name/description/price records. Nonzero selection sets configuration flag `0x4000`; zero clears it.

### 13 Horns

`0 Normal Horn 0`; `1 Air Horn 1,000`; `2 Echo Air Horn 1,000`; `3 Bus Horn 1,000`; `4 Bicycle Bell 1,000`; `5 Venus Horn 1,000`; `6 Chicken Horn 1,000`; `7 Fantasy Horn 1,000`; `8 Trumpet Horn 1,000`; `9 Christmas Horn 1,000`; `10 Duck Horn 1,000`; `11 Space Horn 1,000`; `12 Horse Horn 1,000`; `13 Baby Horn 1,000`; `14 Train Horn 1,000`.

The 16-byte records contain a trailing `u32` sequence `60, 62, …, 88`. Horn selection is known to control horn audio, but this catalogue pass does not assign that trailing word a more specific meaning without its consumer. Categories 13–14 receive no extra mutation in selector helper `0x0023df78` beyond the selector byte itself.

### 14 Meters

`0 Normal Meter 0`; `1 Chronometer 100`; `2 Rainbow Meter 100`; `3 Space Meter 100`; `4 Triangle Meter 100`; `5 Love Sick Meter 100`; `6 Life Meter 100`; `7 Cherry Meter 100`; `8 Duck Meter 100`; `9 Devil Meter 100`; `10 Digital Meter 100`.

These are 12-byte name/description/price records. Meter selection is known to choose the meter/HUD presentation, but no category-specific configuration mutation is performed by `0x0023df78`; this pass does not infer any hidden meter state beyond the selector.

## Evidence boundary

`native-equipment-catalogue-pal.json` is intentionally mechanical. Every item contains its native record address, name pointer, description pointer, Cake price, complete record bytes, the bytes after the common 12-byte header, and only those decoded fields whose layout/consumer has been established. Unknown or incompletely traced words remain named `raw_*` or remain solely in the hex record.

The dump does **not** retain localized descriptions, executable bytes, models, textures, sounds, or any other proprietary payload. It is sufficient to independently check catalogue identity, price, table layout and the recovered configuration fields against a developer-supplied PAL executable/BIN.

Existing focused archaeology remains the semantic authority for consumers already closed: tyre grip/Big flag, engine drive scalar, chassis weight, transmission gear words, steering scalar, brake curve, wheel selector, and Q's Factory selector persistence. This census does not widen those behavioral claims.

## Reproduction and validation

From the repository root, with a locally supplied European PAL source:

```text
python tools/equipment/native_equipment_catalogue.py <SLES_513.56-or-raw-BIN> --verify docs/evidence/equipment/native-equipment-catalogue-pal.json
```

The 2026-09-10 recovery run verified the retained JSON byte-for-byte directly from the 617,825,712-byte raw PAL BIN. The extracted ELF was 1,952,960 bytes with SHA-256 `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

The same retained catalogue also verified from the directly extracted `SLES_513.56` ELF after normalizing input transport metadata, so BIN and ELF inputs now reproduce the same evidence content.
