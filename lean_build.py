#!/usr/bin/env python3
"""Erzeugt docs/lean-data.json fuer die neue st0cks-Oberflaeche aus ../data (history, lage, prices, lauf_status).
Nichts wird erfunden: Fehlendes bleibt None und die App zeigt "keine Daten". Depotdaten (Stueckzahlen, Betraege)
werden nie gelesen, nur das Merkmal depot der These. Aufruf: python lean_build.py"""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
D = ROOT / "data"
from datetime import date, datetime, timezone
TODAY = date.today().isoformat()
FX = {"EUR": 1, "USD": 1/1.122, "GBP": 1.33/1.122, "GBX": 1.33/1.122/100, "JPY": 1/158.2/1.122, "TWD": 1/36.28,
      "KRW": 1/1494.7, "CHF": 1.15/1.122, "SEK": 1/10/1.122, "DKK": 1/7.46, "HKD": 1/7.8/1.122, "CAD": 1/1.38/1.122}

h = json.load(open(D/"history.json", encoding="utf-8"))
lage = json.load(open(D/"lage.json", encoding="utf-8"))
prices = json.load(open(D/"prices.json", encoding="utf-8"))["series"]
try:
    status = json.load(open(D/"lauf_status.json", encoding="utf-8"))
except Exception:
    status = None

GICS_DE = {"Information Technology": "Technologie", "Industrials": "Industrie", "Health Care": "Gesundheit", "Energy": "Energie",
           "Real Estate": "Immobilien", "Communication Services": "Kommunikation", "Consumer Discretionary": "Zyklischer Konsum",
           "Consumer Staples": "Basiskonsum", "Financials": "Finanzen", "Materials": "Rohstoffe", "Utilities": "Versorger"}
try:
    ZUORD = json.load(open(D/"sektoren_zuordnung.json", encoding="utf-8"))
except Exception:
    ZUORD = {}

def last_score(t):
    sl = t.get("score_log") or []
    return sl[-1]["score"] if sl else None

def verdict(t, sc):
    if sc is None: return "unbekannt"
    st = t.get("status")
    if sc < 70 or st == "verletzt": return "widerlegt"
    if sc < 80 or st == "beobachten": return "wackelt"
    return "gilt"

def eur(v, cur):
    f = FX.get(cur)
    return None if v is None or f is None else v * f

def first_sentence(s, n=200):
    s = (s or "").strip()
    m = re.match(r"(.{20,%d}?)(;|\.(\s|$))" % n, s)
    return m.group(1).rstrip(",") + "." if m else s

def zone(dd):
    """Einstiegszone: 20 bis 70 % unter dem Hoch. Ab 40 % nur mit geprueften Ursache (siehe Faktor Kursrutsch-Pruefung)."""
    if dd is None: return None
    a = -dd
    if a < 20: return "nah am Hoch"
    if a <= 40: return "Einstiegszone"
    if a <= 70: return "Einstiegszone, Ursache prüfen"
    return "über 70 % unter dem Hoch"

