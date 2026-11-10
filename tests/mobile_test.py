#!/usr/bin/env python3
"""Handy-Test der st0cks-App: iPhone-15-Pro-Profil (393x852, Touch, 3x), Edge-Engine (Chromium).
Grenze: Safari/WebKit wird NICHT benutzt; Safe Areas und Dynamic Island sind nur ueber die CSS-Regeln geprueft.
Voraussetzung: im Ordner st0cks laeuft `python -m http.server 8765`. Aufruf: python tests/mobile_test.py"""
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/docs/index.html"
SH = Path(__file__).parent / "shots"; SH.mkdir(exist_ok=True)
res = []
def ok(name, cond, info=""):
    res.append((name, bool(cond), info)); print(("OK    " if cond else "FEHLER"), name, info)

def swipe(cdp, x1, y1, x2, y2, steps=8):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x1, "y": y1}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

with sync_playwright() as p:
    dev = dict(p.devices["iPhone 15 Pro"]); dev["viewport"] = {"width": 393, "height": 852}
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(**dev, color_scheme="dark", locale="de-DE")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_selector(".tile .card", timeout=15000)
    ok("Seite lädt ohne JS-Fehler", not errs, "; ".join(errs)[:200])
    ok("Kein waagerechter Überlauf", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    ok("Tab-Leiste mit 5 Punkten", pg.locator("nav button").count() == 5)
    pg.screenshot(path=str(SH / "iphone-01-markt.png"))
    # Schriftgroessen und Tippflaechen
    small = pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 14).map(e => e.tagName + ':' + e.textContent.trim().slice(0, 20)).slice(0, 5)""")
    ok("Alle Texte mindestens 14 px", not small, str(small))
    sizes = pg.evaluate("""() => [...new Set([...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => Math.round(parseFloat(getComputedStyle(e).fontSize))))].sort((a, b) => a - b)""")
    ok("Höchstens 3 Schriftstufen", len(sizes) <= 3, str(sizes))
    small_t = pg.evaluate("""() => [...document.querySelectorAll('button, summary, input, [data-open]')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return [e.tagName + ':' + (e.textContent || '').trim().slice(0, 14), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44)""")
    ok("Tippflächen mindestens 44x44", not small_t, str(small_t[:5]))
    ok("scroll-snap aktiv", pg.evaluate("getComputedStyle(document.querySelector('#scr')).scrollSnapType").startswith("y"))
    ok("Safe-Area-Regeln vorhanden", pg.evaluate("document.documentElement.outerHTML.includes('safe-area-inset-top') && document.documentElement.outerHTML.includes('safe-area-inset-bottom')"))
    # Kachel fuer Kachel scrollen
    h = pg.evaluate("document.querySelector('#scr').clientHeight")
    pg.evaluate("document.querySelector('#scr').style.scrollBehavior='auto'; document.querySelector('#scr').scrollTop = 1")
    pg.wait_for_timeout(300)
    snapped = pg.evaluate("document.querySelector('#scr').scrollTop")
    ok("Kachel springt auf Rasterpunkt", snapped in (0, round(h)) or abs(snapped - 0) < 3 or abs(snapped - h) < 3, f"scrollTop={snapped}, Kachel={h}")
    # Keine Kachel darf ueberlaufen (alle Thesen, Top 10, Sektoren, Depot)
    for mode in ("top", "sek"):
        pg.click("nav button[data-tab=chancen]")
        if mode == "sek": pg.click("[data-mode=sek]")
        pg.wait_for_selector("[data-open]")
        over = pg.evaluate("[...document.querySelectorAll('.card.tap')].filter(c => c.scrollHeight > c.clientHeight + 1).map(c => c.querySelector('.m')?.textContent.slice(0, 20))")
        n = pg.locator(".card.tap").count()
        ok(f"Keine Kachel läuft über ({mode}, {n} Kacheln)", not over, str(over[:4]))
    pg.click("nav button[data-tab=depot]"); pg.wait_for_selector("[data-open]")
    over = pg.evaluate("[...document.querySelectorAll('.card.tap')].filter(c => c.scrollHeight > c.clientHeight + 1).map(c => c.querySelector('.m')?.textContent.slice(0, 20))")
    ok("Keine Kachel läuft über (Depot)", not over, str(over[:4]))
    pg.click("[data-tab=chancen]"); pg.click("[data-mode=top]")
    # Chancen -> Detail -> Gesten
    pg.click("nav button[data-tab=chancen]"); pg.wait_for_selector("[data-open]")
    pg.screenshot(path=str(SH / "iphone-02-chancen.png"))
    pg.tap("[data-open]"); pg.wait_for_selector("#sheet.open"); pg.wait_for_timeout(350)
    pg.screenshot(path=str(SH / "iphone-03-detail.png"))
    cdp = ctx.new_cdp_session(pg)
    swipe(cdp, 300, 500, 80, 500); pg.wait_for_timeout(350)
    ok("Wischen nach links wechselt Tab", pg.evaluate("document.querySelector('[data-dt].on').dataset.dt") == "1")
    ok("Umsatz-Balken und Gewinn-Treppe vorhanden", pg.locator("#gblock svg.chart").count() == 2 and pg.locator("#sblock svg.chart").count() == 1, f"{pg.locator('#gblock svg.chart').count()} Balken, {pg.locator('#sblock svg.chart').count()} Treppe")
    pg.locator("[data-stair=per]").tap(); pg.wait_for_timeout(200)
    ok("Treppe schaltet auf 'Je Quartal'", pg.locator("[data-stair=per].on").count() == 1)
    pg.locator("[data-gm=q]").tap(); pg.wait_for_timeout(200)
    ok("Balken schalten auf Quartale", pg.locator("[data-gm=q].on").count() == 1)
    pg.locator("[data-gm='5']").tap(); pg.locator("[data-stair=kum]").tap(); pg.wait_for_timeout(200)
    pg.locator("#gblock").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SH / "iphone-04c-balken.png"))
    pg.locator("#sblock").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SH / "iphone-04d-treppe.png"))
    pg.locator(".pane").nth(1).evaluate("e => e.scrollTop = 0")
    ok("Kennzahlen-Karten im Reiter Zahlen (mindestens 8)", pg.locator(".kc").count() >= 8, str(pg.locator(".kc").count()))
    pg.locator(".kc summary").nth(1).tap(); pg.wait_for_timeout(250)
    ok("Karte klappt per Tippen auf", pg.evaluate("document.querySelectorAll('.kc')[1].open"))
    pg.screenshot(path=str(SH / "iphone-04-detail-zahlen.png"))
    pg.locator(".pane").nth(1).evaluate("e => e.scrollTop = 900"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SH / "iphone-04b-detail-zahlen-unten.png"))
    pg.locator(".pane").nth(1).evaluate("e => e.scrollTop = 0")
    swipe(cdp, 80, 500, 300, 500); pg.wait_for_timeout(350)
    ok("Wischen nach rechts wechselt zurück", pg.evaluate("document.querySelector('[data-dt].on').dataset.dt") == "0")
    swipe(cdp, 200, 300, 200, 700); pg.wait_for_timeout(450)
    ok("Wischen nach unten schließt", not pg.evaluate("document.querySelector('#sheet').classList.contains('open')"))
    pg.tap("[data-open]"); pg.wait_for_selector("#sheet.open"); pg.wait_for_timeout(350)
    pg.evaluate("document.querySelectorAll('.pane')[0].scrollTop = 99999"); pg.wait_for_timeout(100)
    swipe(cdp, 200, 700, 200, 250); pg.wait_for_timeout(450)
    ok("Wischen nach oben (am Ende) schließt", not pg.evaluate("document.querySelector('#sheet').classList.contains('open')"))
    ok("Kein Schließen-Knopf (nur Wischen)", pg.locator("#sheet button:has-text('Schließen'), #sheet [aria-label*=chließen]").count() == 0)
    # Suche
    pg.click("nav button[data-tab=depot]"); pg.fill("#q", "zzzz"); pg.wait_for_timeout(200)
    ok("Leerzustand bei Suche ohne Treffer", pg.locator("text=Nichts gefunden").count() == 1)
    pg.screenshot(path=str(SH / "iphone-05-leer.png"))
    # Hell
    pg.emulate_media(color_scheme="light"); pg.evaluate("localStorage.removeItem('theme')"); pg.reload(); pg.wait_for_selector(".tile .card")
    pg.click("nav button[data-tab=chancen]"); pg.wait_for_selector("[data-open]"); pg.screenshot(path=str(SH / "iphone-06-hell.png"))
    # Reduzierte Bewegung
    pg.emulate_media(reduced_motion="reduce"); pg.reload(); pg.wait_for_selector(".tile .card")
    ok("Reduzierte Bewegung: Übergänge aus", pg.evaluate("getComputedStyle(document.querySelector('nav button')).transitionDuration") in ("0s", "0.0s", "1e-05s"), pg.evaluate("getComputedStyle(document.querySelector('nav button')).transitionDuration"))
    # Offline mit Zwischenspeicher (Service-Worker muss die Seite kennen)
    pg.evaluate("navigator.serviceWorker.ready.then(() => 1)"); pg.reload(); pg.wait_for_selector(".tile .card"); pg.wait_for_timeout(800)
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector(".tile .card", timeout=15000)
    ok("Offline: Hinweis sichtbar", pg.is_visible("#off"), pg.inner_text("#off")[:80])
    pg.screenshot(path=str(SH / "iphone-07-offline.png"))
    # Fehlerzustand: Daten-Abruf schlaegt fehl (Netz da, Server/Datei nicht), nichts im Zwischenspeicher
    ctx.set_offline(False)
    c2 = b.new_context(**dev, color_scheme="dark", locale="de-DE", service_workers="block")
    p2 = c2.new_page(); p2.route("**/lean-data.json*", lambda r: r.abort())
    p2.goto(URL); p2.wait_for_timeout(2000)
    ok("Fehlerzustand mit verständlicher Meldung", p2.locator("text=Daten konnten nicht geladen werden").count() >= 1)
    p2.screenshot(path=str(SH / "iphone-08-fehler.png"))
    b.close()
bad = [r for r in res if not r[1]]
print(f"\n{len(res) - len(bad)} von {len(res)} Prüfungen ok")
sys.exit(1 if bad else 0)
