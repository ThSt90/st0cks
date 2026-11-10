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
FX = {"AUD": 0.66/1.122, "NZD": 0.58/1.122, "NOK": 1/10.5/1.122, "INR": 1/88/1.122, "ILS": 1/3.6/1.122, "SGD": 1/1.3/1.122, "PLN": 1/4.25, "ZAR": 1/18/1.122, "BRL": 1/5.4/1.122, "MXN": 1/18/1.122, "P": 1.33/1.122/100, "GBp": 1.33/1.122/100, "EUR": 1, "USD": 1/1.122, "GBP": 1.33/1.122, "GBX": 1.33/1.122/100, "JPY": 1/158.2/1.122, "TWD": 1/36.28,
      "KRW": 1/1494.7, "CHF": 1.15/1.122, "SEK": 1/10/1.122, "DKK": 1/7.46, "HKD": 1/7.8/1.122, "CAD": 1/1.38/1.122}

h = json.load(open(D/"history.json", encoding="utf-8"))
lage = json.load(open(D/"lage.json", encoding="utf-8"))
prices = json.load(open(D/"prices.json", encoding="utf-8"))["series"]
try:
    PLAIN = json.load(open(D/"plain.json", encoding="utf-8"))
except Exception:
    PLAIN = {}
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



def eur_range(txt, price=None, cur=None):
    """Szenario-Preis in Euro. '215,88 USD (-39,2 %)' -> '≈ 192 € (-35 % zum heutigen Kurs)': das Prozent im Text galt fuer den
    Kurs von damals und wird neu gegen den aktuellen Kurs gerechnet. Nicht lesbare Formate bleiben im Original (mit Hinweis)."""
    if not txt: return None
    def num(x):
        x = x.strip()
        if "." in x and "," in x: x = x.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"\d{1,3}(\.\d{3})+", x): x = x.replace(".", "")
        else: x = x.replace(",", ".")
        try: return float(x)
        except ValueError: return None
    fmt = lambda v: f"{v:,.0f}".replace(",", ".")
    sign = lambda v: ("+" if v > 0 else "−" if v < 0 else "") + f"{abs(v):.0f}".replace(".", ",")
    m = re.match(r"^\s*(?:rund|ca\.?|etwa|≈)?\s*([\d.,]+)\s*(?:bis|–|-)\s*([\d.,]+)\s*([A-Za-z]{3})", str(txt))
    if m:
        a1, b1, c1 = num(m.group(1)), num(m.group(2)), m.group(3).upper(); f = FX.get(c1)
        if a1 is not None and b1 is not None and f is not None:
            return ("" if c1 == "EUR" else "≈ ") + fmt(a1 * f) + " bis " + fmt(b1 * f) + " €"
    m = re.match(r"^\s*(?:rund|ca\.?|etwa|≈)?\s*([\d.,]+)\s*([A-Za-z]{3,4}|€|\$|£|¥)", str(txt))
    if m:
        v1, c1 = num(m.group(1)), {"€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "YEN": "JPY", "P": "GBX", "GBP": "GBP"}.get(m.group(2).upper(), m.group(2).upper()); f = FX.get(c1)
        if v1 is not None and f is not None:
            out = ("" if c1 == "EUR" else "≈ ") + fmt(v1 * f) + " €"
            if price and cur and c1 == str(cur).upper():
                out += " (" + sign((v1 / price - 1) * 100) + " % zum heutigen Kurs)"
            return out
    return str(txt) + " (Originalwährung)"

def info(t):
    """Texte fuer den Kopf der Detailseite: Was macht die Firma, Geschaeftsmodell, Kurs-Erklaerung, Chancen/Risiken (SWOT)."""
    pl = PLAIN.get(t["id"]) or {}
    deep = t.get("deep") or {}
    gm = next((x.get("text") for x in deep.get("sections", []) if str(x.get("title", "")).startswith("Gesch")), None)
    opt = next((x for x in deep.get("scenarios", []) if re.search("optimist", str(x.get("name", "")), re.I)), None)
    chancen = [first_sentence(x, 200) for x in (t.get("why") or [])[:2]]
    if opt:
        chancen.append("Optimistisch: " + str(opt.get("price", "")) + (" – " + first_sentence(opt.get("assumption", ""), 160) if opt.get("assumption") else ""))
    risiken = ([first_sentence(t["counter"], 220)] if t.get("counter") else []) + (["Widerlegt, wenn: " + first_sentence(t["stop"], 200)] if t.get("stop") else [])
    if gm:
        gm = gm.replace(" (Gegenargument der These)", "").replace("habe ich im Lauf nicht belegt", "sind nicht belegt")
    was = pl.get("was") or t.get("about")
    scen = [{"n": x.get("name"), "a": first_sentence(x.get("assumption", ""), 170), "p": eur_range(x.get("price"), (t.get("last") or {}).get("price"), t.get("currency"))} for x in deep.get("scenarios", [])[:3]]
    _pot = t.get("potential") or {}; _px = (t.get("last") or {}).get("price")
    if _pot.get("high") and _px:
        _hi = (_pot["high"] / _px - 1) * 100
        for sc_ in scen:
            m_ = re.search(r"\+(\d+)\s*%", str(sc_.get("p") or ""))
            if m_ and int(m_.group(1)) > _hi + 5:
                sc_["p"] += " · über dem höchsten Analystenziel (+%d %%)" % round(_hi)
    return {"scen": scen, "scen_note": deep.get("scenario_note"), "was": was, "was1": first_sentence(was, 150) if was else None, "gm": gm, "kurs": pl.get("kurs"), "chancen": chancen, "risiken": risiken}

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
    fund = {}
    try:
        if est.get("fpe"): fund["fpe"] = round(est["fpe"], 1)
        if est.get("op") and est.get("rev") and est["rev"][5] and est["op"][5] is not None: fund["om"] = round(est["op"][5] / est["rev"][5] * 100, 1)
        if est.get("rev") and est["rev"][5] and est["rev"][4]: fund["g"] = round((est["rev"][5] / est["rev"][4] - 1) * 100, 1)
        if est.get("fcf_cur") is not None and est.get("rev") and est["rev"][5]: fund["fcf"] = round(est["fcf_cur"] / est["rev"][5] * 100, 1)
        fund["asof"] = est.get("as_of")
    except Exception: pass
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
        "rev3": rev3, "spark": spark, "fund": fund,
        "why": (t.get("why") or [])[:3], "counter": t.get("counter"), "stop": t.get("stop"),
        "pillars": [{"n": p["name"], "c": p.get("current"), "l": p.get("light"), "tr": p.get("trend")} for p in (t.get("pillars") or [])],
        "parts": parts, "drop": drops[0] if drops else None, "log": log,
        "catalyst": t.get("catalyst"),
        "entry_price": (t.get("entry") or {}).get("price"), "entry_date": (t.get("entry") or {}).get("date"),
        "slog": [{"r": x.get("run") or x.get("date"), "s": x.get("score")} for x in (t.get("score_log") or [])[-3:]],
    }

