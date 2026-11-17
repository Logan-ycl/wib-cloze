#!/usr/bin/env python3
"""Block publication unless every snippet has at least three single-word blanks."""
import json
import re
from pathlib import Path

# Preserve exactly these pre-rule published items so existing answer records and
# spaced-repetition IDs remain stable. All newly published items must be one word.
LEGACY_MULTITOKEN_ANSWERS = {
    "2026-11-11-among-other-things": "among other things",
    "2026-11-11-as-much-as": "as much as",
    "2026-11-11-quarter-point": "a quarter-point",
}

def valid_target(item, name):
    answer = item["answer"]
    expression = item["expression"]
    single_word = re.fullmatch(r"[A-Za-z]+", answer) and re.fullmatch(r"[A-Za-z]+", expression)
    if single_word:
        return True
    return (name == "catalog"
            and item.get("date") == "2026-11-11"
            and LEGACY_MULTITOKEN_ANSWERS.get(item["id"]) == answer == expression)

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
        assert valid_target(item, name), (
            f"{name}: {item['id']}: new questions require one English word"
        )
        assert item["cloze"].count("______") == 1, f"{name}: {item['id']}: invalid cloze"
        assert item["cloze"].replace("______", item["answer"]) == item["example"], (
            f"{name}: {item['id']}: cloze/example mismatch"
        )
        alternatives = item.get("accepted")
        assert isinstance(alternatives, list), f"{name}: {item['id']}: missing accepted list"
        assert all(isinstance(alt, str) and re.fullmatch(r"[A-Za-z]+", alt)
                   for alt in alternatives), f"{name}: {item['id']}: invalid alternative"
        normalised = [alt.lower() for alt in alternatives]
        assert len(set(normalised)) == len(normalised), f"{name}: {item['id']}: duplicate alternative"
        assert item["answer"].lower() not in normalised, f"{name}: {item['id']}: original repeated"
        imitation = item.get("imitation", {})
        for field in ("background_zh", "sentence_en", "translation_zh"):
            assert isinstance(imitation.get(field), str) and imitation[field].strip(), (
                f"{name}: {item['id']}: missing imitation.{field}"
            )
        assert "可迁移" not in item.get("analysis_zh", ""), (
            f"{name}: {item['id']}: obsolete inline example label"
        )

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
            assert valid_target(item, name), (
                f"{name}: {pid}: new items require one English word, got {item['answer']!r}"
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
