"""Turns a Claude Docs export of the novel (the connector's `read` reply, JSON with data.xml)
into public/bok/bok.json. Usage: python3 scripts/bok-fran-doc.py <export.txt>
"""
import html
import json
import re
import sys

raw = open(sys.argv[1], encoding="utf-8").read()
doc, _ = json.JSONDecoder().raw_decode(raw)
x = doc["data"]["xml"]
x = re.sub(r"<paragraph[^>]*heading='(\d)'[^>]*>", lambda m: "\n" + "#" * int(m.group(1)) + " ", x)
x = re.sub(r"</paragraph>|<paragraph[^>]*>", "\n", x)
x = re.sub(r"<[^>]+>", "", x)
lines = [l.strip() for l in html.unescape(x).split("\n")]
lines = [l for l in lines if l and l not in ("-", "·")]


def section(start):
    out = []
    for l in lines[lines.index(start) + 1:]:
        if l.startswith("#"):
            break
        out.append(l)
    return out


def split(s):
    a, b = s.split(" – ", 1)
    return a.strip(), b.strip()


about = section("## Om romanen")
hp, kp = about.index("Huvudpersoner"), about.index("Kapitelplan")
personer = [dict(zip(("namn", "om"), split(l))) for l in about[hp + 1:kp]]
plan = [dict(zip(("titel", "om"), split(l))) for l in about[kp + 1:]]

kapitel = []
for l in lines:
    m = re.match(r"## Kapitel (\d+): (.+)", l)
    if not m:
        continue
    body = section(l)
    kapitel.append({
        "nummer": int(m.group(1)),
        "titel": m.group(2),
        "plats": body[0],
        "stycken": [p for p in body[1:] if not p.startswith("Slut på kapitel")],
    })

bok = {
    "titel": lines[0].lstrip("# "),
    "undertitel": "En Warhammer 40 000-roman",
    "forfattare": "Sebastian",
    "sammanfattning": about[0],
    "personer": personer,
    "kapitelplan": plan,
    "kapitel": kapitel,
}
with open("public/bok/bok.json", "w", encoding="utf-8") as f:
    json.dump(bok, f, ensure_ascii=False, indent=1)
print(f"{len(personer)} personer, {len(kapitel)} kapitel:", [len(k["stycken"]) for k in kapitel])
