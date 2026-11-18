#!/usr/bin/env python3
"""Verify the deployed BriefLab learning data matches committed files, not just HTTP 200."""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

base = sys.argv[1].rstrip("/") + "/"
root = Path(__file__).resolve().parents[1]
expected = {}
for name in ("latest", "catalog"):
    expected[name] = json.loads((root / "content" / f"{name}.json").read_text(encoding="utf-8"))

edition = expected["latest"]["edition"]["date"]
sha = os.environ.get("GITHUB_SHA", "verify")
attempts = 18
for attempt in range(1, attempts + 1):
    errors = []
    for name in ("latest", "catalog"):
        url = urllib.parse.urljoin(base, f"content/{name}.json")
        url += f"?release={urllib.parse.quote(sha)}"
        request = urllib.request.Request(
            url, headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                actual = json.load(response)
            if actual != expected[name]:
                actual_edition = actual.get("edition", {}).get("date", "unknown") if isinstance(actual, dict) else "invalid"
                errors.append(f"{name}: content differs (live edition {actual_edition})")
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            errors.append(f"{name}: request or JSON failed ({exc})")

    if not errors:
        print(
            f"VERIFIED LIVE: edition {edition}, "
            f"{len(expected['latest']['passages'])} passages, "
            f"{len(expected['latest']['items'])} blanks. "
            "Both public JSON files exactly match this commit."
        )
        sys.exit(0)

    print(f"Live verification attempt {attempt}/{attempts}: " + "; ".join(errors), flush=True)
    if attempt < attempts:
        time.sleep(10)

raise SystemExit(
    f"DEPLOYMENT VERIFICATION FAILED: latest/catalog for {edition} are not "
    "both visible at the production website. Do not report publication success."
)
