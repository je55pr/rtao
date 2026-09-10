#!/usr/bin/env python3
"""Summarise activity-linked fixed-interior gates from retained PAL-derived census evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def action_operands(entry: dict, opcode: int) -> list[list[int]]:
    return [
        action.get("operands", [])
        for action in entry.get("actionShapes", [])
        if action.get("opcode") == opcode
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("activity_census", type=Path)
    parser.add_argument("shop_census", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()

    activity_bytes = args.activity_census.read_bytes()
    shop_bytes = args.shop_census.read_bytes()
    activity_census = json.loads(activity_bytes)
    shop_census = json.loads(shop_bytes)
    matches = []
    unmatched = []
    for activity in activity_census["activities"]:
        aid = activity["activityId"]
        name = activity["name"]
        linked = []
        for entry in shop_census:
            text = json.dumps(entry, ensure_ascii=False).lower()
            if name.lower() not in text:
                continue
            linked.append({
                "areaIndex": entry.get("areaIndex"),
                "fieldNumber": entry.get("fieldNumber"),
                "slotIndex": entry.get("slotIndex"),
                "entityName": entry.get("entityName"),
                "packagePath": entry.get("packagePath"),
                "hostAction03Parameters": sorted({value for group in action_operands(entry, 3) for value in group if value}),
                "grantStampIds": sorted({value for group in action_operands(entry, 13) for value in group if value}),
            })
        if linked:
            matches.append({"activityId": aid, "name": name, "owners": linked})
        else:
            unmatched.append({"activityId": aid, "name": name})

    out = {
        "scope": "PAL-derived fixed SHOP dialogue links for activity IDs 24..38; no game payload",
        "activityCensusSha256": hashlib.sha256(activity_bytes).hexdigest(),
        "shopCensusSha256": hashlib.sha256(shop_bytes).hexdigest(),
        "semantics": {
            "action03": "host-action parameter; do not equate with activity ID without a traced consumer",
            "action0D": "GrantStamps: each nonzero operand is appended by PAL helper 0x0023E408",
        },
        "matches": matches,
        "unmatched": unmatched,
    }
    text = json.dumps(out, indent=2, ensure_ascii=False)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
