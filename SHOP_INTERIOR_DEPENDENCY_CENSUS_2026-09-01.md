# RTA fixed-interior dependency census — 2026-09-01

Generated from the PAL executable in one source session. Classification
describes the default entry boundary only; it does not claim that every
quest/save consequence in later variants is implemented.

- Mapped interactions: **235** across **20** areas.
- Decoded entities: **235**.
- Decoder-deferred entities: **0**.
- Entry dialogue: **16**; entry choices: **72**; entry host boundaries: **147**.

## Area 1 · FLD/223 · SHOP/T00.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Body Shop Staff → Body Shop | Q032 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 03 | Paint Shop Staff → Paint Shop | Q034 | slot 02; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 04 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 05 | Policeman → Policeman | Q009 | slot 01; 1 page(s) | 2 | — | `check 23→04`, `clear 23` | `0x02`, `0x05`, `0x07`, `0x0d` |
| 06 | Peach FM Front Desk → Peach FM Front Desk | Q118 | slot 01; 1 page(s) | 2 | — | `check 24→04`, `clear 24` | `0x02`, `0x05`, `0x07`, `0x0d` |
| 07 | Kinsera → Kinsera | Q122 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 08 | Kevin's mom → Kevin's mum | Q048 | slot 01; 1 page(s) | 0 | — | — | `0x0d` |
| 09 | Wolf → Wolf | Q120 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 10 | Best → Best | Q016 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 11 | Jousset → Jousset | Q136 | slot 01; 1 page(s) | 0 | — | `check 46→03`, `clear 46` | `0x01`, `0x0b`, `0x0d`, `0x10` |
| 12 | Owner → Owner | Q100 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x15`, `0x16` |
| 13 | Grandpa Tal → Grandpa Tal | Q137 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x0d` |
| 14 | Jones → Jones | Q092 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | `check 32→10`, `check 32→28`, `check 32→33`, `check 32→34`, `check 33→11`, `check 33→32`, `check 33→33`, `check 33→35`, `check 34→12`, `check 34→29`, `check 34→33`, `check 34→36`, `check 35→13`, `check 35→27`, `check 35→33`, `check 35→37`, `check 36→06`, `check 36→14`, `check 36→33`, `check 36→38`, `check 37→15`, `check 37→30`, `check 37→33`, `check 37→39`, `check 38→16`, `check 38→31`, `check 38→33`, `check 38→40`, `clear 32`, `clear 33`, `clear 34`, `clear 35`, `clear 36`, `clear 37`, `clear 38` | `0x01`, `0x03`, `0x05`, `0x06`, `0x07`, `0x0d`, `0x10`, `0x19`, `0x1b`, `0x1c`, `0x1d`, `0x1e`, `0x1f` |
| 15 | Fight → Fight | Q094 | slot 01; 1 page(s) | 0 | — | `check 31→08`, `clear 31` | `0x01`, `0x02`, `0x07`, `0x0d`, `0x10`, `0x11` |
| 16 | Milton → Milton | Q064 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 17 | Entrance to the cave → Entrance to the cave | Q101 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03` |
| 18 | Quick-Pic Shop Staff → Quick-Pic Shop No.1 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 19 | Quick-Pic Shop Staff → Quick-Pic Shop No.2 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 20 | Quick-Pic Shop Staff → Quick-Pic Shop No.3 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.4 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.5 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 23 | Quick-Pic Shop Staff → Quick-Pic Shop No.6 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 24 | Quick-Pic Shop Staff → Quick-Pic Shop No.7 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 25 | Quick-Pic Shop Staff → Quick-Pic Shop No.8 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 26 | Quick-Pic Shop Staff → Quick-Pic Shop No.9 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 27 | Quick-Pic Shop Staff → Quick-Pic Shop No.10 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 2 · FLD/113 · SHOP/T01.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Body Shop Staff → Body Shop | Q032 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 03 | Paint Shop Staff → Paint Shop | Q034 | slot 02; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 04 | Barkeeper → Barkeeper | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 05 | Heizo → Heizo | Q050 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x59]` | — | `0x01`, `0x02`, `0x07`, `0x08`, `0x0d`, `0x10`, `0x13` |
| 06 | Echigoya sales assistant → Echigoya sales assistant | Q102 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03` |
| 07 | Princess Nanaha → Princess Nanaha | Q027 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 08 | the King → King | Q070 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0b`, `0x0d` |
| 09 | Guard of the maze → Guard of the maze | Q125 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d`, `0x0f`, `0x11` |
| 10 | Otomi → Otomi | Q052 | slot 01; 1 page(s) | 0 | `0x07 [0x0e, 0x05]` | — | `0x07`, `0x14` |
| 11 | spirit mediums → Spirit Mediums | Q071 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0b`, `0x0d` |
| 12 | Dumpling Cake shop → Dumpling Cake shop | Q057 | slot 01; 1 page(s) | 0 | — | — | `0x0d` |
| 13 | Uzumasa → Uzumasa | Q111 | slot 01; 1 page(s) | 2 | — | `check 27→09`, `clear 27` | `0x02`, `0x03`, `0x07` |
| 14 | Iwasuke → Iwasuke | Q042 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x0d`, `0x10` |
| 15 | Hakosuke → Hakosuke | Q072 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x07`, `0x0b`, `0x0d`, `0x0e`, `0x10` |
| 16 | Nobizo → Nobizo | Q040 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x15`, `0x16` |
| 17 | Notsuo → Natsuo | Q001 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d`, `0x13`, `0x16` |
| 18 | Hanako → Hanako | Q099 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 19 | Quick-Pic Shop Staff → Quick-Pic Shop No.17 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 20 | Quick-Pic Shop Staff → Quick-Pic Shop No.18 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.19 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.20 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 23 | Quick-Pic Shop Staff → Quick-Pic Shop No.21 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 24 | Quick-Pic Shop Staff → Quick-Pic Shop No.22 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 25 | Quick-Pic Shop Staff → Quick-Pic Shop No.23 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 26 | Quick-Pic Shop Staff → Quick-Pic Shop No.24 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 27 | Quick-Pic Shop Staff → Quick-Pic Shop No.25 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 28 | Quick-Pic Shop Staff → Quick-Pic Shop No.26 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 3 · FLD/013 · SHOP/T02.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Body Shop Staff → Body Shop | Q032 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 03 | Paint Shop Staff → Paint Shop | Q034 | slot 02; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 04 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 05 | Rombo → Captain Rombo | Q051 | slot 01; 1 page(s) | 0 | — | — | `0x07`, `0x0d` |
| 06 | Registration → Figure 8 Registration | Q061 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x46]` | — | `0x02`, `0x03` |
| 07 | Registration → Football Registration, | Q061 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d`, `0x0e`, `0x12` |
| 08 | Registration → Roulette Registration | Q061 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x52]` | — | `0x02`, `0x03`, `0x0b`, `0x0d`, `0x10` |
| 09 | Tony → Tony | Q107 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 10 | Johnny → Johnny | Q013 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x4f]` | — | `0x02`, `0x03`, `0x0d`, `0x11`, `0x13`, `0x16` |
| 11 | Frank → Frank | Q019 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 12 | Sebastian → Sebastian | Q025 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x09`, `0x10` |
| 13 | Store Manager → Shop Manager | Q020 | slot 01; 1 page(s) | 2 | — | `check 39→07` | `0x07` |
| 14 | King → Mr.King | Q134 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | `check 39→04`, `clear 39` | `0x03`, `0x0d` |
| 15 | Butch → Butch | Q095 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x10`, `0x14` |
| 16 | Barton → Barton | Q037 | slot 01; 1 page(s) | 2 | — | `check 25→09`, `clear 25` | `0x01`, `0x02`, `0x03`, `0x07`, `0x10`, `0x11` |
| 17 | Chocolat → Chocolat | Q043 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x15`, `0x16` |
| 18 | Merci → Merci | Q049 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 19 | Bob → Bob | Q078 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 20 | Richard → Richard | Q131 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.36 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.37 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 23 | Quick-Pic Shop Staff → Quick-Pic Shop No.38 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 24 | Quick-Pic Shop Staff → Quick-Pic Shop No.39 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 25 | Quick-Pic Shop Staff → Quick-Pic Shop No.40 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 26 | Quick-Pic Shop Staff → Quick-Pic Shop No.41 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 27 | Quick-Pic Shop Staff → Quick-Pic Shop No.42 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 28 | Quick-Pic Shop Staff → Quick-Pic Shop No.43 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 29 | Quick-Pic Shop Staff → Quick-Pic Shop No.44 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 30 | Quick-Pic Shop Staff → Quick-Pic Shop No.45 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 31 | Quick-Pic Shop Staff → Quick-Pic Shop No.46 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 32 | Quick-Pic Shop Staff → Quick-Pic Shop No.47 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 4 · FLD/103 · SHOP/T03.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 02 | Wallace → Wallace | Q114 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 03 | Gene → Gene | Q124 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x07`, `0x0d`, `0x12` |
| 04 | Maya Carton → Maya Carton | Q119 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0d` |
| 05 | Rock Climbing entrance → Rock Climbing entrance | Q101 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03` |
| 06 | Mason → Mason | Q097 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x04`, `0x0d` |
| 07 | Rorke → Boss Rorke | Q035 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0d`, `0x0e`, `0x0f`, `0x11` |
| 08 | Tom → Tom | Q138 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x0e`, `0x10` |
| 09 | Lowry → Lowry | Q045 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 10 | Betty → Betty | Q038 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 11 | Lucy → Lucy | Q015 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x08`, `0x10` |
| 12 | Quick-Pic Shop Staff → Quick-Pic Shop No,60 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 13 | Quick-Pic Shop Staff → Quick-Pic Shop No.61 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 14 | Quick-Pic Shop Staff → Quick-Pic Shop No.62 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 15 | Quick-Pic Shop Staff → Quick-Pic Shop No.63 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 16 | Quick-Pic Shop Staff → Quick-Pic Shop No.64 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 5 · FLD/210 · SHOP/T04.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 03 | Jumbo → Jumbo | Q074 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0b`, `0x0d`, `0x0f` |
| 04 | Goddess → Goddess | Q087 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0d` |
| 05 | Quick-Pic Shop Staff → Quick-Pic Shop No.65 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 06 | Quick-Pic Shop Staff → Quick-Pic Shop No.66 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 07 | Quick-Pic Shop Staff → Quick-Pic Shop No.67 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 08 | Quick-Pic Shop Staff → Quick-Pic Shop No.68 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 09 | Quick-Pic Shop Staff → Quick-Pic Shop No.69 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 10 | Quick-Pic Shop Staff → Quick-Pic Shop No.70 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 6 · FLD/203 · SHOP/T05.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Body Shop Staff → Body Shop | Q032 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 03 | Paint Shop Staff → Paint Shop | Q034 | slot 02; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 04 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 05 | Policeman → Policeman | Q009 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0d` |
| 06 | Merrin → Merrin | Q036 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x10` |
| 07 | Registration → Ski Jumping Registration | Q061 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0b`, `0x0d`, `0x0e`, `0x15` |
| 08 | Grandma Dizzy → Grandma Dizzy | Q055 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0d` |
| 09 | Lettar → Lettar | Q033 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | `check 46→06` | `0x01`, `0x03`, `0x07`, `0x10`, `0x11` |
| 10 | Santa Claus → Santa Claus | Q018 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x0d` |
| 11 | Keitel → Keitel | Q046 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x0d` |
| 12 | Ross → Ross | Q008 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x10` |
| 13 | Busheme → Busheme | Q007 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x10` |
| 14 | Madison → Madison | Q006 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x10` |
| 15 | Bunger → Bunger | Q000 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x10` |
| 16 | Emily → Emily | Q090 | slot 01; 1 page(s) | 2 | — | `check 42→07`, `clear 42` | `0x02`, `0x07`, `0x0d` |
| 17 | Bigfoot Joe → Bigfoot Joe | Q005 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x10` |
| 18 | Registration → Curling Registration | Q061 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0b`, `0x0d`, `0x0e`, `0x10`, `0x12` |
| 19 | Kate → Kate | Q130 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x15`, `0x16` |
| 20 | Quick-Pic Shop Staff → Quick-Pic Shop No.71 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.72 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.73 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 23 | Quick-Pic Shop Staff → Quick-Pic Shop No.74 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 24 | Quick-Pic Shop Staff → Quick-Pic Shop No.75 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 25 | Quick-Pic Shop Staff → Quick-Pic Shop No.76 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 26 | Quick-Pic Shop Staff → Quick-Pic Shop No.77 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 7 · FLD/233 · SHOP/T06.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Q's Factory Staff → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Parts Shop Staff → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Body Shop Staff → Body Shop | Q032 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 03 | Bartender → Bartender | Q068 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x07` |
| 04 | Policeman → Policeman | Q009 | slot 01; 1 page(s) | 2 | — | — | `0x02` |
| 05 | Registration → Obstacle Course registration | Q061 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x0b`, `0x0d`, `0x0e`, `0x10`, `0x11` |
| 06 | Mayor → Papaya Mayor | Q054 | slot 01; 1 page(s) | 0 | `0x04 [0x00]` | — | `0x01`, `0x03`, `0x04`, `0x0d`, `0x10`, `0x12` |
| 07 | Luke → Luke | Q118 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x42]` | `check 19→06` | `0x01`, `0x02`, `0x07`, `0x0d`, `0x10` |
| 08 | Grandpa Costello → Grandpa Costello | Q110 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x0e`, `0x10` |
| 09 | Andy → Andy | Q096 | slot 01; 1 page(s) | 0 | — | — | `0x01`, `0x09`, `0x10` |
| 10 | Shirley → Shirley | Q132 | slot 01; 1 page(s) | 2 | — | `check 43→06`, `check 43→17`, `clear 43` | `0x01`, `0x02`, `0x0d`, `0x10` |
| 11 | Casa → Casa | Q104 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x0b`, `0x0d`, `0x10` |
| 12 | Sandro → Sandro | Q053 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x07`, `0x0d`, `0x10` |
| 13 | Micky → Micky | Q051 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d` |
| 14 | Daniel → Daniel | Q121 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x15`, `0x16` |
| 15 | Shimisa → Shimisa | Q013 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x4f]` | — | `0x02`, `0x03`, `0x0d` |
| 16 | Romba → Romba | Q066 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02`, `0x0b`, `0x0d`, `0x10` |
| 17 | Pollepolle → Pollepolle | Q047 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x02` |
| 18 | Quick-Pic Shop Staff → Quick-Pic Shop No.87 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 19 | Quick-Pic Shop Staff → Quick-Pic Shop No.88 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 20 | Quick-Pic Shop Staff → Quick-Pic Shop No.89 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.90 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.91 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 23 | Quick-Pic Shop Staff → Quick-Pic Shop No.92 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 24 | Quick-Pic Shop Staff → Quick-Pic Shop No.93 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 25 | Quick-Pic Shop Staff → Quick-Pic Shop No.94 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 26 | Quick-Pic Shop Staff → Quick-Pic Shop No.95 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 27 | Quick-Pic Shop Staff → Quick-Pic Shop No.96 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 9 · FLD/023 · SHOP/T08.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Gonzo → Q's Factory | Q028 | slot 04; 1 page(s) | 5 | — | — | `0x01`, `0x02`, `0x03`, `0x04`, `0x08`, `0x0e`, `0x0f`, `0x14` |
| 01 | Suess → Parts Shop | Q031 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 02 | Ramsey → Body Shop | Q010 | slot 01; 1 page(s) | 0 | `0x13 [0x02]` | — | `0x13` |
| 03 | Nouri → Paint Shop | Q126 | slot 02; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 04 | Accel → Accel | Q009 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07` |
| 05 | Kite → Second-hand shop | Q127 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x13` |
| 06 | Wonder → Wonder Estate Agency | Q125 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x09`, `0x14` |
| 07 | Manei → Manei | Q003 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x17` |
| 08 | George → George | Q116 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x18` |
| 09 | Roberts → Roberts | Q113 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x0d` |
| 10 | Dayan → Dayan | Q133 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d` |
| 11 | Brian → Brian | Q029 | slot 01; 1 page(s) | 0 | — | — | `0x04`, `0x07`, `0x0d` |
| 12 | Ryoji → Roji, teacher | Q142 | slot 01; 1 page(s) | 0 | `0x06 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x0d`, `0x10` |
| 13 | Coine → Coine | Q123 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x07`, `0x0d` |
| 14 | Kuwano → Kuwano | Q141 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03`, `0x06` |
| 15 | Mien → Mien | Q067 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x01`, `0x03`, `0x10` |
| 16 | Flower → Flower | Q073 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | `check 41→04`, `clear 41` | `0x03`, `0x05`, `0x07`, `0x0d` |
| 17 | Gichi → Gichi | Q044 | slot 01; 1 page(s) | 0 | `0x03 [0x00]` | — | `0x03` |
| 18 | Akiban → Akiban | Q012 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x03`, `0x07`, `0x0d`, `0x0e` |
| 19 | Sally → Sally | Q063 | slot 01; 1 page(s) | 0 | `0x06 [0x00]` | — | `0x01`, `0x03`, `0x06`, `0x0d`, `0x10` |
| 20 | Rally Center → Rally Center | Q059 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x07`, `0x0d` |
| 21 | Quick-Pic Shop Staff → Quick-Pic Shop No.28 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 22 | Quick-Pic Shop Staff → Quick-Pic Shop No.29 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 10 · FLD/213 · SHOP/T09.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Laz → Laz | Q115 | slot 01; 1 page(s) | 0 | — | — | `0x02`, `0x05`, `0x07`, `0x0d` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.84 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.85 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.86 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 11 · FLD/220 · SHOP/T10.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.13 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.14 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.15 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.16 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 12 · FLD/112 · SHOP/T11.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | X → UFO | Q026 | slot 01; 1 page(s) | 2 | — | — | `0x02`, `0x07`, `0x0d` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.52 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.53 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.54 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 13 · FLD/011 · SHOP/T12.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Benji → Benji | Q065 | slot 01; 1 page(s) | 0 | — | `check 40→02` | `0x01`, `0x10` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.48 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.49 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.50 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 04 | Quick-Pic Shop Staff → Quick-Pic Shop No.51 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 14 · FLD/012 · SHOP/T13.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Picarl → Picarl | Q009 | slot 01; 1 page(s) | 0 | — | — | — |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.55 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.56 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.57 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 15 · FLD/022 · SHOP/T14.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.30 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.31 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.32 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.33 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 04 | Quick-Pic Shop Staff → Quick-Pic Shop No.34 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 05 | Quick-Pic Shop Staff → Quick-Pic Shop No.35 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 16 · FLD/110 · SHOP/T15.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.58 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.59 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 17 · FLD/120 · SHOP/T16.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.27 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 18 · FLD/202 · SHOP/T17.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Seidon → Seidon | Q055 | slot 01; 1 page(s) | 2 | — | — | `0x01`, `0x05`, `0x06`, `0x07`, `0x15` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.78 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.79 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 19 · FLD/212 · SHOP/T18.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.80 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 01 | Quick-Pic Shop Staff → Quick-Pic Shop No.81 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 02 | Quick-Pic Shop Staff → Quick-Pic Shop No.82 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
| 03 | Quick-Pic Shop Staff → Quick-Pic Shop No.83 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 20 · FLD/221 · SHOP/T19.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.12 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |

## Area 21 · FLD/232 · SHOP/T20.BIN

| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |
| ---: | --- | ---: | --- | ---: | --- | --- | --- |
| 00 | Quick-Pic Shop Staff → Quick-Pic Shop No.11 | Q052 | slot 01; 1 page(s) | 0 | `0x02 [0x00, 0x51]` | — | `0x01`, `0x02`, `0x05`, `0x11` |
