#!/usr/bin/env python3
"""Extract your personal library from the 'have read' spreadsheet into data/personal_seed.json.

Reads data/raw/Personal_Library-_have_read.xlsx (the 'owned book data' and 'borrowed book
data' sheets — the real data lives there, not in the template's display sheets), then enriches
each title with series name / tropes / spice / subgenre from data/starter_books.json by matching
on (title + surname), falling back to title-only (this is what rescues e.g. "A Court of Thorns
and Roses", which the sheet spells with the author surname "Mass" rather than "Maas").

NOTE: The source .xlsx is your personal data and is not committed to this repo. Drop your copy at
data/raw/Personal_Library-_have_read.xlsx to re-run; otherwise data/personal_seed.json (the output
of this script) is already included.

Run:  python3 scripts/extract_personal.py
Requires: pandas, openpyxl
"""
import json, os, re
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "Personal_Library-_have_read.xlsx")
STARTER = os.path.join(ROOT, "data", "starter_books.json")
OUT = os.path.join(ROOT, "data", "personal_seed.json")

norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s).lower())


def grab(sheet, borrowed):
    df = pd.read_excel(SRC, sheet_name=sheet, header=None)
    rows = []
    for i in range(1, len(df)):  # row 0 is the header band
        t = df.iloc[i, 1]
        if pd.isna(t) or not str(t).strip():
            continue
        g = lambda c: ("" if pd.isna(df.iloc[i, c]) else str(df.iloc[i, c]).strip())
        rows.append({
            "title": str(t).strip(), "cover": g(2), "fave": g(3) in ("True", "TRUE"),
            "author": g(4), "last": g(5), "genre": g(6), "format": g(7), "rating": g(8),
            "status": g(11), "booknum": g(12), "source": "Borrowed" if borrowed else "Owned",
        })
    return rows


recs = grab("owned book data", False) + grab("borrowed book data", True)

starter = json.load(open(STARTER))
by_key, by_title = {}, {}
for s in starter:
    by_key[(norm(s["title"]), norm(s["last"]))] = s
    by_title.setdefault(norm(s["title"]), s)

seen, books = set(), []
for r in recs:
    key = (norm(r["title"]), norm(r["last"]))
    if key in seen:
        continue
    seen.add(key)
    st = by_key.get(key) or by_title.get(norm(r["title"]))

    try:
        rating = float(r["rating"]) if r["rating"] not in ("", "nan") else 0
    except ValueError:
        rating = 0
    try:
        pos = str(int(float(r["booknum"]))) if r["booknum"] not in ("", "nan") else ""
    except ValueError:
        pos = ""

    genre = r["genre"] or "Romance"
    sub = st["subgenre"] if st else (
        "Dark Romance" if "dark" in genre.lower()
        else "Romantasy" if "romantasy" in genre.lower() else "Romance")
    series = st["series"] if st else ""
    status = st["status"].title() if st else ("Series" if (series or (pos and pos != "1")) else "Standalone")

    books.append({
        "title": r["title"],
        "first": r["author"].rsplit(" ", 1)[0] if (r["author"] and " " in r["author"]) else r["author"],
        "last": r["last"] or (r["author"].rsplit(" ", 1)[-1] if r["author"] else ""),
        "series": series, "position": pos, "seriesCount": None, "status": status,
        "subgenre": sub, "genres": [genre],
        "tropes": st["tropes"] if st else [], "spice": st["spice"] if st else 0,
        "cover": r["cover"] if r["cover"].startswith("http") else "", "isbn": "",
        "fave": r["fave"], "format": r["format"] or "Paperback", "rating": rating,
        "readStatus": r["status"] or "Read", "source": r["source"],
    })

json.dump(books, open(OUT, "w"), ensure_ascii=False)
print(f"{len(books)} unique books -> {OUT}")
