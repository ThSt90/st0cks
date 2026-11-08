#!/usr/bin/env python3
"""Baut aus der fertigen Radar-Seite (../index.html, von build.py erzeugt) die st0cks-Web-App:
docs/ (GitHub Pages): index.html, style.css, app.js, loader.js, manifest, Icons
data/blocks/*.json: Datenbloecke fuer Supabase (Tabelle docs, coll='st0cks')
Aufruf: python st0cks_build.py [Pfad zur index.html]"""
import re, sys, json, hashlib
from pathlib import Path
HERE = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "index.html"
SUPA_URL = "https://uuxymefcvplbkdondbpg.supabase.co"
SUPA_KEY = "sb_publishable_tuTu-3tNgOMSb6Z5K2XUzQ_U33tNBZe"
h = SRC.read_text(encoding="utf-8")
DATA = re.compile(r'<script id="(radar-[a-z]+)" type="application/json">(.*?)</script>', re.S)
blocks = {}
for m in DATA.finditer(h):
    blocks[m.group(1)] = m.group(2).strip()
blocks.pop("radar-depot", None)            # Depot bleibt privat und lokal
(HERE / "data" / "blocks").mkdir(parents=True, exist_ok=True)
for k, v in blocks.items():
    json.loads(v)                           # muss gueltig sein
    (HERE / "data" / "blocks" / f"{k}.json").write_text(v, encoding="utf-8")
shell = DATA.sub(lambda m: f'<script id="{m.group(1)}" type="application/json">null</script>' if m.group(1) != "radar-depot" else m.group(0), h)
# Styles
styles = re.findall(r"<style>(.*?)</style>", shell, re.S)
css = "\n".join(styles)
shell = re.sub(r"<style>.*?</style>", "", shell, flags=re.S)
# Skripte (nicht JSON)
JS = re.compile(r"<script>(.*?)</script>", re.S)
js = "\n;\n".join(JS.findall(shell))
shell = JS.sub("", shell)
# Name und Kopf
shell = shell.replace("<title>Aktien-Radar</title>", "<title>st0cks</title>")
shell = shell.replace('name="apple-mobile-web-app-title" content="Radar"', 'name="apple-mobile-web-app-title" content="st0cks"')
shell = shell.replace("<span>Aktien-<em>Radar</em></span>", "<span>st<em>0</em>cks</span>")
head_add = ('<link rel="apple-touch-icon" href="icon.png">\n<link rel="icon" type="image/png" href="favicon.png">\n'
            '<link rel="manifest" href="manifest.webmanifest">\n<link rel="stylesheet" href="style.css?v=%s">\n')
ver = hashlib.sha1((css + js).encode()).hexdigest()[:8]
shell = shell.replace("</head>", (head_add % ver) + "</head>", 1)
splash = ('<div id="st-splash" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
          'flex-direction:column;gap:12px;background:var(--bg);color:var(--muted);font:15px system-ui;z-index:9999">'
          '<img src="icon.png" width="72" height="72" alt="" style="border-radius:16px"><span id="st-msg">Lade st0cks …</span></div>')
shell = shell.replace("</body>", splash + f'\n<script src="config.js"></script>\n<script src="loader.js?v={ver}"></script>\n</body>', 1)
d = HERE / "docs"; d.mkdir(exist_ok=True)
(d / "index.html").write_text(shell, encoding="utf-8")
(d / "style.css").write_text(css, encoding="utf-8")
(d / "app.js").write_text(js, encoding="utf-8")
(d / "config.js").write_text('// Oeffentlicher Schluessel (publishable). Schreiben ist nur serverseitig moeglich.\n'
    f'window.ST0CKS = {{ url: "{SUPA_URL}", key: "{SUPA_KEY}", coll: "st0cks", ver: "{ver}" }};\n', encoding="utf-8")
(d / "loader.js").write_text(r'''(function () {
  "use strict";
  var C = window.ST0CKS, msg = document.getElementById("st-msg"), splash = document.getElementById("st-splash");
  function fail(t) {
    msg.innerHTML = t + '<br><button id="st-retry" style="margin-top:10px;padding:8px 16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--text)">Nochmal laden</button>';
    document.getElementById("st-retry").onclick = function () { location.reload(); };
  }
  function run() {
    var s = document.createElement("script");
    s.src = "app.js?v=" + C.ver;
    s.onload = function () { if (splash) splash.remove(); };
    s.onerror = function () { fail("App-Skript nicht geladen."); };
    document.body.appendChild(s);
  }
  fetch(C.url + "/rest/v1/docs?coll=eq." + C.coll + "&select=path,data", { headers: { apikey: C.key, Authorization: "Bearer " + C.key } })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (rows) {
      if (!rows.length) throw new Error("keine Daten");
      rows.forEach(function (r) {
        var el = document.getElementById(r.path.split("/").pop());
        if (el) el.textContent = JSON.stringify(r.data).replace(/<\//g, "<\\/");
      });
      run();
    })
    .catch(function (e) { fail("Daten konnten nicht geladen werden (" + e.message + ")."); });
})();
''', encoding="utf-8")
(d / "manifest.webmanifest").write_text(json.dumps({
    "name": "st0cks", "short_name": "st0cks", "start_url": ".", "scope": ".", "display": "standalone",
    "background_color": "#111112", "theme_color": "#3d8a8e",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
              {"src": "icon.png", "sizes": "180x180", "type": "image/png"}]}, indent=1), encoding="utf-8")
print("docs/ gebaut:", {p.name: p.stat().st_size for p in d.iterdir() if p.suffix in (".html", ".css", ".js")}, "Bloecke:", {k: len(v) for k, v in blocks.items()})