th = [t for t in h["theses"] if t.get("status") != "geschlossen"]
views = [thesis_view(t) for t in th]
tmap = {t["id"]: t for t in th}
views.sort(key=lambda v: -(v["score"] or 0))
# Eingaben fuer die Kennzahlen-Karten (docs/kpi.js); nur im Detail (all), nicht doppelt in den Listen
def _px(t):
    s_ = prices.get(t["id"]) or {}
    pts = s_.get("pts") or []
    return {"px": [p[1] for p in pts], "px0": pts[0][0] if pts else None, "px1": pts[-1][0] if pts else None, "pcur": s_.get("cur")}
kin = {t["id"]: dict({k: t.get(k) for k in ("growth", "est", "earnings", "kpi_notes", "potential", "last", "currency")}, **_px(t)) for t in th}
try:
    LOGOS = {k: v for k, v in json.load(open(D/"logos.json", encoding="utf-8")).items() if k in {t["id"] for t in th}}
except Exception:
    LOGOS = {}
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
    "logos": LOGOS, "depot": depot, "chancen": chancen, "chancen_note": chancen_note, "all": {v["id"]: dict(v, k=kin[v["id"]], info=info(tmap[v["id"]])) for v in views}, "sectors": sectors,
    "hist": hist[:14], "run": {"id": run.get("id") or run.get("date"), "summary": first_sentence(run.get("summary"), 160), "type": run.get("type")},
    "status": status,
}
out = HERE / "docs" / "lean-data.json"
out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("ok", len(depot), "Depot,", len(chancen), "Chancen,", len(views), "Thesen,", out.stat().st_size // 1024, "KB")