def thesis_view(t):
    cur = t.get("currency", "EUR")
    sc = last_score(t)
    px = (t.get("last") or {}).get("price")
    hi = (t.get("entry") or {}).get("high_52w")
    dd = round((px / hi - 1) * 100, 1) if px and hi else None
    pot = t.get("potential") or {}
    potp = round((pot["mean"] / px - 1) * 100) if pot.get("mean") and px else None
    est = t.get("est") or {}
    rev3 = None
    if est.get("rev") and len(est["rev"]) >= 6:
        r = est["rev"][3:6]; ye = est.get("years", [])[3:6]
        rev3 = [{"y": y, "v": round(eur(v, re.sub(r".*?([A-Z]{3})\s*$", r"\1", est.get("unit", "Mio. EUR"))) / 1000, 1) if v is not None and eur(v, re.sub(r".*?([A-Z]{3})\s*$", r"\1", est.get("unit", "Mio. EUR"))) is not None else None,
                 "est": i == 2} for i, (y, v) in enumerate(zip(ye, r))]
    pts = (prices.get(t["id"]) or {}).get("pts") or []
    spark = [p[1] for p in pts[-52:]]
    parts = [{"n": p["name"], "max": p["max"], "p": p["points"]} for p in (t.get("score") or {}).get("parts", [])]
    drops = (t.get("drops") or [])[:1]
    log = [{"d": l["date"], "t": l.get("type"), "x": first_sentence(l.get("text", ""), 180)} for l in (t.get("log") or [])[-4:]]
    return {
        "id": t["id"], "name": t["name"], "ticker": t["ticker"], "sector": t.get("gics") or t.get("sector"),
        "gics": GICS_DE.get(t.get("gics") or ZUORD.get(t["id"]), None), "cur": cur, "verdict": verdict(t, sc), "score": sc, "depot": bool(t.get("depot")),
        "reason": first_sentence(t.get("headline")), "about": t.get("about"),
        "px_eur": None if eur(px, cur) is None else round(eur(px, cur), 2), "px_date": (t.get("last") or {}).get("date"),
        "dd": dd, "zone": zone(dd), "pot_pct": potp, "pot_asof": pot.get("as_of"), "pot_n": pot.get("analysts"),
        "pot_lo": None if not pot.get("low") or not px else round((pot["low"]/px-1)*100),
        "pot_hi": None if not pot.get("high") or not px else round((pot["high"]/px-1)*100),
        "rev3": rev3, "spark": spark,
        "why": (t.get("why") or [])[:3], "counter": t.get("counter"), "stop": t.get("stop"),
        "pillars": [{"n": p["name"], "c": p.get("current"), "l": p.get("light"), "tr": p.get("trend")} for p in (t.get("pillars") or [])],
        "parts": parts, "drop": drops[0] if drops else None, "log": log,
        "catalyst": t.get("catalyst"),
    }

th = [t for t in h["theses"] if t.get("status") != "geschlossen"]
views = [thesis_view(t) for t in th]
views.sort(key=lambda v: -(v["score"] or 0))
depot = [v for v in views if v["depot"]]
KI = re.compile(r"Halbleiter|KI|Chip|Speicher|Rechenzentr", re.I)
def key(v): return v.get("gics") or "Ohne Sektor"
def diversify(cands, n=10, per_sector=3, max_ki_share=0.4):
    """Top 10 streuen: je Sektor hoechstens per_sector, Chips/KI hoechstens 40 % (Klumpenregel)."""
    out, cnt, ki = [], {}, 0
    for v in cands:
        if (v["score"] or 0) < 80: continue
        k = key(v); is_ki = bool(KI.search(v["sector"] or ""))
        if cnt.get(k, 0) >= per_sector or (is_ki and ki >= int(n * max_ki_share)): continue
        out.append(v); cnt[k] = cnt.get(k, 0) + 1; ki += is_ki
        if len(out) == n: break
    return out
chancen = diversify([v for v in views if not v["depot"]])
n_ge80 = len([v for v in views if not v["depot"] and (v["score"] or 0) >= 80])
chancen_note = None if len(chancen) >= min(10, n_ge80) else f"{len(chancen)} statt {min(10, n_ge80)}: Weitere Kandidaten würden die Streuregel verletzen (höchstens 3 je Sektor, Chips/KI höchstens 40 %)."
by_sector = {}
for v in views:
    by_sector.setdefault(v.get("gics") or "Ohne Sektor", []).append(v)
sectors = {k: [x["id"] for x in vs[:5]] for k, vs in by_sector.items()}

hist = []
for t in h["theses"]:
    for l in t.get("log") or []:
        if l.get("type") in ("neu", "verletzt", "geschlossen"):
            hist.append({"d": l["date"], "t": l["type"], "n": t["name"], "x": first_sentence(l.get("text", ""), 180)})
hist.sort(key=lambda x: x["d"], reverse=True)

run = h["runs"][-1]
# Zeitstempel in UTC mit Z (lage.json speichert UTC); die App rechnet auf Berliner Zeit um
data = {
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "today": TODAY, "lage": {"asof": lage["asof"], "fetched": lage["fetched"] + ("" if lage["fetched"].endswith("Z") else ":00Z"), "rows": lage["rows"]},
    "depot": depot, "chancen": chancen, "chancen_note": chancen_note, "all": {v["id"]: v for v in views}, "sectors": sectors,
    "hist": hist[:14], "run": {"id": run.get("id") or run.get("date"), "summary": first_sentence(run.get("summary"), 160), "type": run.get("type")},
    "status": status,
}
out = HERE / "docs" / "lean-data.json"
out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("ok", len(depot), "Depot,", len(chancen), "Chancen,", len(views), "Thesen,", out.stat().st_size // 1024, "KB")
