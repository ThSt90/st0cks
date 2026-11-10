/* st0cks Kennzahlen (aus der alten Oberfläche übernommen, 10.11.2026: gleiche Schwellen und Erklärsätze).
   window.KPI.data(t) liefert bis zu 10 Karten {id,title,val,sub,rt(top|good|mid|low),dir,sp,text,pro,con,h,hl,note}.
   t braucht: growth, est, kpi_notes, potential, last, currency. Schwellen: siehe Methodik in docs/classic/index.html. */
(function () {
  "use strict";
  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function upside(t) {
    var m = t.potential && num(t.potential.mean), p = t.last && num(t.last.price);
    return m != null && p ? (m / p - 1) * 100 : null;
  }
  function gOf(cur, prev) { return cur != null && prev != null && prev > 0 ? (cur / prev - 1) * 100 : null; }
  function sumN(a, i, n) { var s = 0, k; for (k = 0; k < n; k++) { if (num(a[i + k]) == null) return null; s += a[i + k]; } return s; }
  function gSigned(g) { return g == null ? "–" : (Math.abs(g) >= 1000 ? (g > 0 ? "> +999" : "< −999") : (g > 0 ? "+" : g < 0 ? "−" : "") + nf0.format(Math.abs(g))) + "\u00a0%"; }
  function dirOf(d) { return d == null ? "na" : d >= 5 ? "up2" : d >= 1.5 ? "up" : d <= -5 ? "down2" : d <= -1.5 ? "down" : "flat"; }
  var ARROW = { up2: "▲▲", up: "▲", flat: "►", down: "▼", down2: "▼▼", na: "–" };
  var DIRTXT = { up2: "beschleunigt stark", up: "beschleunigt", flat: "gleichbleibend", down: "verlangsamt", down2: "verlangsamt stark", na: "nicht berechenbar" };
  // Eine Kennzahl: Wachstum je Periode gegen Vorjahr, Zwölf-Monats-Wert, Beschleunigung
  function metric(vals, per) {
    if (!Array.isArray(vals)) return null;
    var yoy = [], i;
    for (i = 0; i + per < vals.length; i++) yoy.push(gOf(vals[i], vals[i + per]));
    var q = yoy.length ? yoy[0] : null;
    var cur = vals.length >= 2 * per ? sumN(vals, 0, per) : null, prv = vals.length >= 2 * per ? sumN(vals, per, per) : null;
    var ttm = gOf(cur, prv);
    var d = q != null && ttm != null ? q - ttm : null;
    return { yoy: yoy, q: q, ttm: ttm, d: d, dir: dirOf(d) };
  }
  function growthMetrics(t) {
    var g = t.growth;
    if (!g || !g.periods) return null;
    var per = num(g.per_year) || 4;
    return { per: per, rev: metric(g.periods.revenue, per), ni: metric(g.periods.net_income, per) };
  }
  var FX = { EUR: 1, USD: 1 / 1.122, GBP: 1.33 / 1.122, GBX: 1.33 / 1.122 / 100, JPY: 1 / 158.2 / 1.122, TWD: 1 / 36.28, KRW: 1 / 1494.7,
    CAD: 1 / 1.38 / 1.122, AUD: 0.66 / 1.122, NZD: 0.58 / 1.122, CHF: 1.15 / 1.122, SEK: 1 / 10 / 1.122, NOK: 1 / 10.5 / 1.122, DKK: 1 / 7.46, INR: 1 / 88 / 1.122, ILS: 1 / 3.6 / 1.122, HKD: 1 / 7.8 / 1.122, SGD: 1 / 1.3 / 1.122, PLN: 1 / 4.25, ZAR: 1 / 18 / 1.122, BRL: 1 / 5.4 / 1.122, MXN: 1 / 18 / 1.122 };
  function curOf(unit) { var m = /([A-Z]{3})\s*$/.exec(unit || ""); return m ? m[1] : null; }
  function toEur(v, cur) { var n = num(v), f = FX[cur]; return n == null || f == null ? null : n * f; }
  function eurShort(e, signed) {
    if (e == null) return "";
    var a = Math.abs(e), s = e < 0 ? "−" : (signed ? "+" : "");
    var x = a >= 1e10 ? nf0.format(a / 1e9) + " Mrd. €" : a >= 1e9 ? nf1.format(a / 1e9) + " Mrd. €" : a >= 1e7 ? nf0.format(a / 1e6) + " Mio. €" : a >= 1e6 ? nf1.format(a / 1e6) + " Mio. €" : a >= 100 ? nf0.format(a) + " €" : nf2.format(a) + " €";
    return s + x;
  }
  /* Betrag in Euro mit „≈", wenn umgerechnet wurde. v in Einheiten der Währung cur. */
  function eu(v, cur, signed) { var e = toEur(v, cur); return e == null ? "" : (cur === "EUR" ? "" : "≈ ") + eurShort(e, signed); }
  function euM(v, unit, signed) { return num(v) == null ? "" : eu(v * 1e6, curOf(unit), signed); }
  function pctPlain(v) { return v == null ? "–" : nf1.format(v) + " %"; }
  /* ---------- Kennzahlen mit Einordnung ---------- */
  var RT = { top: "sehr gut", good: "gut", mid: "mittel", low: "schwach", info: "Einordnung" };
  var LVL = ["low", "mid", "good", "top"];
  function rate(v, th) { return v == null ? null : v >= th[0] ? "top" : v >= th[1] ? "good" : v >= th[2] ? "mid" : "low"; }
  function rateLow(v, th) { return v == null ? null : v <= th[0] ? "top" : v <= th[1] ? "good" : v <= th[2] ? "mid" : "low"; }
  function shift(rt, d) { var i = LVL.indexOf(rt) + d; return LVL[Math.max(0, Math.min(3, i))]; }
  function sgn(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + nf1.format(Math.abs(v)) + " %"; }
  function tempoText(q, ttm) {
    if (q == null || ttm == null) return "";
    var d = q - ttm;
    return d >= 1.5 ? " Das jüngste Quartal wuchs sogar schneller (" + gSigned(q) + "): das Tempo zieht an." : d <= -1.5 ? " Das jüngste Quartal wuchs langsamer (" + gSigned(q) + "): das Tempo lässt nach." : " Das jüngste Quartal liegt auf dem gleichen Niveau (" + gSigned(q) + "): das Tempo bleibt stabil.";
  }

  /* Jahresverlauf (mind. 3 Jahre) mit Wachstum je Jahr */
  function fyCells(arr, e, kind, unit) {
    var cells = [], i;
    for (i = 2; i <= 5; i++) {
      var v = arr[i]; if (num(v) == null) continue;
      var pv = arr[i - 1], g = num(pv) == null ? null : kind === "pct" ? v - pv : gOf(v, pv);
      cells.push({ y: String(e.years[i]) + (i === 5 ? " e" : ""), v: kind === "pct" ? nf1.format(v) + " %" : euM(v, unit), g: g == null ? "–" : kind === "pct" ? (g > 0 ? "+" : g < 0 ? "−" : "") + nf1.format(Math.abs(g)) + " Pkt." : gSigned(g), c: g == null ? "" : g >= 0 ? "up" : "down", est: i === 5 });
    }
    return cells;
  }
  function histSentence(arr, e, kind, unit, what) {
    var a = arr[1], b = arr[4], y1 = e.years[1], y4 = e.years[4];
    if (num(a) == null || num(b) == null) return "";
    if (kind === "pct") return " In den letzten 3 Jahren (" + y1 + " bis " + y4 + ") ging die Quote von " + nf1.format(a) + " % auf " + nf1.format(b) + " % (" + (b >= a ? "+" : "−") + nf1.format(Math.abs(b - a)) + " Prozentpunkte).";
    if (!(a > 0 && b > 0)) return " Von " + y1 + " bis " + y4 + ": " + euM(a, unit) + " auf " + euM(b, unit) + ".";
    var c = (Math.pow(b / a, 1 / 3) - 1) * 100;
    return " In den letzten 3 Jahren (" + y1 + " bis " + y4 + ") ist " + (what || "der Wert") + " von " + euM(a, unit) + " auf " + euM(b, unit) + (b < a ? " gesunken" : " gestiegen") + ", im Schnitt " + gSigned(c) + " pro Jahr.";
  }
  function attachHist(t, ks) {
    ks.forEach(function (k) { if (t.kpi_notes && t.kpi_notes[k.id]) k.note = t.kpi_notes[k.id]; });
    var e = t.est; if (!e || !e.rev || !e.years || e.years.length < 6) return;
    var unit = e.unit || (t.growth && t.growth.unit) || "";
    var pctArr = function (num_) { return [0, 1, 2, 3, 4, 5].map(function (i) { return e.rev[i] > 0 && num(num_ && num_[i]) != null ? num_[i] / e.rev[i] * 100 : null; }); };
    var map = { rev: [e.rev, "abs"], ni: [e.ni, "abs"], nm: [pctArr(e.ni), "pct"], om: [pctArr(e.op), "pct"], gm: [e.gm, "pct"], sz: [e.rev, "abs"] };
    ks.forEach(function (k) {
      var d = map[k.id];
      if (d && d[0]) {
        k.h = fyCells(d[0], e, d[1], unit);
        if (k.id !== "sz") k.text += histSentence(d[0], e, d[1], unit, k.id === "rev" ? "der Umsatz" : k.id === "ni" ? "der Nettogewinn" : "der Wert");
        k.hl = { rev: "Umsatz je Geschäftsjahr", ni: "Nettogewinn je Geschäftsjahr", nm: "Nettomarge je Geschäftsjahr", om: "Operative Marge je Geschäftsjahr", gm: "Bruttomarge je Geschäftsjahr", sz: "Umsatz je Geschäftsjahr" }[k.id];
      }
      if (k.id === "fcf" && num(e.fcf_last) != null) {
        var c = [{ y: String(e.years[4]), v: euM(e.fcf_last, unit), g: "–", c: "" }];
        if (num(e.fcf_cur) != null) { var g2 = e.fcf_last > 0 ? gOf(e.fcf_cur, e.fcf_last) : null; c.push({ y: String(e.years[5]) + " e", v: euM(e.fcf_cur, unit), g: g2 == null ? "–" : gSigned(g2), c: g2 == null ? "" : g2 >= 0 ? "up" : "down", est: true }); }
        k.h = c; k.hl = "Freier Cashflow (nur letztes Jahr und Erwartung verfügbar)";
      }
      if (k.id === "ex") {
        var gs = [[3, e.rev[3], e.rev[2]], [4, e.rev[4], e.rev[3]], [5, e.rev[5], e.rev[4]]].map(function (r) { var gg = gOf(r[1], r[2]); return { y: String(e.years[r[0]]) + (r[0] === 5 ? " e" : ""), v: gSigned(gg), g: "", c: gg == null ? "" : gg >= 0 ? "up" : "down", est: r[0] === 5 }; });
        gs.unshift({ y: String(e.years[2]), v: gSigned(gOf(e.rev[2], e.rev[1])), g: "", c: "up" });
        if (num(e.rev_next) > 0) { var gn = gOf(e.rev_next, e.rev[5]); gs.push({ y: String(parseInt(e.years[5], 10) + 1) + " e", v: gSigned(gn), g: "", c: gn >= 0 ? "up" : "down", est: true }); }
        k.h = gs; k.hl = "Umsatzwachstum je Jahr";
      }
    });
  }
  function kpiData(t) {
    var g = t.growth, e = t.est;
    if (!g || !g.periods || !g.annual) return null;
    var m = growthMetrics(t), per = m.per, P = g.periods, unit = g.unit || "", cur = curOf(unit), out = [];
    var enough = P.revenue.length >= 2 * per && P.net_income.length >= 2 * per;
    var revC = enough ? sumN(P.revenue, 0, per) : null, revP = enough ? sumN(P.revenue, per, per) : null;
    var niC = enough ? sumN(P.net_income, 0, per) : null, niP = enough ? sumN(P.net_income, per, per) : null;
    var einmal = /sondereffekt|einmal/i.test(g.source || "");
    var rt, gR = m.rev ? m.rev.ttm : null, gN = m.ni ? m.ni.ttm : null, txt, k;

    // 1 Umsatzwachstum
    if (gR != null) {
      rt = rate(gR, [25, 12, 5]);
      txt = "Der Umsatz wächst derzeit um " + gSigned(gR) + " pro Jahr. " +
        (rt === "top" ? "Das ist ein außergewöhnlich hohes Tempo: Die Firma verkauft deutlich mehr als im Vorjahr, während der Gesamtmarkt nur um 4 bis 5 % zulegt." : rt === "good" ? "Das ist ein starkes Tempo und liegt klar über dem Gesamtmarkt (4 bis 5 % pro Jahr)." : rt === "mid" ? "Das ist solide, aber kein Ausnahmetempo." : "Das Wachstum ist schwach, die Firma kommt kaum voran.") + tempoText(m.rev.q, gR);
      out.push({ id: "rev", title: "Umsatzwachstum", val: gSigned(gR), sub: "pro Jahr, letzte 12 Monate", rt: rt, dir: m.rev.dir, sp: m.rev.yoy.slice(0, 8).slice().reverse(), text: txt,
        pro: "Der Umsatz wächst schnell (" + gSigned(gR) + " pro Jahr)", con: "Der Umsatz wächst nur langsam (" + gSigned(gR) + ")" });
    }
    // 2 Gewinnwachstum
    if (niC != null) {
      if (gN != null) {
        rt = rate(gN, [30, 15, 5]);
        txt = "Der Gewinn legt um " + gSigned(gN) + " pro Jahr zu. " +
          (gR != null ? (gN > gR + 3 ? "Er wächst schneller als der Umsatz: Die Firma wird profitabler, aus jedem Euro Umsatz wird mehr Gewinn. " : gN < gR - 3 ? "Er wächst langsamer als der Umsatz: Die Kosten steigen schneller als die Einnahmen. " : "Er wächst ähnlich schnell wie der Umsatz, das Geschäft skaliert gleichmäßig. ") : "") +
          (einmal ? "Vorsicht: Einmaleffekte wie Steuern oder Verkäufe können den Vergleich verzerren." : "");
        out.push({ id: "ni", title: "Gewinnwachstum", val: gSigned(gN), sub: "pro Jahr, letzte 12 Monate", rt: rt, dir: m.ni.dir, sp: m.ni.yoy.slice(0, 8).slice().reverse().map(function (x) { return x == null ? null : Math.max(-100, Math.min(300, x)); }), text: txt,
          pro: "Der Gewinn wächst stark (" + gSigned(gN) + ")", con: "Der Gewinn wächst kaum oder sinkt (" + gSigned(gN) + ")" });
      } else {
        out.push({ id: "ni", title: "Gewinnwachstum", val: "–", sub: "nicht vergleichbar", rt: null, text: "Ein Wachstum in Prozent lässt sich nicht sinnvoll berechnen, weil der Gewinn in den 12 Monaten davor null oder negativ war. Aktuell: " + (niC >= 0 ? "Gewinn " : "Verlust ") + euM(Math.abs(niC), unit) + " in 12 Monaten." });
      }
    }
    // 3 Nettomarge
    if (revC > 0 && niC != null) {
      var nm = niC / revC * 100, nmP = revP > 0 && niP != null ? niP / revP * 100 : null, dN = nmP == null ? null : nm - nmP;
      rt = rate(nm, [20, 10, 5]);
      var nser = e && e.rev && e.ni ? [0, 1, 2, 3, 4, 5].map(function (i) { return e.rev[i] > 0 && num(e.ni[i]) != null ? e.ni[i] / e.rev[i] * 100 : null; }) : null;
      txt = "Von 100 € Umsatz bleiben " + nf1.format(nm) + " € als Gewinn hängen. " +
        (nm < 0 ? "Die Firma schreibt derzeit Verlust. " : rt === "top" ? "Das ist ein Spitzenwert, wie ihn sonst nur die besten Software- und Chipfirmen erreichen. " : rt === "good" ? "Das ist besser als bei den meisten großen US-Firmen (rund 10 €). " : rt === "mid" ? "Das ist durchschnittlich. " : "Das ist wenig: Es bleibt kaum etwas hängen. ") +
        (dN != null ? (dN >= 1 ? "Vor einem Jahr war es weniger, die Firma verdient pro Euro Umsatz also mehr." : dN <= -1 ? "Vor einem Jahr war es mehr, die Firma verdient pro Euro Umsatz also weniger." : "Das ist ähnlich wie vor einem Jahr.") : "") + (einmal ? " Einmaleffekte sind möglich." : "");
      out.push({ id: "nm", title: "Gewinn pro 100 € Umsatz", val: nf1.format(nm) + " €", sub: "Nettomarge " + pctPlain(nm), rt: rt, dir: dirOf(dN), sp: nser, text: txt,
        pro: "Von 100 € Umsatz bleiben " + nf1.format(nm) + " € Gewinn (Marktdurchschnitt etwa 10 €)", con: "Von 100 € Umsatz bleiben nur " + nf1.format(nm) + " € Gewinn" });
    }
    if (e && e.rev && e.rev[4] > 0) {
      var r4 = e.rev[4], r5 = e.rev[5];
      // 4 operative Marge
      if (num(e.op && e.op[4]) != null) {
        var om = e.op[4] / r4 * 100, om3 = e.op[3] != null && e.rev[3] > 0 ? e.op[3] / e.rev[3] * 100 : null, om5 = e.op[5] != null && r5 > 0 ? e.op[5] / r5 * 100 : null;
        rt = rate(om, [25, 15, 8]);
        txt = "Die operative Marge zeigt, wie viel vom Umsatz nach allen laufenden Kosten übrig bleibt, vor Zinsen und Steuern: " + nf1.format(om) + " € von 100 €. " +
          (rt === "top" ? "Das Kerngeschäft ist sehr profitabel. " : rt === "good" ? "Das Kerngeschäft verdient gut. " : rt === "mid" ? "Das ist mittelmäßig, für Rückschläge bleibt nur ein kleiner Puffer. " : "Das ist wenig Puffer, schon kleine Kostenschübe fallen ins Gewicht. ") +
          (om3 != null ? (om - om3 >= 1 ? "Gegenüber dem Vorjahr wird die Firma effizienter. " : om - om3 <= -1 ? "Gegenüber dem Vorjahr drücken die Kosten stärker. " : "Das ist ähnlich wie im Vorjahr. ") : "") +
          (om5 != null ? "Analysten erwarten für das laufende Jahr " + nf1.format(om5) + " %." : "");
        out.push({ id: "om", title: "Operative Marge", val: pctPlain(om), sub: "letztes Geschäftsjahr", rt: rt, dir: dirOf(om5 != null ? om5 - om : om3 != null ? om - om3 : null), sp: [0, 1, 2, 3, 4, 5].map(function (i) { return e.rev[i] > 0 && num(e.op[i]) != null ? e.op[i] / e.rev[i] * 100 : null; }), text: txt,
          pro: "Hohe operative Marge (" + pctPlain(om) + "): Das Kerngeschäft verdient gut", con: "Niedrige operative Marge (" + pctPlain(om) + "): wenig Puffer" });
      }
      // 5 Bruttomarge
      if (e.gm && num(e.gm[4]) != null) {
        var gm = e.gm[4], gm3 = num(e.gm[3]);
        rt = rate(gm, [60, 40, 25]);
        txt = "Die Bruttomarge zeigt, was nach den direkten Herstellungskosten vom Umsatz bleibt: " + nf1.format(gm) + " € von 100 €. " +
          (rt === "top" ? "Das spricht für echte Preismacht, wie bei guter Software. " : rt === "good" ? "Die Firma kann ihre Preise gut durchsetzen. " : rt === "mid" ? "Das ist für Hardware typisch, der Spielraum bei den Preisen ist begrenzt. " : "Der Spielraum bei den Preisen ist gering. ") +
          (gm3 != null ? (gm - gm3 >= 1 ? "Die Marge ist gegenüber dem Vorjahr gestiegen." : gm - gm3 <= -1 ? "Die Marge ist gegenüber dem Vorjahr gesunken." : "Sie ist stabil geblieben.") : "");
        out.push({ id: "gm", title: "Bruttomarge", val: pctPlain(gm), sub: "letztes Geschäftsjahr", rt: rt, dir: dirOf(gm3 != null ? gm - gm3 : null), sp: e.gm.slice(0, 6), text: txt,
          pro: "Hohe Bruttomarge (" + pctPlain(gm) + "): starke Preismacht", con: "Niedrige Bruttomarge (" + pctPlain(gm) + "): wenig Spielraum bei Preisen" });
      }
      // 6 Freier Cashflow
      if (num(e.fcf_last) != null) {
        var fm = e.fcf_last / r4 * 100, fc = num(e.fcf_cur);
        rt = rate(fm, [15, 5, 0]);
        txt = "Der freie Cashflow ist das Geld, das nach allen Ausgaben und Investitionen tatsächlich übrig bleibt, und lässt sich schwerer schönrechnen als der Gewinn. Hier sind es " + euM(e.fcf_last, unit) + " im letzten Geschäftsjahr, " + nf1.format(fm) + " % vom Umsatz. " +
          (rt === "top" ? "Das ist sehr stark: Die Firma erwirtschaftet echtes Geld. " : rt === "good" ? "Das ist ordentlich. " : rt === "mid" ? "Das ist wenig, die Firma investiert fast alles wieder. " : fm < 0 ? "Die Firma verbrennt derzeit Geld. " : "Das ist kaum etwas. ") +
          (fc != null ? "Für das laufende Jahr erwarten Analysten " + (fc > e.fcf_last ? "mehr." : "weniger.") : "");
        out.push({ id: "fcf", title: "Freier Cashflow", val: euM(e.fcf_last, unit), sub: nf1.format(fm) + " % vom Umsatz", rt: rt, dir: fc != null && e.fcf_last ? (function (ch) { return ch >= 20 ? "up2" : ch >= 5 ? "up" : ch <= -20 ? "down2" : ch <= -5 ? "down" : "flat"; })((fc - e.fcf_last) / Math.abs(e.fcf_last) * 100) : null, text: txt,
          pro: "Viel freier Cashflow (" + nf1.format(fm) + " % vom Umsatz): echtes Geld in der Kasse", con: "Wenig oder negativer freier Cashflow (" + nf1.format(fm) + " % vom Umsatz)" });
      }
      // 7 Bewertung
      if (num(e.fpe) != null && e.fpe > 0) {
        var epsG = num(e.eps_cur) > 0 && num(e.eps_next) != null ? (e.eps_next / e.eps_cur - 1) * 100 : null, peg = epsG != null && epsG > 0 ? e.fpe / epsG : null;
        rt = rateLow(e.fpe, [18, 28, 45]);
        if (peg != null) rt = peg < 1 ? shift(rt, 1) : peg > 2 ? shift(rt, -1) : rt;
        txt = "Das Kurs-Gewinn-Verhältnis (KGV) von " + nf1.format(e.fpe) + " heißt: Du zahlst das " + nf1.format(e.fpe) + "-fache des fürs nächste Jahr erwarteten Gewinns je Aktie. Der breite US-Markt liegt bei etwa 20 bis 22. " +
          (rt === "top" ? "Die Aktie ist günstig bewertet. " : rt === "good" ? "Die Bewertung ist fair. " : rt === "mid" ? "Die Bewertung ist anspruchsvoll: Es ist schon viel Gutes eingepreist. " : "Die Aktie ist teuer: Schon kleine Enttäuschungen können den Kurs deutlich drücken. ") +
          (peg != null ? (peg < 1 ? "Gemessen am erwarteten Wachstum ist der Preis sogar niedrig." : peg <= 2 ? "Gemessen am erwarteten Wachstum ist der Preis noch vertretbar." : "Gemessen am erwarteten Wachstum ist der Preis hoch.") : "");
        out.push({ id: "pe", title: "Bewertung (KGV)", val: nf1.format(e.fpe), sub: peg != null ? "PEG " + nf1.format(peg) : "erwartetes KGV", rt: rt, lab: { top: "günstig", good: "fair", mid: "anspruchsvoll", low: "teuer" }[rt], text: txt,
          pro: "Die Bewertung ist nicht überzogen (KGV " + nf1.format(e.fpe) + ")", con: "Die Aktie ist hoch bewertet (KGV " + nf1.format(e.fpe) + "): Enttäuschungen werden bestraft" });
      }
    }
    // 8 Größe
    if (revC > 0) {
      var rE = toEur(revC * 1e6, cur), tier = rE >= 5e10 ? "Riese" : rE >= 1e10 ? "Großkonzern" : rE >= 2e9 ? "mittelgroß" : rE >= 5e8 ? "klein" : "sehr klein";
      txt = "Der Umsatz der letzten 12 Monate liegt bei " + euM(revC, unit) + ". Damit ist die Firma " + (tier === "Riese" ? "ein Weltkonzern. Große Firmen wachsen schwerer, deshalb ist hohes Wachstum hier besonders bemerkenswert." : tier === "Großkonzern" ? "ein großer, etablierter Konzern." : tier === "mittelgroß" ? "mittelgroß, mit Luft nach oben." : "klein: mehr Chancen, aber auch mehr Risiko.");
      out.push({ id: "sz", title: "Größe (Umsatz)", val: eurShort(rE), sub: "letzte 12 Monate", rt: null, lab: tier, text: txt,
        pro: tier === "Riese" || tier === "Großkonzern" ? "Große, etablierte Firma (" + eurShort(rE) + " Umsatz)" : null, con: tier === "klein" || tier === "sehr klein" ? "Kleine Firma (" + eurShort(rE) + " Umsatz): anfälliger für Rückschläge" : null });
    }
    // 9 Kurspotenzial
    var up = upside(t), p = t.potential || {}, l = t.last || {};
    if (up != null) {
      rt = rate(up, [40, 20, 8]);
      txt = "Analysten sehen die Aktie im Schnitt bei " + eu(p.mean, t.currency) + ", das sind " + sgn(up) + " zum heutigen Kurs. " +
        (up < 0 ? "Das Ziel liegt unter dem Kurs: Die Analysten halten die Aktie für ausgereizt. " : rt === "top" ? "Das ist viel Luft nach oben. " : rt === "good" ? "Das ist spürbar Luft nach oben. " : "Viel Luft ist nicht mehr. ") + "Das ist eine Meinung, keine Garantie, und Ziele werden oft erst nach Kursbewegungen angepasst.";
      out.push({ id: "up", title: "Kurspotenzial", val: sgn(up), sub: eu(p.mean - l.price, t.currency, true) + " je Aktie", rt: rt, text: txt,
        pro: "Hohes Kurspotenzial laut Analysten (" + sgn(up) + ")", con: "Wenig Kurspotenzial laut Analysten (" + sgn(up) + ")" });
    }
    // 10 Erwartung gegen gemeldet
    if (e && e.rev && e.rev[3] > 0 && e.rev[4] > 0 && e.rev[5] > 0) {
      var lg = gOf(e.rev[4], e.rev[3]), eg = gOf(e.rev[5], e.rev[4]), ng = num(e.rev_next) > 0 ? gOf(e.rev_next, e.rev[5]) : null, dd = eg - lg;
      var eg2 = num(e.eps_last) > 0 && num(e.eps_cur) != null ? gOf(e.eps_cur, e.eps_last) : null;
      rt = rate(eg, [25, 12, 5]);
      txt = "Zuletzt wuchs der Umsatz um " + gSigned(lg) + ", für das laufende Jahr erwarten Analysten " + gSigned(eg) + (ng != null ? " und fürs Jahr danach " + gSigned(ng) : "") + ". " +
        (dd >= 3 ? "Sie rechnen also mit einer Beschleunigung. " : dd <= -3 ? "Sie rechnen also mit einer Abkühlung. " : "Sie rechnen mit ähnlichem Tempo wie zuletzt. ") +
        "Für den Kurs zählt: Übertrifft die Firma die Erwartungen, steigt die Aktie oft; verfehlt sie sie, fällt sie oft, auch bei guten Zahlen.";
      out.push({ id: "ex", title: "Erwartung der Analysten", val: gSigned(eg), sub: "Umsatz laufendes Jahr, gemeldet " + gSigned(lg), rt: rt, dir: dirOf(dd), sp: [lg, eg, ng], text: txt,
        pro: "Analysten erwarten weiter starkes Wachstum (" + gSigned(eg) + ")", con: "Analysten erwarten nur schwaches Wachstum (" + gSigned(eg) + ")" });
    }
    attachHist(t, out);
    return out;
  }
  window.KPI = { data: kpiData, ARROW: ARROW, DIRTXT: DIRTXT, RT: RT, euM: euM, eu: eu, eurShort: eurShort, toEur: toEur };
})();
