#!/usr/bin/env python3
"""Block publication unless every snippet has at least three single-word blanks."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / "content/catalog.json").read_text(encoding="utf-8"))
latest = json.loads((root / "content/latest.json").read_text(encoding="utf-8"))
for name, doc in (("catalog", catalog), ("latest", latest)):
    assert doc.get("schema_version", 0) >= 3, f"{name}: outdated schema"
    assert isinstance(doc.get("items"), list), f"{name}: missing items"
    assert isinstance(doc.get("passages"), list) and doc["passages"], f"{name}: missing snippets"

    item_map = {}
    for item in doc["items"]:
        assert item["id"] not in item_map, f"{name}: repeated target ID {item['id']}"
        item_map[item["id"]] = item

    passage_ids = set()
    for passage in doc["passages"]:
        pid = passage["id"]
        assert pid not in passage_ids, f"{name}: repeated snippet ID {pid}"
        passage_ids.add(pid)
        ids = re.findall(r"\{\{([^{}]+)\}\}", passage["body"])
        assert len(ids) >= 3, f"{name}: {pid}: expected at least 3 blanks; got {len(ids)}"
        assert len(set(ids)) == len(ids), f"{name}: {pid}: repeated target"
        assert len(re.findall(r"[.!?](?:\s|$)", passage["body"])) >= 3, f"{name}: {pid}: missing news context"
        for target_id in ids:
            assert target_id in item_map, f"{name}: {pid}: missing {target_id}"
            item = item_map[target_id]
            assert re.fullmatch(r"[A-Za-z]+", item["answer"]), (
                f"{name}: {pid}: expected exactly one English word, got {item['answer']!r}"
            )
            assert all(re.fullmatch(r"[A-Za-z]+", alt) for alt in item.get("accepted", [])), (
                f"{name}: {pid}: non-single-word alternative"
            )
            assert item["date"] == passage["date"], f"{name}: {pid}: mixed issue dates"

catalog_passages = {p["id"]: p for p in catalog["passages"]}
catalog_items = {i["id"]: i for i in catalog["items"]}
for passage in latest["passages"]:
    assert catalog_passages.get(passage["id"]) == passage, "latest and catalog snippet mismatch"
for item in latest["items"]:
    assert catalog_items.get(item["id"]) == item, "latest and catalog target mismatch"
assert latest["passages"] and all(p["date"] == latest["edition"]["date"] for p in latest["passages"])
print(f"Validated {len(latest['passages'])} latest snippets; at least 3 single-word blanks each.")
