# RTA fixed-interior quest-inventory census — 2026-09-01

## Scope and method

The one-pass 235/235 PAL fixed-interior dependency census now preserves every
distinct pre-text control shape, not only opcode numbers. Filtering exact
`0x03 [15,item,target]` checks and `0x11 [15,item]` clears identifies 15 fixed
interactions that depend on namespace-15 item bits.

The item names below come from the same entities' original English dialogue
and, where available, the action-`0x07 [15,item]` grant on the producing
interaction. “Unresolved name” is retained where the translated stream does
not name the object.

## Recovered item dependencies

| Item | Original evidence | Checking/consuming interiors | Confidence |
| ---: | --- | --- | --- |
| 19 | Luke grants and later checks this item, but speaks only untranslated/fictional “Unbabo” syllables. | Cloud Hill Luke | bit role proven; item name unresolved |
| 23 | Tim's missing wallet | Peach Policeman | exact text + check/clear |
| 24 | Peach FM voucher, granted by Policeman after the wallet chain | Peach FM front desk | exact text + grant/check/clear |
| 25 | cards, granted by Fight after item 31 | Sandpolis Barton | exact text + grant/check/clear |
| 27 | “God's Rod” | Fuji Uzumasa | exact text + check/clear |
| 31 | inspiring magazine | Peach Fight | exact text + check/clear |
| 32–38 | Jones's seven coloured gemstones | Peach Adventure Jones | exact quest text + repeated checks/clears |
| 39 | football, granted by Sandpolis Shop Manager | Sandpolis Mr. King | exact text + grant/check/clear |
| 40 | fountain pen lost near the ruins | Cloud City Benji | exact text + check; later outcome still needs tracing |
| 41 | flower seed, granted by Emily after item 42 | Papaya Island Flower | exact text + grant/check/clear |
| 42 | pink flower sought by Emily | White Mountain Emily | exact text + check/clear |
| 43 | fluffy mushroom | Cloud Hill Shirley | exact text + check/clear |
| 46 | birthday gift from Jousset's favourite uncle; granted by Lettar | White Mountain Lettar → Peach Jousset | linked grant/check/clear; generic gift name |

Store Manager's item-39 bit is a producer-side possession/progression check and
does not clear the football. Lettar similarly checks item 46 after granting it.
These producer-side checks are why an item may appear in more than one room.

## Proven quest chains

| Input/found item | First recipient | Granted item | Second recipient |
| --- | --- | --- | --- |
| inspiring magazine 31 | Fight | cards 25 | Barton |
| football 39 (shop grant) | — | football 39 | Mr. King |
| pink flower 42 | Emily | flower seed 41 | Flower |
| Lettar quest completion | Lettar | birthday gift 46 | Jousset |
| Tim's wallet 23 | Policeman | voucher 24 | Peach FM |

## Tooling result

`SandboxShopInteriorDialogueInfo` and the complete census now contain
`controlShapes`, preserving opcode plus operands for every distinct control in
an entity. `shop_readiness.py` adds a compact “Inventory checks/clears” column
to the Markdown census. The generated JSON remains the authoritative complete
machine-readable map.

This census identifies dependencies; it does not connect normal browser play
to the original save inventory yet, nor does it invent missing item acquisition
events. Zero-mode action `0x05` was subsequently proven as the native 0–99
selector with zero return targets and no save mutation.
