/* st0cks Diagramme (aus der alten Oberfläche übernommen, neu gezeichnet für das Handy):
   CH.growth(t, mode)  Umsatz und Nettogewinn: 3 Jahre zurück, dieses Jahr, bis zu 3 Jahre voraus (Erwartung) oder je Quartal
   CH.stair(t, mode)   Gewinn-Treppe (Gewinn je Aktie): kum | ttm | per
   t = {growth, est, earnings, currency}. Braucht window.KPI (kpi.js). Alle Beträge in Euro (grob umgerechnet). */
(function () {
  "use strict";
  var K = window.KPI;
  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var uid = 0;
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function gs(g) { return g == null ? "–" : (Math.abs(g) >= 1000 ? (g > 0 ? ">+999" : "<−999") : (g > 0 ? "+" : g < 0 ? "−" : "") + nf0.format(Math.abs(g))) + " %"; }
  function seg(attr, cur, opts) { return '<span class="seg" style="margin:0;flex:1 1 100%" role="group">' + opts.map(function (o) { return '<button type="button" ' + attr + '="' + o[0] + '" class="' + (cur === o[0] ? "on" : "") + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</span>"; }

  /* ---------- Balken: 3 Jahre zurück, dieses Jahr, 3 Jahre voraus ---------- */
  function expItems(e, key) {
    var arr = key === "revenue" ? e.rev : e.ni, y = e.years, items = [], i;
    for (i = 2; i <= 5; i++) { if (num(arr[i]) == null) continue; items.push({ label: y[i] + (i === 5 ? " e" : ""), v: arr[i], g: num(arr[i - 1]) != null ? K.gOf(arr[i], arr[i - 1]) : null, est: i === 5 }); }
    var f = e.fwd || {}, fy = Array.isArray(f.years) ? f.years : [], prev = arr[5], j, any = false;
    for (j = 0; j < fy.length && j < 3; j++) {
      var v = null, der = false;
      if (key === "revenue") v = f.rev ? f.rev[j] : null;
      else if (num(f.ni && f.ni[j]) != null) v = f.ni[j];
      else if (num(f.eps && f.eps[j]) != null && num(e.eps_cur) > 0 && num(arr[5]) != null) { v = arr[5] * f.eps[j] / e.eps_cur; der = true; }
      if (num(v) == null) continue;
      items.push({ label: fy[j] + " e" + (der ? "*" : ""), v: v, g: K.gOf(v, prev), est: true }); prev = v; any = true;
    }
    if (!any) {
      var ny = /^\d{4}$/.test(String(y[5])) ? String(parseInt(y[5], 10) + 1) : "";
      if (key === "revenue" && num(e.rev_next) != null && num(arr[5]) != null) items.push({ label: ny + " e", v: e.rev_next, g: K.gOf(e.rev_next, arr[5]), est: true });
      if (key === "net_income" && num(arr[5]) != null && num(e.eps_cur) > 0 && num(e.eps_next) != null) { var v2 = arr[5] * e.eps_next / e.eps_cur; items.push({ label: ny + " e*", v: v2, g: K.gOf(v2, arr[5]), est: true }); }
    }
    return items;
  }
  function annualItems(vals, years, count) { var items = [], i; for (i = Math.min(count, vals.length) - 1; i >= 0; i--) items.push({ label: "GJ " + years[i], v: vals[i], g: i + 1 < vals.length ? K.gOf(vals[i], vals[i + 1]) : null }); return items; }
  function seriesItems(vals, labels, per, count) { var items = [], i; for (i = Math.min(count, vals.length - per) - 1; i >= 0; i--) items.push({ label: labels[i], v: vals[i], g: K.gOf(vals[i], vals[i + per]) }); return items; }
  function toEurItems(items, unit) {
    var cur = K.curOf(unit), f = K.toEur(1, cur);
    if (f == null) return { items: items, ok: false };
    return { items: items.map(function (x) { var q = {}; for (var k in x) q[k] = x[k]; if (num(q.v) != null) q.v = q.v * f; return q; }), ok: true, conv: cur !== "EUR" };
  }
  function bars(items, title) {
    uid++;
    var n = items.length, W = 360, H = 230, L = 4, R = 4, T = 26, B = 56, pw = W - L - R, ph = H - T - B;
    var vs = items.map(function (x) { return x.v; }).filter(function (x) { return num(x) != null; });
    var mx = Math.max.apply(null, vs.concat([0])), mn = Math.min.apply(null, vs.concat([0])), big = Math.max(Math.abs(mx), Math.abs(mn)), div = big >= 1000 ? 1000 : 1;
    var rng = (mx - mn) || 1, y0 = T + ph * (mx / rng), slot = pw / n, bw = Math.min(46, slot * 0.66), id = "h" + uid;
    var o = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Balkendiagramm ' + esc(title) + '"><defs><pattern id="' + id + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--surface)"/><rect width="3" height="7" fill="var(--accent)" opacity=".55"/></pattern></defs>';
    o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="var(--line)" stroke-width="1.5"/>';
    items.forEach(function (it, i) {
      var cx = L + slot * i + slot / 2, v = it.v; if (num(v) == null) return;
      var h = Math.max(3, Math.abs(v) / rng * ph), neg = v < 0, y = neg ? y0 : y0 - h;
      o += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="6" fill="' + (it.est ? "url(#" + id + ")" : neg ? "var(--bad-soft)" : "var(--ok-soft)") + '" stroke="' + (neg ? "var(--bad)" : "var(--accent)") + '" stroke-width="1.6"' + (it.est ? ' stroke-dasharray="4 3"' : "") + "/>";
      o += '<text x="' + cx.toFixed(1) + '" y="' + (neg ? y + h + 15 : y - 6).toFixed(1) + '" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">' + (neg ? "−" : "") + nf1.format(Math.abs(v) / div) + "</text>";
      o += '<text x="' + cx.toFixed(1) + '" y="' + (H - 32) + '" text-anchor="middle" font-size="14" fill="var(--muted)">' + esc(it.label) + "</text>";
      o += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + (it.g == null ? "var(--muted)" : it.g >= 0 ? "var(--ok)" : "var(--bad)") + '">' + (it.g == null ? "–" : (n <= 5 ? (it.g >= 0 ? "▲ " : "▼ ") : "") + gs(it.g)) + "</text>";
    });
    return { svg: o + "</svg>", unit: div === 1000 ? "Mrd." : "Mio." };
  }
  function cagr(vals, n) { return vals.length > n && vals[0] > 0 && vals[n] > 0 ? (Math.pow(vals[0] / vals[n], 1 / n) - 1) * 100 : null; }
  function sumLine(label, m) {
    if (!m || m.q == null) return '<div class="muted"><b>' + label + ":</b> Quartalsdaten fehlen oder der Vorjahreswert ist nicht positiv, kein Vergleich möglich.</div>";
    return '<div style="margin:4px 0"><b>' + label + ":</b> Letzte Periode <b style=\"color:var(" + (m.q >= 0 ? "--ok" : "--bad") + ')">' + gs(m.q) + "</b> gegenüber Vorjahr, letzte 12 Monate <b>" + gs(m.ttm) + "</b>. " +
      (m.dir && m.dir !== "na" ? '<span class="arr ' + m.dir + '">' + K.ARROW[m.dir] + "</span> " + K.DIRTXT[m.dir] + "." : "") + "</div>";
  }
  function growth(t, mode) {
    var g = t.growth, e = t.est;
    if (!g || !g.annual || !g.periods) return '<div class="muted">Umsatz und Gewinn: keine Daten</div>';
    var m = K.growthMetrics({ growth: g }), per = m.per, a = g.annual, p = g.periods, unit = g.unit || "", hasE = !!(e && e.rev && e.years && e.ni);
    var pl = per === 2 ? "Halbjahre" : "Quartale", conv = false, miss = 0;
    function chart(title, key) {
      var items, d;
      if (mode === "q") items = seriesItems(p[key], p.labels, per, 8); else { items = hasE ? expItems(e, key) : annualItems(a[key], a.years, 5); miss = hasE ? 7 - items.length : 0; }
      d = toEurItems(items, unit); if (!d.ok) return '<div class="muted">' + title + ": Währung unbekannt, keine Euro-Umrechnung möglich.</div>"; conv = conv || d.conv;
      var b = bars(d.items, title), tail = "";
      if (mode !== "q") {
        var av = a[key], c3 = cagr(av, 2), ci = d.items.filter(function (x) { return x.est; }), cx = null, cxl = "";
        if (hasE && ci.length >= 2 && ci[0].v > 0 && ci[ci.length - 1].v > 0) { cx = (Math.pow(ci[ci.length - 1].v / ci[0].v, 1 / (ci.length - 1)) - 1) * 100; cxl = ci[ci.length - 1].label.replace(/ e\*?$/, ""); }
        tail = '<div class="muted">Ø pro Jahr: ' + (c3 != null ? "2 Jahre zurück " + gs(c3) : "2 Jahre zurück –") + (hasE ? " · " + (cx != null ? "erwartet bis " + esc(cxl) + " " + gs(cx) : "Erwartung –") : "") + "</div>";
      }
      return '<div class="sec">' + title + " (" + b.unit + " €)</div>" + b.svg + tail;
    }
    var out = '<div class="row" style="justify-content:space-between;margin:12px 0 6px"><b class="m">Umsatz und Gewinn</b>' + seg("data-gm", mode, [["5", hasE ? "Jahre + Erwartung" : "Jahre"], ["q", pl]]) + "</div>" +
      sumLine("Umsatz", m.rev) + sumLine("Gewinn", m.ni) + chart("Umsatz", "revenue") + chart("Nettogewinn", "net_income");
    return out + '<div class="muted" style="margin-top:6px">' + (conv ? "Umgerechnet aus " + esc(unit.replace(/^Mio\.\s*/, "")) + " (grob). " : "") + 'Schraffiert (e) = Erwartung der Analysten, * = aus dem Gewinn je Aktie hochgerechnet. Prozent: Veränderung zur Vorperiode des Vorjahres.' +
      (mode !== "q" && miss > 0 ? " Für " + miss + " Erwartungsjahr(e) liegen keine Analystenwerte vor, sie werden nicht geschätzt." : "") + (mode === "q" ? " Für " + pl + " liegen keine Erwartungen vor." : "") + "</div>";
  }

  /* ---------- Gewinn-Treppe ---------- */
  function stairSvg(pts, o) {
    var W = 360, H = 210, L = 6, R = 6, T = 40, B = 26, pw = W - L - R, ph = H - T - B;
    var vals = pts.map(function (p) { return p.value; }), max = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
    var cut = !!o.cut && vmin > 0, min = cut ? vmin * 0.6 : Math.min(0, vmin);
    if (max <= min) max = min + 1;
    var top = max + (max - min) * 0.05, n = pts.length, w = pw / n;
    function y(v) { return T + ph * (1 - (v - min) / (top - min)); }
    var base = y(Math.max(min, 0)), firstLabel = Math.max(0, n - 3);
    var d = "M" + L + "," + base;
    pts.forEach(function (p, i) { var x0 = L + i * w, x1 = L + (i + 1) * w; d += " L" + x0 + "," + y(p.value) + " L" + x1 + "," + y(p.value); });
    d += " L" + (L + n * w) + "," + base + " Z";
    var out = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.aria) + '"><path d="' + d + '" fill="var(--accent)" opacity=".13"/><line x1="' + L + '" x2="' + (W - R) + '" y1="' + base + '" y2="' + base + '" stroke="var(--line)" stroke-width="1.5"/>';
    pts.forEach(function (p, i) {
      var x0 = L + i * w, x1 = L + (i + 1) * w, yy = y(p.value);
      out += '<path d="M' + x0 + "," + (i > 0 ? y(pts[i - 1].value) : yy) + " L" + x0 + "," + yy + " L" + x1 + "," + yy + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"' + (p.estimate ? ' stroke-dasharray="5 4"' : "") + "/>";
    });
    pts.forEach(function (p, i) {
      var cx = L + i * w + w / 2, yy = y(p.value), anchor = i === n - 1 ? "end" : "middle", ax = i === n - 1 ? W - R : cx;
      if (i >= firstLabel) {
        out += '<text x="' + ax.toFixed(1) + '" y="' + (yy - 19).toFixed(1) + '" text-anchor="' + anchor + '" font-size="14" font-weight="700" fill="var(--text)" stroke="var(--surface)" stroke-width="4" paint-order="stroke">' + nf2.format(p.value) + "</text>";
        var sub = o.sub(p); if (sub) out += '<text x="' + ax.toFixed(1) + '" y="' + (yy - 5).toFixed(1) + '" text-anchor="' + anchor + '" font-size="14" font-weight="700" fill="' + (sub.c === "down" ? "var(--bad)" : "var(--ok)") + '" stroke="var(--surface)" stroke-width="4" paint-order="stroke">' + esc(sub.t) + "</text>";
      }
      if ((n - 1 - i) % 3 === 0) out += '<text x="' + (i === n - 1 ? W - R : cx).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === n - 1 ? "end" : "middle") + '" font-size="14" fill="var(--muted)">' + esc(p.label || "") + "</text>";
    });
    return { svg: out + "</svg>", cut: cut };
  }
  function stair(t, mode) {
    var e = t.earnings || {}, s = (Array.isArray(e.series) ? e.series : []).filter(function (p) { return num(p.value) != null; });
    var f = e.currency ? K.toEur(1, e.currency) : null, fxk = f != null && e.currency !== "EUR" ? f : 1;
    if (e.currency && f == null) return '<div class="muted">Gewinn-Treppe: Währung ' + esc(e.currency) + " unbekannt, keine Euro-Umrechnung möglich.</div>";
    if (fxk !== 1) s = s.map(function (p) { var q = {}; for (var kk in p) q[kk] = p[kk]; q.value = p.value * fxk; return q; });
    if (s.length < 3) return '<div class="sec">Gewinn-Treppe</div><div class="muted">Gewinnreihe fehlt. Der nächste Lauf trägt sie nach.</div>';
    var yearly = e.period === "year", half = e.period === "half", lag = yearly ? 1 : half ? 2 : 4, k = lag, unit = yearly ? "Jahr" : half ? "Halbjahr" : "Quartal", i, j;
    var per = s.map(function (p, i2) { var prev = i2 - lag >= 0 ? s[i2 - lag].value : null; return { label: p.label, value: p.value, estimate: !!p.estimate, g: prev != null && prev > 0 ? (p.value / prev - 1) * 100 : null }; });
    var acc = 0, kum = s.map(function (p) { acc += p.value; return { label: p.label, value: acc, estimate: !!p.estimate, inc: p.value }; });
    var ttm = [];
    for (i = k - 1; i < s.length; i++) { var sum = 0, est = false; for (j = i - k + 1; j <= i; j++) { sum += s[j].value; est = est || !!s[j].estimate; } ttm.push({ label: s[i].label, value: sum, estimate: est }); }
    ttm.forEach(function (p, i2) { var prev = i2 - lag >= 0 ? ttm[i2 - lag].value : null; p.g = prev != null && prev > 0 ? (p.value / prev - 1) * 100 : null; });
    var hasTtm = ttm.length >= 3 && !yearly; if (mode === "ttm" && !hasTtm) mode = "kum";
    var growthSub = function (p) { return p.g == null ? null : { t: (p.g > 0 ? "+" : "") + nf0.format(p.g) + " %", c: p.g >= 0 ? "up" : "down" }; };
    var incSub = function (p) { return { t: (p.inc > 0 ? "+" : "") + nf2.format(p.inc), c: p.inc >= 0 ? "up" : "down" }; };
    var first = s[0].label || "", A = "Gewinn je Aktie in Euro, ";
    var pick = mode === "per" ? stairSvg(per, { cut: true, sub: growthSub, aria: A + "je " + unit }) : mode === "ttm" ? stairSvg(ttm, { cut: true, sub: growthSub, aria: A + "rollierend 12 Monate" }) : stairSvg(kum, { cut: false, sub: incSub, aria: A + "kumuliert" });
    var cap = mode === "kum" ? "Kumuliert: Summe des Gewinns je Aktie seit " + esc(first) + ". Obere Zahl = aufgelaufener Wert, Plus darunter = Gewinn der Periode. Je steiler, desto stärker der Gewinn."
      : mode === "ttm" ? "Rollierend: Gewinn je Aktie der jeweils letzten 12 Monate. Prozent = Wachstum zum gleichen Wert ein Jahr davor." : "Je " + unit + ": Gewinn je Aktie der einzelnen Periode. Prozent = Wachstum zum Vorjahreszeitraum.";
    cap += " Gestrichelt = Schätzung." + (mode !== "kum" && pick.cut ? " Die Achse beginnt nicht bei 0." : "");
    var act = s.filter(function (p) { return !p.estimate; }), sumTxt = "";
    if (act.length >= k) {
      var now = 0, accAct = 0, prevS = null;
      for (j = act.length - k; j < act.length; j++) now += act[j].value;
      for (j = 0; j < act.length; j++) accAct += act[j].value;
      if (act.length - k - lag >= 0) { prevS = 0; for (j = act.length - k - lag; j < act.length - lag; j++) prevS += act[j].value; }
      var gg = prevS != null && prevS > 0 ? (now / prevS - 1) * 100 : null;
      sumTxt = '<div class="facts" style="margin-top:8px"><div class="fact"><small>' + (yearly ? "Letztes Jahr" : "Letzte 12 Monate") + "</small><b>" + nf2.format(now) + "</b></div>" +
        (gg != null ? '<div class="fact"><small>Wachstum zum Vorjahr</small><b style="color:var(' + (gg >= 0 ? "--ok" : "--bad") + ')">' + gs(gg) + "</b></div>" : "") +
        '<div class="fact"><small>Aufgelaufen seit ' + esc(first) + "</small><b>" + nf2.format(accAct) + "</b></div></div>";
    }
    return '<div class="row" style="justify-content:space-between;margin:12px 0 6px"><b class="m">Gewinn-Treppe</b>' + seg("data-stair", mode, [["kum", "Kumuliert"]].concat(hasTtm ? [["ttm", "12 Monate"]] : [], [["per", "Je " + unit]])) + "</div>" +
      pick.svg + sumTxt + '<div class="muted" style="margin-top:6px">' + cap + " " + esc(e.metric || "Gewinn je Aktie") + (fxk !== 1 ? " in Euro (grob umgerechnet aus " + esc(e.currency) + ")" : e.currency ? " in " + esc(e.currency) : "") + "." + (e.as_of ? " Stand " + esc(e.as_of.slice(8, 10) + "." + e.as_of.slice(5, 7) + "." + e.as_of.slice(0, 4)) + "." : "") + "</div>";
  }
  window.CH = { growth: growth, stair: stair };
})();
