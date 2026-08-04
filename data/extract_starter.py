#!/usr/bin/env python3
"""Extract the romance catalog from the Chism spreadsheet into data/starter_books.json.

Reads data/raw/Chism_Books.xlsx (the 'Library' sheet), keeps rows whose Genre mentions
"romance", classifies a subgenre, and re-applies any hand-curated tropes/spice from
data/curated_tropes.json so they survive a regeneration.

Run from anywhere:  python3 scripts/extract_starter.py
Requires: pandas, openpyxl  (pip install -r requirements.txt)
"""
import json, os, re
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "Chism_Books.xlsx")
OUT = os.path.join(ROOT, "data", "starter_books.json")
OVERLAY = os.path.join(ROOT, "data", "curated_tropes.json")

norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s).lower())
clean = lambda v: "" if (v is None or str(v).strip().lower() == "nan") else str(v).strip()

overlay = json.load(open(OVERLAY)) if os.path.exists(OVERLAY) else {}
df = pd.read_excel(SRC, sheet_name="Library")

out, seen = [], set()
for _, r in df.iterrows():
    title = clean(r.get("Title"))
    genre = clean(r.get("Genre"))
    if not title or "romance" not in genre.lower():
        continue
    last = clean(r.get("Author, Last"))
    key = (norm(title), norm(last))
    if key in seen:
        continue
    seen.add(key)

    tags = clean(r.get("Tags"))
    comp = clean(r.get("Completed / Standalones")).lower()
    series = clean(r.get("Series"))
    g, t = genre.lower(), tags.lower()
    if "dark" in t or "dark" in g:
        sub = "Dark Romance"
    elif any(k in g for k in ("fantasy", "romantasy", "fae")):
        sub = "Romantasy"
    else:
        sub = "Romance"
    if "standalone" in comp:
        status = "Standalone"
    elif "complete" in comp:
        status = "Complete"
    elif series:
        status = "Series"
    else:
        status = "Standalone"

    ov = overlay.get(title, {})
    out.append({
        "title": title,
        "first": clean(r.get("Author, First")),
        "last": last,
        "series": series,
        "position": "",
        "status": status,
        "genres": [x.strip() for x in re.split(r"[;,/]", genre) if x.strip()],
        "subgenre": sub,
        "tropes": ov.get("tropes", []),
        "spice": ov.get("spice", 0),
        "tags": tags,
        "duplicate": bool(clean(r.get("Duplicate"))),
        # "TC" (a second reader's read-status column) dropped from the source and from this
        # schema together (pre-public audit) — readBy itself has no consumer anywhere downstream
        # (verified: grep for "readBy" outside this file returns nothing), so this is dead output
        # kept only because deleting the field outright is a separate, unrequested change.
        "readBy": {"GC": bool(clean(r.get("GC Read")))},
    })

json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"{len(out)} romance books -> {OUT}")
