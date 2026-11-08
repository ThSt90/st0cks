
(function () {
  "use strict";
  var data;
  try { data = JSON.parse(document.getElementById("radar-data").textContent); }
  catch (e) { data = { runs: [], theses: [] }; }
  var theses = Array.isArray(data.theses) ? data.theses : [];
  var runs = Array.isArray(data.runs) ? data.runs : [];
  var checked = Array.isArray(data.checked) ? data.checked : [];
  var depot = null;
  try { depot = JSON.parse(document.getElementById("radar-depot").textContent); } catch (e) { depot = null; }
  var dpos = depot && Array.isArray(depot.positions) ? depot.positions : [];

  var REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var FX = !REDUCE && ("IntersectionObserver" in window);
  if (FX) document.documentElement.classList.add("fx");

  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var STATUS = ["neu", "intakt", "beobachten", "verletzt", "geschlossen"];
  var LIGHTS = ["gruen", "gelb", "rot", "unbekannt"];
  var LIGHT_TEXT = { gruen: "erfüllt", gelb: "wackelt", rot: "gebrochen", unbekannt: "nicht belegt" };
  var SVGNS = "http://www.w3.org/2000/svg";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function status(t) { return STATUS.indexOf(t.status) >= 0 ? t.status : "beobachten"; }
  function light(p) { return LIGHTS.indexOf(p.light) >= 0 ? p.light : "unbekannt"; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function money(v, cur) {
    var n = num(v);
    if (n == null) return "unbekannt";
    var f = FX[cur];
    if (f != null && cur !== "EUR") { var e = n * f; return "≈ " + (Math.abs(e) >= 1000 ? nf0 : nf2).format(e) + " € <span class=\"meta\">(" + nf2.format(n) + " " + esc(cur) + ")</span>"; }
    return nf2.format(n) + " " + esc(cur || "");
  }
  function pct(v, signed) { var n = num(v); if (n == null) return "unbekannt"; return (signed && n > 0 ? "+" : "") + nf1.format(n) + " %"; }
  function date(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return s ? esc(s) : "–";
    var p = s.slice(0, 10).split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function link(url, label) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return "";
    return ' <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label || "Quelle") + "</a>";
  }
  function isOpen(t) { return status(t) !== "geschlossen"; }
  function latestDate() {
    var d = data.updated || null;
    runs.forEach(function (r) { if (r.date && (!d || r.date > d)) d = r.date; });
    return d;
  }
  function perf(t) {
    var e = t.entry && num(t.entry.price), l = t.last && num(t.last.price);
    return e && l ? (l / e - 1) * 100 : null;
  }
  function isHG(t) { return Array.isArray(t.tags) && t.tags.indexOf("high-growth") >= 0; }
  function upside(t) {
    var m = t.potential && num(t.potential.mean), p = t.last && num(t.last.price);
    return m != null && p ? (m / p - 1) * 100 : null;
  }
  /* ---------- eigener Kurs-Chart (ohne TradingView): Wochenschlusskurse aus data/prices.json ---------- */
  var PRICES = {};
  try { var pje = document.getElementById("radar-prices"); var pjo = pje ? JSON.parse(pje.textContent) : null; if (pjo && pjo.series) PRICES = pjo.series; } catch (e) { PRICES = {}; }
  function smallScr() { return window.innerWidth <= 760; }
  function yahooSym(t) {
    var m = /^([A-Za-z]+):(.+)$/.exec(t.tv_symbol || ""); if (!m) return null;
    var x = m[1].toUpperCase(), k = m[2].replace(/\./g, "-");
    return x === "XETR" ? k + ".DE" : x === "EURONEXT" ? k + ".AS" : x === "TSE" ? k + ".T" : x === "LSE" ? k + ".L" : k;
  }
  function prPts(t) {
    var sr = PRICES[t.id]; if (!sr || !sr.pts || sr.pts.length < 5) return null;
    var out = [];
    sr.pts.forEach(function (p) { var v = toEur(p[1], t.currency); if (v != null) out.push([p[0], v]); });
    return out.length >= 5 ? out : null;
  }
  function prSvg(t, range, mini, hOverride) {
    var all = prPts(t); if (!all) return "";
    var months = range === "6m" ? 6 : range === "1y" ? 12 : 60;
    var dl = new Date(all[all.length - 1][0]); dl.setMonth(dl.getMonth() - months);
    var cut = dl.toISOString().slice(0, 10), pts = all.filter(function (p) { return p[0] >= cut; });
    if (pts.length < 3) pts = all.slice(-3);
    var W = 420, H = mini ? 70 : (hOverride || 190), L = mini ? 4 : 46, R = mini ? 4 : 12, T = mini ? 6 : 12, B = mini ? 6 : 26, pw = W - L - R, ph = H - T - B, n = pts.length;
    var vs = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    var ep = t.entry && num(t.entry.price) != null ? toEur(t.entry.price, t.currency) : null, tp = t.potential && num(t.potential.mean) != null ? toEur(t.potential.mean, t.currency) : null;
    if (!mini) { if (ep != null) { lo = Math.min(lo, ep); hi = Math.max(hi, ep); } if (tp != null) { lo = Math.min(lo, tp); hi = Math.max(hi, tp); } }
    var maPts = [];
    if (!mini) { var off = all.length - n, sm = 0, q; for (q = 0; q < all.length; q++) { sm += all[q][1]; if (q >= 40) sm -= all[q - 40][1]; if (q >= 39 && q >= off) maPts.push({ i: q - off, v: sm / 40 }); } maPts.forEach(function (m) { lo = Math.min(lo, m.v); hi = Math.max(hi, m.v); }); }
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    function X(i) { return L + pw * i / (n - 1); } function Y(v) { return T + ph * (1 - (v - lo) / (hi - lo)); }
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
    var up = vs[n - 1] >= vs[0];
    var o = '<svg class="prsvg' + (up ? " up" : " dn") + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Kursverlauf in Euro">';
    if (!mini) {
      for (var k = 0; k <= 3; k++) { var gv = lo + (hi - lo) * k / 3, gy = Y(gv); o += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/><text x="' + (L - 5) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' + nf0.format(gv) + "</text>"; }
      if (ep != null) o += '<line class="ent" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(ep).toFixed(1) + '" y2="' + Y(ep).toFixed(1) + '"/><text class="lb" x="' + (L + 4) + '" y="' + (Y(ep) - 4).toFixed(1) + '">Aufnahme</text>';
      if (tp != null) o += '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(tp).toFixed(1) + '" y2="' + Y(tp).toFixed(1) + '"/><text class="lb" x="' + (L + 4) + '" y="' + (Y(tp) - 4).toFixed(1) + '">Ø-Ziel</text>';
    }
    o += '<path class="ar" d="' + d + " L" + X(n - 1).toFixed(1) + " " + (T + ph) + " L" + L + " " + (T + ph) + ' Z"/><path class="ln" d="' + d + '"/>';
    if (maPts.length > 1) o += '<path class="ma" d="' + maPts.map(function (m, k) { return (k ? "L" : "M") + X(m.i).toFixed(1) + " " + Y(m.v).toFixed(1); }).join(" ") + '"/>';
    o += '<circle class="pt" cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(vs[n - 1]).toFixed(1) + '" r="' + (mini ? 2.5 : 4) + '"/>';
    if (!mini) {
      for (var j = 0; j < 4; j++) {
        var ix = Math.round((n - 1) * j / 3), dt = pts[ix][0].split("-");
        o += '<text x="' + X(ix).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (j === 0 ? "start" : j === 3 ? "end" : "middle") + '">' + (months <= 6 ? dt[2] + "." + dt[1] + "." : dt[1] + "/" + dt[0].slice(2)) + "</text>";
      }
      o += '<text class="vl" x="' + (W - R) + '" y="' + (Y(vs[n - 1]) - 9).toFixed(1) + '" text-anchor="end">' + nf0.format(vs[n - 1]) + " €</text>";
    }
    return o + "</svg>";
  }
  function validSymbol(s) { return typeof s === "string" && /^[A-Za-z0-9._-]+:[A-Za-z0-9._!-]+$/.test(s); }
  function theme() {
    var a = document.documentElement.getAttribute("data-theme");
    if (a === "dark" || a === "light") return a;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /* ---------- Kurs-Chart (TradingView, 5 Jahre) ---------- */
  function chartBlock(t) {
    var sym = t.tv_symbol, ys = yahooSym(t), tvUrl = validSymbol(sym) ? "https://www.tradingview.com/symbols/" + encodeURIComponent(sym.replace(":", "-")) + "/" : null;
    var ext = (tvUrl ? link(tvUrl, "TradingView") : "") + (tvUrl && ys ? " · " : "") + (ys ? link("https://finance.yahoo.com/quote/" + encodeURIComponent(ys), "Yahoo Finance") : "");
    if (prPts(t)) {
      var asof = PRICES[t.id].asof || (PRICES[t.id].pts[PRICES[t.id].pts.length - 1] || [])[0];
      return '<div class="box prbox" data-t="' + esc(t.id) + '"><div class="boxtitle"><span>Kurs in Euro (grob)</span><span class="seg" role="group" aria-label="Zeitraum"><button type="button" data-prr="5y" aria-pressed="true">5 J</button><button type="button" data-prr="1y" aria-pressed="false">1 J</button><button type="button" data-prr="6m" aria-pressed="false">6 M</button></span></div>' +
        '<div class="prc">' + prSvg(t, "5y") + "</div>" +
        '<div class="cap">Wochenschlusskurse, Stand ' + date(asof) + ". Gestrichelt: Kurs bei Aufnahme und Ø-Kursziel der Analysten. Orange Linie: 200-Tage-Linie (Schnitt der letzten 40 Wochen). Umgerechnet in Euro (grob).</div>" +
        (ext ? '<div class="src">Chart extern: ' + ext + "</div>" : "") + "</div>";
    }
    if (smallScr()) {
      return '<div class="box"><div class="boxtitle"><span>Kurs</span></div><div class="nodata">Kursdaten für den Chart werden noch geladen. Bis dahin: Chart in einer anderen App öffnen.</div>' + (ext ? '<div class="src">Chart extern: ' + ext + "</div>" : "") + "</div>";
    }
    if (!tvUrl) {
      return '<div class="box"><div class="boxtitle"><span>Kurs 5 Jahre</span></div><div class="nodata">Chart-Symbol fehlt. Der nächste /radar-Lauf trägt es nach.</div></div>';
    }
    return '<div class="box"><div class="boxtitle"><span>Kurs 5 Jahre</span>' + link(tvUrl, "TradingView") + "</div>" +
      '<div class="tvhost" data-sym="' + esc(sym) + '"><div class="ph">Chart wird geladen …</div></div></div>';
  }
  function mountChart(host) {
    if (host.getAttribute("data-mounted") === theme()) return;
    host.setAttribute("data-mounted", theme());
    host.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    var inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrap.appendChild(inner);
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    s.text = JSON.stringify({
      symbol: host.getAttribute("data-sym"), width: "100%", height: host.getAttribute("data-h") || "220", locale: "de_DE",
      dateRange: "60M", colorTheme: theme(), isTransparent: true, autosize: false,
      largeChartUrl: "", chartOnly: !!host.getAttribute("data-h"), noTimeScale: !!host.getAttribute("data-h")
    });
    s.onerror = function () {
      host.innerHTML = '<div class="ph">' + (host.getAttribute("data-h") ? "Chart nicht erreichbar" : "Chart konnte nicht geladen werden (keine Verbindung oder blockiert). Nutze den Link rechts oben.") + "</div>";
    };
    wrap.appendChild(s);
    host.appendChild(wrap);
  }
  var observer = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { observer.unobserve(en.target); mountChart(en.target); } });
  }, { rootMargin: "300px" }) : null;
  function armCharts() {
    if (smallScr()) return;
    Array.prototype.forEach.call(document.querySelectorAll(".tvhost[data-sym]"), function (h) {
      if (h.getAttribute("data-mounted") === theme()) return;
      if (observer) observer.observe(h); else mountChart(h);
    });
  }

  /* ---------- Gewinn-Treppe (kumuliert, 12 Monate, je Periode) ---------- */
  var stairMode = "kum";
  function stairSvg(pts, o) {
    var W = 360, H = 200, L = 6, R = 6, T = 34, B = 24, pw = W - L - R, ph = H - T - B;
    var vals = pts.map(function (p) { return p.value; });
    var max = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
    var cut = !!o.cut && vmin > 0;
    var min = cut ? vmin * 0.6 : Math.min(0, vmin);
    if (max <= min) max = min + 1;
    var top = max + (max - min) * 0.05;
    function y(v) { return T + ph * (1 - (v - min) / (top - min)); }
    var n = pts.length, w = pw / n, base = y(Math.max(min, 0));
    var firstLabel = Math.max(0, n - 8);
    var out = '<svg class="stair" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.aria) + '">';
    var d = "M" + L + "," + base;
    pts.forEach(function (p, i) { var x0 = L + i * w, x1 = L + (i + 1) * w; d += " L" + x0 + "," + y(p.value) + " L" + x1 + "," + y(p.value); });
    d += " L" + (L + n * w) + "," + base + " Z";
    out += '<path class="area" d="' + d + '"/>';
    out += '<line class="base" x1="' + L + '" x2="' + (W - R) + '" y1="' + base + '" y2="' + base + '"/>';
    pts.forEach(function (p, i) {
      var x0 = L + i * w, x1 = L + (i + 1) * w, yy = y(p.value);
      var seg = "M" + x0 + "," + (i > 0 ? y(pts[i - 1].value) : yy) + " L" + x0 + "," + yy + " L" + x1 + "," + yy;
      out += '<path class="line' + (p.estimate ? " est" : "") + '" d="' + seg + '"/>';
    });
    pts.forEach(function (p, i) {
      var cx = L + i * w + w / 2, yy = y(p.value);
      if (i >= firstLabel) {
        out += '<text class="val" x="' + cx + '" y="' + (yy - 15) + '" text-anchor="middle">' + esc(nf2.format(p.value)) + "</text>";
        var sub = o.sub(p, i);
        if (sub) out += '<text class="' + sub.c + '" x="' + cx + '" y="' + (yy - 4) + '" text-anchor="middle">' + esc(sub.t) + "</text>";
      }
      if (n <= 8 || (n - 1 - i) % 2 === 0) out += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label || "") + "</text>";
    });
    return { svg: out + "</svg>", cut: cut };
  }
  function growthSub(p) { return p.g == null ? null : { t: (p.g > 0 ? "+" : "") + nf0.format(p.g) + " %", c: p.g >= 0 ? "up" : "down" }; }
  function incSub(p) { return { t: (p.inc > 0 ? "+" : "") + nf2.format(p.inc), c: p.inc >= 0 ? "inc" : "down" }; }

  function stairBlock(t) {
    var e = t.earnings || {};
    var s = (Array.isArray(e.series) ? e.series : []).filter(function (p) { return num(p.value) != null; });
    var title = "Gewinn-Treppe";
    var fxk = e.currency && FX[e.currency] != null && e.currency !== "EUR" ? FX[e.currency] : 1;
    if (fxk !== 1) s = s.map(function (p) { var q = {}; for (var kk in p) q[kk] = p[kk]; q.value = p.value * fxk; return q; });
    if (s.length < 3) {
      return '<div class="box"><div class="boxtitle"><span>' + title + '</span></div><div class="nodata">Gewinnreihe fehlt. Der nächste /radar-Lauf trägt sie nach.</div></div>';
    }
    var yearly = e.period === "year", half = e.period === "half", lag = yearly ? 1 : (half ? 2 : 4), k = lag;
    var unit = yearly ? "Jahr" : (half ? "Halbjahr" : "Quartal"), units = yearly ? "Jahre" : (half ? "Halbjahre" : "Quartale");
    var i, j;
    var per = s.map(function (p, i2) {
      var prev = i2 - lag >= 0 ? s[i2 - lag].value : null;
      return { label: p.label, value: p.value, estimate: !!p.estimate, g: prev != null && prev > 0 ? (p.value / prev - 1) * 100 : null };
    });
    var acc = 0;
    var kum = s.map(function (p) { acc += p.value; return { label: p.label, value: acc, estimate: !!p.estimate, inc: p.value }; });
    var ttm = [];
    for (i = k - 1; i < s.length; i++) {
      var sum = 0, est = false;
      for (j = i - k + 1; j <= i; j++) { sum += s[j].value; est = est || !!s[j].estimate; }
      ttm.push({ label: s[i].label, value: sum, estimate: est });
    }
    ttm.forEach(function (p, i2) { var prev = i2 - lag >= 0 ? ttm[i2 - lag].value : null; p.g = prev != null && prev > 0 ? (p.value / prev - 1) * 100 : null; });

    var first = s[0].label || "", lastL = s[s.length - 1].label || "";
    var A = "Gewinn je Aktie, ";
    var sK = stairSvg(kum, { cut: false, sub: incSub, aria: A + "kumuliert über " + s.length + " " + units + ": von " + nf2.format(kum[0].value) + " auf " + nf2.format(kum[kum.length - 1].value) });
    var sP = stairSvg(per, { cut: true, sub: growthSub, aria: A + "je " + unit + ": von " + nf2.format(s[0].value) + " auf " + nf2.format(s[s.length - 1].value) });
    var hasTtm = ttm.length >= 3 && !yearly;
    var sT = hasTtm ? stairSvg(ttm, { cut: true, sub: growthSub, aria: A + "rollierend 12 Monate: von " + nf2.format(ttm[0].value) + " auf " + nf2.format(ttm[ttm.length - 1].value) }) : null;

    var cutNote = " Die Achse beginnt nicht bei 0.";
    var capK = "Kumuliert: Summe des Gewinns je Aktie seit " + esc(first) + ". Die Zahl über der Stufe ist der aufgelaufene Wert, das Plus darunter der Gewinn der jeweiligen Periode. Je steiler die Treppe, desto stärker der Gewinn. Gestrichelt = Schätzung.";
    var capT = "Rollierend: Gewinn je Aktie der jeweils letzten 12 Monate. Prozent = Wachstum zum gleichen Wert ein Jahr davor. Gestrichelt = enthält Schätzung." + (sT && sT.cut ? cutNote : "");
    var capP = "Je " + unit + ": Gewinn je Aktie der einzelnen Periode. Prozent = Wachstum zum Vorjahreszeitraum, gestrichelt = Schätzung." + (sP.cut ? cutNote : "");
    var perCls = "sv m-per" + (hasTtm ? "" : " m-ttm");

    var act = s.filter(function (p) { return !p.estimate; });
    var sumTxt = "";
    if (act.length >= k) {
      var now = 0, accAct = 0, prevS = null;
      for (j = act.length - k; j < act.length; j++) now += act[j].value;
      for (j = 0; j < act.length; j++) accAct += act[j].value;
      if (act.length - k - lag >= 0) { prevS = 0; for (j = act.length - k - lag; j < act.length - lag; j++) prevS += act[j].value; }
      var gg = prevS != null && prevS > 0 ? (now / prevS - 1) * 100 : null;
      sumTxt = '<div class="stairsum"><span>' + (yearly ? "Letztes Jahr" : "Letzte 12 Monate") + "<b>" + nf2.format(now) + "</b></span>" +
        (gg != null ? "<span>Wachstum zum Vorjahr<b class=\"" + (gg >= 0 ? "pos" : "neg") + '">' + pct(gg, true) + "</b></span>" : "") +
        "<span>Aufgelaufen seit " + esc(first) + "<b>" + nf2.format(accAct) + "</b></span></div>";
    }
    var btn = function (m, label) { return '<button type="button" data-stair-mode="' + m + '" aria-pressed="' + (stairMode === m) + '">' + label + "</button>"; };
    var seg = '<span class="seg" role="group" aria-label="Darstellung der Treppe">' + btn("kum", "Kumuliert") + (hasTtm ? btn("ttm", "12 Monate") : "") + btn("per", "Je " + unit) + "</span>";
    var common = esc(e.metric || "Gewinn je Aktie") + (fxk !== 1 ? " in Euro (grob umgerechnet aus " + esc(e.currency) + ")" : e.currency ? " in " + esc(e.currency) : "") + "." + (e.as_of ? " Stand " + date(e.as_of) + "." : "") + link(e.source);
    return '<div class="box stairbox"><div class="boxtitle"><span>' + title + "</span>" + seg + "</div>" +
      '<div class="sv m-kum">' + sK.svg + '<div class="cap">' + capK + "</div></div>" +
      (hasTtm ? '<div class="sv m-ttm">' + sT.svg + '<div class="cap">' + capT + "</div></div>" : "") +
      '<div class="' + perCls + '">' + sP.svg + '<div class="cap">' + capP + "</div></div>" +
      sumTxt + '<div class="cap">' + common + "</div></div>";
  }

  /* ---------- Kurspotenzial ---------- */
  function potBlock(t) {
    var p = t.potential || {}, price = t.last && num(t.last.price), cur = t.currency;
    var mean = num(p.mean), low = num(p.low), high = num(p.high);
    if (mean == null || price == null) {
      return '<div class="box"><div class="boxtitle"><span>Kurspotenzial</span></div><div class="nodata">Kursziele von Analysten: unbekannt. Der nächste /radar-Lauf sucht sie.</div></div>';
    }
    var lo = Math.min(price, low != null ? low : mean) * 0.94, hi = Math.max(price, high != null ? high : mean) * 1.04;
    function pos(v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); }
    var up = (mean / price - 1) * 100;
    var bar = '<div class="pot"><div class="track"></div>';
    if (low != null && high != null) bar += '<div class="range" style="left:' + pos(low) + "%;width:" + Math.max(1, pos(high) - pos(low)) + '%"></div>';
    bar += '<div class="mark mean" style="left:' + pos(mean) + '%" title="Ø Kursziel"></div>';
    bar += '<div class="mark price" style="left:' + pos(price) + '%" title="Kurs"></div>';
    bar += '<span class="lbl" style="left:' + pos(price) + '%">Kurs</span>';
    bar += '<span class="lbl low" style="left:' + pos(mean) + '%">Ø Ziel</span></div>';
    var line = '<div class="potline"><b class="' + (up >= 0 ? "pos" : "neg") + '">' + pct(up, true) + "</b> bis zum Ø-Kursziel " + money(mean, cur) +
      (low != null && high != null ? ' <span class="meta">(Spanne ' + (cur === "EUR" ? nf2.format(low) + " bis " + nf2.format(high) : eu(low, cur) + " bis " + eu(high, cur)) + ")</span>" : "") + "</div>";
    var cap = "Meinung der Analysten" + (num(p.analysts) != null ? " (" + nf0.format(p.analysts) + " Schätzungen)" : "") +
      ", keine Prognose des Radars." + (p.as_of ? " Stand " + date(p.as_of) + "." : "") + link(p.source);
    return '<div class="box"><div class="boxtitle"><span>Kurspotenzial</span></div>' + bar + line + '<div class="cap">' + cap + "</div></div>";
  }

  function dots(t) {
    var ps = Array.isArray(t.pillars) ? t.pillars : [];
    if (!ps.length) return "";
    return '<div class="dots" aria-label="Säulen">' + ps.map(function (p) {
      var l = light(p);
      return '<span class="dot ' + l + '" title="' + esc((p.name || "Säule") + ": " + LIGHT_TEXT[l]) + '"></span>';
    }).join("") + '<span class="meta">' + ps.filter(function (p) { return light(p) === "gruen"; }).length + " von " + ps.length + " erfüllt</span></div>";
  }

  /* ---------- Score ---------- */
  var rankMap = {};
  var CFG = (typeof data !== "undefined" && data.config) || {}, TH = num(CFG.threshold) != null ? CFG.threshold : 80, TOPN = num(CFG.top_n) != null ? CFG.top_n : 10;
  function scoreParts(t) {
    var s = t.score || {};
    return (Array.isArray(s.parts) ? s.parts : []).filter(function (p) { return num(p.max) != null && p.max > 0 && num(p.points) != null; });
  }
  function scoreTotal(t) {
    var parts = scoreParts(t);
    if (parts.length) return Math.round(parts.reduce(function (a, p) { return a + Math.max(0, Math.min(p.max, p.points)); }, 0));
    return t.score && num(t.score.total) != null ? Math.round(t.score.total) : null;
  }
  function computeRanks() {
    var list = theses.filter(isOpen).map(function (t) { return { id: t.id, s: scoreTotal(t) }; }).filter(function (x) { return x.s != null; });
    list.sort(function (a, b) { return b.s - a.s; });
    list.forEach(function (x, i) { rankMap[x.id] = { rank: i + 1, of: list.length }; });
  }
  function byScore(a, b) {
    var x = scoreTotal(a), y = scoreTotal(b);
    return (y == null ? -1 : y) - (x == null ? -1 : x);
  }
  function scoreClass(s) { return s >= TH ? "sc-hi" : s >= 70 ? "sc-mid" : s >= 55 ? "sc-low" : "sc-bad"; }
  function ringClass(s) { return s >= TH ? "rc-hi" : s >= 70 ? "rc-mid" : s >= 55 ? "rc-low" : "rc-bad"; }
  function scorePill(t) {
    var s = scoreTotal(t);
    if (s == null) return '<div class="score" title="Score fehlt. Der nächste /radar-Lauf trägt ihn nach."><div class="ring rc-none" style="--p:0"><span>–</span></div><small>Score</small></div>';
    var r = rankMap[t.id];
    return '<div class="score" title="Radar-Score von 100: Heuristik aus sieben Teilnoten, nicht rückwirkend getestet. Aufschlüsselung unter Details."><div class="ring ' + ringClass(s) + '" style="--p:' + s + '"><span data-count="' + s + '">' + s + "</span></div><small title=\"" + (r ? "Rang " + r.rank + " von " + r.of + ". " : "") + "Bereich: ab " + TH + " stark, 70 bis " + (TH - 1) + " mittel, 55 bis 69 schwach, darunter kritisch. Der Score ist ungetestet.\">" + (s >= TH ? "stark" : s >= 70 ? "mittel" : s >= 55 ? "schwach" : "kritisch") + " · ungetestet</small></div>";
  }
  function klumpenBlock(open) {
    var by = {}, themeOf = {}, th = Array.isArray(data.themes) ? data.themes : [];
    th.forEach(function (x) { (x.members || []).forEach(function (m) { if (m.id && !themeOf[m.id]) themeOf[m.id] = x.title || x.id; }); });
    open.forEach(function (t) { var k = themeOf[t.id] || "Ohne gemeinsames Thema"; by[k] = (by[k] || 0) + 1; });
    var n = open.length || 1, rows = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) {
      var p = by[k] / n * 100, warn = p > 40 && k !== "Ohne gemeinsames Thema";
      return '<div class="fk-r"><span class="rk">' + by[k] + "</span><div><b>" + esc(k) + "</b><small>" + nf0.format(p) + " % der Thesen ab Score " + TH + (warn ? " · über der Grenze von 40 %" : "") + '</small></div><span class="sc" style="color:var(' + (warn ? "--red" : "--muted") + ')">' + nf0.format(p) + " %</span></div>";
    }).join("");
    return '<details class="fold" open><summary>Klumpenrisiko: Wie viele Thesen hängen am selben Thema?</summary><div class="fk"><p class="cap">Thesen im gleichen Thema bewegen sich oft gemeinsam. Mehr als 40 % in einem Thema gelten als zu viel; neue Thesen dort brauchen dann Score 85 oder mehr.</p>' + rows + "</div></details>";
  }
  function scoreTable(t) {
    var parts = scoreParts(t);
    if (!parts.length) return "";
    var rows = parts.map(function (p) {
      var pts = Math.max(0, Math.min(p.max, p.points));
      return "<tr><td><b>" + esc(p.name) + '</b><div class="pbar"><i style="width:' + (pts / p.max * 100) + '%"></i></div></td><td class="nw">' + nf0.format(pts) + " / " + nf0.format(p.max) + "</td><td>" + esc(p.why || "") + "</td></tr>";
    }).join("");
    return '<div class="kv"><b>Score-Aufschlüsselung' + (t.score && t.score.as_of ? " (Stand " + date(t.score.as_of) + ")" : "") + '</b><table class="pillars parts">' + rows + "</table></div>";
  }
  var TREND = { steigend: "↑ besser", stabil: "→ stabil", fallend: "↓ schwächer" };

  /* ---------- Vorschau vor den Zahlen (earnings-preview) ---------- */
  function previewBlock(t) {
    var p = t.preview;
    if (!p || !(p.event || p.expectation)) return "";
    var watch = Array.isArray(p.watch) ? p.watch : [];
    var sc = p.scenarios || {};
    var rows = [["Besser als erwartet", sc.better], ["Im Rahmen", sc.inline], ["Schwächer als erwartet", sc.worse]].filter(function (r) { return r[1]; });
    return '<div class="box"><div class="boxtitle"><span>Vorschau: ' + esc(p.event || "Zahlen") + (p.date ? " am " + date(p.date) : "") + "</span></div>" +
      (p.expectation ? "<div>" + esc(p.expectation) + "</div>" : "") +
      (watch.length ? '<div class="kv"><b>Darauf achten</b><ul class="plain">' + watch.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>" : "") +
      (rows.length ? '<div class="kv"><b>Mögliche Reaktion (qualitativ)</b><ul class="plain">' + rows.map(function (r) { return "<li><b>" + r[0] + ":</b> " + esc(r[1]) + "</li>"; }).join("") + "</ul></div>" : "") +
      (p.implied_move || p.history ? '<ul class="pv-x">' + (p.implied_move ? '<li><b>Erwartete Bewegung (Optionen):</b> ' + esc(p.implied_move) + '</li>' : '') + (p.history ? '<li><b>Reaktion auf frühere Zahlen:</b> ' + esc(p.history) + '</li>' : '') + '</ul>' : '') + '<div class="cap">' + esc(p.consensus || "Konsens-Schätzungen: unbekannt.") + (p.as_of ? " Stand " + date(p.as_of) + "." : "") + link(p.source) + "</div></div>";
  }

  /* ---------- Tiefenanalyse ---------- */
  var DRV = { treibt: "up", belastet: "down", neutral: "n", unklar: "n" };
  function driversBlock(d) {
    var a = Array.isArray(d.drivers) ? d.drivers : [];
    if (!a.length && !d.price_driver) return "";
    var rows = a.map(function (x) {
      var st = String(x.status || "neutral").toLowerCase(), c = DRV[st] || "n";
      return '<tr><td data-l="Faktor"><b>' + esc(x.factor) + '</b></td><td data-l="Wirkung"><span class="vw dv-' + c + '">' + esc(x.status || "neutral") + '</span></td><td data-l="Wert">' + esc(x.value || "–") + '</td><td class="wrap" data-l="Einordnung">' + linkify(x.text || "") + "</td></tr>";
    }).join("");
    return '<div class="kv"><b>Was bewegt diese Aktie?</b>' + (d.price_driver ? "<p style='margin:4px 0 8px'>" + linkify(d.price_driver) + "</p>" : "") + "</div>" +
      (rows ? '<div class="tablebox scroll"><table class="list top"><thead><tr><th>Faktor</th><th>Wirkung auf den Kurs</th><th>Wert</th><th>Einordnung</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "");
  }
  function deepBlock(t) {
    var d = t.deep;
    if (!d) return "";
    var secs = (Array.isArray(d.sections) ? d.sections : []).map(function (s) { return '<div class="kv"><b>' + esc(s.title) + "</b>" + esc(s.text) + "</div>"; }).join("");
    var sc = Array.isArray(d.scenarios) ? d.scenarios : [];
    var tbl = sc.length ? '<table class="pillars" style="margin-top:10px"><tr><td><b>Szenario</b></td><td><b>Annahme</b></td><td><b>Kurs</b></td></tr>' + sc.map(function (s) {
      return "<tr><td><b>" + esc(s.name) + "</b></td><td>" + esc(s.assumption || "") + "</td><td>" + esc(s.price || "") + "</td></tr>";
    }).join("") + "</table>" + (d.scenario_note ? '<div class="cap">' + esc(d.scenario_note) + "</div>" : "") : "";
    var srcs = (Array.isArray(d.sources) ? d.sources : []).map(function (s) { return typeof s === "string" ? link(s) : link(s.url, s.title); }).join("");
    return '<details class="deep"><summary>Tiefenanalyse vom ' + date(d.date) + "</summary>" +
      (d.summary ? '<p class="headline" style="margin-top:8px">' + esc(d.summary) + "</p>" : "") + driversBlock(d) + secs + tbl +
      (srcs ? '<div class="cap">Quellen:' + srcs + "</div>" : "") + "</details>";
  }

  /* ---------- Wachstum und Beschleunigung (aus t.growth) ---------- */
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
  function accScore(t) {
    var m = growthMetrics(t);
    return m && m.rev && m.rev.d != null ? m.rev.d : -1e9;
  }
  function isAccel(t) { var m = growthMetrics(t); return !!(m && m.rev && m.rev.d != null && m.rev.d >= 5); }
  function arrowPill(dir, big) { return '<span class="arr a-' + dir + (big ? " big" : "") + '" title="' + DIRTXT[dir] + '">' + ARROW[dir] + "</span>"; }

  function sbAbs(v, unit) {
    if (num(v) == null) return "";
    return euM(v, unit).replace(/^≈\s*/, "").replace(/\u00a0/g, " ").replace(/ Mio\. €/, " M€").replace(/ Mrd\. €/, " Mrd €").replace(/ €$/, "");
  }
  function sparkBars(vals, years, unit) {
    if (!Array.isArray(vals) || vals.length < 3) return "";
    var it = annualItems(vals, years || [], 3);
    var vs = it.map(function (x) { return num(x.v) == null ? 0 : x.v; });
    var mx = Math.max.apply(null, vs.concat([0])), mn = Math.min.apply(null, vs.concat([0])), rng = (mx - mn) || 1;
    var W = 120, H = 66, top = 15, ph = 34, slot = W / 3, bw = 22, y0 = top + ph * (mx / rng);
    var out = '<svg class="sb" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Entwicklung über 3 Jahre"><line class="sbase" x1="0" x2="' + W + '" y1="' + y0 + '" y2="' + y0 + '"/>';
    it.forEach(function (x, i) {
      var v = vs[i], h = Math.max(2, Math.abs(v) / rng * ph), cx = slot * i + slot / 2, neg = v < 0;
      out += '<rect style="--i:' + i + '" x="' + (cx - bw / 2) + '" y="' + (neg ? y0 : y0 - h) + '" width="' + bw + '" height="' + h + '" rx="2.5" class="' + (i === 2 ? "last" : "") + (neg ? " neg" : "") + '"/>';
      out += '<text class="sv" x="' + cx + '" y="' + ((neg ? y0 + h : y0 - h) + (neg ? 10 : -3)) + '" text-anchor="middle">' + esc(sbAbs(x.v, unit)) + "</text>";
      out += '<text class="sg ' + (x.g == null ? "" : x.g >= 0 ? "up" : "down") + '" x="' + cx + '" y="' + (H - 3) + '" text-anchor="middle">' + (x.g == null ? "–" : gSigned(x.g).replace("\u00a0%", "%")) + "</text>";
    });
    return out + "</svg>";
  }
  function accRow(label, m, series, years, unit) {
    if (!m || m.q == null) return '<div class="acc na"><span class="al">' + label + '</span><span class="av">–</span><span class="as">keine Daten</span></div>';
    var sub = m.ttm != null ? "12 Mon. " + gSigned(m.ttm) : "12 Mon. –";
    return '<div class="acc"><span class="al">' + label + '</span><span class="av ' + (m.q >= 0 ? "pos" : "neg") + '">' + gSigned(m.q) + "</span>" + arrowPill(m.dir) +
      '<span class="as">' + sub + "</span>" + sparkBars(series, years, unit) + "</div>";
  }

  /* Balkendiagramm mit Prozentwerten */
  function fmtAxis(v, div) { return nf1.format(v / div); }
  function barSvg(items, unitLbl, cls) {
    // items: [{label, v, g}] von alt nach neu
    var n = items.length, W = 420, H = 210, L = 6, R = 6, T = 26, B = 52, pw = W - L - R, ph = H - T - B;
    var vs = items.map(function (x) { return x.v; }).filter(function (x) { return num(x) != null; });
    var mx = Math.max.apply(null, vs.concat([0])), mn = Math.min.apply(null, vs.concat([0]));
    var big = Math.max(Math.abs(mx), Math.abs(mn)), div = big >= 1000 ? 1000 : 1;
    var rng = (mx - mn) || 1, y0 = T + ph * (mx / rng);
    var slot = pw / n, bw = Math.min(46, slot * 0.6);
    var out = '<svg class="gbar ' + (cls || "") + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Balkendiagramm">' + (items.some(function (x) { return x.est; }) ? '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--accent);stroke-width:2.4;opacity:.55"/></pattern></defs>' : "");
    out += '<line class="base" x1="' + L + '" x2="' + (W - R) + '" y1="' + y0 + '" y2="' + y0 + '"/>';
    items.forEach(function (it, i) {
      var cx = L + slot * i + slot / 2, v = it.v;
      if (num(v) == null) return;
      var h = Math.max(2, Math.abs(v) / rng * ph), neg = v < 0, y = neg ? y0 : y0 - h;
      out += '<rect class="b' + (neg ? " neg" : "") + (i === n - 1 ? " last" : "") + (it.est ? " est" : "") + '" style="--i:' + i + (it.est ? ";fill:url(#hatch);stroke:var(--accent);stroke-width:1.5" : "") + '" x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="3"/>';
      out += '<text class="val" x="' + cx + '" y="' + (neg ? y + h + 12 : y - 5) + '" text-anchor="middle">' + (neg ? "−" : "") + fmtAxis(Math.abs(v), div) + "</text>";
      out += '<text class="lbl" x="' + cx + '" y="' + (H - 30) + '" text-anchor="middle">' + esc(it.label) + "</text>";
      var gc = it.g == null ? "" : (it.g >= 0 ? "up" : "down");
      out += '<text class="gr ' + gc + '" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + (it.g == null ? "–" : (it.g > 0 ? "▲ " : it.g < 0 ? "▼ " : "") + gSigned(it.g)) + "</text>";
    });
    return out + "</svg>" + '<div class="cap">Angaben in ' + (div === 1000 ? "Mrd." : "Mio.") + " " + esc(unitLbl.replace(/^Mio\.\s*/, "")) + ". Prozent: Veränderung gegenüber der Vorperiode des Vorjahres.</div>";
  }
  function seriesItems(vals, labels, per, count) {
    var items = [], i;
    for (i = Math.min(count, vals.length - per) - 1; i >= 0; i--) items.push({ label: labels[i], v: vals[i], g: gOf(vals[i], vals[i + per]) });
    return items;
  }
  function annualItems(vals, years, count) {
    var items = [], i;
    for (i = Math.min(count, vals.length) - 1; i >= 0; i--) items.push({ label: "GJ " + years[i], v: vals[i], g: i + 1 < vals.length ? gOf(vals[i], vals[i + 1]) : null });
    return items;
  }
  function cagr(vals, n) { if (vals.length <= n || !(vals[0] > 0) || !(vals[n] > 0)) return null; return (Math.pow(vals[0] / vals[n], 1 / n) - 1) * 100; }
  function chain(m) {
    var ys = (m && m.yoy ? m.yoy : []).slice(0, 5).filter(function (x) { return x != null; }).reverse();
    if (ys.length < 2) return "";
    return '<div class="chain">' + ys.map(function (g, i) {
      var d = i ? g - ys[i - 1] : null;
      return (i ? '<span class="cs ' + (d >= 1.5 ? "up" : d <= -1.5 ? "down" : "flat") + '">' + (d >= 1.5 ? "▲" : d <= -1.5 ? "▼" : "►") + "</span>" : "") + '<span class="cv">' + gSigned(g) + "</span>";
    }).join("") + "</div>";
  }
  function sumLine(label, m) {
    if (!m || m.q == null) return '<div class="gsum"><b>' + label + '</b> <span class="meta">Quartalsdaten fehlen oder Vorjahreswert nicht positiv, kein Vergleich möglich.</span></div>';
    var txt = m.d == null ? "" : (m.d >= 0 ? "+" : "−") + nf1.format(Math.abs(m.d)).replace(/ /g, "") + " Prozentpunkte";
    return '<div class="gsum"><div class="gs-h"><b>' + label + "</b>" + arrowPill(m.dir, true) + '<span class="gs-t">' + DIRTXT[m.dir] + (txt ? " (" + txt + ")" : "") + "</span></div>" +
      '<div class="gs-b">Letzte Periode <b class="' + (m.q >= 0 ? "pos" : "neg") + '">' + gSigned(m.q) + "</b> gegenüber Vorjahr, letzte 12 Monate <b>" + gSigned(m.ttm) + "</b>.</div>" + chain(m) + "</div>";
  }
  function expItems(e, key) {
    var arr = key === "revenue" ? e.rev : e.ni, y = e.years, items = [], i;
    // 3 Jahre zurück bis dieses Jahr: Index 2 (z. B. 2023) bis 5 (laufendes Jahr, Erwartung)
    for (i = 2; i <= 5; i++) { if (num(arr[i]) == null) continue; items.push({ label: y[i] + (i === 5 ? " e" : ""), v: arr[i], g: i > 0 && num(arr[i - 1]) != null ? gOf(arr[i], arr[i - 1]) : null, est: i === 5 }); }
    var f = e.fwd || {}, fy = Array.isArray(f.years) ? f.years : [], prev = arr[5], j, any = false;
    for (j = 0; j < fy.length && j < 3; j++) {
      var v = null, der = false;
      if (key === "revenue") v = f.rev ? f.rev[j] : null;
      else if (num(f.ni && f.ni[j]) != null) v = f.ni[j];
      else if (num(f.eps && f.eps[j]) != null && num(e.eps_cur) > 0 && num(arr[5]) != null) { v = arr[5] * f.eps[j] / e.eps_cur; der = true; }
      if (num(v) == null) continue;
      items.push({ label: fy[j] + " e" + (der ? "*" : ""), v: v, g: gOf(v, prev), est: true, fwd: true }); prev = v; any = true;
    }
    if (!any) {  // Ersatz: nur das Folgejahr aus den Kurzfeldern
      var ny = /^\d{4}$/.test(String(y[5])) ? String(parseInt(y[5], 10) + 1) : "";
      if (key === "revenue" && num(e.rev_next) != null && num(arr[5]) != null) items.push({ label: ny + " e", v: e.rev_next, g: gOf(e.rev_next, arr[5]), est: true, fwd: true });
      if (key === "net_income" && num(arr[5]) != null && num(e.eps_cur) > 0 && num(e.eps_next) != null) { var v2 = arr[5] * e.eps_next / e.eps_cur; items.push({ label: ny + " e*", v: v2, g: gOf(v2, arr[5]), est: true, fwd: true }); }
    }
    return items;
  }
  function eurItems(items, unit) {
    var f = FX[curOf(unit)];
    if (f == null || curOf(unit) === "EUR") return items;
    return items.map(function (x) { var q = {}; for (var kk in x) q[kk] = x[kk]; if (num(q.v) != null) q.v = q.v * f; return q; });
  }
  function euLineG(items, unit) {
    return '<div class="cap">In Euro (grob): ' + items.filter(function (x) { return num(x.v) != null; }).map(function (x) { return x.label + " " + euM(x.v, unit); }).join(" · ") + "</div>";
  }
  function growthBlock(t, mode) {
    var g = t.growth, e = t.est;
    if (!g || !g.annual || !g.periods) return '<div class="box gbox"><div class="boxtitle"><span>Umsatz und Gewinn</span></div><div class="nodata">Wachstumsdaten fehlen. Der nächste /radar-Lauf trägt sie nach.</div></div>';
    var m = growthMetrics(t), per = m.per, a = g.annual, p = g.periods, unit = g.unit || "", hasE = !!(e && e.rev && e.years && e.ni);
    var pl = per === 2 ? "Halbjahre" : "Quartale", i;
    function charts(title, key) {
      var av = a[key], pv = p[key];
      var items = hasE ? expItems(e, key) : annualItems(av, a.years, 5);
      items = eurItems(items, unit);
      var qitems = eurItems(seriesItems(pv, p.labels, per, 8), unit), bu = FX[curOf(unit)] != null && curOf(unit) !== "EUR" ? "Mio. EUR" : unit;
      var c3 = cagr(av, 2), c4 = cagr(av, 4), cx = null, cxl = "", ci = items.filter(function (x) { return x.est; });
      if (hasE && ci.length >= 2 && ci[0].v > 0 && ci[ci.length - 1].v > 0) { cx = (Math.pow(ci[ci.length - 1].v / ci[0].v, 1 / (ci.length - 1)) - 1) * 100; cxl = ci[ci.length - 1].label.replace(/ e\*?$/, ""); }
      var miss = hasE ? 7 - items.length : 0;
      return '<div class="gchart"><div class="gc-t">' + title + "</div>" +
        '<div class="gm gm-5">' + barSvg(items, bu, "e") + (bu !== unit ? '<div class="cap">Umgerechnet aus ' + esc(unit) + " (grob, 1 € ≈ 1,16 US-$).</div>" : "") + "</div>" +
        '<div class="gm gm-q">' + barSvg(qitems, bu, "q") + "</div>" +
        '<div class="cagr">Ø pro Jahr: ' + (c3 != null ? "2 Jahre zurück " + gSigned(c3) : "2 Jahre zurück –") + (hasE ? " · " + (cx != null ? "erwartet bis " + esc(cxl) + " " + gSigned(cx) : "Erwartung –") : " · " + (c4 != null ? "4 Jahre " + gSigned(c4) : "4 Jahre –")) + "</div>" +
        (miss > 0 ? '<div class="cap">Für ' + miss + " Erwartungsjahr(e) liegen keine Analystenwerte vor (oft nur gegen Bezahlung verfügbar). Sie werden nicht geschätzt.</div>" : "") + "</div>";
    }
    var mchart = "";
    if (hasE) {
      var mser = [{ v: [] }, { v: [] }, { v: [] }], lab = [];
      for (i = 0; i <= 5; i++) {
        lab.push(i === 5 ? e.years[i] + " e" : String(e.years[i]));
        mser[0].v.push(e.gm && num(e.gm[i]) != null ? e.gm[i] : null);
        mser[1].v.push(e.rev[i] > 0 && num(e.op && e.op[i]) != null ? e.op[i] / e.rev[i] * 100 : null);
        mser[2].v.push(e.rev[i] > 0 && num(e.ni[i]) != null ? e.ni[i] / e.rev[i] * 100 : null);
      }
      var qm = [], ql = [], n = Math.min(8, p.revenue.length);
      for (i = n - 1; i >= 0; i--) { ql.push(p.labels[i]); qm.push(p.revenue[i] > 0 && num(p.net_income[i]) != null ? p.net_income[i] / p.revenue[i] * 100 : null); }
      var legend = function (arr) { return '<div class="lgd">' + arr.map(function (x, j) { return '<span class="s' + j + '"><i></i>' + x + "</span>"; }).join("") + "</div>"; };
      mchart = '<div class="gchart"><div class="gc-t">Wie viel vom Umsatz bleibt hängen? (Margen)</div>' +
        '<div class="gm gm-5">' + lineSvg(mser, lab, 5) + legend(["Brutto (nach Herstellungskosten)", "Operativ (nach laufenden Kosten)", "Netto (Gewinn)"]) + '<div class="cap">Je höher und je steiler nach oben, desto besser. Das letzte Jahr (e) ist die Erwartung der Analysten.</div></div>' +
        '<div class="gm gm-q">' + lineSvg([{ v: qm }], ql, null) + legend(["Netto-Marge je " + (per === 2 ? "Halbjahr" : "Quartal")]) + '<div class="cap">Für ' + pl + " liegen keine Erwartungen vor.</div></div></div>";
    }
    if (mode === "margins") return mchart ? '<div class="box gbox" data-gmode="5">' + mchart + "</div>" : "";
    return '<div class="box gbox" data-gmode="5"><div class="boxtitle"><span>Umsatz und Gewinn: 3 Jahre zurück, dieses Jahr, 3 Jahre voraus</span><span class="seg" role="group" aria-label="Zeitraum">' +
      '<button type="button" data-gm="5" aria-pressed="true">Jahre + Erwartung</button><button type="button" data-gm="q" aria-pressed="false">' + pl + "</button></span></div>" +
      '<div class="gsums">' + sumLine("Umsatz", m.rev) + sumLine("Gewinn (Nettoergebnis)", m.ni) + "</div>" +
      '<div class="gcharts">' + charts("Umsatz", "revenue") + charts("Nettogewinn", "net_income") + "</div>" +
      '<div class="cap">Quelle Zahlen: ' + (g.url ? link(g.url, g.source || "StockAnalysis") : esc(g.source || "StockAnalysis")) + ", Stand " + date(g.as_of) + (hasE ? ". Schraffierte Balken (e) sind Erwartungen der Analysten (Durchschnitt, Stand " + date(e.as_of) + ")" + (e.source ? link(e.source, "Quelle Erwartungen") : "") + ". * Nettogewinn des Folgejahrs abgeleitet aus der erwarteten Steigerung des Gewinns je Aktie. Ein drittes Erwartungsjahr und Quartals-Erwartungen liegen frei nicht vor." : "") + " Einmalposten im Nettogewinn möglich. Pfeile: Wachstum der letzten Periode minus Wachstum der letzten 12 Monate (mindestens 5 Punkte = stark).</div></div>";
  }

  /* ---------- Euro (grob umgerechnet) ---------- */
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
  function spark(vals) {
    var v = (vals || []).map(function (x) { return num(x); });
    var pts = v.map(function (x, i) { return x == null ? null : [i, x]; }).filter(Boolean);
    if (pts.length < 2) return "";
    var W = 74, H = 26, mn = Math.min.apply(null, pts.map(function (p) { return p[1]; })), mx = Math.max.apply(null, pts.map(function (p) { return p[1]; })), rg = (mx - mn) || 1, n = v.length;
    function X(i) { return 3 + (W - 6) * i / Math.max(1, n - 1); } function Y(x) { return 3 + (H - 6) * (1 - (x - mn) / rg); }
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
    var last = pts[pts.length - 1];
    return '<svg class="spk" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Verlauf"><path d="' + d + '"/><circle cx="' + X(last[0]).toFixed(1) + '" cy="' + Y(last[1]).toFixed(1) + '" r="2.6"/></svg>';
  }
  var NOTE_LAB = { einmal: "Einmaleffekt", kurzfristig: "wahrscheinlich kurzfristig", beobachten: "beobachten", risiko: "echtes Risiko", strukturell: "branchentypisch" };
  function noteHtml(k) {
    var n = k.note;
    if (!n && k.rt !== "low") return "";
    if (!n && smallScr()) return '<span class="kn-flag kn-beobachten" tabindex="0" data-tip="Die Ursache liegt dem Radar noch nicht vor. Der nächste Lauf ergänzt sie." data-tipt="Auffällig schwach">⚑ Auffällig, antippen</span>';
    if (!n) return '<div class="kn kn-beobachten"><span class="kn-chip">Warum so schwach?</span> Die Ursache liegt dem Radar noch nicht vor. Der nächste Lauf ergänzt sie.</div>';
    if (smallScr()) return '<span class="kn-flag kn-' + esc(n.v) + '" tabindex="0" data-tip="' + esc(n.t) + '" data-tipt="Besonderes Ereignis">⚑ Besonderheit, antippen</span>';
    return '<div class="kn kn-' + esc(n.v) + '"><span class="kn-chip">Warum? ' + esc(NOTE_LAB[n.v] || "") + "</span> " + esc(n.t) + (n.src ? link(n.src, "Quelle") : "") + "</div>";
  }
  var PLAIN = {};
  (function () { try { var el = document.getElementById("radar-plain"); if (el) PLAIN = JSON.parse(el.textContent) || {}; } catch (e) { PLAIN = {}; } })();
  function plainBlock(t) {
    var p = PLAIN[t.id]; if (!p) return "";
    var li = function (a) { return Array.isArray(a) && a.length ? "<ul>" + a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; };
    var h = function (lab, body) { return body ? '<div class="pl-r"><b>' + lab + "</b>" + body + "</div>" : ""; };
    var para = function (x) { return x ? "<p>" + esc(x) + "</p>" : ""; };
    var beg = Array.isArray(p.begriffe) && p.begriffe.length ? '<details class="pl-beg"><summary>Begriffe kurz erklärt (' + p.begriffe.length + ")</summary><dl>" + p.begriffe.map(function (b) { return "<dt>" + esc(b[0]) + "</dt><dd>" + esc(b[1]) + "</dd>"; }).join("") + "</dl></details>" : "";
    return '<section class="plainbox" aria-label="Einfach erklärt"><div class="pl-t">Einfach erklärt</div>' +
      h("Was macht die Firma?", para(p.was)) + h("Warum steht sie im Radar?", li(p.warum)) + h("Was ist mit dem Kurs passiert?", para(p.kurs)) +
      h("Was kann schiefgehen?", li(p.risiken)) + h("Worauf achten?", li(p.achten)) + h("Fazit", para(p.fazit)) + beg +
      '<div class="pl-n">Einordnung in Alltagssprache aus den Radar-Daten, keine Anlageberatung.</div></section>';
  }
  function dropsBlock(t) {
    var a = t.drops;
    if (!Array.isArray(a) || !a.length) return '<div class="box dbox"><div class="boxtitle"><span>Frühere Kursrücksetzer und ihre Auslöser</span></div><div class="nodata">Für diese Aktie sind im Radar keine früheren Rücksetzer mit Ursache hinterlegt. Der nächste Lauf ergänzt sie.</div></div>';
    var own = 0, mk = 0, nw = 0;
    a.forEach(function (x) { var k = String(x.kind || ""); if (/Zahlen|Ausblick/.test(k)) own++; else if (/Sektor|Markt/.test(k)) mk++; else nw++; });
    var pat = (a.length > 1 ? "Von " + a.length + " Rücksetzern lagen " + own + " an eigenen Zahlen oder dem Ausblick, " + mk + " an Sektor oder Gesamtmarkt und " + nw + " an Nachrichten oder Sonstigem. " : "") +
      "Faustregel: Enttäuschen die eigenen Zahlen oder der Ausblick, wirkt das meist länger nach. Reißt nur der Sektor oder der Markt die Aktie mit, erholt sie sich oft schneller (keine Garantie).";
    var pl = PLAIN[t.id] && PLAIN[t.id].rueck;
    return '<div class="box dbox"><div class="boxtitle"><span>Frühere Kursrücksetzer und ihre Auslöser</span></div>' + (pl ? '<p class="pl-rueck"><b>Kurz gesagt:</b> ' + esc(pl) + "</p>" : "") + '<ul class="dlist">' + a.map(function (x) {
      return '<li><div class="dl-h"><span class="dl-d">' + esc(x.date) + '</span><b class="dl-m">' + esc(x.move) + '</b><span class="dl-k">' + esc(x.kind) + "</span></div><p>" + esc(x.cause) + (x.src ? link(x.src, "Quelle") : "") + "</p></li>";
    }).join("") + '</ul><div class="cap">' + esc(pat) + " Auswahl aus öffentlichen Berichten, nicht vollständig. Der aktuelle Rücksetzer steht oben in der Kurzbeschreibung.</div></div>";
  }
  function dropsFold(t, open) {
    var a = t.drops; if (!Array.isArray(a) || !a.length) return "";
    return '<details class="sec"' + (open ? " open" : "") + '><summary>Frühere Kursrücksetzer und ihre Auslöser (' + a.length + ")</summary>" + dropsBlock(t).replace('<div class="boxtitle"><span>Frühere Kursrücksetzer und ihre Auslöser</span></div>', "") + "</details>";
  }
  function qmHtml(text) { return '<span class="qm" tabindex="0" role="note" aria-label="Erklärung" data-tip="' + esc(text) + '" data-tipt="Erklärung">?</span>'; }
  function kpiCard(k, compact) {
    var rt = k.rt || "info";
    return '<div class="kc rt-' + rt + '"><div class="kc-top"><span class="kc-t">' + gl(k.title) + (compact && k.text ? qmHtml(k.text) : "") + '</span><span class="kc-chip">' + esc(k.lab || RT[rt]) + '</span></div>' +
      '<div class="kc-v"><b>' + esc(k.val) + "</b>" + (k.dir && k.dir !== "na" ? arrowPill(k.dir) : "") + (k.sp ? spark(k.sp) : "") + "</div>" +
      (k.sub ? '<div class="kc-s">' + esc(k.sub) + "</div>" : "") +
      (!compact && k.h && k.h.length ? '<div class="kh-t">' + esc(k.hl || "") + '</div><div class="kh">' + k.h.map(function (c) { return '<div class="kh-c' + (c.est ? " est" : "") + '"><i>' + esc(c.y) + "</i><b>" + esc(c.v) + "</b>" + (c.g ? '<u class="' + c.c + '">' + esc(c.g) + "</u>" : "") + "</div>"; }).join("") + "</div>" : "") + (compact ? "" : '<p class="kc-x">' + esc(k.text) + "</p>") + noteHtml(k) + "</div>";
  }
  function kpiBlock(t, full, nosum) {
    var ks = kpiData(t);
    if (!ks || !ks.length) return "";
    var order = { top: 0, good: 1, mid: 2, low: 3 };
    var pros = ks.filter(function (k) { return k.pro && (k.rt === "top" || k.rt === "good" || (k.id === "sz" && k.pro)); }).sort(function (a, b) { return (order[a.rt] == null ? 4 : order[a.rt]) - (order[b.rt] == null ? 4 : order[b.rt]); }).slice(0, 4);
    var cons = ks.filter(function (k) { return k.con && (k.rt === "low" || (k.rt === "mid" && k.id === "pe") || (k.id === "sz" && k.con)); }).slice(0, 4);
    var e = t.est || {};
    var li = function (a, c) { return a.length ? "<ul>" + a.map(function (k) { return "<li>" + esc(c === "p" ? k.pro : k.con) + "</li>"; }).join("") + "</ul>" : '<p class="meta">Nichts Auffälliges.</p>'; };
    var legendTxt = "Einstufung: sehr gut, gut, mittel, schwach. Pfeil: Entwicklung gegenüber früher, ▲ wird besser, ▼ wird schlechter (bei Wachstum: Tempo nimmt zu oder ab). Linie: Verlauf, rechts = neuester Wert.";
    return '<div class="box kbox' + (full ? "" : " compact") + '"><div class="boxtitle"><span>' + (full ? "Auf einen Blick: Zahlen einfach erklärt" : "Kennzahlen auf einen Blick") + '</span></div>' +
      (full ? '<div class="klegend">Einstufung: <span class="kc-chip c-top">sehr gut</span><span class="kc-chip c-good">gut</span><span class="kc-chip c-mid">mittel</span><span class="kc-chip c-low">schwach</span> · Pfeil: Entwicklung gegenüber früher, ▲ wird besser, ▼ wird schlechter (bei Wachstum: Tempo nimmt zu oder ab) · Linie: Verlauf, rechts = neuester Wert</div>' : "") +
      '<div class="kgrid">' + ks.map(function (k) { return kpiCard(k, !full); }).join("") + "</div>" +
      (nosum ? "" : '<div class="ksum"><div class="pro"><b>Das spricht dafür</b>' + li(pros, "p") + '</div><div class="con"><b>Das spricht dagegen</b>' + li(cons, "c") + "</div></div>") +
      '<div class="cap">' + (full ? "" : legendTxt + " ") + 'Die Stufen sind Faustregeln, keine Anlageberatung. Euro-Werte sind grob umgerechnet (1 € ≈ 1,16 US-$, 1,33 US-$ je £, 0,0067 US-$ je ¥); das Zeichen „≈" markiert umgerechnete Werte. Erwartungen: Durchschnitt der Analysten' + (e.analysts ? " (" + nf0.format(e.analysts) + " Schätzungen)" : "") + ", Stand " + date(e.as_of) + ". Ob eine Firma die Erwartungen je Quartal übertroffen oder verfehlt hat, liegt dem Radar nicht systematisch vor.</div></div>";
  }

  /* ---------- Liniendiagramm und Erwartungs-Charts ---------- */
  function lineSvg(series, labels, dashFrom) {
    var W = 420, H = 210, L = 40, R = 26, T = 16, B = 32, pw = W - L - R, ph = H - T - B, n = labels.length, all = [];
    series.forEach(function (s) { s.v.forEach(function (x) { if (num(x) != null) all.push(x); }); });
    if (!all.length || n < 2) return '<div class="nodata">keine Daten</div>';
    var mx = Math.max.apply(null, all.concat([0])), mn = Math.min.apply(null, all.concat([0]));
    if (mx === mn) mx = mn + 1;
    var pad = (mx - mn) * 0.1; mx += pad; if (mn < 0) mn -= pad;
    function X(i) { return L + pw * i / (n - 1); } function Y(v) { return T + ph * (1 - (v - mn) / (mx - mn)); }
    var out = '<svg class="gline" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Liniendiagramm">', k;
    for (k = 0; k <= 4; k++) { var gv = mn + (mx - mn) * k / 4, gy = Y(gv); out += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="ax" x="' + (L - 5) + '" y="' + (gy + 3.5) + '" text-anchor="end">' + nf0.format(gv) + " %</text>"; }
    if (mn < 0 && mx > 0) out += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    series.forEach(function (s, si) {
      var pts = [], i;
      for (i = 0; i < n; i++) if (num(s.v[i]) != null) pts.push([i, X(i), Y(s.v[i]), s.v[i]]);
      if (!pts.length) return;
      var solid = pts.filter(function (p) { return dashFrom == null || p[0] < dashFrom; }), dash = pts.filter(function (p) { return dashFrom != null && p[0] >= dashFrom - 1; });
      function path(a) { return a.map(function (p, j) { return (j ? "L" : "M") + p[1].toFixed(1) + " " + p[2].toFixed(1); }).join(" "); }
      if (solid.length > 1) out += '<path class="ln s' + si + '" d="' + path(solid) + '"/>';
      if (dashFrom != null && dash.length > 1) out += '<path class="ln est s' + si + '" d="' + path(dash) + '"/>';
      pts.forEach(function (p) { out += '<circle class="pt s' + si + (dashFrom != null && p[0] >= dashFrom ? " est" : "") + '" cx="' + p[1].toFixed(1) + '" cy="' + p[2].toFixed(1) + '" r="3"/>'; });
      var lp = pts[pts.length - 1];
      out += '<text class="vl s' + si + '" x="' + Math.min(W - R, lp[1]) + '" y="' + (lp[2] - 7 - (si % 2) * 0) + '" text-anchor="end">' + nf1.format(lp[3]) + " %</text>";
    });
    labels.forEach(function (lb, i) { if (n > 7 && (n - 1 - i) % 2) return; out += '<text class="lbl" x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(lb) + "</text>"; });
    return out + "</svg>";
  }
  /* ---------- Kurspotenzial-Band (Kachel) ---------- */
  function potTone(up) { return up == null ? "none" : up >= 40 ? "hi" : up >= 20 ? "good" : up >= 8 ? "mid" : up >= 0 ? "low" : "neg"; }
  function potBand(t) {
    var up = upside(t), p = t.potential || {}, l = t.last || {}, cur = t.currency;
    if (up == null || num(l.price) == null) return '<div class="t-pot pot-none"><span class="tp-lab">Kurspotenzial</span><span class="tp-na">kein Analystenziel</span></div>';
    var lo = num(p.low), hi = num(p.high), mean = p.mean, pr = l.price;
    var a = Math.min(lo != null ? lo : mean, pr, mean), b = Math.max(hi != null ? hi : mean, pr, mean), rg = (b - a) || 1;
    function pos(x) { return Math.max(0, Math.min(100, (x - a) / rg * 100)); }
    var rng = lo != null && hi != null ? '<i class="rng" style="left:' + pos(lo).toFixed(1) + "%;width:" + (pos(hi) - pos(lo)).toFixed(1) + '%"></i>' : "";
    var stale = p.as_of ? (Date.now() - new Date(p.as_of).getTime()) / 864e5 > 14 : true;
    return '<div class="t-pot pot-' + potTone(up) + (stale ? " pot-stale" : "") + '" title="Abstand vom heutigen Kurs zum durchschnittlichen Kursziel der Analysten"><div class="tp-row"><div class="tp-l"><span class="tp-lab">' + (stale ? "Kursziel (veraltet)" : "Bis zum Kursziel") + '</span><b class="tp-val">' + (up > 0 ? "+" : up < 0 ? "−" : "") + nf0.format(Math.abs(up)) + "\u00a0%" + '</b></div>' +
      '<div class="tp-r"><b>' + eu(mean - pr, cur, true) + '</b><span>je Aktie bis zum Ø-Ziel ' + eu(mean, cur) + "</span>" + (function () { var d = p.as_of ? Math.round((Date.now() - new Date(p.as_of).getTime()) / 864e5) : null; return '<span style="' + (d != null && d > 14 ? "color:var(--red);font-weight:700" : "") + '">Ziele: ' + (p.as_of ? date(p.as_of) + (d > 14 ? " · veraltet" : "") : "Datum unbekannt") + "</span>"; })() + (t.check_needed ? '<span style="color:var(--red);font-weight:700">Ursache prüfen</span>' : "") + "</div></div>" +
      '<div class="tp-bar">' + rng + '<i class="mk px" style="left:' + pos(pr).toFixed(1) + '%" title="Kurs heute"></i><i class="mk mn" style="left:' + pos(mean).toFixed(1) + '%" title="Ø-Ziel"></i></div>' +
      '<div class="tp-ends"><span>' + (lo != null ? "Tief " + eu(lo, cur) : "") + '</span><span class="lg"><i class="d1"></i>Kurs <i class="d2"></i>Ø-Ziel</span><span>' + (hi != null ? "Hoch " + eu(hi, cur) : "") + "</span></div></div>";
  }
  function expLines(t) {
    var g = t.growth, e = t.est;
    if (!g || !g.periods) return '<div class="t-exp"></div>';
    var m = growthMetrics(t), per = m.per, P = g.periods, unit = g.unit || "";
    var rc = P.revenue.length >= per ? sumN(P.revenue, 0, per) : null, nc = P.net_income.length >= per ? sumN(P.net_income, 0, per) : null;
    var l1 = '<div><b>Letzte 12 Mon.:</b> Umsatz ' + (rc != null ? euM(rc, unit) : "–") + " · Gewinn " + (nc != null ? euM(nc, unit) : "–") + "</div>";
    var l2 = "";
    if (e && e.rev && e.rev[4] > 0 && e.rev[5] > 0) {
      var lg = gOf(e.rev[4], e.rev[3]), eg = gOf(e.rev[5], e.rev[4]), eps = num(e.eps_last) > 0 && num(e.eps_cur) != null ? gOf(e.eps_cur, e.eps_last) : null, d = lg != null ? eg - lg : 0;
      l2 = '<div class="ex"><b>Analysten erwarten ' + esc(e.years && e.years[5] != null ? e.years[5] : "") + ':</b> Umsatz <span class="' + (eg >= 0 ? "pos" : "neg") + '">' + gSigned(eg) + "</span>" + (eps != null ? " · Gewinn/Aktie <span class=\"" + (eps >= 0 ? "pos" : "neg") + '">' + gSigned(eps) + "</span>" : "") +
        ' <span class="xa ' + (d >= 3 ? "up" : d <= -3 ? "down" : "flat") + '" title="Erwartetes Wachstum gegenüber dem zuletzt gemeldeten (' + (lg != null ? gSigned(lg) : "–") + ')">' + (d >= 3 ? "▲" : d <= -3 ? "▼" : "►") + "</span></div>";
    }
    return '<div class="t-exp">' + l1 + l2 + "</div>";
  }
  /* ---------- Links aus Texten zur Kachel ---------- */
  var aliasMap = null, aliasRe = null;
  function buildAlias() {
    aliasMap = {};
    var extra = { "besi-be-semiconductor": ["Besi", "BE Semiconductor"], "vh2-friedrich-vorwerk": ["Vorwerk", "Friedrich Vorwerk"], "wkl-wolters-kluwer": ["Wolters Kluwer", "Wolters"], "mpwr-monolithic-power": ["Monolithic Power", "Monolithic"], "isrg-intuitive-surgical": ["Intuitive Surgical", "Intuitive"], "hwm-howmet-aerospace": ["Howmet"], "bkng-booking-holdings": ["Booking"] };
    var stop = { Friedrich: 1, Intuitive: 1, Booking: 1 };
    function add(a, id) { if (!a || a.length < 3 || /^\d+$/.test(a)) return; [a, a.charAt(0).toUpperCase() + a.slice(1)].forEach(function (x) { if (!aliasMap[x]) aliasMap[x] = id; }); }
    theses.forEach(function (t) {
      var n = String(t.name || ""), s = n, prev;
      do { prev = s; s = s.replace(/[,\s]+(Inc\.?|Corp\.?|Corporation|plc|N\.V\.|SE|Co\.?|Holdings?|Group|Technologies|Pharmaceuticals|Industries)$/i, ""); } while (s !== prev);
      add(n, t.id); add(s, t.id);
      var fw = s.split(/\s+/)[0]; if (fw.length >= 4 && !stop[fw]) add(fw, t.id);
      if (/^[A-Z0-9.]{3,}$/.test(t.ticker || "")) add(t.ticker, t.id);
      (extra[t.id] || []).forEach(function (x) { add(x, t.id); });
    });
    var keys = Object.keys(aliasMap).sort(function (a, b) { return b.length - a.length; });
    aliasRe = keys.length ? new RegExp("(^|[^A-Za-z0-9ÄÖÜäöüß])(" + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")(s?)(?![A-Za-z0-9ÄÖÜäöüß])", "g") : null;
  }
  function linkify(txt) {
    txt = String(txt == null ? "" : txt);
    if (!aliasMap) buildAlias();
    if (!aliasRe) return esc(txt);
    var out = "", last = 0, m;
    aliasRe.lastIndex = 0;
    while ((m = aliasRe.exec(txt))) {
      var start = m.index + m[1].length, id = aliasMap[m[2]];
      if (!id) continue;
      out += esc(txt.slice(last, start)) + '<a href="#" class="xl" data-open-id="' + esc(id) + '" title="Zur Kachel springen">' + esc(m[2] + m[3]) + "</a>";
      last = start + m[2].length + m[3].length;
    }
    return out + esc(txt.slice(last));
  }
  function eSub() { return ""; }

  function tileChart(t) {
    if (prPts(t)) return '<div class="prmini big" aria-label="Kurs in Euro, 5 Jahre, gestrichelt: Aufnahme und Ø-Ziel">' + prSvg(t, "5y", false, 130) + "</div>";
    if (smallScr()) return "";
    if (!validSymbol(t.tv_symbol)) return '<div class="tvhost mini nochart"><div class="ph">kein Chart-Symbol</div></div>';
    return '<div class="tvhost mini" data-sym="' + esc(t.tv_symbol) + '" data-h="96"><div class="ph">Chart …</div></div>';
  }
  /* ---------- Kachel (einheitlich) ---------- */
  function tileTrend(t) {
    var h = slog(t), last = h.slice(-3);
    if (last.length < 2) return '<div class="t-sc" title="Der Score-Verlauf füllt sich mit jedem Lauf"><span class="lb">Score-Verlauf</span><span class="none">erster Messpunkt</span></div>';
    var cells = last.map(function (x, i) {
      var d = (x.date || "").slice(5).split("-").reverse().join(".") + (x.time ? " " + x.time : "");
      return (i ? '<span class="ar">›</span>' : "") + '<span class="sp" title="' + esc(d + ": " + (x.why || "")) + '"><b class="' + (x.score >= TH ? "up" : "eq") + '">' + x.score + "</b><small>" + esc(d) + "</small></span>";
    }).join("");
    var tot = last[last.length - 1].score - last[0].score;
    return '<div class="t-sc"><span class="lb">Score</span>' + cells + '<span class="tot">' + dlt(tot) + "</span></div>";
  }
  function shortSector(s) { var x = String(s || ""), i = x.indexOf(" ("); return (i > 2 ? x.slice(0, i) : x).trim(); }
  function tile(t) {
    var s = status(t), e = t.entry || {}, l = t.last || {}, pf = perf(t), up = upside(t), sc = scoreTotal(t), r = rankMap[t.id];
    var m = growthMetrics(t), g = t.growth;
    var kq = function (lab, val, cls, sub) { return '<div class="kp"><span>' + lab + '</span><b class="' + (cls || "") + '">' + val + "</b><i>" + (sub || "") + "</i></div>"; };
    var next = t.catalyst && t.catalyst.date ? date(t.catalyst.date) : "–";
    var ps = Array.isArray(t.pillars) ? t.pillars : [];
    return '<article class="tile ' + (s === "verletzt" ? "broken" : "") + '" data-card="' + esc(t.id) + '" data-open="' + esc(t.id) + '" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Details öffnen: ' + esc(t.name || t.ticker) + '">' +
      '<div class="t-head"><div class="t-id"><h3' + tipAttr(t) + '>' + logo(t) + esc(t.name || t.ticker) + '</h3><div class="meta" title="' + esc(t.sector || "") + '">' + esc(t.ticker) + (t.sector ? " · " + esc(shortSector(t.sector)) : "") + '</div></div>' +
      (sc == null ? '<div class="ring rc-none" style="--p:0"><span>–</span></div>' : '<div class="ring ' + ringClass(sc) + '" style="--p:' + sc + '" title="Radar-Score ' + sc + " von 100" + (r ? ", Rang " + r.rank + " von " + r.of : "") + '"><span data-count="' + sc + '">' + sc + "</span></div>") + "</div>" +
      verdictBadge(t) + '<div class="t-badges"><span class="badge b-' + s + '">' + s + "</span>" + (isHG(t) ? '<span class="tag hg" title="High Growth">High Growth</span>' : "") + (inDepot(t) ? '<span class="tag dp" title="Aktie liegt in deinem Depot">Depot</span>' : "") + ruleBadge(t) + (isAccel(t) ? '<span class="tag accel" title="Umsatzwachstum der letzten Periode mindestens 5 Punkte über dem Zwölf-Monats-Wert">▲ beschleunigt</span>' : "") + "</div>" +
      tileTrend(t) + potBand(t) + '<div class="t-kpis">' + kq("Kurs", l.price != null ? (t.currency === "EUR" || !FX[t.currency] ? nf2.format(l.price) + " " + esc(t.currency || "") : eu(l.price, t.currency)) : "–", "", l.price != null && t.currency !== "EUR" && FX[t.currency] ? nf2.format(l.price) + " " + esc(t.currency) : "") + kq("seit Aufnahme", pf != null ? pct(pf, true) : "–", pf == null ? "" : pf >= 0 ? "pos" : "neg", pf != null ? eu(l.price - e.price, t.currency, true) + " je Aktie" : "") + "</div>" +
      '<div class="t-acc">' + (m ? accRow("Umsatz", m.rev, g.annual.revenue, g.annual.years, g.unit) + accRow("Gewinn", m.ni, g.annual.net_income, g.annual.years, g.unit) : '<div class="acc na"><span class="as">Wachstumsdaten fehlen</span></div>') + "</div>" +
      expLines(t) + tileChart(t) + '<div class="t-foot"><span class="dots mini">' + ps.map(function (p) { return '<span class="dot ' + light(p) + '" title="' + esc((p.name || "Säule") + ": " + LIGHT_TEXT[light(p)]) + '"></span>'; }).join("") + '</span><span class="meta">Zahlen ' + next + '</span><span class="more">Details ›</span></div></article>';
  }

  /* ---------- Detailansicht (im Fenster) ---------- */
  function detail(t, longMode) {
    var s = status(t), e = t.entry || {}, l = t.last || {}, pf = perf(t), dd = num(e.drawdown_pct), up = upside(t);
    var ps = (Array.isArray(t.pillars) ? t.pillars : []).map(function (p) {
      var li = light(p);
      return '<tr><td><span class="dot ' + li + '" title="' + LIGHT_TEXT[li] + '"></span></td><td><b>' + esc(p.name) + "</b><br><span class='meta'>Regel: " + esc(p.rule) + "</span></td><td>" + esc(p.current || "unbekannt") + '<br><span class="meta">Stand ' + date(p.as_of) + (TREND[p.trend] ? " · Trend " + TREND[p.trend] : "") + "</span>" + link(p.source) + "</td></tr>";
    }).join("");
    var why = Array.isArray(t.why) && t.why.length ? '<div class="kv"><b>Warum interessant</b><ul class="plain">' + t.why.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>" : "";
    var log = Array.isArray(t.log) && t.log.length ? '<ul class="plain">' + t.log.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).map(function (x) {
      return "<li><span class='meta'>" + date(x.date) + "</span> " + esc(x.text) + link(x.source) + "</li>";
    }).join("") + "</ul>" : "";
    var cat = t.catalyst && (t.catalyst.event || t.catalyst.date) ? '<div class="next">Nächster Katalysator: ' + date(t.catalyst.date) + " " + esc(t.catalyst.event || "") + "</div>" : "";
    var bar = dd != null ? '<div><div class="bar" role="img" aria-label="Abstand zum 52-Wochen-Hoch beim Einstieg"><i style="width:' + Math.max(2, Math.min(100, 100 + dd)) + '%"></i></div><div class="barlabel"><span>Abstand zum Hoch bei Aufnahme</span><span>' + pct(dd) + "</span></div></div>" : "";
    var sec = function (title, body, open) { return body ? '<details class="sec"' + (open ? " open" : "") + "><summary>" + title + "</summary>" + body + "</details>" : ""; };
    var parts = scoreTable(t);
    var pillars = (ps ? '<table class="pillars">' + ps + "</table>" : "") + why +
      (t.valuation ? '<div class="kv"><b>Bewertung grob</b>' + esc(t.valuation) + "</div>" : "") +
      (t.counter ? '<div class="kv"><b>Stärkstes Gegenargument</b>' + esc(t.counter) + "</div>" : "") +
      (t.stop ? '<div class="kv"><b>Stop-Kriterium</b>' + esc(t.stop) + "</div>" : "") + trdRow(t);
    var anaLink = '<button type="button" class="anabtn" data-ana-go="' + esc(t.id) + '"><span>Ausführliche Analyse, Säulen und Score-Details</span><b aria-hidden="true">→</b></button>';
    var dsec = function (title) { var ss = t.deep && Array.isArray(t.deep.sections) ? t.deep.sections : [], i; for (i = 0; i < ss.length; i++) if (ss[i].title === title) return ss[i].text || ""; return ""; };
    var mrow = function (lab, txt, n) { txt = String(txt || "").trim(); if (!txt) return ""; n = n || 320; return '<div class="mi-r"><b>' + lab + "</b><span>" + esc(txt) + "</span></div>"; };
    var devs = (Array.isArray(t.log) ? t.log.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 3) : []).map(function (x) { return "<li><span class='meta'>" + date(x.date) + "</span> " + esc(x.text) + "</li>"; }).join("");
    var mobInfo = '<section class="mobinfo" aria-label="Unternehmen und Geschäftsmodell">' + mrow("Was das Unternehmen macht", t.about, 260) + mrow("Geschäftsmodell", dsec("Geschäftsmodell und Wettbewerb"), 360) +
      (devs ? '<div class="mi-r"><b>Entwicklungen</b><ul class="plain">' + devs + "</ul></div>" : "") + "</section>";
    var PL = PLAIN[t.id] || {}, uRow = function (lab, txt) { txt = String(txt || "").trim(); return txt ? '<div class="mi-r"><b>' + lab + "</b><span>" + esc(txt) + "</span></div>" : ""; };
    var ueber = verdictRow(t) + '<section class="mobinfo" aria-label="Überblick">' + uRow("Was das Unternehmen macht", PL.was || t.about) + uRow("Geschäftsmodell", dsec("Geschäftsmodell und Wettbewerb")) + uRow("Was ist mit dem Kurs passiert?", PL.kurs) + "</section>" + proCon(t) + compBlock(t) + anaLink;
    var mobRisk = (dsec("Risiken") || t.counter) ? '<section class="mobinfo" aria-label="Risiken">' + mrow("Risiken", dsec("Risiken"), 320) + mrow("Größtes Risiko", t.counter, 200) + "</section>" : "";
    if (longMode) return (t.about ? '<p class="about"><b>Was das Unternehmen macht:</b> ' + esc(t.about) + "</p>" : "") + deepBlock(t) + compBlock(t) + kpiBlock(t, true) + growthBlock(t, "margins") +
      sec("Säulen, Gründe und Stop-Kriterium", pillars, false) + sec("Score-Aufschlüsselung", parts, false) + sec("Score-Verlauf (letzte 20 Läufe)", scoreMini(t), false) + sec("Verlauf dieser These", log, false);
    var sc = scoreTotal(t);
    if (smallScr()) {
      var stopN = s === "verletzt" ? '<div class="kv" style="color:var(--red)"><b style="color:var(--red)">Vorsicht</b>Die Begründung für die Aufnahme gilt nicht mehr. Prüfe, ob du die Aktie weiter beobachten willst.</div>' : "";
      var panes = [
        ["Überblick", ueber + stopN + sec("Meine Notiz", journalBlock(t), false)],
        ["Kurs", chartBlock(t) + dropsFold(t, true) + momBlock(t)],
        ["Zahlen", growthBlock(t) + kpiBlock(t, true, true) + stairBlock(t) + previewBlock(t) + cat]
      ];
      return '<header class="d-head"><div><h2 id="dlg-title">' + logo(t) + esc(t.name || t.ticker) + '</h2><div class="meta">' + esc(t.ticker) + (t.sector ? " · " + esc(t.sector) : "") + '</div>' +
        '<div class="t-badges"><span class="badge b-' + s + '">' + s + "</span>" + (isHG(t) ? '<span class="tag hg">High Growth</span>' : "") + (isAccel(t) ? '<span class="tag accel">▲ beschleunigt</span>' : "") + "</div></div>" +
        (sc == null ? "" : scorePill(t)) + "</header>" +
        '<div class="dsec-wrap"><div class="dsec-nav" role="tablist" aria-label="Bereiche">' + panes.map(function (p, k) { return '<button type="button" role="tab" data-dsec="' + k + '" aria-selected="' + (k === 0) + '">' + p[0] + "</button>"; }).join("") + "</div>" +
        panes.map(function (p, k) { return '<div class="dsec' + (k === 0 ? " on" : "") + '" data-dpane="' + k + '" role="tabpanel">' + p[1] + "</div>"; }).join("") + "</div>";
    }

    return '<header class="d-head"><div><h2 id="dlg-title">' + logo(t) + esc(t.name || t.ticker) + '</h2><div class="meta">' + esc(t.ticker) + " · " + esc(t.index) + (t.sector ? " · " + esc(t.sector) : "") + '</div>' +
      '<div class="t-badges"><span class="badge b-' + s + '">' + s + "</span>" + (isHG(t) ? '<span class="tag hg">High Growth</span>' : "") + (isAccel(t) ? '<span class="tag accel">▲ beschleunigt</span>' : "") + "</div></div>" +
      (sc == null ? "" : scorePill(t)) + "</header>" + ueber +
      (s === "verletzt" ? '<div class="kv" style="color:var(--red)"><b style="color:var(--red)">Vorsicht</b>Die Begründung für die Aufnahme gilt nicht mehr. Prüfe, ob du die Aktie weiter beobachten willst.</div>' : "") +
      dropsFold(t) + '<div class="dgrid" style="grid-template-columns:1fr">' + chartBlock(t) + momBlock(t) + "</div>" + growthBlock(t) + kpiBlock(t) +
      '<div class="prices"><div><span>Kurs ' + date(l.date) + "</span><b>" + money(l.price, t.currency) + "</b>" + eSub(l.price, t.currency) + "</div><div><span>bei Aufnahme " + date(e.date) + "</span><b>" + money(e.price, t.currency) + "</b>" + eSub(e.price, t.currency) + "</div>" +
      (pf != null ? '<div><span>seitdem</span><b class="' + (pf >= 0 ? "pos" : "neg") + '">' + pct(pf, true) + "</b><small>" + eu(l.price - e.price, t.currency, true) + " je Aktie</small></div>" : "") +
      (up != null ? '<div><span>bis Ø-Ziel (' + eu(t.potential.mean, t.currency) + ')</span><b class="' + (up >= 0 ? "pos" : "neg") + '">' + pct(up, true) + "</b><small>" + eu(t.potential.mean - l.price, t.currency, true) + " je Aktie</small></div>" : "") + "</div>" + cat +
      '<div class="dgrid">' + stairBlock(t) + potBlock(t) + previewBlock(t) + "</div>" +
      sec("Meine Notiz", journalBlock(t), false);
  }

  /* Erklärtexte (.cap) in der Detailansicht werden zum ?-Tooltip neben der Überschrift; Quellenzeilen mit Link bleiben */
  function tidyDetail(root) {
    var map = [];
    Array.prototype.forEach.call(root.querySelectorAll(".cap"), function (c) {
      if (c.closest(".jr") || c.closest(".nodata")) return;
      var gc = c.closest(".gchart"), bx = c.closest(".box");
      var host = (gc && gc.querySelector(".gc-t")) || (bx && bx.querySelector(".boxtitle > span:first-child"));
      if (!host) return;
      var rec = null; map.forEach(function (r) { if (r.h === host) rec = r; });
      if (!rec) { rec = { h: host, t: [] }; map.push(rec); }
      var tx = c.textContent.replace(/\s+/g, " ").trim();
      if (tx && rec.t.indexOf(tx) < 0) rec.t.push(tx);
      var links = c.querySelectorAll("a");
      if (links.length) {
        var src = document.createElement("div"); src.className = "src"; src.appendChild(document.createTextNode("Quelle: "));
        Array.prototype.forEach.call(links, function (a, i) { if (i) src.appendChild(document.createTextNode(" · ")); src.appendChild(a.cloneNode(true)); });
        c.parentNode.replaceChild(src, c);
      } else c.parentNode.removeChild(c);
    });
    map.forEach(function (r) {
      if (!r.t.length) return;
      var q = document.createElement("span");
      q.className = "qm"; q.tabIndex = 0; q.setAttribute("role", "note"); q.setAttribute("aria-label", "Erklärung"); q.setAttribute("data-tip", r.t.join(" ")); q.setAttribute("data-tipt", "Erklärung"); q.textContent = "?";
      r.h.appendChild(q);
    });
  }
  /* Ausführliche Analysen: Langtexte je Aktie, erst beim Aufklappen gefüllt */
  function anaList() {
    var list = theses.slice().sort(function (a, b) { return (scoreTotal(b) || 0) - (scoreTotal(a) || 0) || String(a.name).localeCompare(String(b.name)); });
    return '<details class="mkt box" id="ana-all" style="padding:14px 16px"><summary><h2>Ausführliche Analysen</h2><span class="meta">' + list.length + ' Aktien, Texte, Säulen, Score-Details</span></summary><div style="margin-top:12px">' +
      list.map(function (t) {
        var sc = scoreTotal(t);
        return '<details class="fold ana" data-ana="' + esc(t.id) + '"><summary>' + esc(t.name || t.ticker) + ' <span class="meta">' + esc(t.ticker) + " · Score " + (sc == null ? "–" : sc) + '</span></summary><div class="ana-body"></div></details>';
      }).join("") + "</div></details>";
  }
  document.addEventListener("toggle", function (ev) {
    var d = ev.target;
    if (!d || !d.matches || !d.matches("details[data-ana]") || !d.open) return;
    var body = d.querySelector(".ana-body"), t = byIdMap[d.getAttribute("data-ana")];
    if (body && t && !body.getAttribute("data-f")) { body.innerHTML = detail(t, true); body.setAttribute("data-f", "1"); if (typeof armCharts === "function") armCharts(); if (typeof fx === "function") fx(); }
  }, true);

  /* ---------- Fenster: Kachel wächst in die Mitte, dreht sich einmal, zeigt Details ---------- */
  var modalOpen = false, lastFocus = null, dlgEl = null;
  var byIdMap = {};
  theses.forEach(function (t) { byIdMap[t.id] = t; });
  function openDetail(id, src) {
    var t = byIdMap[id];
    if (!t || modalOpen) return;
    modalOpen = true;
    lastFocus = document.activeElement;
    var r = src.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, small = vw < 700;
    var sat = 0;
    try { var pr = document.createElement("div"); pr.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top)"; document.body.appendChild(pr); sat = parseFloat(getComputedStyle(pr).paddingTop) || 0; document.body.removeChild(pr); } catch (e) { sat = 0; }
    var fw = small ? vw - 12 : Math.min(980, vw - 48), fh = small ? vh - 12 - sat : Math.min(vh - 40, 920);
    var fl = (vw - fw) / 2, ft = small ? 6 + sat : (vh - fh) / 2;
    var ov = document.createElement("div");
    ov.className = "ov";
    ov.innerHTML = '<div class="dpanel" role="dialog" aria-modal="true" aria-labelledby="dlg-title"><div class="spin">' +
      '<div class="face front"><div class="layer l-tile"></div></div>' +
      '<div class="face back"><div class="layer l-det"><button type="button" class="dclose" aria-label="Schließen">✕</button><div class="dscroll">' + detail(t) + "</div></div></div></div></div>";
    tidyDetail(ov);
    document.body.appendChild(ov);
    document.documentElement.classList.add("modal-open");
    var panel = ov.querySelector(".dpanel"), spin = ov.querySelector(".spin"), lt = ov.querySelector(".l-tile"), ld = ov.querySelector(".l-det"), fr = ov.querySelector(".face.front"), bk = ov.querySelector(".face.back");
    dlgEl = ov;
    /* Handy: Detailseite wegwischen (nach unten ziehen, wenn ganz oben, oder zur Seite) */
    (function () {
      var sc = ov.querySelector(".dscroll"), g = null;
      function hs(el) { while (el && el !== sc) { if (el.nodeType === 1 && el.scrollWidth > el.clientWidth + 2) { var ox = getComputedStyle(el).overflowX; if (ox === "auto" || ox === "scroll") return true; } el = el.parentNode; } return false; }
      function reset() { panel.style.transition = "transform .2s ease, opacity .2s ease"; panel.style.transform = ""; panel.style.opacity = ""; setTimeout(function () { panel.style.transition = ""; }, 230); }
      ov.addEventListener("touchstart", function (ev) {
        g = null;
        if (!smallScr() || ev.touches.length !== 1 || !panel.classList.contains("done") || !sc) return;
        var q = ev.touches[0]; g = { x: q.clientX, y: q.clientY, top: sc.scrollTop <= 0, bot: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, h: hs(ev.target), dx: 0, dy: 0, mode: "" };
      }, { passive: true });
      ov.addEventListener("touchmove", function (ev) {
        if (!g) return;
        var q = ev.touches[0]; g.dx = q.clientX - g.x; g.dy = q.clientY - g.y;
        if (!g.mode) {
          if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) return;
          if (g.top && g.dy > 0 && g.dy > Math.abs(g.dx)) g.mode = "down";
          else if (g.bot && g.dy < 0 && -g.dy > Math.abs(g.dx)) g.mode = "up";
          else if (!g.h && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) g.mode = "side";
          else { g = null; return; }
        }
        if (g.mode === "down" && sc.scrollTop > 0) { g = null; reset(); return; }
        if (g.mode === "side") return;
        if (ev.cancelable) ev.preventDefault();
        var d = g.mode === "down" ? Math.max(0, g.dy) : Math.min(0, g.dy);
        panel.style.transition = "none";
        panel.style.transform = "translateY(" + d + "px)";
        panel.style.opacity = String(Math.max(0.35, 1 - Math.abs(d) / 520));
      }, { passive: false });
      function end() {
        if (!g || !g.mode) { g = null; return; }
        var d = g.mode === "side" ? g.dx : g.dy, lim = g.mode === "side" ? 50 : 120, mode = g.mode; g = null;
        if (mode === "side") {
          if (Math.abs(d) < lim) return;
          var tabs = Array.prototype.slice.call(ov.querySelectorAll("[data-dsec]")), cur = -1, i;
          tabs.forEach(function (b, k) { if (b.getAttribute("aria-selected") === "true") cur = k; });
          i = cur + (d < 0 ? 1 : -1);
          if (cur >= 0 && i >= 0 && i < tabs.length) { tabs[i].click(); sc.scrollTop = 0; }
          return;
        }
        if (Math.abs(d) < lim) { reset(); return; }
        panel.style.transition = "transform .18s ease-in, opacity .18s ease-in";
        panel.style.transform = "translateY(" + (d > 0 ? 1 : -1) * window.innerHeight + "px)";
        panel.style.opacity = "0";
        setTimeout(closeDetail, 150);
      }
      ov.addEventListener("touchend", end, { passive: true });
      ov.addEventListener("touchcancel", function () { if (g && g.mode) reset(); g = null; }, { passive: true });
    })();
    var scx = scoreTotal(t); panel.classList.add("tc-" + (scx == null ? "none" : ringClass(scx).slice(3)));
    var clone = src.cloneNode(true);
    clone.removeAttribute("data-card"); clone.removeAttribute("data-open"); clone.removeAttribute("tabindex"); clone.removeAttribute("role"); clone.classList.add("clone");
    clone.classList.remove("reveal", "in");
    lt.appendChild(clone);
    lt.style.width = r.width + "px"; lt.style.height = r.height + "px";
    function place(l, tp, w, h) { panel.style.left = l + "px"; panel.style.top = tp + "px"; panel.style.width = w + "px"; panel.style.height = h + "px"; }
    function finish() {
      place(fl, ft, fw, fh);
      // Ende der Drehung: flach schalten, damit Scrollen mit Maus, Touch und Tastatur sicher funktioniert
      spin.style.transform = "none"; bk.style.transform = "none"; fr.style.display = "none";
      bk.style.backfaceVisibility = "visible"; bk.style.webkitBackfaceVisibility = "visible";
      panel.classList.add("done");
      armCharts();
      Array.prototype.forEach.call(ld.querySelectorAll("[data-count]"), function (el) { el.textContent = el.getAttribute("data-count"); });
      var cb = ld.querySelector(".dclose"); if (cb) cb.focus({ preventScroll: true });
    }
    // Detailfläche hat feste Endgröße, damit während der Drehung nichts neu umbricht
    ld.style.width = fw + "px"; ld.style.height = fh + "px";
    if (REDUCE || !panel.animate) {
      place(fl, ft, fw, fh); ov.classList.add("show"); finish();
    } else {
      place(r.left, r.top, r.width, r.height);
      ov.classList.add("show");
      var D = 1000;
      var pa = panel.animate([{ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }, { left: fl + "px", top: ft + "px", width: fw + "px", height: fh + "px" }],
        { duration: D * 0.85, easing: "cubic-bezier(.45,.05,.2,1)", fill: "forwards" });
      fr.style.backfaceVisibility = "visible"; fr.style.webkitBackfaceVisibility = "visible"; bk.style.backfaceVisibility = "visible"; bk.style.webkitBackfaceVisibility = "visible";
      var sa = spin.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: D, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" });
      /* Seitenwechsel exakt bei 90° (dann steht die Karte quer): so sieht man nie die gespiegelte Rückseite der Kachel */
      try { fr.animate([{ opacity: 1 }, { opacity: 1, offset: 0.38 }, { opacity: 0, offset: 0.381 }, { opacity: 0 }], { duration: D, easing: "linear", fill: "forwards" }); bk.animate([{ opacity: 0 }, { opacity: 0, offset: 0.38 }, { opacity: 1, offset: 0.381 }, { opacity: 1 }], { duration: D, easing: "linear", fill: "forwards" }); } catch (x) { /* optional */ }
      sa.onfinish = function () {
        place(fl, ft, fw, fh);
        [sa, pa].forEach(function (a) { try { a.cancel(); } catch (x) { /* optional */ } });
        finish();
      };
    }
    ov.addEventListener("click", function (ev) { if (ev.target === ov) closeDetail(); });
    var cbtn = ov.querySelector(".dclose");
    cbtn.addEventListener("click", closeDetail);
    cbtn.addEventListener("touchend", function (ev) { ev.preventDefault(); closeDetail(); });
    // Wischen nach links schließt das Fenster (nicht, wenn man gerade eine breite Tabelle seitlich schiebt)
    function hScroll(el) {
      while (el && el !== ov) {
        if (el.nodeType === 1 && !el.classList.contains("dscroll") && el.scrollWidth > el.clientWidth + 2) {
          var ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        el = el.parentNode;
      }
      return false;
    }
    var sx = 0, sy = 0, st = 0, sok = false;
    ov.addEventListener("touchstart", function (ev) {
      if (ev.touches.length !== 1) { sok = false; return; }
      var q = ev.touches[0]; sx = q.clientX; sy = q.clientY; st = Date.now(); sok = !hScroll(ev.target);
    }, { passive: true });
    ov.addEventListener("touchend", function (ev) {
      if (!sok || !dlgEl) return; sok = false;
      var q = ev.changedTouches[0], dx = q.clientX - sx, dy = q.clientY - sy;
      /* Seitwärts wischen wechselt nur den Tab (oben), schließt nicht mehr */
    }, { passive: true });
  }
  function closeDetail() {
    if (!modalOpen || !dlgEl) return;
    var ov = dlgEl; dlgEl = null;
    ov.classList.add("out");
    var done = function () {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.documentElement.classList.remove("modal-open");
      modalOpen = false;
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* optional */ } }
    };
    if (REDUCE) done(); else setTimeout(done, 260);
  }
  window.radarSearchApi = {
    items: function () { return theses.map(function (t) { return { id: t.id, name: t.name || "", ticker: t.ticker || "", score: scoreTotal(t), extra: [t.index, t.sector, t.isin].filter(Boolean).join(" ") }; }); },
    open: function (id, rowEl) {
      var t = byIdMap[id]; if (!t || modalOpen) return;
      var host = document.createElement("div");
      host.innerHTML = tile(t);
      var el = host.firstChild, r = rowEl.getBoundingClientRect();
      el.style.cssText = "position:fixed;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + Math.max(r.height, 120) + "px;opacity:0;pointer-events:none;margin:0";
      document.body.appendChild(el);
      openDetail(id, el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 80);
    }
  };
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && modalOpen) { ev.preventDefault(); closeDetail(); return; }
    if (modalOpen && ev.key === "Tab" && dlgEl) {
      var f = Array.prototype.slice.call(dlgEl.querySelectorAll("button, a[href], summary, [tabindex]:not([tabindex='-1'])")).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && !modalOpen) {
      var tl = ev.target.closest && ev.target.closest(".tile[data-open], .dtile[data-open]");
      if (tl && ev.target === tl) { ev.preventDefault(); openDetail(tl.getAttribute("data-open"), tl); }
    }
  });
  document.addEventListener("click", function (ev) {
    var tl = ev.target.closest && ev.target.closest(".tile[data-open], .dtile[data-open]");
    if (tl && !modalOpen) { openDetail(tl.getAttribute("data-open"), tl); return; }
    var gm = ev.target.closest && ev.target.closest("[data-gm]");
    if (gm) {
      var box = gm.closest(".gbox");
      if (!box) return;
      box.setAttribute("data-gmode", gm.getAttribute("data-gm"));
      Array.prototype.forEach.call(box.querySelectorAll("[data-gm]"), function (b) { b.setAttribute("aria-pressed", String(b === gm)); });
    }
  });

  function empty(title, text) { return '<div class="empty"><b>' + esc(title) + "</b>" + esc(text) + "</div>"; }
  function group(title, list, emptyText, expanded) {
    return "<h2>" + esc(title) + ' <span class="count">' + list.length + "</span></h2>" +
      (list.length ? '<div class="grid tiles">' + list.slice().sort(byScore).map(function (t) { return tile(t); }).join("") + "</div>" : (emptyText ? empty("Nichts zu melden", emptyText) : ""));
  }
  // Läufe vom selben Tag: der später eingetragene zuerst
  function runsDesc() {
    return runs.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      return (b.r.date || "").localeCompare(a.r.date || "") || b.i - a.i;
    }).map(function (x) { return x.r; });
  }
  function lastRun() {
    return runsDesc()[0];
  }

  function noteBlock() {
    var r = runsDesc().filter(function (x) { return x.note && (Array.isArray(x.note.bullets) ? x.note.bullets.length : x.note.title); })[0];
    if (!r) return "";
    var n = r.note, b = Array.isArray(n.bullets) ? n.bullets : [];
    return '<details class="mkt box" style="padding:14px 16px"><summary><h2>Tagesnotiz</h2><span class="meta">' + date(r.date) + "</span></summary>" +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' +
      (n.title ? '<p class="mhead">' + linkify(n.title) + "</p>" : "") +
      (b.length ? '<ul class="plain" style="margin:0">' + b.map(function (x) { return "<li>" + linkify(x) + "</li>"; }).join("") + "</ul>" : "") + "</div></details>";
  }

  /* ---------- Markt-Tab: Lagebild, Markteinschätzung, Ampel, Tagesnotiz ---------- */
  var ABBR = /^(inc|corp|co|ltd|plc|ag|se|sa|nv|mio|mrd|bzw|ca|nr|vs|dr|prof|ggf|usw|etc|z|b|u|a|ev|tsd|rd)$/i;
  function split2(x, n) {
    x = String(x || "").replace(/\s+/g, " ").trim();
    if (x.length <= n) return [x, ""];
    var re = /[.!?](?=\s+[A-ZÄÖÜ0-9„"(])/g, m, cut = -1;
    while ((m = re.exec(x))) {
      var pre = x.slice(0, m.index).split(/[\s(]/).pop();
      if (/^\d+$/.test(pre) || ABBR.test(pre) || pre.length < 2) continue;
      if (m.index + 1 <= n) cut = m.index + 1; else break;
    }
    if (cut < 0) { var c = x.lastIndexOf("; ", n); if (c < n * 0.4) c = x.lastIndexOf(": ", n); if (c < n * 0.4) c = x.lastIndexOf(", ", n); cut = c >= n * 0.4 ? c + 1 : x.lastIndexOf(" ", n); }
    if (cut < 10) cut = n;
    return [x.slice(0, cut).trim(), x.slice(cut).trim()];
  }
  function ex(x, n) {
    var a = split2(x, n);
    if (!a[1]) return esc(a[0]);
    return '<span class="ex">' + esc(a[0]) + ' <button type="button" class="ex-b" aria-expanded="false">mehr</button><span class="ex-r" hidden> ' + esc(a[1]) + "</span></span>";
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".ex-b"); if (!b) return;
    var r = b.parentNode.querySelector(".ex-r"), open = r.hidden; r.hidden = !open; b.textContent = open ? "weniger" : "mehr"; b.setAttribute("aria-expanded", String(open));
  });
  function ageText(d, t) {
    var dt = d ? new Date(d + "T" + (t || "12:00") + ":00") : null; if (!dt || isNaN(dt)) return null;
    var h = (Date.now() - dt.getTime()) / 3600000;
    if (h < 0) return { t: "gerade eben", old: false };
    if (h < 1) return { t: "vor " + Math.max(1, Math.round(h * 60)) + " Min.", old: false };
    if (h < 72) { var wk = new Date().getDay(); return { t: "vor " + Math.round(h) + " Std.", old: h > ((wk === 0 || wk === 6 || wk === 1) ? 60 : 20) }; }
    return { t: "vor " + Math.round(h / 24) + " Tagen", old: true };
  }

  /* ---------- Geldfluss: Handelsvolumen und Fondsflüsse (recherchiert, Stand im Objekt) ---------- */
  var FLOWS = {
    asof: "2026-10-17",
    vol: { date: "2026-10-16", src: "Stock Market Watch (Stand 17.10.), Kursänderungen vom Handelstag", rows: [
      ["INTC", "Intel", 102.0, -5.8], ["NVDA", "Nvidia", 96.8, -1.4], ["CRWV", "CoreWeave", 85.4, -11.9], ["SPCX", "SpaceX (SPCX)", 72.0, -1.7], ["TSLA", "Tesla", 52.7, -2.1],
      ["AAPL", "Apple", 43.1, 0.4], ["NBIS", "Nebius", 31.1, -12.2], ["AMZN", "Amazon", 30.5, -1.9], ["ORCL", "Oracle", 30.5, -4.6], ["PLTR", "Palantir", 27.9, -7.2],
      ["MU", "Micron", 24.4, -5.6], ["AVGO", "Broadcom", 22.2, -4.5], ["MRNA", "Moderna", 19.7, -7.8], ["MSFT", "Microsoft", 18.8, -1.9], ["AMD", "AMD", 17.9, -6.0],
      ["META", "Meta Platforms", 16.9, -3.7], ["MRVL", "Marvell", 16.0, -5.6], ["TSM", "TSMC", 14.2, -2.3], ["GOOG", "Alphabet", 11.9, -2.3], ["SNDK", "Sandisk", 7.7, -6.8]
    ] },
    funds: { week: "Woche bis 14.10.", src: "Reuters / LSEG Lipper, 16.10", total: 13.01, rows: [
      ["Große Unternehmen (Large Cap)", 16.55], ["Breit gestreut (Multi Cap)", 2.12], ["Kleine Unternehmen (Small Cap)", 0.54], ["Mittlere Unternehmen (Mid Cap)", -0.65], ["Sektor Technologie", -5.21], ["Anleihenfonds", 6.45], ["Geldmarktfonds", -45.93]
    ], note: "Technologie-Fonds mit dem größten Wochenabfluss seit 24.6. (Sorge vor steigenden Schulden). Anleihenfonds zum 26. Mal in Folge mit Zuflüssen. Geldmarktfonds verlieren, nachdem sie in der Vorwoche +68,5 Mrd. $ hatten." },
    eu: { week: "Woche 5. bis 9.10. (Europa)", src: "ETF Express, 12.10", unit: "Mio. €", rows: [
      ["Versorger", 177.9], ["Rohstoffe und Materialien", 63.4], ["Informationstechnologie", 26.6], ["Immobilien", 22.3], ["Finanzwerte", -451.8], ["Energie", -108.5], ["Konsum (zyklisch)", -81.9]
    ], themes: [["Cybersecurity", 124.8], ["KI und Big Data", 48.1], ["China-Technologie", -45.6]], assets: [["Aktien-ETFs", 7260], ["Anleihen-ETFs", 3180], ["Gold", 366.5], ["Rohöl", -127.6]], note: "Größte Zuflüsse: Vanguard FTSE All-World (+801 Mio. €), Vanguard FTSE Global All-Cap (+418 Mio. €), iShares Core S&P 500 (+405 Mio. €)." },
    us: { week: "Woche 28.9. bis 2.10. (USA, älter)", src: "Trackinsight via ETF Central, KI-Zusammenfassung, bitte prüfen", unit: "Mio. $", rows: [
      ["Versorger", 1140], ["Kommunikation", 420.6], ["Gesundheit", 241.1], ["Immobilien", 186.1], ["Informationstechnologie", -1710], ["Finanzwerte", -990], ["Basiskonsum", -509.7]
    ], note: "Größte Abflüsse: iShares Semiconductor (SOXX, −1,46 Mrd. $), Krypto-Themen (−1,67 Mrd. $), US-Rüstung (−424 Mio. $). Größter Zufluss: Vanguard S&P 500 (VOO, +10,15 Mrd. $)." }
  };
  function flowPane() {
    var F = FLOWS, mine = {}; theses.forEach(function (t) { if (t.ticker) mine[String(t.ticker).split(/[.:]/)[0].toUpperCase()] = 1; });
    var nf = function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + nf1.format(Math.abs(v)); };
    var bars = function (rows, unit) {
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); })) || 1;
      return '<div class="fl-b">' + rows.map(function (r) {
        var w = Math.max(2, Math.abs(r[1]) / mx * 100), up = r[1] >= 0;
        return '<div class="fl-r"><span>' + esc(r[0]) + '</span><span class="fl-t"><i class="' + (up ? "up" : "dn") + '" style="width:' + w.toFixed(0) + '%"></i></span><b class="' + (up ? "up" : "dn") + '">' + nf(r[1]) + "</b></div>";
      }).join("") + '<p class="cap" style="margin:2px 0 0">Angaben in ' + unit + "</p></div>";
    };
    var v = F.vol, mxv = v.rows[0][2], down = v.rows.filter(function (r) { return r[3] <= -2; }).length;
    var vt = '<div class="fl-v">' + v.rows.map(function (r) {
      var inR = mine[r[0]] ? '<em class="fl-in" title="Aktie ist im Radar">Radar</em>' : "";
      return '<div class="fl-r"><span><b>' + esc(r[1]) + "</b> " + inR + '</span><span class="fl-t"><i class="vol" style="width:' + (r[2] / mxv * 100).toFixed(0) + '%"></i></span><b>' + nf1.format(r[2]) + ' Mio.</b><em class="' + (r[3] >= 0 ? "up" : "dn") + '">' + nf(r[3]) + " %</em></div>";
    }).join("") + "</div>";
    var age = ageText(F.asof, "12:00");
    return '<div class="fl"><h4>Meistgehandelte Aktien am ' + date(v.date).slice(0, 6) + "</h4>" + vt +
      '<p class="cap">' + down + " von " + v.rows.length + " Titeln fielen um mehr als 2 %. Viel Volumen bei fallendem Kurs heißt meist Verkaufsdruck, nicht Kaufinteresse. Das Volumen sagt nicht, wer kauft oder verkauft. Quelle: " + esc(v.src) + ". Nur der genannte Handelstag ist belegt.</p>" +
      "<h4>US-Fonds: wohin das Geld fließt (" + esc(F.funds.week) + ")</h4>" +
      '<p class="fl-sum"><b class="up">' + nf(F.funds.total) + " Mrd. $</b> in US-Aktienfonds insgesamt</p>" + bars(F.funds.rows, "Mrd. $") + '<p class="cap">' + esc(F.funds.note) + " Quelle: " + esc(F.funds.src) + ".</p>" +
      "<h4>ETFs nach Sektor (" + esc(F.eu.week) + ")</h4>" + bars(F.eu.rows, F.eu.unit) +
      '<div class="fl-2"><div><b>Themen</b>' + bars(F.eu.themes, F.eu.unit) + "</div><div><b>Anlageklassen</b>" + bars(F.eu.assets, F.eu.unit) + "</div></div>" +
      '<p class="cap">' + esc(F.eu.note) + " Quelle: " + esc(F.eu.src) + ".</p>" +
      '<details class="thm-src"><summary>US-ETFs nach Sektor (älter: ' + esc(F.us.week) + ")</summary>" + bars(F.us.rows, F.us.unit) + '<p class="cap">' + esc(F.us.note) + " Quelle: " + esc(F.us.src) + ".</p></details>" +
      '<details class="thm-src" open><summary>Was mit „Institutionellen“ gemeint ist</summary><div class="cap">Echte Käufe und Verkäufe von Großanlegern sind nicht täglich öffentlich. Öffentlich sind: Fonds- und ETF-Zuflüsse (wöchentlich, oben, eine Näherung für das Anlegergeld) und die 13F-Meldungen großer US-Investoren (nur vierteljährlich und mit bis zu 45 Tagen Verzögerung; die Meldungen zum 30.9. kommen bis etwa 16.11.). Aus den oben genannten Zahlen lässt sich nicht ableiten, was einzelne Institutionen tun.</div></details>' +
      '<p class="cap">Stand der Recherche: ' + date(F.asof).slice(0, 6) + (age ? ", " + age.t : "") + ". Die Daten werden bei jedem Lauf neu recherchiert; fehlt eine Quelle, bleibt der alte Stand mit Altersangabe stehen.</p></div>";
  }


  /* ---------- Ausblick auf den nächsten Handelstag (recherchiert, Stand im Objekt) ---------- */
  var OUTLOOK = {
    asof: "2026-10-18", time: "20:40", day: "Montag 19.10.",
    recap: "In der Woche bis Freitag 16.10. verlor der S&P 500 2,0 %, der Nasdaq 4,5 % und der Russell 2000 3,1 % (sechste Verlustwoche in Folge); nur der Dow legte 0,7 % zu. Chipwerte fielen 11,4 %, Technologie 7,7 %. Basiskonsum (+5,0 %), Energie (+4,9 %) und Gesundheit (+3,5 %) hielten.",
    expect: "Für Montag ist eine technische Erholung etwas wahrscheinlicher als ein weiterer Abverkauf: Chipwerte fielen acht Handelstage in Folge, der Angstindex VIX sprang am Freitag auf knapp 20 und Bitcoin blieb am Wochenende stabil. Das ist eine Einschätzung, keine Prognose. Echte Futures-Kurse gibt es erst ab Montag 0:00 Uhr. Ab Dienstag liefern Quartalszahlen (Netflix, SAP, Tesla, Texas Instruments, Lam Research, IBM, Intel) neue Richtung; die US-Notenbank hält sich bis 29.10. bedeckt.",
    signals: [
      ["up", "Der Angstindex VIX fiel nach Sprüngen wie am Freitag montags in 25 von 32 Fällen.", "Der VIX stieg am Freitag um 21,5 % auf 19,99, der größte Tagessprung seit 5.6. In 7 der 32 Fälle seit 1990 stieg er am Montag weiter (z. B. August 2015, Februar 2018, August 2024). Saisonal fällt der VIX von Ende Oktober bis Jahresende in 22 von 36 Jahren. Quelle: CoinDesk-Auswertung, 18.10."],
      ["n", "Bitcoin hält sich über 80.000 $ (rund 81.000 $): kein zusätzlicher Stress am Wochenende.", "Bitcoin handelt rund um die Uhr und gilt als Frühindikator für die Stimmung vor der Börsenöffnung. Die Bitcoin-Fonds hatten in der Woche Nettoabflüsse von rund 228 Mio. $."],
      ["n", "Futures: Der Handel öffnet erst Montag 0:00 Uhr (Sonntag 18 Uhr US-Ostküste), vorher gibt es keinen belastbaren Stand.", "Wer vor dem Montag-Handel prüfen will, schaut ab Mitternacht auf die Futures für S&P 500 und Nasdaq 100 und auf die Eröffnung in Asien (Hongkong ist am Montag wegen eines Feiertags geschlossen)."],
      ["dn", "Öl: Brent rund 106 $ (+70 % seit Jahresbeginn), Angriffe auf Tanker in der Straße von Hormus.", "Der Iran-Konflikt ist ungelöst, die USA schließen weitere Eskalation nicht aus. Dämpfend wirken die gesenkte IEA-Nachfrageprognose und weitere Freigaben strategischer Reserven. WTI lag bei rund 99 $."],
      ["dn", "Zinsen: 10-jährige US-Rendite 5,08 %, eine Zinserhöhung im Dezember ist zu rund 74 % eingepreist.", "Die Rendite lag am Mittwoch nach heißen Inflationsdaten bei 5,33 % (Hoch 5,36 %). Die Verbraucherpreise stiegen im September um 3,7 %, die Erzeugerpreise um 6,3 %. Die Fed ist bis 29.10. im Schweigen (Blackout), die Sitzung ist am 27. und 28.10. Wahrscheinlichkeit laut CME; andere Quellen nennen bis zu 92 %."],
      ["dn", "Marktbreite schwach: nur 28 % der S&P-500-Werte liegen über der 50-Tage-Linie.", "Am Freitag gab es an der Nasdaq rund siebenmal mehr neue Tiefs als neue Hochs. Nur 41 % der Werte liegen über der 200-Tage-Linie. Der Russell 2000 verlor die sechste Woche in Folge."],
      ["dn", "KI-Kredit: Anleihen von CoreWeave (2032) notieren unter 80 Cent, die Rendite liegt über 15 %.", "Die Kosten für Ausfallversicherungen auf KI-nahe Firmen erreichten neue Höchststände. Nvidia hält 2 Mrd. $ Eigenkapital und hat eine bedingte Kapazitätszusage über 6,3 Mrd. $ gegeben, aber keine unbedingte Schuldengarantie. TSMC und ASML meldeten dagegen starke Zahlen."]
    ],
    scen: [
      ["Technische Erholung", 52, "up", "Chips stabilisieren sich, der VIX fällt, die Rendite bleibt unter 5,1 %. Typisch nach acht Verlusttagen und einem VIX-Sprung."],
      ["Unruhig seitwärts", 36, "n", "Anleger warten auf die Zahlen ab Dienstag und auf die Fed. Der S&P 500 pendelt zwischen 7.610 und 7.736."],
      ["Weiterer Abverkauf", 22, "dn", "Neue Hormus-Meldungen, Rendite über 5,3 % oder neuer KI-Kreditstress. Unterstützung S&P 500: 7.610, Nasdaq 100: 28.612."]
    ],
    levels: "Marken: S&P 500 Unterstützung 7.610, Widerstand 7.736. Nasdaq 100 Unterstützung 28.612, Widerstand 29.580. Dow Widerstand 52.325. Quelle: Palma Futures, 18.10.",
    mon: [["04:00", "China: Wirtschaftswachstum 3. Quartal (Konsens 4,4 %), Industrie, Einzelhandel"], ["08:00", "Deutschland: Auftragseingang August"], ["16:00", "USA: NAHB-Wohnungsmarktindex"], ["tagsüber", "Norma Group (Strategie), Jefferies Investor Day; Hongkong geschlossen"]],
    week: [["Di 20.10.", "ZEW 11:05; GM, GE Aerospace, RTX vor US-Start; Netflix nach Schluss; Deutsche Börse 19:00"], ["Mi 21.10.", "SAP 22:05; Texas Instruments, Lam Research, IBM, Tesla (nach US-Schluss); Lagarde 18:00"], ["Do 22.10.", "Nestlé, Roche, BE Semiconductor, Nokia, Hermès; Procter & Gamble, Comcast, Lockheed Martin"], ["Fr 23.10.", "Einkaufsmanagerindizes (Euroraum 10:00, USA 15:45); American Express"], ["28./29.10.", "Fed-Zinsentscheid (28.10.), EZB (29.10.), Intel"]],
    risks: [
      ["KI-Finanzierung und Chip-Zahlen", 5, "Die Verkaufswelle kam aus Sorge, wie lange der KI-Ausbau läuft und ob er über Schulden bezahlt werden kann. Zahlen von TI, Lam Research, IBM, Intel und Tesla sind Prüfsteine."],
      ["Zinsen und Fed", 4, "Hohe Anleiherenditen belasten teure Wachstumsaktien. Eine Erhöhung im Dezember ist weitgehend eingepreist; die Fed entscheidet am 28.10."],
      ["Öl und Hormus", 4, "Neue Angriffe oder eine Eskalation im Iran-Konflikt treiben den Ölpreis und damit die Inflationssorge."],
      ["Schwache Marktbreite", 3, "Wenige Werte tragen den Index. Fällt der S&P 500 unter 7.610, droht technisch weiterer Druck."],
      ["Zahlen-Enttäuschung", 3, "Hohe Erwartungen bei SAP, Tesla, Netflix und IBM; Enttäuschungen werden bei der aktuellen Stimmung hart bestraft."],
      ["Konjunkturdaten", 2, "ZEW (Di) und Einkaufsmanagerindizes (Fr) können die Zins- und Wachstumssicht verschieben."]
    ],
    swot: {
      s: [["Gewinnwachstum", "Analysten erwarten für das 3. Quartal rund +30 % Gewinn bei US-Firmen, bei Technologie rund +58 % (LSEG)."], ["Große Werte gefragt", "US-Aktienfonds nahmen 13,0 Mrd. $ ein, davon 16,6 Mrd. $ in große Unternehmen."], ["Defensive trägt", "Basiskonsum, Energie und Gesundheit stützen die Indizes."]],
      w: [["Chips und Technologie", "Chipwerte −11,4 %, Technologie −7,7 % in einer Woche; Technologie-Fonds mit dem größten Abfluss seit Juni."], ["Schwache Breite", "Nur 28 % der Werte über der 50-Tage-Linie, kleine Werte sechs Wochen im Minus."], ["Inflation hoch", "Verbraucherpreise +3,7 %, Erzeugerpreise +6,3 %."]],
      o: [["Zinsentspannung", "Die 10-jährige Rendite sank vom Hoch 5,36 % auf 5,08 %."], ["Erholungsmuster", "Nach VIX-Sprüngen folgt oft ein ruhigerer Montag; Ende Oktober bis Jahresende ist saisonal meist ruhiger."], ["Starke Chip-Zahlen", "TSMC mit Rekordquartalsgewinn, ASML mit starken Zahlen: die Nachfrage ist laut Berichten intakt."]],
      t: [["KI-Finanzierung", "CoreWeave-Anleihen unter 80 Cent; Sorge um kreisförmige Geschäfte (Zulieferer finanzieren Kunden)."], ["Fed und Zinsen", "Erhöhung im Dezember zu rund 74 % eingepreist; Entscheid am 28.10."], ["Öl und Geopolitik", "Brent über 105 $, Tankerangriffe bei Hormus, ungelöster Iran-Konflikt."]]
    }
  };
  (function () {
    try {
      var el = document.getElementById("radar-markt"), mk = el ? JSON.parse(el.textContent) : null, o = mk && mk.outlook, f = mk && mk.flows;
      if (o && o.asof && o.day && o.recap && o.expect && o.signals && o.scen && o.risks && o.swot && o.swot.s && o.swot.w && o.swot.o && o.swot.t && o.mon && o.week) OUTLOOK = o;
      if (f && f.asof && f.vol && f.vol.rows && f.funds && f.funds.rows && f.eu && f.eu.rows && f.us && f.us.rows) FLOWS = f;
    } catch (e) { }
  })();
  /* ===== Crash-Radar und Backtest ===== */
  var CRASH = null, BT = null;
  try { var _c = document.getElementById("radar-crash"); CRASH = _c ? JSON.parse(_c.textContent) : null; } catch (e) { CRASH = null; }
  var LOGOS = {};
  try { var _lg = document.getElementById("radar-logos"); LOGOS = (_lg && JSON.parse(_lg.textContent)) || {}; } catch (e) { LOGOS = {}; }
  function logo(t) { var u = LOGOS[t.id]; if (u) return '<img class="flogo" alt="" src="' + u + '">'; var n = String(t.name || t.ticker || "?").replace(/[^A-Za-z0-9]/g, ""); return '<span class="flogo mono" aria-hidden="true">' + esc(n.slice(0, 1).toUpperCase()) + "</span>"; }
  try { var _b = document.getElementById("radar-backtest"); BT = _b ? JSON.parse(_b.textContent) : null; } catch (e) { BT = null; }
  var CR_LAB = {
    trend_spx: ["Trendbruch S&P 500", "S&P 500 schließt den Monat unter seiner 10-Monats-Linie."],
    trend_ndx: ["Trendbruch Nasdaq 100", "Nasdaq 100 schließt den Monat unter seiner 10-Monats-Linie."],
    curve_inv: ["Zinskurve invertiert", "Die 10-jährige US-Rendite liegt unter der 3-monatigen."],
    curve_un: ["Zinskurve nach Inversion wieder normal", "In den letzten 18 Monaten war die Kurve invertiert, jetzt ist sie wieder normal. Historisch folgten Rezessionen oft erst in dieser Phase."],
    rate_shock: ["Zinsschock", "Die 10-jährige Rendite stieg in 12 Monaten um 1,5 Punkte oder mehr."],
    vix_high: ["Angst hoch (VIX ab 25)", "Der Volatilitätsindex VIX schließt den Monat bei 25 oder höher."],
    vix_jump: ["Angst springt (VIX +60 %)", "Der VIX liegt 60 % über seinem Tief der letzten 6 Monate."],
    hot_ndx: ["Überhitzung Nasdaq 100", "Nasdaq 100 20 % über der 10-Monats-Linie oder +60 % in 12 Monaten."],
    hot_spx: ["Überhitzung S&P 500", "S&P 500 +30 % in 12 Monaten."],
    mom_break: ["Momentum-Bruch", "S&P 500 in 3 Monaten −8 % oder mehr."]
  };
  var crLvl = { gruen: ["Grün", "up"], gelb: ["Gelb", "warn"], rot: ["Rot", "down"] };
  function cnt(v, dec, suf, pre) { var t = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); return '<b class="cnt" data-cnt="' + v + '" data-dec="' + (dec || 0) + '" data-suf="' + esc(suf || "") + '" data-pre="' + esc(pre || "") + '">' + esc((v < 0 ? "−" : (pre || "")) + t + (suf || "")) + "</b>"; }
  function crashHtml() {
    var C = CRASH; if (!C || !C.now || !Array.isArray(C.signals)) return "";
    var n = C.now, L = crLvl[n.level] || ["–", "n"], lv = (C.levels || {})[n.level] || {}, base = C.signals[0] ? C.signals[0].p_base : null;
    var act = C.signals.filter(function (s) { return s.active; });
    var gauge = '<div class="crg crg-' + esc(n.level || "") + '"><div class="crg-t"><i style="width:' + Math.max(2, Math.min(100, n.composite || 0)) + '%"></i><em style="left:20%"></em><em style="left:45%"></em></div><div class="crg-l"><span>0</span><span style="margin-left:6%">Gelb ab 20</span><span>Rot ab 45</span><span>100</span></div></div>';
    var sgn = function (v) { return (v < 0 ? "−" : "") + nf1.format(Math.abs(v)); };
    var tr = function (x, nm) { if (!x) return ""; var d = (x.last / x.ma200 - 1) * 100; return '<div class="mkv-k ' + (x.above200 ? "up" : "down") + '"><span>' + nm + "</span><b>" + (d >= 0 ? "+" : "−") + nf1.format(Math.abs(d)) + ' %</b><em>' + (x.above200 ? "über" : "unter") + " Ø 200 Tage</em></div>"; };
    var rs = (C.rules || {}).ndx || {}, rp = (C.rules || {}).spx || {};
    var stay = !(C.signals.filter(function (s) { return s.id === "trend_spx" || s.id === "trend_ndx"; }).some(function (s) { return s.active; }));
    var sigRows = C.signals.slice().sort(function (a, b) { return (b.lift || 0) - (a.lift || 0); }).map(function (s) {
      var lb = CR_LAB[s.id] || [s.id, ""], cls = (s.lift || 0) >= 1.5 ? "up" : (s.lift || 0) < 1 ? "down" : "n";
      var tip = lb[1] + " Danach fiel der S&P 500 in " + nf1.format(s.p_severe) + " % der Monate innerhalb von 12 Monaten um 15 % oder mehr (alle Monate: " + nf1.format(s.p_base) + " %), um 25 % oder mehr in " + nf1.format(s.p_crash) + " %. Aktiv in " + s.months_active + " Monaten, " + s.false_alarms + " von " + s.alarms + " Signalbeginnen ohne Rückgang von 15 % (Fehlalarme).";
      return '<div class="crl' + (s.active ? " on" : "") + '"><span class="crl-n">' + esc(lb[0]) + mxQ(tip, lb[0]) + (s.active ? ' <span class="badge b-verletzt">aktiv</span>' : "") + '</span><b class="lf ' + cls + '">' + (s.lift == null ? "–" : nf1.format(s.lift) + "×") + '</b><span class="crl-w">' + s.bears_warned + "/" + s.bears + "</span></div>";
    }).join("");
    var epRows = (C.episodes || []).map(function (e) {
      var w = Object.keys(e.sig || {}).filter(function (k) { return e.sig[k].lead != null; }).sort(function (a, b) { return e.sig[b].lead - e.sig[a].lead; }).map(function (k) { return (CR_LAB[k] || [k])[0] + " " + e.sig[k].lead + " Mon."; });
      return '<div class="cre"><b>' + esc(e.peak.split("-").reverse().join("/")) + '</b><span class="neg">' + sgn(e.depth) + " %</span><span class='meta'>" + e.months + " Mon. bis zum Tief</span><p>" + (w.length ? "Vorwarnung: " + esc(w.join(", ")) : "Keine Vorwarnung in den 12 Monaten davor") + "</p></div>";
    }).join("");
    var hist = (C.history || []).filter(function (x) { return x[1] != null; }), spark = "";
    if (hist.length > 5) {
      var W2 = 320, H2 = 64, pts = hist.map(function (x, i) { return (i / (hist.length - 1) * W2).toFixed(1) + "," + (H2 - x[1] / 100 * H2).toFixed(1); }).join(" ");
      spark = '<svg class="crs" viewBox="0 0 ' + W2 + " " + H2 + '" preserveAspectRatio="none"><line x1="0" x2="' + W2 + '" y1="' + (H2 - 0.45 * H2) + '" y2="' + (H2 - 0.45 * H2) + '" class="cr-rot"/><line x1="0" x2="' + W2 + '" y1="' + (H2 - 0.2 * H2) + '" y2="' + (H2 - 0.2 * H2) + '" class="cr-gelb"/><polyline points="' + pts + '" pathLength="1"/></svg><div class="crg-l"><span>' + esc(hist[0][0].slice(0, 4)) + "</span><span>Gesamtindex der letzten 10 Jahre</span><span>" + esc(hist[hist.length - 1][0].slice(0, 4)) + "</span></div>";
    }
    return '<section class="box mx mo" id="mkc"><div class="mk-h"><h2>Crash-Radar</h2><span class="mood m-' + (n.level === "rot" ? "negativ" : n.level === "gelb" ? "vorsichtig" : "positiv") + '">' + L[0] + "</span></div>" +
      '<p class="mkv-p">Gesamtindex <b class="cnt" data-cnt="' + (n.composite || 0) + '">' + (n.composite || 0) + "</b> von 100. In Monaten mit diesem Stand fiel der S&P 500 in den 12 Monaten danach in " + (lv.p_severe == null ? "–" : nf1.format(lv.p_severe)) + " % der Fälle um 15 % oder mehr" + (base != null ? " (in allen Monaten: " + nf1.format(base) + " %)" : "") + ". " + (act.length ? "Aktiv: " + esc(act.map(function (s) { return (CR_LAB[s.id] || [s.id])[0]; }).join(", ")) + "." : "Kein Signal aktiv.") + mxQ("Zehn Warnsignale aus S&P 500, Nasdaq 100, VIX und Zinskurve, jeweils gewichtet danach, wie oft ihnen seit 1985 ein schwerer Rückgang folgte. Die Gewichte stammen nur aus Daten, die zum jeweiligen Zeitpunkt schon bekannt waren. " + (C.source || "") + ". Kleine Stichprobe (7 Rückgänge ab 15 %), Monatsschlüsse, keine Prognose.", "Wie der Crash-Radar rechnet") + "</p>" + gauge +
      '<div class="mkv-kp">' + tr(n.spx, "S&P 500") + tr(n.ndx, "Nasdaq 100") + '<div class="mkv-k ' + (n.curve != null && n.curve < 0 ? "down" : "n") + '"><span>Zinskurve</span><b>' + (n.curve == null ? "–" : (n.curve >= 0 ? "+" : "−") + nf1.format(Math.abs(n.curve))) + "</b><em>10 J. minus 3 Mon.</em></div></div>" +
      '<div class="mkv-trig"><b>Ausstiegsregel mit Beleg</b><ul><li>Regel: Aussteigen, wenn der Index einen Monat unter seiner 10-Monats-Linie schließt; wieder einsteigen, wenn er darüber schließt.</li>' +
      (rs.trend ? "<li>Nasdaq 100 seit " + esc((rs.trend.from || "").slice(0, 4)) + ": " + nf1.format(rs.trend.cagr) + " % pro Jahr statt " + nf1.format(rs.hold.cagr) + " %, größter Verlust " + sgn(rs.trend.maxdd) + " % statt " + sgn(rs.hold.maxdd) + " % (" + rs.trend.trades + " Wechsel).</li>" : "") +
      (rp.trend ? "<li>S&P 500: " + nf1.format(rp.trend.cagr) + " % statt " + nf1.format(rp.hold.cagr) + " % pro Jahr, größter Verlust " + sgn(rp.trend.maxdd) + " % statt " + sgn(rp.hold.maxdd) + " %.</li>" : "") +
      "<li><b style='display:inline;text-transform:none;letter-spacing:0;color:var(--" + (stay ? "green" : "red") + ")'>Heute: " + (stay ? "investiert bleiben" : "Ausstiegssignal") + "</b>, beide Indizes " + (stay ? "über" : "teils unter") + " der Linie.</li></ul></div>" +
      '<details class="thm-src"><summary>Historische Belege: Signale und Bärenmärkte seit 1985</summary>' + spark +
      '<h4 class="mx-h4">Signale nach Aussagekraft</h4><div class="crl crl-h"><span>Signal</span><b>Stärke</b><span class="crl-w">Vorwarnung</span></div>' + sigRows +
      '<p class="cap">Stärke: Wie viel häufiger als im Durchschnitt folgte dem Signal ein Rückgang von 15 % oder mehr (ab 1,5× brauchbar, unter 1× kein Warnsignal). Vorwarnung: in den 12 Monaten vor dem Hoch eines Bärenmarkts aktiv. Details im Fragezeichen.</p>' +
      '<h4 class="mx-h4">Rückgänge ab 15 % seit 1985</h4><div class="cres">' + epRows + "</div>" +
      '<p class="cap">Stand ' + esc(C.asof || "") + '. Kurs-Indizes ohne Dividenden, Monatsschlüsse (der Crash 1987 erscheint daher kleiner als im Tagesverlauf). Keine Prognose und keine Handlungsempfehlung.</p></details></section>';
  }
  function btHtml() {
    var B = BT; if (!B || !B.counts) return "";
    var c = B.counts, a = c.aufnahme || {}, x = c.ausstieg || {}, ic = B.ic || {}, cal = B.calibration || {};
    var icTxt = ic.total == null ? "noch nicht berechenbar" : (ic.total >= 0.1 ? "höhere Scores liefen bisher besser" : ic.total <= -0.1 ? "höhere Scores liefen bisher schlechter" : "kein klarer Zusammenhang");
    var parts = Object.keys(ic.parts || {}).map(function (k) { var v = ic.parts[k]; return v.ic == null ? "" : '<div class="bt-p"><span>' + esc(k) + '</span><span class="bt-bar"><i class="' + (v.ic >= 0 ? "up" : "dn") + '" style="--w:' + Math.min(50, Math.abs(v.ic) * 50).toFixed(0) + '%;' + (v.ic >= 0 ? "left:50%" : "right:50%") + '"></i></span><b class="' + (v.ic >= 0 ? "pos" : "neg") + '">' + (v.ic >= 0 ? "+" : "−") + nf1.format(Math.abs(v.ic) * 100) + "</b></div>"; }).join("");
    var wrong = (B.decisions || []).filter(function (d) { return d.verdict === "falsch" && d.causes; }).slice(0, 6).map(function (d) {
      return '<li><b>' + esc(d.ticker) + "</b> " + (d.excess >= 0 ? "+" : "−") + nf1.format(Math.abs(d.excess)) + " % ggü. Index: " + esc(d.causes.join(" ")) + (d.lessons && d.lessons.length ? " <span class='meta'>" + esc(d.lessons.join(" ")) + "</span>" : "") + "</li>";
    }).join("");
    var bands = (B.bands || []).map(function (b) { return '<div class="mkv-k ' + (b.excess >= 0 ? "up" : "down") + '"><span>Score ' + esc(b.band.replace(" bis ", "–")) + "</span><b>" + (b.excess >= 0 ? "+" : "−") + nf1.format(Math.abs(b.excess)) + " %</b><em>" + b.hit + " % · n " + b.n + "</em></div>"; }).join("");
    return '<section class="box mx mo bt" id="btx"><div class="mk-h"><h2>Backtest: Wie gut war die Auswahl?</h2><span class="meta">Stand ' + date(B.asof).slice(0, 6) + "</span></div>" +
      (B.basis && /vorläufig/.test(B.basis) ? '<p class="bt-warn">Vorläufig: Die Thesen sind im Schnitt erst ' + B.avg.days + " Tage alt. Aussagekräftig wird der Backtest nach 13 Wochen Haltedauer und ab 30 ausgewerteten Aufnahmen; bis dahin ändert er nichts am Score.</p>" : "") +
      '<div class="mkv-kp"><div class="mkv-k ' + (B.avg.ret >= 0 ? "up" : "down") + '"><span>Ø Rendite</span>' + cnt(B.avg.ret, 1, " %", B.avg.ret > 0 ? "+" : "") + '<em>seit Aufnahme</em></div><div class="mkv-k ' + (B.avg.excess >= 0 ? "up" : "down") + '"><span>Ø gegen Index</span>' + cnt(B.avg.excess, 1, " %", B.avg.excess > 0 ? "+" : "") + '<em>vs. Index</em></div><div class="mkv-k n"><span>Thesen</span>' + cnt(c.theses, 0) + "<em>" + B.avg.days + " Tage im Schnitt</em></div></div>" +
      '<div class="bt-v"><div><b>Aufnahmen</b><span class="pos">' + (a["richtig"] || 0) + ' richtig</span><span class="neg">' + (a["falsch"] || 0) + ' falsch</span><span class="meta">' + (a["zu früh"] || 0) + ' zu früh</span></div><div><b>Ausstiege</b><span class="pos">' + (x["richtig"] || 0) + ' richtig</span><span class="neg">' + (x["falsch"] || 0) + ' falsch</span><span class="meta">' + (x["zu früh"] || 0) + ' zu früh</span></div><div><b>Ablehnungen</b><span class="meta">' + c.ablehnung_messbar + " von " + c.ablehnung_gesamt + " messbar</span></div></div>" +
      '<h4 class="mx-h4">Funktioniert der Score?</h4><p class="mkv-p">Rangkorrelation Score zu Überrendite: <b>' + (ic.total == null ? "–" : nf1.format(ic.total * 100) + " von 100") + "</b> (" + icTxt + ", n = " + (ic.n || 0) + ")." + mxQ("Spearman-Rangkorrelation (IC) zwischen dem Score bei Aufnahme und der Rendite gegenüber dem Index. Ab etwa +10 gilt ein Score in der Praxis als nützlich; belastbar ist der Wert erst mit vielen ausgewerteten Thesen (t-Wert ab 2).", "IC") + "</p>" +
      (bands ? '<div class="mkv-kp">' + bands + "</div>" : "") + (parts ? '<div class="bt-ps"><div class="bt-p bt-h"><span>Teilnote</span><span>schlechter ← → besser</span><b>IC</b></div>' + parts + "</div>" : "") +
      '<div class="mkv-trig"><b>Score-Anpassung</b><ul><li>' + esc(cal.reason || "") + "</li>" + (cal.threshold ? "<li>" + esc(cal.threshold) + "</li>" : "") + (cal.regime_rule ? "<li>" + esc(cal.regime_rule) + "</li>" : "") + "</ul></div>" +
      (wrong ? '<details class="thm-src"><summary>Falsche Entscheidungen und Ursachen</summary><ul class="mk-l">' + wrong + "</ul></details>" : "") + "</section>";
  }
  /* ===== Bewegung: Zählen, Balken, Linien beim Erscheinen ===== */
  (function () {
    var red = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function countUp(el) {
      if (el.__done) return; el.__done = 1;
      var v = parseFloat(el.getAttribute("data-cnt")), dec = +el.getAttribute("data-dec") || 0, suf = el.getAttribute("data-suf") || "", pre = el.getAttribute("data-pre") || "";
      if (isNaN(v) || red) return;
      var fmt = function (x) { return (v < 0 ? "−" : pre) + Math.abs(x).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; };
      var t0 = null, dur = 900;
      function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(v * e); if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(v); }
      el.textContent = fmt(0); requestAnimationFrame(step);
    }
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; var t = e.target; io.unobserve(t); t.classList.add("on"); if (t.classList.contains("cnt")) countUp(t); t.querySelectorAll && Array.prototype.forEach.call(t.querySelectorAll(".cnt"), countUp); });
    }, { threshold: 0.15 }) : null;
    function scan(root) {
      var els = (root || document).querySelectorAll(".mo:not(.mo-w), .cnt:not(.mo-w), .mkv-kp:not(.mo-w), .rks:not(.mo-w), .scn:not(.mo-w), .fl:not(.mo-w)");
      Array.prototype.forEach.call(els, function (el) { el.classList.add("mo-w"); if (io) io.observe(el); else { el.classList.add("on"); if (el.classList.contains("cnt")) countUp(el); } });
    }
    var pend = 0;
    new MutationObserver(function () { if (pend) return; pend = requestAnimationFrame(function () { pend = 0; scan(); }); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", function () { scan(); });
    setTimeout(scan, 400);
  })();
  function mxQ(detail, title) { return detail ? '<span class="qm mx-q" tabindex="0" role="note" aria-label="Details" data-tip="' + esc(detail) + '" data-tipt="' + esc(title || "Details") + '">?</span>' : ""; }
  document.addEventListener("click", function (ev) {
    var q = ev.target.closest && ev.target.closest("[data-tip]");
    if (q) { tipShow(q); ev.stopPropagation(); return; }
    tipHide();
  }, true);
  function mxFirst(x) { var a = split2(x, 150); return a[0]; }
  function marktHead() {
    var out = "", r = runsDesc().filter(function (x) { return x.market; })[0], m = r ? r.market : null;
    if (!m) return "";
    var today = new Date().toISOString().slice(0, 10), F = FLOWS;
    var oAge = ageText(OUTLOOK.asof, OUTLOOK.time), rAge = ageText(r.date, r.time);
    var nf = function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + nf1.format(Math.abs(v)); };
    /* KI-Ampel kompakt */
    var aw = aiWarn(), awOut = "", awLvl = "";
    if (aw) {
      var d = document.createElement("div"); d.innerHTML = aw; var sec = d.firstChild;
      if (sec && sec.querySelectorAll) {
        awLvl = (/aw-(rot|gelb|gruen)/.exec(sec.className) || [])[1] || "";
        var rows = sec.querySelectorAll(".aw-r"), cap = sec.querySelector(".cap"), more = document.createElement("details"), sm = document.createElement("summary");
        more.className = "aw-more"; sm.textContent = "Weitere Werte und Grundlage"; more.appendChild(sm);
        Array.prototype.forEach.call(rows, function (x, i) { if (i >= 2) more.appendChild(x); });
        if (cap) { more.appendChild(cap); var c2 = document.createElement("p"); c2.className = "cap"; c2.textContent = "Zeigt erhöhtes Risiko für deinen KI- und Chip-Block. Keine Prognose und keine Handlungsempfehlung."; sec.appendChild(c2); }
        if (more.children.length > 1) sec.appendChild(more);
        awOut = sec.outerHTML;
      }
    }
    var evAll = Array.isArray(m.events) ? m.events.slice() : [];
    var up = evAll.filter(function (e) { return e.date && e.date >= today && e.status !== "vorbei"; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.time || "").localeCompare(String(b.time || "")); });
    var past = evAll.filter(function (e) { return up.indexOf(e) < 0; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var er = termsRows(relTheses(), 30);
    var moodW = ["positiv", "vorsichtig", "negativ", "neutral"].indexOf(m.mood) >= 0 ? m.mood : "neutral";
    var kall = (m.kpis || []).filter(function (k) { return k.label !== "Stimmung" && k.label !== "Nächster Termin"; });
    var chgOf = function (k) { var sub = String(k.sub || ""); return (/^[+−\-]\d[\d.,]*\s?(%|Punkte)/.exec(sub) || [""])[0]; };
    var tech = F.funds.rows.filter(function (x) { return /Technologie/.test(x[0]); })[0];
    var bars = function (rows2, unit) {
      var mx = Math.max.apply(null, rows2.map(function (q) { return Math.abs(q[1]); })) || 1;
      return rows2.map(function (q) { var w = Math.max(2, Math.abs(q[1]) / mx * 100), u = q[1] >= 0; return '<div class="fl-r"><span>' + esc(q[0]) + '</span><span class="fl-t"><i class="' + (u ? "up" : "dn") + '" style="width:' + w.toFixed(0) + '%"></i></span><b class="' + (u ? "up" : "dn") + '">' + nf(q[1]) + "</b></div>"; }).join("") + '<p class="cap" style="margin:2px 0 0">Angaben in ' + unit + "</p>";
    };
    /* 1. Urteil */
    var VERD = OUTLOOK.verdict || m.headline || "";
    var want = [["S&P 500", "S&P 500"], ["Nasdaq Composite", "Nasdaq"], ["VIX", "VIX"], ["US-Zins 10 Jahre", "Zins 10 J."], ["Ölpreis Brent", "Brent"], ["Zinserhöhung Dez.", "Fed Dez."]];
    var kstrip = want.map(function (w) {
      var k = kall.filter(function (x) { return x.label === w[0]; })[0]; if (!k) return "";
      var tn = ["up", "down", "warn"].indexOf(k.tone) >= 0 ? k.tone : "n", ch = chgOf(k), rest = String(k.sub || "").slice(ch.length).replace(/^\s*[·(]?\s*/, "").replace(/\)\s*$/, "");
      return '<div class="mkv-k ' + tn + '"><span>' + esc(w[1]) + "</span><b>" + esc(k.value) + "</b><em>" + (ch ? esc(ch) : "&nbsp;") + "</em></div>";
    }).join("");
    var nxt = up.slice(0, 3).map(function (e) { var tip = [e.expectation, e.why, e.effect].filter(Boolean).join(" "); return "<li><b>" + date(e.date).slice(0, 6) + "</b><span>" + esc(e.name) + mxQ(tip, e.name) + "</span></li>"; }).join("");
    out += '<section class="box mx mkv-hero" id="mks"><div class="mk-h"><h2>Urteil</h2><span class="mood m-' + moodW + '">' + esc(m.mood || "neutral") + "</span></div>" +
      '<p class="mkv-verd">' + esc(VERD) + mxQ(m.summary, "Ausführlich zum letzten Lauf") + "</p>" +
      '<div class="mk-st">Stand ' + date(OUTLOOK.asof).slice(0, 6) + ", " + OUTLOOK.time + " Uhr" + (oAge ? ' · <span class="' + (oAge.old ? "old" : "") + '">' + oAge.t + (oAge.old ? ", evtl. veraltet" : "") + "</span>" : "") + " · Einschätzung, keine Prognose</div>" +
      (kstrip ? '<div class="mkv-kp">' + kstrip + "</div>" : "") +
      (nxt ? '<h4 class="mx-h4">Als Nächstes</h4><ul class="mkv-nx">' + nxt + "</ul>" : "") + "</section>";
    /* 2. Dein Radar: KI-Ampel */
    if (awOut) out += '<div id="mka">' + awOut + "</div>";
    out += crashHtml();
    /* 3. Ausblick */
    var sigAll = OUTLOOK.signals.map(function (x) { return '<li class="sg sg-' + x[0] + '"><i>' + (x[0] === "up" ? "▲" : x[0] === "dn" ? "▼" : "●") + "</i><span>" + esc(x[1]) + "</span>" + mxQ(x[2], "Hintergrund") + "</li>"; });
    var stot = OUTLOOK.scen.reduce(function (a, x) { return a + (x[1] || 0); }, 0) || 1, spc = OUTLOOK.scen.map(function (x) { return Math.floor((x[1] || 0) / stot * 100); });
    var srem = 100 - spc.reduce(function (a, b2) { return a + b2; }, 0);
    OUTLOOK.scen.map(function (x, i) { return [i, (x[1] || 0) / stot * 100 - spc[i]]; }).sort(function (p, q) { return q[1] - p[1]; }).forEach(function (p) { if (srem > 0) { spc[p[0]]++; srem--; } });
    var scn = OUTLOOK.scen.map(function (x, i) { return '<div class="sc sc-' + x[2] + '"><div class="sc-h"><b>' + esc(x[0]) + '</b><em class="sc-p">ca. ' + spc[i] + " %</em>" + mxQ(x[3], x[0]) + '</div><div class="sc-b"><i style="width:' + spc[i] + '%"></i></div></div>'; }).join("");
    var rl = function (a) { return a.map(function (x) { return "<div><b>" + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div>"; }).join(""); };
    var trig = Array.isArray(OUTLOOK.triggers) && OUTLOOK.triggers.length ? '<div class="mkv-trig"><b>Das ändert die Lage</b><ul>' + OUTLOOK.triggers.map(function (z) { return "<li>" + esc(z) + "</li>"; }).join("") + "</ul></div>" : "";
    var imp = OUTLOOK.impact ? '<div class="mkv-imp"><b>Für deine Thesen</b><p>' + esc(OUTLOOK.impact) + "</p></div>" : "";
    out += '<section class="box mx" id="mko"><div class="mk-h"><h2>Ausblick ' + esc(OUTLOOK.day.split(" (")[0]) + "</h2></div>" +
      '<h4 class="mx-h4">Rückblick</h4><p class="mkv-p">' + esc(OUTLOOK.recap) + "</p>" +
      '<h4 class="mx-h4">Szenarien <span>grobe Gewichtung, auf 100 % normiert, keine Wahrscheinlichkeit</span></h4><div class="scn">' + scn + "</div>" +
      trig + (trig ? "" : '<p class="cap">' + esc(OUTLOOK.levels) + "</p>") + imp +
      '<h4 class="mx-h4">Signale</h4><ul class="sgs">' + sigAll.slice(0, 4).join("") + "</ul>" +
      (sigAll.length > 4 ? '<details class="thm-src"><summary>Weitere Signale (' + (sigAll.length - 4) + ')</summary><ul class="sgs">' + sigAll.slice(4).join("") + "</ul></details>" : "") +
      '<details class="thm-src"><summary>Womit zu rechnen ist, ausführlich</summary><p class="mkv-p">' + esc(OUTLOOK.expect) + (trig ? '</p><p class="cap">' + esc(OUTLOOK.levels) : "") + "</p></details></section>";
    /* 4. Risiken (ein Block) */
    var rk = OUTLOOK.risks.slice(0, 5).map(function (x) { return '<div class="rk"><div class="rk-h"><b>' + esc(x[0]) + "</b>" + mxQ(x[2], x[0]) + '</div><div class="rk-b"><i class="l' + x[1] + '" style="width:' + (x[1] * 20) + '%"></i></div></div>'; }).join("");
    out += '<section class="box mx" id="mkr"><div class="mk-h"><h2>Risiken</h2><span class="meta">Gewicht 1 bis 5, meine Einschätzung</span></div><div class="rks">' + rk + "</div></section>";
    /* 5. Branchen */
    var secs = Array.isArray(m.sectors) ? m.sectors : [], bg = "";
    [["chance", "Chance"], ["risiko", "Risiko"], ["neutral", "Neutral"]].forEach(function (g) {
      var it = secs.filter(function (x) { var vw = String(x.view || "neutral").toLowerCase(); vw = vw === "chance" || vw === "risiko" ? vw : "neutral"; return vw === g[0]; });
      if (it.length) bg += '<div class="bg bg-' + g[0] + '"><b>' + g[1] + "</b>" + it.map(function (x) { return "<span>" + esc(x.name) + mxQ(x.note, x.name) + "</span>"; }).join("") + "</div>";
    });
    if (bg) out += '<section class="box mx"><div class="mk-h"><h2>Branchen</h2></div><div class="bgs">' + bg + "</div></section>";
    /* 6. Eingeklappt: Geldfluss, Termine, Hintergrund */
    var v = F.vol, vtop = v.rows.slice(0, 6), mxv = v.rows[0][2], mine = {};
    theses.forEach(function (t) { if (t.ticker) mine[String(t.ticker).split(/[.:]/)[0].toUpperCase()] = 1; });
    var down = v.rows.filter(function (x) { return x[3] <= -2; }).length;
    var vrows = vtop.map(function (x) { return '<div class="fl-r fl-vr"><span><b>' + esc(x[1]) + "</b>" + (mine[x[0]] ? ' <em class="fl-in">Radar</em>' : "") + '</span><span class="fl-t"><i class="vol" style="width:' + (x[2] / mxv * 100).toFixed(0) + '%"></i></span><b>' + nf1.format(x[2]) + ' Mio.</b><em class="' + (x[3] >= 0 ? "up" : "dn") + '">' + nf(x[3]) + " %</em></div>"; }).join("");
    out += '<details class="box mx mkv-fold fl" id="mkf"><summary><b>Geldfluss</b><span class="meta">Fonds und Handelsvolumen · Stand ' + date(F.asof).slice(0, 6) + (tech ? " · Tech " + nf(tech[1]) + " Mrd. $" : "") + "</span></summary>" +
      '<h4 class="mx-h4">US-Aktienfonds: ' + nf(F.funds.total) + " Mrd. $ in der " + esc(F.funds.week.toLowerCase()) + mxQ(F.funds.note + " Quelle: " + F.funds.src + ".", "Fondsflüsse") + "</h4>" + bars(F.funds.rows, "Mrd. $") +
      '<h4 class="mx-h4">Meistgehandelt am ' + date(v.date).slice(0, 6) + mxQ(down + " von " + v.rows.length + " Titeln fielen um mehr als 2 %. Viel Volumen bei fallendem Kurs heißt meist Verkaufsdruck, nicht Kaufinteresse. Das Volumen sagt nicht, wer kauft oder verkauft. Quelle: " + v.src + ". Nur dieser Handelstag ist belegt.", "Handelsvolumen") + "</h4>" + vrows +
      '<details class="thm-src"><summary>Alle 20 Aktien, ETFs nach Sektor und Institutionelle</summary>' + flowPane() + "</details></details>";
    var evRow = function (e) { var tip = [e.expectation, e.why, e.effect].filter(Boolean).join(" "); return '<div class="ev-r imp-' + esc(String(e.importance || "").toLowerCase()) + '"><b>' + date(e.date).slice(0, 6) + "</b><span>" + esc(e.name) + mxQ(tip, e.name) + (e.time ? "<small>" + esc(e.time) + "</small>" : "") + "</span><i>" + esc(e.importance || "") + "</i></div>"; };
    out += '<details class="box mx mkv-fold" id="mkt"><summary><b>Termine</b><span class="meta">' + up.length + " anstehend" + (er.length ? " · " + er.length + " Quartalszahlen im Radar" : "") + "</span></summary>" + (up.length ? '<div class="evl">' + up.slice(0, 8).map(evRow).join("") + "</div>" : '<p class="meta">Keine Termine hinterlegt.</p>') +
      (up.length > 8 ? '<details class="thm-src"><summary>Weitere Termine (' + (up.length - 8) + ")</summary><div class=\"evl\">" + up.slice(8).map(evRow).join("") + "</div></details>" : "") +
      (er.length ? '<h4 class="mx-h4">Quartalszahlen im Radar (30 Tage)</h4><div class="evl">' + er.slice(0, 8).map(function (x) { return '<div class="ev-r"><b>' + date(x.ne.date).slice(0, 6) + "</b><span>" + esc(x.t.name) + "</span><i>" + esc(inDays(x.ne.date)) + "</i></div>"; }).join("") + "</div>" : "") +
      '<details class="thm-src"><summary>Tagesplan und Rest der Woche</summary><h4 class="mx-h4">' + esc(OUTLOOK.day.split(" ")[0]) + '</h4><div class="mx-ev">' + rl(OUTLOOK.mon) + '</div><h4 class="mx-h4">Rest der Woche</h4><div class="mx-ev">' + rl(OUTLOOK.week) + "</div></details>" +
      (past.length ? '<details class="thm-src"><summary>Schon vorbei (' + past.length + ')</summary><div class="evl">' + past.map(evRow).join("") + "</div></details>" : "") + "</details>";
    var sw = function (k, lab, cls, sym) { return '<div class="sw sw-' + cls + '"><b>' + sym + " " + lab + "</b><ul>" + OUTLOOK.swot[k].map(function (x) { return "<li><span>" + esc(x[0]) + "</span>" + mxQ(x[1], x[0]) + "</li>"; }).join("") + "</ul></div>"; };
    var nr = runsDesc().filter(function (x) { return x.note && (Array.isArray(x.note.bullets) ? x.note.bullets.length : x.note.title); })[0], nrHtml = "";
    if (nr && Array.isArray(nr.note.bullets) && nr.note.bullets.length) nrHtml = '<h4 class="mx-h4">Tagesnotiz ' + date(nr.date).slice(0, 6) + '</h4><ul class="mk-l">' + nr.note.bullets.slice(0, 5).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    out += '<details class="box mx mkv-fold" id="mkw"><summary><b>Hintergrund</b><span class="meta">SWOT, Treiber, Tagesnotiz</span></summary><div class="swg">' + sw("s", "Stärken", "s", "▲") + sw("w", "Schwächen", "w", "▼") + sw("o", "Chancen", "o", "▲") + sw("t", "Risiken", "t", "▼") + "</div>" +
      ((m.chances || []).length || (m.risks || []).length || (m.macro || []).length ? '<details class="thm-src"><summary>Weitere Chancen, Risiken und Makro aus dem Lauf</summary><div class="mx-more">' +
        [["▲ Chancen", m.chances], ["▼ Risiken", m.risks], ["Makro", m.macro]].map(function (g) { return (g[1] || []).length ? "<h5>" + g[0] + "</h5><ul>" + g[1].map(function (z) { return "<li>" + esc(z) + "</li>"; }).join("") + "</ul>" : ""; }).join("") + "</div></details>" : "") +
      '<details class="thm-src"><summary>Treiber im Detail</summary>' + marketDrivers(m) + "</details>" + nrHtml + "</details>";
    var src = (m.sources || []).map(function (x) { return typeof x === "string" ? link(x) : link(x.url, x.title); }).join("");
    out += (src ? '<details class="thm-src mx-last"><summary>Quellen</summary><div class="cap">' + src + "</div></details>" : "");
    return out;
  }

  document.addEventListener("click", function (ev) {
    var g = ev.target.closest && ev.target.closest("[data-mkgo]"); if (!g) return;
    var id = g.getAttribute("data-mkgo"), el = document.getElementById(id); if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    if (id === "mkt") { var wrap = el.closest(".dsec-wrap"), bt = wrap && wrap.querySelector('[data-dsec="mk4"]'); if (bt) bt.click(); el = wrap || el; }
    var top = el.getBoundingClientRect().top + window.scrollY - (document.documentElement.classList.contains("embedded") ? 8 : 12);
    window.scrollTo({ top: top, behavior: "smooth" });
  });

  function renderThemes() {
    var el = document.getElementById("tab-themen");
    var list = Array.isArray(data.themes) ? data.themes : [];
    var head = marktHead();
    if (!list.length) { el.innerHTML = head + empty("Noch keine Themen", "Wenn mehrere Aktien denselben Auslöser haben (z. B. KI-Angst bei Software), schreibt der /radar-Lauf hier eine Branchen- oder Themenübersicht."); Array.prototype.forEach.call(el.querySelectorAll("details.mkt"), function (d) { d.open = true; }); return; }
    var sm = smallScr(), NB = 99, NL = 100000, NS = 100000;
    var li = function (a, n) { a = Array.isArray(a) ? a.slice(0, NB) : []; return a.length ? "<ul>" + a.map(function (v) { return "<li>" + esc(short(v, n)) + (!sm && String(v).length > n ? qmHtml(v) : "") + "</li>"; }).join("") + "</ul>" : '<p class="meta">–</p>'; };
    el.innerHTML = head + '<h2 style="margin-top:20px">Themen <span class="count">' + list.length + '</span></h2><div class="grid wide">' + list.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).map(function (m) {
      var srcs = (Array.isArray(m.sources) ? m.sources : []).map(function (s) { return typeof s === "string" ? link(s) : link(s.url, s.title); }).join("");
      return '<article class="card thm"><div class="row"><h3>' + esc(String(m.title || "")) + '</h3><span class="meta">' + date(m.date) + "</span></div>" +
        (m.summary ? '<p class="thm-s">' + esc(short(m.summary, NS)) + "</p>" : "") +
        '<div class="thm-2"><div class="thm-up"><b>▲ Chancen und Treiber</b>' + li(m.drivers, NL) + '</div><div class="thm-dn"><b>▼ Risiken und Gegenargumente</b>' + li(m.risks, NL) + "</div></div>" +
        (m.verdict ? '<div class="thm-v"><b>Einordnung</b>' + esc(short(m.verdict, NS)) + "</div>" : "") +
        (srcs ? '<details class="thm-src"><summary>Quellen</summary><div class="cap">' + srcs + "</div></details>" : "") + "</article>";
    }).join("") + "</div>";
    Array.prototype.forEach.call(el.querySelectorAll("details.mkt"), function (d) { d.open = true; });
  }

  function renderHeader() {
    var d = latestDate();
    document.getElementById("sub").textContent = d ? "Letzter Lauf: " + date(d) : "Noch kein Lauf. Starte in Claude Code den Befehl /radar.";
    if (data.demo) document.getElementById("demo").innerHTML = '<div class="demo-banner">DEMO mit erfundenen Beispieldaten. Keine echten Unternehmen, keine Empfehlung.</div>';
    var open = theses.filter(isOpen);
    var broken = open.filter(function (t) { return status(t) === "verletzt"; });
    var fresh = open.filter(function (t) { return status(t) === "neu"; });
    var seen = {};
    theses.forEach(function (t) { seen[t.ticker + "|" + t.index] = 1; });
    checked.forEach(function (c) { seen[c.ticker + "|" + c.index] = 1; });
    var okN = open.filter(valid).length;
    document.getElementById("stats").innerHTML =
      '<div class="stat new"><b data-count="' + okN + '">' + okN + "</b><span>Score ab " + TH + " (gültig)</span></div>" +
      '<div class="stat muted"><b data-count="' + (open.length - okN) + '">' + (open.length - okN) + "</b><span>unter " + TH + "</span></div>" +
      "<div class=\"stat\"><b data-count=\"" + open.length + "\">" + open.length + "</b><span>Thesen insgesamt</span></div>" +
      "<div class=\"stat\"><b data-count=\"" + Object.keys(seen).length + "\">" + Object.keys(seen).length + "</b><span>Aktien einzeln geprüft</span></div>";
  }

  function coverageBlock() {
    var r = lastRun();
    var cov = r && Array.isArray(r.coverage) ? r.coverage : [];
    if (!cov.length) return "";
    var rows = cov.map(function (c) {
      var st = ["gescreent", "teilweise", "nicht"].indexOf(c.status) >= 0 ? c.status : "teilweise";
      return '<tr><td data-l="Index">' + esc(c.index) + '</td><td data-l="Stand"><span class="badge b-' + st + '">' + (st === "nicht" ? "nicht gescreent" : st) + '</span></td><td data-l="Methode">' + esc(c.method || "") + '</td><td data-l="Hinweis">' + esc(c.note || "") + "</td></tr>";
    }).join("");
    return '<details class="fold"><summary>Abdeckung im letzten Lauf</summary><div class="tablebox scroll"><table class="list"><thead><tr><th>Index</th><th>Stand</th><th>Quelle / Methode</th><th>Hinweis</th></tr></thead><tbody>' + rows + "</tbody></table></div></details>";
  }

  function foldRank(open) {
    var r = rankStrip(open);
    return r ? '<details class="mkt box" style="padding:14px 16px"><summary><h2>Rangliste nach Score</h2><span class="count">' + open.length + "</span></summary>" + '<div style="margin-top:12px">' + r.replace(/^<h2>.*?<\/h2>/, "") + "</div></details>" : "";
  }
  /* ---------- Entscheidungshilfe: Regeln, Kopf, Alarme, Termine, Tagebuch, Vergleich ---------- */
  var memStore = {};
  function lsGet(k, def) { try { var v = window.localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* optional */ } return memStore[k] != null ? memStore[k] : def; }
  function lsSet(k, v) { memStore[k] = v; try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* optional */ } }
  var GLOSS = {
    "Score": "Radar-Zahl von 0 bis 100: Summe aus sieben Teilnoten (Wachstum, Qualität, Bewertung, Kurspotenzial, Einstieg, Risiko, Erwartungen). Ab 80 gilt die These als gültig. Eine Heuristik, keine Prognose.",
    "Score Δ": "Veränderung des Scores seit dem Lauf davor.",
    "Rang Δ": "Wie viele Plätze die Aktie seit dem Lauf davor gewonnen (+) oder verloren (−) hat.",
    "Kurspotenzial": "Abstand vom aktuellen Kurs zum durchschnittlichen Kursziel der Analysten. Ein Mittelwert, kein Versprechen.",
    "Bewertung (KGV)": "Kurs-Gewinn-Verhältnis: Kurs geteilt durch den Gewinn je Aktie. Zeigt, wie viele Jahresgewinne man zahlt. Niedrig ist nicht automatisch günstig, hoch nicht automatisch teuer.",
    "Freier Cashflow": "Geld, das nach laufenden Kosten und Investitionen im Unternehmen übrig bleibt. Schwerer zu schönen als der Gewinn.",
    "Operative Marge": "Anteil vom Umsatz, der nach allen laufenden Kosten (vor Zinsen und Steuern) als Gewinn bleibt.",
    "Bruttomarge": "Anteil vom Umsatz, der nach den direkten Herstellungskosten übrig bleibt.",
    "Gewinn pro 100 € Umsatz": "Nettomarge: Wie viel Euro Gewinn nach Steuern aus 100 € Umsatz werden.",
    "Umsatzwachstum": "Wie stark der Umsatz der letzten 12 Monate gegenüber den 12 Monaten davor gewachsen ist.",
    "Gewinnwachstum": "Wie stark der Nettogewinn der letzten 12 Monate gegenüber den 12 Monaten davor gewachsen ist.",
    "Beta": "Empfindlichkeit gegenüber dem Gesamtmarkt. Beta 1,2 heißt: Bewegt sich der Markt um 1 %, bewegt sich die Aktie im Schnitt um 1,2 %.",
    "Einstand": "Dein durchschnittlicher Kaufkurs je Stück.",
    "Regeln": "Wie viele deiner eigenen Kriterien die Aktie erfüllt. Du stellst sie unter „Meine Regeln“ auf der Startseite ein.",
    "Klumpenrisiko": "Hängen viele Positionen am selben Thema, fallen sie oft gemeinsam. Hier zählt die Summe je Thema.",
    "Abstand zum Hoch": "Wie weit der Kurs unter seinem höchsten Stand der letzten 52 Wochen liegt."
  };
  function gl(label, key) { var k = key || label, g = GLOSS[k]; return g ? '<span class="gl" tabindex="0" data-tip="' + esc(g) + '" data-tipt="' + esc(k) + '">' + esc(label) + "</span>" : esc(label); }

  /* Eigene Regeln (im Browser gespeichert) */
  var RULE_DEF = [
    { id: "score", label: "Score", kind: "min", v: 80, unit: "" },
    { id: "dd", label: "Abstand zum 52-Wochen-Hoch (von bis)", kind: "range", lo: 20, hi: 70, unit: " %" },
    { id: "up", label: "Kurspotenzial mindestens", kind: "min", v: 15, unit: " %" },
    { id: "rev", label: "Umsatzwachstum (12 Monate) mindestens", kind: "min", v: 10, unit: " %" },
    { id: "fcf", label: "Freier Cashflow positiv", kind: "flag" },
    { id: "pil", label: "Keine gebrochene These-Säule", kind: "flag" },
    { id: "pe", label: "Erwartetes KGV höchstens", kind: "max", v: 45, unit: "", off: true }
  ];
  var LIM_DEF = { maxpos: 10, maxtheme: 35 };
  function rulesCfg() { var c = lsGet("radar-rules", {}); return c && typeof c === "object" ? c : {}; }
  function ruleOf(def) {
    var c = rulesCfg()[def.id] || {}, r = {}; for (var k in def) r[k] = def[k];
    if (c.v != null) r.v = c.v; if (c.lo != null) r.lo = c.lo; if (c.hi != null) r.hi = c.hi;
    r.on = c.on != null ? !!c.on : !def.off;
    return r;
  }
  function limOf(id) { var c = rulesCfg().lim || {}; return num(c[id]) != null ? c[id] : LIM_DEF[id]; }
  function curDD(t) {
    var e = t.entry || {}, l = t.last || {}, p = num(l.price) != null ? l.price : e.price;
    if (num(e.high_52w) > 0 && num(p) > 0) return (1 - p / e.high_52w) * 100;
    return num(e.drawdown_pct) != null ? Math.abs(e.drawdown_pct) : null;
  }
  function revTTM(t) { var m = growthMetrics(t); return m && m.rev ? m.rev.ttm : null; }
  function niTTM(t) { var m = growthMetrics(t); return m && m.ni ? m.ni.ttm : null; }
  function ruleCheck(t) {
    var items = [], e = t.est || {};
    RULE_DEF.forEach(function (d) {
      var r = ruleOf(d); if (!r.on) return;
      var val = null, ok = null, txt = "", sc;
      if (r.id === "score") { val = scoreTotal(t); ok = val == null ? null : val >= r.v; txt = "Score " + (val == null ? "–" : val) + " (ab " + r.v + ")"; }
      else if (r.id === "dd") { val = curDD(t); ok = val == null ? null : val >= r.lo && val <= r.hi; txt = "Abstand zum Hoch " + (val == null ? "–" : nf0.format(val) + " %") + " (" + r.lo + " bis " + r.hi + " %)"; }
      else if (r.id === "up") { val = upside(t); ok = val == null ? null : val >= r.v; txt = "Kurspotenzial " + (val == null ? "–" : sgn(val)) + " (ab " + r.v + " %)"; }
      else if (r.id === "rev") { val = revTTM(t); ok = val == null ? null : val >= r.v; txt = "Umsatzwachstum " + (val == null ? "–" : gSigned(val)) + " (ab " + r.v + " %)"; }
      else if (r.id === "fcf") { val = num(e.fcf_last); ok = val == null ? null : val > 0; txt = "Freier Cashflow " + (val == null ? "unbekannt" : val > 0 ? "positiv" : "negativ"); }
      else if (r.id === "pil") { var ps = Array.isArray(t.pillars) ? t.pillars : []; val = ps.filter(function (p) { return light(p) === "rot"; }).length; ok = ps.length ? val === 0 : null; txt = ps.length ? (val ? val + " Säule(n) gebrochen" : "alle Säulen intakt oder wackelnd") : "keine Säulen"; }
      else if (r.id === "pe") { val = num(e.fpe); ok = val == null ? null : val <= r.v; txt = "Erwartetes KGV " + (val == null ? "–" : nf1.format(val)) + " (höchstens " + r.v + ")"; }
      items.push({ id: r.id, label: r.label, ok: ok, txt: txt });
    });
    var okN = items.filter(function (i) { return i.ok === true; }).length, noN = items.filter(function (i) { return i.ok === false; }).length;
    return { items: items, ok: okN, no: noN, na: items.length - okN - noN, tot: items.length };
  }
  function ruleBadge(t) {
    var rc = ruleCheck(t); if (!rc.tot) return "";
    var cls = rc.no === 0 ? "r-ok" : rc.no === 1 ? "r-mid" : "r-bad";
    var tip = rc.items.map(function (i) { return (i.ok === true ? "✓ " : i.ok === false ? "✗ " : "? ") + i.txt; }).join(" · ");
    return '<span class="rbadge ' + cls + '" tabindex="0" data-tip="' + esc(tip) + '" data-tipt="Deine Regeln">' + rc.ok + "/" + rc.tot + "</span>";
  }

  /* Datenstand */
  function daysTo(d) { if (!d) return null; var a = new Date(String(d).slice(0, 10) + "T00:00:00"), b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 86400000); }
  function ageCls(d) { var n = daysTo(d); if (n == null) return "age-na"; n = -n; return n > 3 ? "age-old" : n > 1 ? "age-mid" : "age-new"; }
  function nextEvt(t) {
    var c = t.catalyst || {}, p = t.preview || {}, d = c.date || p.date;
    return d ? { date: d, event: c.event || p.event || "Termin", exp: p.expectation || "" } : null;
  }
  function inDays(d) { var n = daysTo(d); return n == null ? "" : n === 0 ? "heute" : n === 1 ? "morgen" : n > 1 ? "in " + n + " Tagen" : "vor " + (-n) + " Tagen"; }
  function freshLine(t) {
    var l = t.last || {}, g = t.growth || {}, e = t.est || {}, sl = slog(t), ls = sl[sl.length - 1], bits = [];
    var add = function (lab, d, note) { if (d) bits.push('<span class="fr ' + ageCls(d) + '" title="' + esc(note || "") + '">' + lab + " " + date(d) + "</span>"); };
    add("Kurs", l.date, "Zeitpunkt des Kurses");
    add("Zahlen", g.as_of, "Quartals- und Jahreszahlen");
    add("Erwartung", e.as_of, "Durchschnitt der Analysten" + (e.analysts ? ", " + e.analysts + " Analysten" : ""));
    add("Score", ls ? ls.date : null, "Letzter Lauf mit Bewertung");
    return bits.length ? '<div class="fresh">Datenstand: ' + bits.join("") + '<span class="qm" tabindex="0" role="note" aria-label="Erklärung" data-tip="grün = frisch, gelb = 2 bis 3 Tage, rot = älter" data-tipt="Datenstand">?</span></div>' : "";
  }

  /* ---------- Momentum (aus Wochenkursen) und Urteil nach eigenen Regeln ---------- */
  function mom(t) {
    var sr = PRICES[t.id]; if (!sr || !sr.pts || sr.pts.length < 30) return null;
    var d = sr.pts.map(function (x) { return x[0]; }), p = sr.pts.map(function (x) { return x[1]; }), n = p.length, last = p[n - 1], ld = new Date(d[n - 1]);
    function perf(mo) { var c = new Date(ld); c.setMonth(c.getMonth() - mo); var cs = c.toISOString().slice(0, 10); if (d[0] > cs) return null; for (var i = n - 1; i >= 0; i--) if (d[i] <= cs) return (last / p[i] - 1) * 100; return null; }
    var k = Math.min(40, n), sma = 0, i; for (i = n - k; i < n; i++) sma += p[i]; sma /= k;
    var c12 = new Date(ld); c12.setMonth(c12.getMonth() - 12); var cs12 = c12.toISOString().slice(0, 10), pk = 0, mdd = 0, rets = [];
    for (i = 0; i < n; i++) { if (d[i] < cs12) continue; if (p[i] > pk) pk = p[i]; if (pk > 0) mdd = Math.min(mdd, (p[i] / pk - 1) * 100); if (i > 0) rets.push(Math.log(p[i] / p[i - 1])); }
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1), v = rets.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (rets.length > 1 ? rets.length - 1 : 1);
    return { m1: perf(1), m3: perf(3), m6: perf(6), m12: perf(12), above: (last / sma - 1) * 100, mdd: mdd, vol: Math.sqrt(v) * Math.sqrt(52) * 100, asof: sr.asof || d[n - 1] };
  }
  function momBlock(t) {
    var m = mom(t); if (!m) return "";
    var c = function (lab, v) { return '<div class="mm-c"><span>' + lab + '</span><b class="' + (v == null ? "" : v >= 0 ? "pos" : "neg") + '">' + (v == null ? "–" : sgn(v)) + "</b></div>"; };
    return '<div class="box mom"><div class="boxtitle"><span>Kursentwicklung ' + qmHtml("Wie hat sich der Kurs entwickelt? Berechnet aus Wochenschlusskursen (Yahoo), Stand " + date(m.asof) + ". Die 200-Tage-Linie entspricht dem Durchschnitt der letzten 40 Wochen. Ein Kurs über der Linie gilt als Aufwärtstrend.") + '</span></div><div class="mm-g">' + c("1 Monat", m.m1) + c("3 Monate", m.m3) + c("6 Monate", m.m6) + c("12 Monate", m.m12) + "</div>" +
      '<div class="mm-r"><span>Kurs zur 200-Tage-Linie</span><b class="' + (m.above >= 0 ? "pos" : "neg") + '">' + sgn(m.above) + '</b></div><div class="mm-r"><span>Größter Rückgang (12 Monate)</span><b class="neg">' + sgn(m.mdd) + '</b></div><div class="mm-r"><span>Schwankung pro Jahr ' + qmHtml("Wie stark der Kurs im Schnitt schwankt (Standardabweichung der Wochenrenditen, auf ein Jahr hochgerechnet). Höher heißt unruhiger.") + "</span><b>" + nf0.format(m.vol) + " %</b></div></div>";
  }
  function dataFresh(t) {
    var l = t.last || {}, p = t.potential || {}, a = daysTo(l.date), b = daysTo(p.as_of);
    return a != null && -a <= 4 && b != null && -b <= 14 && num(p.analysts) >= 5;
  }
  function verdict(t) {
    var sc = scoreTotal(t), up = upside(t), st = status(t), m = mom(t), inD = inDepot(t), rS = ruleOf(RULE_DEF[0]), rU = ruleOf(RULE_DEF[2]);
    var ps = Array.isArray(t.pillars) ? t.pillars : [], red = ps.filter(function (x) { return light(x) === "rot"; }).length, fresh = dataFresh(t);
    var ch = [
      { l: "Score mindestens " + rS.v + " von 100", ok: sc == null ? null : sc >= rS.v },
      { l: "Analysten sehen mindestens " + rU.v + " % Luft bis zu ihrem Kursziel", ok: up == null ? null : up >= rU.v },
      { l: "Die Begründung für die Aufnahme gilt noch", ok: st !== "verletzt" },
      { l: "Keine der Grundannahmen ist gebrochen", ok: ps.length ? red === 0 : null },
      { l: "Kurs höchstens 10 % unter seinem 200-Tage-Durchschnitt", ok: m ? m.above >= -10 : null },
      { l: "Kursziele aktuell (höchstens 2 Wochen alt, mindestens 5 Analysten)", ok: fresh }
    ];
    var bad = ch.filter(function (x) { return x.ok !== true; }).map(function (x) { return x.l; }), v, cls;
    if (st === "verletzt" || (sc != null && sc < 55)) { v = "Vorsicht"; cls = "bad"; }
    else if (!bad.length) { v = "Chance"; cls = "ok"; }
    else if (ch[0].ok && ch[1].ok && ch[2].ok && !ch[5].ok) { v = "Beobachten"; cls = "mid"; }
    else { v = "Beobachten"; cls = "mid"; }
    return { v: v, cls: cls, ch: ch, bad: bad };
  }
  function verdictRow(t) {
    var r = verdict(t), MEAN = { Chance: "Alle deine Regeln sind erfüllt. Ein Prüfauftrag, keine Kaufempfehlung.", Beobachten: "Nicht alle Regeln sind erfüllt. Rot markiert, was fehlt.", Vorsicht: "Die Begründung für die Aufnahme gilt nicht mehr oder der Score ist sehr niedrig." };
    var li = r.ch.map(function (c) { return '<li class="' + (c.ok === true ? "ok" : c.ok === false ? "no" : "na") + '">' + (c.ok === true ? "✓ " : c.ok === false ? "✗ " : "? ") + esc(c.l) + "</li>"; }).join("");
    return '<div class="verdict v-' + r.cls + ' vv-' + vslug(r.v) + '"><span class="vd-l">Einschätzung nach deinen Regeln</span><div class="vd-top"><b>' + r.v + '</b></div><p class="vd-m">' + MEAN[r.v] + '</p><ul class="vd-ch">' + li + '</ul><p class="vd-n">Rot = Vorsicht, Gelb = Beobachten, Grün = Chance. Die Grenzen stellst du unter Mehr → Allgemeine Infos → Meine Regeln ein.</p></div>';
  }
  function vslug(v) { return v === "Chance" ? "buy" : v === "Beobachten" ? "watch" : "sell"; }
  function verdictBadge(t) { var r = verdict(t); return '<div class="vbadge vv-' + vslug(r.v) + '">' + r.v + "</div>"; }

  function proCon(t) {
    var ks = kpiData(t) || [], order = { top: 0, good: 1, mid: 2, low: 3 };
    var pros = ks.filter(function (k) { return k.pro && (k.rt === "top" || k.rt === "good" || (k.id === "sz" && k.pro)); }).sort(function (a, b) { return (order[a.rt] == null ? 4 : order[a.rt]) - (order[b.rt] == null ? 4 : order[b.rt]); }).slice(0, 3).map(function (k) { return k.pro; });
    var cons = ks.filter(function (k) { return k.con && (k.rt === "low" || (k.rt === "mid" && k.id === "pe") || (k.id === "sz" && k.con)); }).slice(0, 3).map(function (k) { return k.con; });
    var sc = t.deep && Array.isArray(t.deep.scenarios) ? t.deep.scenarios : [], opt = null, i;
    for (i = 0; i < sc.length; i++) if (/optimist/i.test(sc[i].name || "")) opt = sc[i];
    var chancen = [].concat(Array.isArray(t.why) ? t.why.slice(0, 2) : [], opt ? ["Optimistisch: " + (opt.price || "") + (opt.assumption ? " – " + opt.assumption : "")] : []);
    var risiken = [].concat(t.counter ? [t.counter] : [], t.stop ? ["Widerlegt, wenn: " + t.stop] : []);
    var lis = function (a, n) { a = a.slice(0, 3); return a.length ? "<ul>" + a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : '<p class="meta">Nichts Auffälliges.</p>'; };
    var p0 = t.potential || {}, pr = t.last && num(t.last.price), ch = upside(t), rk = (num(p0.low) != null && pr) ? (p0.low / pr - 1) * 100 : null, cr = "";
    if (ch != null) {
      var rr = rk != null ? Math.max(0, -rk) : null, mx = Math.max(ch, rr || 0, 1);
      cr = '<div class="crbar"><div><span>Chance bis Ø-Ziel</span><b class="up">' + sgn(ch) + '</b><span class="tr"><i class="g" style="width:' + (Math.max(ch, 0) / mx * 100).toFixed(0) + '%"></i></span></div>' +
        (rk != null ? '<div><span>Risiko bis schwächstem Ziel</span><b class="' + (rk < 0 ? "dn" : "up") + '">' + sgn(rk) + '</b><span class="tr"><i class="r" style="width:' + ((rr || 0) / mx * 100).toFixed(0) + '%"></i></span></div>' : "") + "</div>";
    }
    return '<div class="box pcbox"><div class="boxtitle"><span>Chance, Risiko und SWOT</span></div>' + cr +
      '<div class="swot"><div class="sw s"><b><em>+</em>Stärken</b>' + lis(pros, 70) + '</div><div class="sw w"><b><em>−</em>Schwächen</b>' + lis(cons, 70) + '</div><div class="sw o"><b><em>↗</em>Chancen</b>' + lis(chancen, 70) + '</div><div class="sw t"><b><em>!</em>Risiken</b>' + lis(risiken, 70) + "</div></div></div>";
  }
  function decisionHead(t) {
    var sc = scoreTotal(t), h = histOf(t), last = h[h.length - 1], d1 = last ? last.d1 : null, r = rankMap[t.id], dd = curDD(t), up = upside(t), ne = nextEvt(t), rc = ruleCheck(t);
    var cell = function (lab, val, sub, cls) { return '<div class="dh-c ' + (cls || "") + '"><span class="lb">' + lab + '</span><b>' + val + "</b><i>" + (sub || "") + "</i></div>"; };
    var failing = rc.items.filter(function (i) { return i.ok === false; }).map(function (i) { return i.label.replace(/ \(.*\)| mindestens| höchstens/g, ""); });
    var cells = cell(gl("Score"), sc == null ? "–" : sc, (d1 != null && d1 !== 0 ? (d1 > 0 ? "▲ +" : "▼ −") + Math.abs(d1) + " seit Lauf davor" : "unverändert") + (r ? " · Rang " + r.rank + "/" + r.of : ""), sc == null ? "" : sc >= TH ? "ok" : "bad") +
      cell(gl("Abstand zum Hoch"), dd == null ? "–" : nf0.format(dd) + " %", "unter dem 52-Wochen-Hoch", "") +
      cell(gl("Kurspotenzial"), up == null ? "–" : sgn(up), (t.potential && t.potential.analysts ? "Ø-Ziel, " + t.potential.analysts + " Analysten" : "Ø-Ziel") + (t.potential && num(t.potential.low) != null && t.last && num(t.last.price) ? " · schwächstes Ziel " + sgn((t.potential.low / t.last.price - 1) * 100) : ""), up == null ? "" : up >= 15 ? "ok" : up < 5 ? "bad" : "") +
      cell("Nächster Termin", ne ? date(ne.date) : "–", ne ? esc(inDays(ne.date)) + " · " + esc(ne.event) : "nicht hinterlegt", ne && daysTo(ne.date) != null && daysTo(ne.date) >= 0 && daysTo(ne.date) <= 7 ? "warn" : "") +
      cell(gl("Regeln"), rc.tot ? rc.ok + " von " + rc.tot : "–", rc.tot ? (failing.length ? "offen: " + esc(failing.join(", ")) : rc.na ? rc.na + " ohne Daten" : "alle erfüllt") : "keine aktiv", rc.no === 0 && rc.tot ? "ok" : rc.no >= 2 ? "bad" : "warn");
    var note = (lsGet("radar-journal", {})[t.id] || [])[0];
    return '<section class="dhead" aria-label="Entscheidungskopf">' + verdictRow(t) + '<div class="dh-grid">' + cells + "</div>" +
      (t.counter ? '<div class="dh-row risk"><b>Größtes Risiko</b><span>' + esc(t.counter) + "</span></div>" : "") +
      (t.stop ? '<div class="dh-row stop"><b>Widerlegt, wenn</b><span>' + esc(t.stop) + "</span></div>" : "") +
      trdRow(t) +
      (note ? '<div class="dh-row note"><b>Deine Notiz</b><span>' + date(note.date) + " · " + esc(note.action) + ": " + esc(note.text) + "</span></div>" : "") +
      freshLine(t) + "</section>";
  }

  /* Entscheidungstagebuch */
  var ACTIONS = ["Beobachten", "Gekauft", "Nachgekauft", "Teilverkauft", "Verkauft", "Verworfen"];
  function journalBlock(t) {
    var list = lsGet("radar-journal", {})[t.id] || [], l = t.last || {};
    var rows = list.map(function (x, i) {
      return '<li><span class="meta">' + date(x.date) + (x.price != null ? " · Kurs " + money(x.price, t.currency) : "") + " · " + (x.score != null ? "Score " + x.score : "") + "</span> <b>" + esc(x.action) + "</b> " + esc(x.text) + ' <button type="button" class="linkbtn" data-jdel="' + esc(t.id) + ":" + i + '" title="Eintrag löschen">löschen</button></li>';
    }).join("");
    return '<div class="jr"><p class="cap" style="margin:0 0 8px">Halte kurz fest, warum du so entscheidest. Später siehst du, ob die Gründe noch gelten. Gespeichert nur in diesem Browser (Sicherung über „Meine Regeln und Notizen“ auf der Startseite).</p>' +
      '<div class="jr-form"><select data-jact aria-label="Art der Entscheidung">' + ACTIONS.map(function (a) { return "<option>" + a + "</option>"; }).join("") + '</select><textarea data-jtxt rows="2" maxlength="600" placeholder="Warum? Zum Beispiel: Score 90, Abstand zum Hoch 29 %, Zahlen am 20.10. abwarten"></textarea><button type="button" class="btn" data-jsave="' + esc(t.id) + '">Speichern</button></div>' +
      (rows ? '<ul class="plain jr-list">' + rows + "</ul>" : '<p class="meta">Noch keine Notiz.</p>') + "</div>";
  }
  function journalSave(id, wrap) {
    var t = byIdMap[id], txt = wrap.querySelector("[data-jtxt]").value.trim(), act = wrap.querySelector("[data-jact]").value;
    if (!t || !txt) return;
    var j = lsGet("radar-journal", {}), l = t.last || {};
    (j[id] = j[id] || []).unshift({ date: new Date().toISOString().slice(0, 10), action: act, text: txt, price: num(l.price), score: scoreTotal(t) });
    lsSet("radar-journal", j);
  }

  /* Alarme (eine Zeile auf Heute) */
  function relTheses() {
    var seen = {}, out = [];
    topList().concat(theses.filter(function (t) { return isOpen(t) && inDepot(t); })).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; out.push(t); } });
    return out;
  }
  function alertList() {
    var out = [];
    relTheses().forEach(function (t) {
      var sc = scoreTotal(t), h = histOf(t), last = h[h.length - 1], nm = t.name.replace(/,? (Inc\.?|Corporation|Corp\.?|Incorporated|Limited|Ltd\.?|N\.V\.|AG|SE|plc)$/i, ""), ne = nextEvt(t), dn = ne ? daysTo(ne.date) : null;
      if (sc != null && sc < TH) out.push({ sev: "hi", txt: nm + ": Score " + sc + " unter " + TH, id: t.id });
      else if (last && last.d1 != null && last.d1 <= -5) out.push({ sev: "mid", txt: nm + ": Score " + last.d1, id: t.id });
      if (dn != null && dn >= 0 && dn <= 7) out.push({ sev: "info", txt: nm + ": " + short(String(ne.event).replace(/\s*\(.*?\)/g, ""), 32) + " " + inDays(ne.date), id: t.id });
    });
    dpos.forEach(function (p) { if (num(p.day_pct) != null && Math.abs(p.day_pct) >= 5) out.push({ sev: p.day_pct < 0 ? "mid" : "info", txt: p.name + " heute " + pct(p.day_pct, true), tab: "depot" }); });
    var r = runsDesc().filter(function (x) { return x.market; })[0];
    if (r && Array.isArray(r.market.events)) r.market.events.forEach(function (x) {
      var dn = daysTo(x.date); if (String(x.importance).toLowerCase() === "hoch" && dn != null && dn >= 0 && dn <= 3) out.push({ sev: "info", txt: x.name.replace(/ \(.*\)/, "") + " " + inDays(x.date), alert: "market" });
    });
    var ord = { hi: 0, mid: 1, info: 2 };
    return out.sort(function (a, b) { return ord[a.sev] - ord[b.sev]; });
  }
  function alertStrip() {
    var a = alertList();
    if (!a.length) return '<div class="alerts ok" role="status"><b>Handlungsbedarf:</b> keiner erkannt (kein Score unter ' + TH + ', keine Termine in den nächsten Tagen).</div>';
    return '<div class="alerts" role="status"><b>Handlungsbedarf (' + a.length + "):</b> " + a.slice(0, 8).map(function (x) {
      var at = x.id ? ' data-jump="' + esc(x.id) + '"' : x.alert ? ' data-alert="market"' : x.tab ? ' data-gotab="' + x.tab + '"' : "";
      return '<button type="button" class="alchip al-' + x.sev + '"' + at + ">" + esc(x.txt) + "</button>";
    }).join("") + (a.length > 8 ? '<span class="meta">+ ' + (a.length - 8) + " weitere</span>" : "") + "</div>";
  }

  /* Termine (Quartalszahlen) */
  function termsRows(list, days) {
    return list.map(function (t) { var ne = nextEvt(t); return ne ? { t: t, ne: ne, n: daysTo(ne.date) } : null; }).filter(function (x) { return x && x.n != null && x.n >= 0 && x.n <= days; }).sort(function (a, b) { return a.n - b.n; });
  }
  function termsTable(rows) {
    if (!rows.length) return '<p class="meta">Keine hinterlegten Termine in den nächsten 30 Tagen. Der nächste Lauf trägt sie nach.</p>';
    return '<div class="tablebox scroll"><table class="list top"><thead><tr><th>Wann</th><th>Aktie</th><th>Ereignis</th><th>' + gl("Score") + "</th><th>Worauf der Markt schaut</th></tr></thead><tbody>" + rows.map(function (x) {
      var sc = scoreTotal(x.t);
      return '<tr><td data-l="Wann"><b>' + date(x.ne.date) + '</b><div class="meta">' + esc(inDays(x.ne.date)) + '</div></td><td class="wrap" data-l="Aktie"><button type="button" class="linkbtn" data-jump="' + esc(x.t.id) + '"' + tipAttr(x.t) + "><b>" + esc(x.t.name) + "</b></button>" + (inDepot(x.t) ? ' <span class="tag dp">Depot</span>' : "") + '</td><td class="wrap" data-l="Ereignis">' + esc(short(x.ne.event, 60)) + '</td><td data-l="Score">' + (sc != null ? '<span class="miniscore ' + scoreClass(sc) + '">' + sc + "</span>" : "–") + '</td><td class="wrap" data-l="Worauf der Markt schaut">' + esc(short(x.ne.exp, 150)) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  }
  function termsBox() {
    var rows = termsRows(relTheses(), 30);
    return '<details class="mkt box" style="padding:14px 16px"><summary><h2>Termine: Quartalszahlen</h2><span class="meta">Depot und Top ' + TOPN + ", nächste 30 Tage (" + rows.length + ")</span></summary><div style=\"margin-top:12px\">" + termsTable(rows) + '<p class="cap">Termine kommen aus dem Radar (Feld catalyst/preview). Fehlt ein Termin, trägt ihn der nächste Lauf nach.</p></div></details>';
  }

  /* Meine Regeln */
  function rulesBox() {
    var rows = RULE_DEF.map(function (d) {
      var r = ruleOf(d), inp = "";
      if (r.kind === "range") inp = '<input type="number" data-rv="' + r.id + '" data-f="lo" value="' + r.lo + '" min="0" max="100" aria-label="von"> bis <input type="number" data-rv="' + r.id + '" data-f="hi" value="' + r.hi + '" min="0" max="100" aria-label="bis">' + r.unit;
      else if (r.kind === "flag") inp = "";
      else inp = '<input type="number" data-rv="' + r.id + '" data-f="v" value="' + r.v + '" step="1" aria-label="Grenzwert">' + r.unit;
      return '<tr><td><label><input type="checkbox" data-ron="' + r.id + '"' + (r.on ? " checked" : "") + "> " + esc(r.label) + "</label></td><td>" + inp + "</td></tr>";
    }).join("");
    var lim = '<tr><td>Max. Anteil einer Aktie am Depot</td><td><input type="number" data-lim="maxpos" value="' + limOf("maxpos") + '" min="1" max="100"> %</td></tr><tr><td>Max. Anteil eines Themas am Depot</td><td><input type="number" data-lim="maxtheme" value="' + limOf("maxtheme") + '" min="1" max="100"> %</td></tr>';
    return '<details class="mkt box" style="padding:14px 16px"><summary><h2>Meine Regeln</h2><span class="meta">Checkliste je Aktie, Grenzen für Position und Thema</span></summary><div style="margin-top:12px">' +
      '<p class="meta" style="margin:0 0 8px">Jede Aktie wird gegen diese Regeln geprüft (Spalte „Regeln“, Detailansicht). Die Werte bleiben in diesem Browser gespeichert.</p>' +
      '<table class="rules-t"><tbody>' + rows + lim + "</tbody></table>" +
      '<div class="rules-act"><button type="button" class="btn" data-rreset>Auf Standard zurücksetzen</button><button type="button" class="btn" data-rexport>Regeln und Notizen sichern (Datei)</button><label class="btn">Aus Datei laden<input type="file" accept="application/json" data-rimport hidden></label></div></div></details>';
  }
  function rerenderAll() {
    var open = []; Array.prototype.forEach.call(document.querySelectorAll("details[open]"), function (d) { var s = d.querySelector("summary"); if (s) open.push(s.textContent); });
    computeRanks(); renderToday(); renderDepot(); renderTheses(); renderScore();
    Array.prototype.forEach.call(document.querySelectorAll("details"), function (d) { var s = d.querySelector("summary"); if (s && open.indexOf(s.textContent) >= 0 && !d.open && (d.classList.contains("mkt") || d.classList.contains("fold"))) d.open = true; });
    if (typeof armCharts === "function") armCharts(); if (typeof fx === "function") fx();
  }

  /* Depot: Themen (Klumpenrisiko) und Positionsrechner */
  var THEMES = ["KI / Halbleiter / Rechenzentrum", "Software / Internet", "Rüstung", "Industrie / Infrastruktur", "Gesundheit", "Konsum / Finanzen", "Breite Aktien-ETFs", "Rohstoffe", "Sonstiges"];
  function guessTheme(sec) {
    sec = String(sec || "");
    if (/halbleiter|semicond|chip|rechenzent|datenspeicher|speicher|ki\b|ai\b|server|netzwerk/i.test(sec)) return THEMES[0];
    if (/software|internet|cloud|plattform|werbung|e-commerce|zahlungs/i.test(sec)) return THEMES[1];
    if (/rüstung|verteidig|defen|luftfahrt/i.test(sec)) return THEMES[2];
    if (/industrie|bau|infrastr|elektr|maschin|energie|strom/i.test(sec)) return THEMES[3];
    if (/medizin|pharma|gesund|biotech/i.test(sec)) return THEMES[4];
    if (/konsum|luxus|handel|bank|versicher|finanz|zahlung/i.test(sec)) return THEMES[5];
    return THEMES[8];
  }
  function themeOfPos(p) { if (p.theme) return p.theme; if (p.kind === "etf") return THEMES[6]; if (p.kind === "rohstoff") return THEMES[7]; var t = thesisFor(p); return guessTheme(t && t.sector); }
  function themeSums(list) { var m = {}; list.forEach(function (p) { var k = themeOfPos(p); m[k] = (m[k] || 0) + p.value; }); return m; }
  function klumpenBox(list, tot) {
    var m = themeSums(list), lim = limOf("maxtheme"), ks = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    var max = Math.max.apply(null, ks.map(function (k) { return m[k] / tot * 100; }).concat([lim]));
    var rows = ks.map(function (k) {
      var w = m[k] / tot * 100, over = w > lim && k !== THEMES[6] && k !== THEMES[7];
      var names = list.filter(function (p) { return themeOfPos(p) === k; }).map(function (p) { return p.name.replace(/ \(Acc\)| USD| EUR/g, ""); }).join(", ");
      return '<div class="krow' + (over ? " over" : "") + '"><span class="kn" title="' + esc(names) + '">' + esc(k) + '<small>' + esc(short(names, 70)) + '</small></span><span class="kb"><i style="width:' + (w / max * 100).toFixed(1) + '%"></i><u style="left:' + (lim / max * 100).toFixed(1) + '%"></u></span><span class="kv2">' + nf1.format(w) + " %" + (over ? " ⚠" : "") + "</span></div>";
    }).join("");
    return '<div class="box" style="margin-bottom:14px"><div class="boxtitle"><span>' + gl("Klumpenrisiko") + ": Aufteilung nach Thema</span><span>Grenze " + lim + " % je Thema</span></div>" + rows +
      '<div class="cap">Breite ETFs enthalten Technologie und KI zusätzlich indirekt (nicht eingerechnet). Die Zuordnung ist grob und steht je Position im Feld theme in depot.json.</div></div>';
  }
  function calcBox(list, tot) {
    var topIds = topList().map(function (t) { return t.id; });
    var op = function (v, t) { return '<option value="' + v + '">' + esc(t) + "</option>"; };
    var depotOpts = list.filter(function (p) { return p.kind === "aktie"; }).map(function (p, i) { return op("p:" + dpos.indexOf(p), p.name + " (Depot)"); }).join("");
    var topOpts = topList().map(function (t) { return op("t:" + t.id, t.name + " · Score " + scoreTotal(t)); }).join("");
    var restOpts = theses.filter(function (t) { return isOpen(t) && topIds.indexOf(t.id) < 0 && scoreTotal(t) != null; }).sort(byScore).map(function (t) { return op("t:" + t.id, t.name + " · Score " + scoreTotal(t)); }).join("");
    return '<div class="box calc" style="margin-bottom:14px"><div class="boxtitle"><span>Positionsrechner: Was ändert ein Kauf an meinem Depot?</span></div>' +
      '<div class="calc-in"><label>Aktie<select data-calc="stock"><optgroup label="In deinem Depot">' + depotOpts + '</optgroup><optgroup label="Radar Top ' + TOPN + '">' + topOpts + '</optgroup><optgroup label="Weitere Thesen">' + restOpts + '</optgroup></select></label>' +
      '<label>Betrag in €<input type="number" data-calc="amt" value="1000" min="0" step="100"></label>' +
      '<label>Thema<select data-calc="theme"><option value="">automatisch</option>' + THEMES.map(function (t) { return op(t, t); }).join("") + "</select></label></div>" +
      '<div class="calc-out" id="calc-out"></div><div class="cap">Rechnung mit frischem Geld, ohne Umschichtung. Keine Empfehlung: Sie zeigt nur, wie sich Größe, Thema und mögliches Verlustrisiko deiner Positionen verändern.</div></div>';
  }
  function calcUpdate() {
    var out = document.getElementById("calc-out"); if (!out || !dpos.length) return;
    var sel = document.querySelector('[data-calc="stock"]'), amt = parseFloat(document.querySelector('[data-calc="amt"]').value) || 0, thSel = document.querySelector('[data-calc="theme"]').value;
    var tot = dpos.reduce(function (a, p) { return a + p.value; }, 0), key = sel.value, cur = 0, theme, name, t = null, kindE = true;
    if (key.indexOf("p:") === 0) { var p = dpos[+key.slice(2)]; cur = p.value; name = p.name; theme = themeOfPos(p); t = thesisFor(p); }
    else { t = byIdMap[key.slice(2)]; name = t.name; var held = dpos.filter(function (p) { return p.ticker && p.ticker === t.ticker; })[0]; cur = held ? held.value : 0; theme = held ? themeOfPos(held) : guessTheme(t.sector); }
    if (thSel) theme = thSel;
    var ms = themeSums(dpos), before = (ms[theme] || 0) / tot * 100, after = ((ms[theme] || 0) + amt) / (tot + amt) * 100;
    var pos = cur + amt, posPct = pos / (tot + amt) * 100, mp = limOf("maxpos"), mt = limOf("maxtheme");
    var einzel = dpos.filter(function (p) { return p.kind === "aktie"; }).reduce(function (a, p) { return a + p.value; }, 0), e0 = einzel / tot * 100, e1 = (einzel + amt) / (tot + amt) * 100;
    var chip = function (ok, txt) { return '<li class="' + (ok ? "okc" : "badc") + '">' + (ok ? "✓ " : "⚠ ") + txt + "</li>"; };
    var rc = t ? ruleCheck(t) : null, l5 = pos * 0.3, l5p = l5 / (tot + amt) * 100, l50 = pos * 0.5;
    out.innerHTML = "<ul>" +
      chip(posPct <= mp, "Position " + esc(name) + ": " + eur(pos) + " = <b>" + nf1.format(posPct) + " %</b> vom Depot (deine Grenze " + mp + " %)") +
      (theme !== THEMES[6] && theme !== THEMES[7] ? chip(after <= mt, "Thema „" + esc(theme) + "“: " + nf1.format(before) + " % → <b>" + nf1.format(after) + " %</b> (deine Grenze " + mt + " %)") : '<li class="okc">Thema „' + esc(theme) + "“: " + nf1.format(before) + " % → " + nf1.format(after) + " %</li>") +
      '<li class="okc">Einzelaktien-Anteil: ' + nf1.format(e0) + " % → " + nf1.format(e1) + " %. Depotwert danach: " + eur(tot + amt) + "</li>" +
      '<li class="' + (l5p > 5 ? "badc" : "okc") + '">Verlustrisiko: Fällt diese Position um 30 %, sind das ' + eur(l5) + " (" + nf1.format(l5p) + " % vom Depot), bei 50 % " + eur(l50) + "</li>" +
      (rc ? '<li class="' + (rc.no ? "badc" : "okc") + '">Deine Regeln: ' + rc.ok + " von " + rc.tot + " erfüllt" + (rc.no ? " (offen: " + esc(rc.items.filter(function (i) { return i.ok === false; }).map(function (i) { return i.label.replace(/ \(.*\)| mindestens| höchstens/g, ""); }).join(", ")) + ")" : "") + "</li>" : "") + "</ul>";
  }

  /* Vergleich zweier Aktien */
  function cmpData(t) {
    var e = t.est || {}, g = t.growth || {}, P = g.periods, m = growthMetrics(t), per = m ? m.per : 4, nm = null, fm = null;
    if (P && P.revenue && P.net_income) { var r = sumN(P.revenue, 0, per), n = sumN(P.net_income, 0, per); if (r > 0 && n != null) nm = n / r * 100; }
    if (num(e.fcf_last) != null && e.rev && num(e.rev[4]) > 0) fm = e.fcf_last / e.rev[4] * 100;
    var ne = nextEvt(t), rc = ruleCheck(t), r0 = rankMap[t.id];
    return { sc: scoreTotal(t), rank: r0 ? r0.rank : null, up: upside(t), dd: curDD(t), rev: revTTM(t), ni: niTTM(t), nm: nm, fm: fm, pe: num(e.fpe), ne: ne, rc: rc, risk: t.counter, ex: num(e.rev && e.rev[5] && e.rev[4] ? gOf(e.rev[5], e.rev[4]) : null) };
  }
  function cmpTable(a, b) {
    var A = cmpData(a), B = cmpData(b);
    var row = function (lab, key, fmt, better, glk) {
      var x = A[key], y = B[key], w = null;
      if (better && x != null && y != null && x !== y) w = (better === "hi" ? x > y : x < y) ? "a" : "b";
      return "<tr><td>" + (glk ? gl(lab, glk) : esc(lab)) + '</td><td data-l="' + esc(a.name) + '" class="' + (w === "a" ? "win" : "") + '">' + (x == null ? "–" : fmt(x)) + '</td><td data-l="' + esc(b.name) + '" class="' + (w === "b" ? "win" : "") + '">' + (y == null ? "–" : fmt(y)) + "</td></tr>";
    };
    var P1 = function (v) { return nf1.format(v) + " %"; }, S1 = function (v) { return sgn(v); };
    return '<div class="tablebox scroll"><table class="list top cmp"><thead><tr><th></th><th>' + esc(a.name) + "</th><th>" + esc(b.name) + "</th></tr></thead><tbody>" +
      row("Score", "sc", function (v) { return v; }, "hi", "Score") + row("Rang", "rank", function (v) { return v; }, "lo") + row("Kurspotenzial", "up", S1, "hi", "Kurspotenzial") + row("Abstand zum Hoch", "dd", P1, null, "Abstand zum Hoch") +
      row("Umsatzwachstum (12 M.)", "rev", gSigned, "hi", "Umsatzwachstum") + row("Gewinnwachstum (12 M.)", "ni", gSigned, "hi", "Gewinnwachstum") + row("Nettomarge", "nm", P1, "hi", "Gewinn pro 100 € Umsatz") + row("Freier Cashflow vom Umsatz", "fm", P1, "hi", "Freier Cashflow") + row("Erwartetes KGV", "pe", function (v) { return nf1.format(v); }, "lo", "Bewertung (KGV)") +
      '<tr><td>' + gl("Regeln") + '</td><td data-l="' + esc(a.name) + '">' + ruleBadge(a) + '</td><td data-l="' + esc(b.name) + '">' + ruleBadge(b) + "</td></tr>" +
      '<tr><td>Nächster Termin</td><td data-l="' + esc(a.name) + '">' + (A.ne ? date(A.ne.date) + " · " + esc(short(A.ne.event.replace(/\s*\(.*?\)/g, ""), 40)) : "–") + '</td><td data-l="' + esc(b.name) + '">' + (B.ne ? date(B.ne.date) + " · " + esc(short(B.ne.event.replace(/\s*\(.*?\)/g, ""), 40)) : "–") + "</td></tr>" +
      '<tr><td>Größtes Risiko</td><td class="wrap" data-l="' + esc(a.name) + '">' + esc(A.risk) + '</td><td class="wrap" data-l="' + esc(b.name) + '">' + esc(B.risk) + "</td></tr></tbody></table></div>" +
      '<div class="cap">Grün = bessere Zahl in dieser Zeile. Das ist ein Zahlenvergleich, keine Empfehlung. Erst die Risiken und die Regeln lesen.</div>';
  }
  function cmpBox() {
    var open = theses.filter(function (t) { return isOpen(t) && scoreTotal(t) != null; }).sort(byScore);
    if (open.length < 2) return "";
    var opts = open.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + " · " + scoreTotal(t) + "</option>"; }).join("");
    return '<details class="mkt box" style="padding:14px 16px"><summary><h2>Zwei Aktien vergleichen</h2><span class="meta">Zahlen nebeneinander</span></summary><div style="margin-top:12px"><div class="calc-in"><label>Aktie A<select data-cmp="a">' + opts + '</select></label><label>Aktie B<select data-cmp="b">' + opts.replace('value="' + esc(open[1].id) + '"', 'value="' + esc(open[1].id) + '" selected') + '</select></label></div><div id="cmp-out">' + cmpTable(open[0], open[1]) + "</div></div></details>";
  }
  function cmpUpdate() {
    var a = document.querySelector('[data-cmp="a"]'), b = document.querySelector('[data-cmp="b"]'), o = document.getElementById("cmp-out");
    if (a && b && o && byIdMap[a.value] && byIdMap[b.value]) o.innerHTML = cmpTable(byIdMap[a.value], byIdMap[b.value]);
  }

  /* Ereignisse der Entscheidungshilfe */
  function dlJSON(name, obj) {
    try { var b = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); } catch (e) { /* optional */ }
  }
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest ? ev.target : null; if (!el) return;
    var pr = el.closest("[data-prr]");
    if (pr) {
      var pbox = pr.closest(".prbox"), ptt = pbox ? byIdMap[pbox.getAttribute("data-t")] : null;
      if (ptt) { pbox.querySelector(".prc").innerHTML = prSvg(ptt, pr.getAttribute("data-prr")); Array.prototype.forEach.call(pbox.querySelectorAll("[data-prr]"), function (b) { b.setAttribute("aria-pressed", String(b === pr)); }); }
      return;
    }
    var ab = el.closest("[data-ana-go]");
    if (ab) {
      var aid = ab.getAttribute("data-ana-go"); closeDetail(); show("methodik", true);
      setTimeout(function () { var all = document.getElementById("ana-all"); if (all) all.open = true; var dd = document.querySelector('details[data-ana="' + aid + '"]'); if (dd) { dd.open = true; dd.scrollIntoView({ behavior: "smooth", block: "start" }); } }, 340);
      return;
    }
    var b = el.closest("[data-jsave]");
    if (b) { var id = b.getAttribute("data-jsave"), wrap = b.closest(".jr"); journalSave(id, wrap); var t = byIdMap[id]; wrap.outerHTML = journalBlock(t); var hd = document.querySelector(".dhead"); if (hd) hd.outerHTML = decisionHead(t); return; }
    b = el.closest("[data-jdel]");
    if (b) { var p = b.getAttribute("data-jdel").split(":"), j = lsGet("radar-journal", {}); if (j[p[0]]) { j[p[0]].splice(+p[1], 1); lsSet("radar-journal", j); } var t2 = byIdMap[p[0]], w2 = b.closest(".jr"); w2.outerHTML = journalBlock(t2); var hd2 = document.querySelector(".dhead"); if (hd2) hd2.outerHTML = decisionHead(t2); return; }
    b = el.closest("[data-alert]");
    if (b) { show("themen", true); var m = document.querySelector("#tab-themen details.mkt"); if (m) { m.open = true; var ev2 = document.querySelector("#tab-themen details.evt"); if (ev2) ev2.open = true; setTimeout(function () { (ev2 || m).scrollIntoView({ behavior: "smooth", block: "center" }); }, 120); } return; }
    b = el.closest("[data-gotab]");
    if (b) { show(b.getAttribute("data-gotab"), true); return; }
    if (el.closest("[data-rreset]")) { lsSet("radar-rules", {}); rerenderAll(); return; }
    if (el.closest("[data-rexport]")) { dlJSON("aktien-radar-regeln-und-notizen.json", { version: 1, rules: rulesCfg(), journal: lsGet("radar-journal", {}) }); return; }
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target, cfg, c;
    if (!el.matches) return;
    if (el.matches("[data-ron]")) { cfg = rulesCfg(); c = cfg[el.getAttribute("data-ron")] = cfg[el.getAttribute("data-ron")] || {}; c.on = el.checked; lsSet("radar-rules", cfg); rerenderAll(); }
    else if (el.matches("[data-rv]")) { cfg = rulesCfg(); c = cfg[el.getAttribute("data-rv")] = cfg[el.getAttribute("data-rv")] || {}; var v = parseFloat(el.value); if (isFinite(v)) c[el.getAttribute("data-f")] = v; lsSet("radar-rules", cfg); rerenderAll(); }
    else if (el.matches("[data-lim]")) { cfg = rulesCfg(); cfg.lim = cfg.lim || {}; var v2 = parseFloat(el.value); if (isFinite(v2)) cfg.lim[el.getAttribute("data-lim")] = v2; lsSet("radar-rules", cfg); rerenderAll(); }
    else if (el.matches("[data-rimport]")) {
      var f = el.files && el.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { try { var o = JSON.parse(rd.result); if (o.rules) lsSet("radar-rules", o.rules); if (o.journal) lsSet("radar-journal", o.journal); rerenderAll(); } catch (e) { /* ungültige Datei */ } }; rd.readAsText(f);
    }
    else if (el.matches("[data-calc]")) calcUpdate();
    else if (el.matches("[data-cmp]")) cmpUpdate();
  });
  document.addEventListener("input", function (ev) { if (ev.target.matches && ev.target.matches('[data-calc="amt"]')) calcUpdate(); });

  /* ---------- KI-Frühwarnung: Ampel für den KI- und Chip-Block ---------- */
  var AI_IDS = { "msft-microsoft": 1, "meta-meta-platforms": 1, "orcl-oracle": 1 };
  var AI_RE = /halbleiter|speicher|datenspeicher|optisch|rechenzentr|ki-|leiterplatt|elektronik|test- und messtechnik|server|cloud-infra/i;
  function isAI(t) { return !!AI_IDS[t.id] || AI_RE.test(String(t.sector || "")); }
  function aiWarn() {
    var mem = theses.filter(isOpen).filter(isAI), rows = [];
    mem.forEach(function (t) { var m = mom(t); if (m) rows.push({ t: t, m: m }); });
    if (rows.length < 5) return "";
    var below = rows.filter(function (r) { return r.m.above < 0; }).length, shareB = below / rows.length * 100;
    var m1s = rows.filter(function (r) { return r.m.m1 != null; }), avg1 = m1s.reduce(function (a, r) { return a + r.m.m1; }, 0) / (m1s.length || 1);
    var worst = rows.slice().sort(function (a, b) { return (a.m.m1 == null ? 0 : a.m.m1) - (b.m.m1 == null ? 0 : b.m.m1); }).slice(0, 3);
    var lvl = shareB >= 50 || avg1 <= -12 ? "rot" : shareB >= 30 || avg1 <= -6 ? "gelb" : "gruen";
    var lab = { rot: "Rot: Schwäche im ganzen Block", gelb: "Gelb: erhöhte Vorsicht", gruen: "Grün: Trend intakt" }[lvl];
    var why = { rot: "Mindestens die Hälfte der Werte liegt unter der 200-Tage-Linie oder der Monatsdurchschnitt ist bei −12 % oder schlechter.", gelb: "Mindestens ein Drittel der Werte liegt unter der 200-Tage-Linie oder der Monatsdurchschnitt ist bei −6 % oder schlechter.", gruen: "Weniger als ein Drittel der Werte unter der 200-Tage-Linie, Monatsdurchschnitt besser als −6 %." }[lvl];
    var asof = rows.reduce(function (a, r) { return r.m.asof > a ? r.m.asof : a; }, "");
    var dep = "";
    if (dpos.length) {
      var tot = 0, ai = 0, names = [];
      dpos.forEach(function (p) {
        var v = num(p.value) || 0; tot += v;
        var th = p.ticker ? theses.filter(function (t) { return t.ticker === p.ticker; })[0] : null;
        if ((th && isAI(th)) || /ai\s*&\s*big\s*data/i.test(p.name || "")) { ai += v; names.push(p.name); }
      });
      if (tot > 0) dep = '<div class="aw-r"><span>Dein Depot</span><b>' + nf0.format(ai / tot * 100) + " % hängen direkt am Block</b> <span class=\"meta\">(" + eur0(ai) + " von " + eur0(tot) + "; Nasdaq-100-ETF mit hohem Tech-Anteil nicht eingerechnet)</span></div>";
    }
    var evs = [], lr = lastRun(), me = lr && lr.market && Array.isArray(lr.market.events) ? lr.market.events : [];
    me.forEach(function (e) { var d = daysTo(e.date); if (d != null && d >= 0 && d <= 10 && e.status !== "vorbei" && (e.importance === "hoch" || e.importance === "mittel")) evs.push({ d: d, t: date(e.date) + " " + esc(e.name) }); });
    var ern = [];
    rows.forEach(function (r) { var c = r.t.catalyst || {}, d = daysTo(c.date); if (d != null && d >= 0 && d <= 10) ern.push({ d: d, t: esc(r.t.ticker) + " " + date(c.date) }); });
    evs.sort(function (a, b) { return a.d - b.d; }); ern.sort(function (a, b) { return a.d - b.d; });
    return '<section class="box aw aw-' + lvl + '" aria-label="KI-Frühwarnung"><div class="aw-h"><span class="aw-dot" aria-hidden="true"></span><div><b>KI-Frühwarnung: ' + lab + '</b><div class="meta">' + rows.length + " Thesen im KI- und Chip-Block, Stand der Kurse " + date(asof) + "</div></div></div>" +
      '<div class="aw-r"><span>Unter der 200-Tage-Linie</span><b>' + below + " von " + rows.length + " (" + nf0.format(shareB) + " %)</b></div>" +
      '<div class="aw-r"><span>Ø-Kurs letzter Monat</span><b class="' + (avg1 >= 0 ? "pos" : "neg") + '">' + sgn(avg1) + "</b></div>" +
      '<div class="aw-r"><span>Schwächste drei</span><b>' + worst.map(function (r) { return esc(r.t.ticker) + " " + (r.m.m1 == null ? "–" : sgn(r.m.m1)); }).join(" · ") + "</b></div>" + dep +
      (evs.length ? '<div class="aw-r"><span>Termine bis 10 Tage</span><b>' + evs.slice(0, 4).map(function (e) { return e.t; }).join(" · ") + "</b></div>" : "") +
      (ern.length ? '<div class="aw-r"><span>Quartalszahlen im Block</span><b>' + ern.length + " (" + ern.slice(0, 6).map(function (e) { return e.t; }).join(", ") + (ern.length > 6 ? " …" : "") + ")</b></div>" : "") +
      '<p class="cap">' + why + " Die Ampel zeigt erhöhtes Risiko, sie sagt keinen Zeitpunkt voraus und ist keine Handlungsempfehlung. Grundlage: Wochenschlusskurse (Yahoo).</p></section>";
  }

  function runStatus() {
    var st = null; try { var el = document.getElementById("radar-status"); st = el ? JSON.parse(el.textContent) : null; } catch (e) { st = null; }
    if (!st || !st.end) return '<section class="box runst runst-grau" aria-label="Lauf-Status"><div class="rs-h"><span class="aw-dot" aria-hidden="true"></span><div><b>Lauf-Status</b><div class="meta">Noch kein Lauf-Protokoll. Es erscheint nach dem nächsten Lauf.</div></div></div></section>';
    var e = new Date(st.end), now = new Date(), wd = 0, d, k, lvl = st.state || "gelb", note = "";
    for (k = 1; k < 8; k++) { d = new Date(e.getFullYear(), e.getMonth(), e.getDate() + k); if (d > now) break; if (d.getDay() > 0 && d.getDay() < 6) wd++; }
    if (wd >= 2) { lvl = "rot"; note = "Seit " + wd + " Handelstagen kein neuer Lauf. Der Plan lief vermutlich nicht."; }
    else if (wd === 1 && now.getHours() >= 19) { if (lvl === "gruen") lvl = "gelb"; note = "Heute wurde noch kein Lauf gemeldet."; }
    var kind = st.type === "deep" ? "Tiefer Lauf" : st.type === "update" ? "Update" : "Lauf";
    var lab = { gruen: "sauber durchgelaufen", gelb: "mit Hinweisen", rot: "mit Fehlern" }[st.state] || "unklar";
    var when = e.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + ", " + String(e.getHours()).padStart(2, "0") + ":" + String(e.getMinutes()).padStart(2, "0") + " Uhr";
    var rows = (st.checks || []).map(function (c) { return '<li class="' + (c.ok ? "ok" : c.sev === "err" ? "bad" : "warn") + '"><b>' + (c.ok ? "✓" : c.sev === "err" ? "✕" : "!") + " " + esc(c.n) + "</b><span>" + esc(c.d) + "</span></li>"; }).join("");
    return '<section class="box runst runst-' + lvl + '" aria-label="Lauf-Status"><div class="rs-h"><span class="aw-dot" aria-hidden="true"></span><div><b>' + kind + " " + esc(when) + ": " + lab + "</b>" + (note ? '<div class="rs-note">' + esc(note) + "</div>" : "") + "</div></div>" +
      '<details class="rs-d"><summary>Prüfungen ansehen (' + (st.checks || []).length + ')</summary><ul class="rs-l">' + rows + "</ul></details></section>";
  }
  /* ---------- Sektoren (ersetzt die Top 10): je klassischem Sektor die besten Thesen, filterbar ---------- */
  var SEK_ID = {"isrg-intuitive-surgical":"Health Care","avgo-broadcom":"Information Technology","hwm-howmet-aerospace":"Industrials","uber-uber-technologies":"Industrials","sap-sap":"Information Technology","g24-scout24":"Communication Services","rel-relx":"Industrials","wkl-wolters-kluwer":"Industrials","adsk-autodesk":"Information Technology","bkng-booking-holdings":"Consumer Discretionary","nem-nemetschek":"Information Technology","vh2-friedrich-vorwerk":"Industrials","orcl-oracle":"Information Technology","app-applovin":"Information Technology","vrt-vertiv":"Industrials","alny-alnylam":"Health Care","besi-be-semiconductor":"Information Technology","disco-disco":"Information Technology","strl-sterling-infrastructure":"Industrials","argx-argenx":"Health Care","mpwr-monolithic-power":"Information Technology","cohr-coherent":"Information Technology","axon-axon-enterprise":"Industrials","cls-celestica":"Information Technology","enr-siemens-energy":"Industrials","amat-applied-materials":"Information Technology","ifx-infineon":"Information Technology","stx-seagate":"Information Technology","asm-asm-international":"Information Technology","6723-renesas":"Information Technology","lrcx-lam-research":"Information Technology","jbl-jabil":"Information Technology","ftk-flatexdegiro":"Financials","msft-microsoft":"Information Technology","nvda-nvidia":"Information Technology","meta-meta-platforms":"Communication Services","rhm-rheinmetall":"Industrials","eme-emcor":"Industrials","hag-hensoldt":"Industrials","sndk-sandisk":"Information Technology","wdc-western-digital":"Information Technology","crdo-credo":"Information Technology","nbix-neurocrine-biosciences":"Health Care","fn-fabrinet":"Information Technology","cien-ciena":"Information Technology","tsem-tower-semiconductor":"Information Technology","rddt-reddit":"Communication Services","lite-lumentum":"Information Technology","samsung-electronics":"Information Technology","nanya-technology":"Information Technology","winbond-electronics":"Information Technology","elite-material":"Information Technology","isu-petasys":"Information Technology","2059-king-slide":"Industrials","2360-chroma-ate":"Information Technology","2368-gold-circuit":"Information Technology","aeis-advanced-energy":"Information Technology","flex-flex":"Information Technology","agi-alamos-gold":"Materials","207940-samsung-biologics":"Health Care","1801-innovent-biologics":"Health Care","2345-accton":"Information Technology","2308-delta-electronics":"Information Technology","2317-hon-hai-precision":"Information Technology","2327-yageo":"Information Technology","3665-bizlink":"Industrials","3036-wt-microelectronics":"Information Technology","mu-micron":"Information Technology","ter-teradyne":"Information Technology","mrvl-marvell":"Information Technology"};
  var SEK_DE = {"Information Technology":"Technologie","Communication Services":"Kommunikation","Health Care":"Gesundheit","Industrials":"Industrie","Materials":"Rohstoffe","Financials":"Finanzen","Consumer Discretionary":"Zyklischer Konsum","Consumer Staples":"Basiskonsum","Energy":"Energie","Real Estate":"Immobilien","Utilities":"Versorger"};
  var SEK_ORD = ["Information Technology", "Industrials", "Health Care", "Communication Services", "Consumer Discretionary", "Financials", "Materials", "Energy", "Consumer Staples", "Real Estate", "Utilities"];
  var skS = { v: "top", s: "alle", n: 5 };
  try { var _sk = JSON.parse(localStorage.getItem("radar-sek") || "null"); if (_sk && _sk.s) skS = _sk; } catch (e) {}
  skS.v = skS.v === "sek" ? "sek" : "top";
  function sektor(t) { return t.gics || SEK_ID[t.id] || "Sonstige"; }
  function sektorBlock(valid0) {
    var open = skS.v === "top" ? valid0 : theses.filter(isOpen), by = {}; open.slice().sort(byScore).forEach(function (t) { var k = sektor(t); (by[k] = by[k] || []).push(t); });
    var F = null; try { var _f = document.getElementById("radar-faktor"); F = _f ? JSON.parse(_f.textContent) : null; } catch (e) { F = null; }
    var keys = SEK_ORD.slice(); Object.keys(by).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var show = skS.s === "alle" ? keys : [skS.s], lim = skS.n === 0 ? 999 : skS.n;
    var chips = '<button type="button" class="sk-c' + (skS.s === "alle" ? " on" : "") + '" data-sk="alle">Alle <i>' + open.length + "</i></button>" + keys.map(function (k) { var n = (by[k] || []).length; return '<button type="button" class="sk-c' + (skS.s === k ? " on" : "") + (n ? "" : " leer") + '" data-sk="' + esc(k) + '">' + esc(SEK_DE[k] || k) + " <i>" + n + "</i></button>"; }).join("");
    var seg = [[5, "Top 5"], [10, "Top 10"], [0, "Alle"]].map(function (a) { return '<button type="button" class="sk-c' + (skS.n === a[0] ? " on" : "") + '" data-skn="' + a[0] + '">' + a[1] + "</button>"; }).join("");
    var body = show.map(function (k) {
      var l = by[k] || [], cand = F && F.top ? F.top.filter(function (x) { return x.sc === k && !x.radar; }).slice(0, 5) : [];
      var h = '<section class="sk-sec"><h3>' + esc(SEK_DE[k] || k) + ' <span class="count">' + Math.min(l.length, lim) + (l.length > lim ? " von " + l.length : "") + "</span></h3>";
      if (!l.length) h += '<p class="cap">Keine These mit Score ab ' + TH + " in diesem Sektor.</p>";
      else h += '<div class="grid tiles">' + l.slice(0, lim).map(function (t) { return tile(t); }).join("") + "</div>";
      if (cand.length) h += '<p class="cap sk-cand">Im Faktor-Ranking, noch ohne These: ' + cand.map(function (x) { return "<b>" + esc(x.n || x.s) + "</b> (" + x.score + ")"; }).join(", ") + ".</p>";
      return h + "</section>";
    }).join("");
    var view = '<div class="sk-bar sk-v" role="group" aria-label="Ansicht"><button type="button" class="sk-c' + (skS.v === "top" ? " on" : "") + '" data-skv="top">Top 10 gesamt</button><button type="button" class="sk-c' + (skS.v !== "top" ? " on" : "") + '" data-skv="sek">Nach Sektoren</button></div>';
    if (skS.v === "top") {
      var tl = valid0.slice().sort(byScore).slice(0, 10);
      return '<div class="tiles-wrap"><h2>Top 10 <span class="count">' + tl.length + "</span></h2>" + view + '<p class="cap">Die zehn Thesen mit dem höchsten Score ab ' + TH + ", über alle Sektoren.</p>" + '<div class="grid tiles">' + tl.map(function (t) { return tile(t); }).join("") + '</div></div><div id="t10extra"></div>';
    }
    var low = open.filter(function (t) { return !valid(t); }).length;
    return '<div class="tiles-wrap"><h2>Nach Sektoren <span class="count">' + open.length + "</span></h2>" + view + '<div class="sk-bar" role="group" aria-label="Sektor wählen">' + chips + '</div><div class="sk-bar sk-n" role="group" aria-label="Anzahl je Sektor">' + seg + "</div>" + (low ? '<p class="cap">Je Sektor die besten Thesen, auch mit Score unter ' + TH + " (" + low + " Thesen), damit jeder Sektor vertreten ist. Nur Thesen ab " + TH + " zählen für die Top 10.</p>" : "") + body + '</div><div id="t10extra"></div>';
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-sk],[data-skn],[data-skv]"); if (!b) return;
    if (b.hasAttribute("data-skv")) skS.v = b.getAttribute("data-skv"); else if (b.hasAttribute("data-sk")) skS.s = b.getAttribute("data-sk"); else skS.n = +b.getAttribute("data-skn");
    try { localStorage.setItem("radar-sek", JSON.stringify(skS)); } catch (e) {}
    renderToday(); armCharts(); fx();
  });

  /* ---------- Tages-Scanner (Auswertung, keine Orders) ---------- */
  var TRD = null; try { var _tr = document.getElementById("radar-trader"); TRD = _tr ? JSON.parse(_tr.textContent) : null; } catch (e) { TRD = null; }
  function trdN(v, cur) { if (v == null) return "–"; var big = Math.abs(v) >= 1000; return (big ? nf0 : nf2).format(v) + (cur ? " " + esc(cur === "GBp" ? "p" : cur) : ""); }
  function trdPlan(x, cur) {
    if (!x || !x.plan) return "";
    var p = x.plan;
    return "Einstieg " + trdN(x.c, cur) + "<br>Stop " + trdN(p.stop) + " (−" + nf1.format(p.r_pct) + " %)<br>Ziel " + trdN(p.ziel) + " (2R)";
  }
  function trdChips(set) { return (set || []).map(function (s) { return '<span class="trd-ch' + (s === "oversold" ? " dn" : "") + '">' + esc((TRD && TRD.regeln && TRD.regeln[s]) || s) + "</span>"; }).join(""); }
  function traderBlock() {
    if (!TRD || !TRD.thesen) return "";
    var rows = [];
    theses.filter(isOpen).forEach(function (t) { var x = TRD.thesen[t.id]; if (x && x.set && x.set.length) rows.push({ t: t, x: x }); });
    rows.sort(function (a, b) { return byScore(a.t, b.t); });
    var h = rows.map(function (r) {
      return '<button type="button" class="trd-r" data-trd="' + esc(r.t.id) + '"><span><b>' + esc(r.t.name) + "</b><small>Score " + (scoreTotal(r.t) != null ? scoreTotal(r.t) : "–") + " · RSI " + (r.x.rsi != null ? nf0.format(r.x.rsi) : "–") + " · Stand " + date(r.x.d) + "</small>" + trdChips(r.x.set) + '</span><span class="pl">' + trdPlan(r.x, r.x.cur) + "</span></button>";
    }).join("");
    var act = (TRD.aktiv && TRD.aktiv.treffer) || [];
    var ah = act.map(function (a) {
      return '<div class="trd-r st"><span><b>' + esc(a.nm) + "</b><small>" + esc(a.s) + " · RSI " + (a.rsi != null ? nf0.format(a.rsi) : "–") + "</small>" + trdChips(a.set) + '</span><span class="pl">' + trdPlan(a, "USD") + "</span></div>";
    }).join("");
    return '<section class="trd"><h3>Tages-Scanner <span class="count">' + rows.length + "</span></h3>" +
      '<p class="cap">Chart-Setups aus Tageskursen für deine ' + Object.keys(TRD.thesen).length + " Thesen (Stand " + date(TRD.asof) + "). Ein Treffer ist ein Anlass, den Chart anzusehen, keine Kaufempfehlung und keine Prognose. Stop = Einstieg minus 2 × ATR, Ziel = 2R. Reine Rechenbeispiele, es werden keine Orders erzeugt.</p>" +
      (h || '<p class="cap">Heute erfüllt keine These eine Setup-Regel.</p>') +
      (ah ? "<details><summary>Meistgehandelt (US), " + act.length + " von " + TRD.aktiv.n + " mit Setup</summary>" + ah + "</details>" : "") +
      '<details><summary>Regeln</summary><p class="cap">' + Object.keys(TRD.regeln || {}).map(function (k) { return "<b>" + esc(TRD.regeln[k]) + "</b>"; }).join(", ") + ". " + esc(TRD.hinweis || "") + "</p></details></section>";
  }
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-trd]"); if (b) openDetail(b.getAttribute("data-trd"), b); });
  function trdRow(t) {
    var x = TRD && TRD.thesen && TRD.thesen[t.id]; if (!x || !x.plan) return "";
    return '<div class="kv"><b>Rechenbeispiel Stop und Ziel</b><span>Einstieg ' + trdN(x.c, x.cur) + ", Stop " + trdN(x.plan.stop) + " (2 × ATR, −" + nf1.format(x.plan.r_pct) + " %), Ziel " + trdN(x.plan.ziel) + " (Reward:Risk 2,0)" + (x.set && x.set.length ? " · Setup: " + x.set.map(function (s) { return esc(TRD.regeln[s] || s); }).join(", ") : "") + (x.chk !== "ok" ? " · " + esc(x.chk) : "") + " (Stand " + date(x.d) + "). Kein Kaufsignal.</span></div>";
  }
  function renderToday() {
    var open = theses.filter(isOpen).filter(valid);
    var broken = open.filter(function (t) { return status(t) === "verletzt"; });
    var fresh = open.filter(function (t) { return status(t) === "neu"; });
    var watch = open.filter(function (t) { return status(t) === "beobachten"; });
    var html;
    if (!theses.length) {
      html = empty("Noch keine Daten", "Öffne Claude Code in diesem Ordner und tippe /radar deep. Danach erscheinen hier Markteinschätzung, Top 10 und Score-Verlauf.");
    } else {
      html = foldRank(open);
      if (!open.length) html += empty("Keine These mit Score ab " + TH, "Alle Thesen mit niedrigerem Score stehen unter „Alle Thesen“.");
      else html += sektorBlock(open);
    }
    var info = rulesBox() + anaList() + coverageBlock();
    var last = lastRun();
    if (last) info += '<p class="meta" style="margin-top:22px">Letzter Lauf ' + date(last.date) + (last.time ? ", " + esc(last.time) + " Uhr" : "") + (last.type ? " (" + esc(last.type === "deep" ? "tief" : "Update") + ")" : "") + ": " + linkify(last.summary || "") + "</p>";
    document.getElementById("tab-heute").innerHTML = html; var idyn = document.getElementById("info-dyn"); if (idyn) idyn.innerHTML = info || "";
  }

  /* ---------- v4: Score-Verlauf, Rangänderungen, Markt ---------- */
  function slog(t) {
    return (Array.isArray(t.score_log) ? t.score_log : []).filter(function (x) { return num(x.score) != null && x.run; })
      .slice().sort(function (a, b) { return String(a.run).localeCompare(String(b.run)); });
  }
  function runKeys() {
    var k = {};
    theses.forEach(function (t) { slog(t).forEach(function (x) { k[x.run] = 1; }); });
    return Object.keys(k).sort();
  }
  function rankAt(key) {
    var arr = [];
    theses.forEach(function (t) { slog(t).forEach(function (x) { if (x.run === key) arr.push({ id: t.id, s: x.score }); }); });
    arr.sort(function (a, b) { return b.s - a.s || a.id.localeCompare(b.id); });
    var m = {}; arr.forEach(function (x, i) { m[x.id] = i + 1; }); return m;
  }
  var tipEl = document.createElement("div"); tipEl.className = "tipbox"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl);
  function tipShow(el) {
    var txt = el.getAttribute("data-tip"); if (!txt) return;
    tipEl.innerHTML = (el.getAttribute("data-tipt") ? "<b>" + esc(el.getAttribute("data-tipt")) + "</b>" : "") + esc(txt);
    tipEl.classList.add("on");
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  function tipHide() { tipEl.classList.remove("on"); }
  document.addEventListener("mouseover", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipShow(el); });
  document.addEventListener("mouseout", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipHide(); });
  document.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipShow(el); });
  document.addEventListener("focusout", tipHide);
  window.addEventListener("scroll", tipHide, { passive: true });
  function tipAttr(t) { return t && t.about ? ' data-tip="' + esc(t.about) + '" data-tipt="' + esc((t.name || t.ticker) + " · Was das Unternehmen macht") + '"' : ""; }
  function valid(t) { var s = scoreTotal(t); return s != null && s >= TH; }
  function sectorGroup(t) {
    var x = String(t.sector || "");
    if (/^(biotech|pharma|medizin)|cdmo/i.test(x)) return "Gesundheit";
    if (/broker|finanz|gold|bergbau/i.test(x)) return "Finanzen und Rohstoffe";
    if (/^(bau|energie|luftfahrt|rüstung|sicherheits|mobilität)/i.test(x)) return "Industrie, Energie, Mobilität";
    if (/halbleiter|speicher|elektronik|leiterplatt|server|netzwerktechnik|optisch|rechenzentr|stromversorgung|kabel|bauteile|test- und mess|silizium/i.test(x)) return "KI-Hardware";
    if (/software|cloud|internet|online|werbe|informations|soziales/i.test(x)) return "Software und Internet";
    return "Sonstige";
  }
  /* Streuung: Liste nach Score, aber höchstens 2 je Branchengruppe; bleibt Platz übrig, wird schrittweise auf 3, 4 … gelockert */
  function divPick(list, n, max) {
    var out = [], used = {}, cap, i;
    for (cap = max; cap <= max + 8 && out.length < n; cap++) {
      var cnt = {};
      out.forEach(function (t) { var g = sectorGroup(t); cnt[g] = (cnt[g] || 0) + 1; });
      for (i = 0; i < list.length && out.length < n; i++) {
        var t = list[i], g = sectorGroup(t);
        if (used[t.id] || (cnt[g] || 0) >= cap) continue;
        used[t.id] = 1; cnt[g] = (cnt[g] || 0) + 1; out.push(t);
      }
    }
    return out.sort(byScore);
  }
  function topList() { return divPick(theses.filter(isOpen).filter(valid).sort(byScore), TOPN, 2); }
  function dlt(v, unit) {
    if (v == null) return '<span class="eq">–</span>';
    if (v === 0) return '<span class="eq">±0' + (unit || "") + "</span>";
    return '<span class="' + (v > 0 ? "up" : "dn") + '">' + (v > 0 ? "+" : "−") + Math.abs(v) + (unit || "") + "</span>";
  }
  function rdlt(v) { // Rangänderung: positiv = nach oben
    if (v == null) return '<span class="eq">–</span>';
    if (v === 0) return '<span class="eq">unverändert</span>';
    return '<span class="' + (v > 0 ? "up" : "dn") + '">' + (v > 0 ? "▲ " : "▼ ") + Math.abs(v) + "</span>";
  }
  function validBadge(sc) { return ""; }
  function histOf(t) {
    var keys = runKeys(), rk = {}, out = [];
    keys.forEach(function (k) { rk[k] = rankAt(k); });
    slog(t).forEach(function (x, i, a) {
      out.push({ x: x, rank: rk[x.run] ? rk[x.run][t.id] : null,
        d1: i >= 1 ? x.score - a[i - 1].score : null, d2: i >= 2 ? x.score - a[i - 2].score : null, d3: i >= 3 ? x.score - a[i - 3].score : null,
        rprev: i >= 1 && rk[a[i - 1].run] ? rk[a[i - 1].run][t.id] : null });
    });
    return out.slice(-20);
  }
  function changesBlock() {
    var keys = runKeys();
    var open = theses.filter(isOpen);
    var nOk = open.filter(valid).length;
    var head = '<div class="boxtitle"><span>Änderungen seit dem letzten Lauf</span><span>' + nOk + " von " + open.length + " Thesen mit Score ≥ " + TH + "</span></div>";
    if (keys.length < 2) {
      return '<div class="chgbox">' + head + '<p style="margin:0;font-size:14px">Erster Messpunkt (' + (keys[0] ? esc(keys[0].replace("T", " ")) : "–") + "). Rangänderungen und Unterschreitungen der " + TH + " erscheinen ab dem nächsten Lauf. Aktuell liegen " + nOk + " Thesen bei " + TH + " oder darüber. Bei einem Score unter " + TH + " gilt die These nicht mehr als gültig.</p></div>";
    }
    var cur = keys[keys.length - 1], prev = keys[keys.length - 2], rc = rankAt(cur), rp = rankAt(prev);
    var items = [], alert = false;
    theses.forEach(function (t) {
      var h = slog(t), a = h.filter(function (x) { return x.run === cur; })[0], b = h.filter(function (x) { return x.run === prev; })[0];
      if (!a) return;
      var nm = '<b>' + esc(t.name) + "</b> (" + esc(t.ticker) + ")";
      if (!b) { items.push({ k: 2, h: nm + " neu aufgenommen, Score " + a.score + ", Rang " + rc[t.id] + "." }); return; }
      if (b.score >= TH && a.score < TH) { alert = true; items.push({ k: 0, h: '<span class="dn">Schwelle unterschritten:</span> ' + nm + " von " + b.score + " auf " + a.score + ". Die These ist nicht mehr gültig. " + esc(a.why || "") }); }
      else if (b.score < TH && a.score >= TH) items.push({ k: 1, h: '<span class="up">Schwelle wieder erreicht:</span> ' + nm + " von " + b.score + " auf " + a.score + ". " + esc(a.why || "") });
      var topNow = rc[t.id] <= TOPN, topBefore = rp[t.id] != null && rp[t.id] <= TOPN;
      if (topNow && !topBefore) items.push({ k: 3, h: nm + " ist neu in den Top " + TOPN + " (Rang " + rc[t.id] + ")." });
      else if (!topNow && topBefore) items.push({ k: 3, h: nm + " ist aus den Top " + TOPN + " gefallen (Rang " + rc[t.id] + ")." });
      else if (rp[t.id] != null && Math.abs(rp[t.id] - rc[t.id]) >= 2 && (topNow || topBefore)) items.push({ k: 4, h: nm + ": Rang " + rp[t.id] + " → " + rc[t.id] + " (Score " + b.score + " → " + a.score + "). " + esc(a.why || "") });
    });
    items.sort(function (x, y) { return x.k - y.k; });
    return '<div class="chgbox' + (alert ? " alert" : "") + '">' + head +
      (items.length ? "<ul>" + items.map(function (x) { return "<li>" + x.h + "</li>"; }).join("") + "</ul>" : '<p style="margin:0;font-size:14px">Keine Rangänderung in den Top ' + TOPN + ' und keine Unterschreitung der ' + TH + ".</p>") + "</div>";
  }
  /* ---------- Makro-Kalender mit Depot-Wirkung ---------- */
  var BETA_DEF = { aktie: 1.2, etf: 1.0, rohstoff: 0 };
  function posBeta(p) { return num(p.beta) != null ? p.beta : (BETA_DEF[p.kind] != null ? BETA_DEF[p.kind] : 1); }
  function depotMove(mv) {
    if (!dpos.length) return null;
    var tot = 0, chg = 0; dpos.forEach(function (p) { tot += p.value; chg += p.value * posBeta(p) * mv / 100; });
    return { eur: chg, pct: tot ? chg / tot * 100 : 0 };
  }
  function topMove(mv) {
    return topList().map(function (t) { var b = num(t.beta) != null ? t.beta : BETA_DEF.aktie; return { n: t.name.replace(/,? (Inc\.?|Corporation|Corp\.?|Incorporated|Limited|Ltd\.?|N\.V\.|AG|SE|plc)$/i, ""), p: b * mv }; });
  }
  var IMP = { hoch: "hi", mittel: "mid", niedrig: "lo" };
  function eventsBlock(m) {
    var ev = Array.isArray(m.events) ? m.events.slice() : [];
    if (!ev.length) return "";
    ev.sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")); });
    var today = new Date().toISOString().slice(0, 10);
    var items = ev.map(function (x, k) {
      var past = x.date && x.date < today, imp = IMP[String(x.importance || "").toLowerCase()] || "mid";
      var sc = Array.isArray(x.scenarios) ? x.scenarios : [], haveB = topList().some(function (t) { return num(t.beta) != null; });
      var rows = sc.map(function (c) {
        var mv = num(c.move_pct), dm = mv != null ? depotMove(mv) : null, tm = mv != null ? topMove(mv) : [];
        return '<tr><td data-l="Fall"><b>' + esc(c.case || "") + '</b><div class="meta">' + linkify(c.note || "") + '</div></td><td data-l="Markt">' + (mv != null ? '<span class="' + (mv >= 0 ? "up" : "dn") + '">' + pct(mv, true) + "</span>" : "–") + "</td>" +
          '<td data-l="Dein Depot">' + (dm ? '<span class="' + (dm.eur >= 0 ? "up" : "dn") + '"><b>' + eur(dm.eur, true) + "</b> · " + pct(dm.pct, true) + "</span>" : '<span class="meta">nur lokal im Dashboard</span>') + "</td>" +
          '<td data-l="Top ' + TOPN + '" class="wrap">' + (tm.length ? (haveB ? tm.map(function (q) { return '<span class="chip2 ' + (q.p >= 0 ? "up" : "dn") + '">' + esc(q.n) + " " + pct(q.p, true) + "</span>"; }).join(" ") : '<span class="' + (mv >= 0 ? "up" : "dn") + '">Ø ' + pct(tm.reduce(function (a, q) { return a + q.p; }, 0) / tm.length, true) + '</span> <span class="meta">(noch ohne eigene Beta-Werte je Aktie)</span>') : "–") + "</td></tr>";
      }).join("");
      return '<details class="evt' + (past ? " past" : "") + '"><summary><span class="ed">' + (x.date ? date(x.date) : "") + (x.time ? ", " + esc(x.time) : "") + '</span><b>' + esc(x.name) + '</b><span class="imp imp-' + imp + '">' + esc(x.importance || "mittel") + "</span>" + (past ? '<span class="meta">vorbei</span>' : "") + (x.expectation ? '<span class="meta ex">' + esc(x.expectation) + "</span>" : "") + "</summary>" +
        '<div class="evb">' + (x.why ? '<div class="kv"><b>Warum das wichtig ist</b>' + linkify(x.why) + "</div>" : "") + (x.effect ? '<div class="kv"><b>Wirkung auf Aktien und warum</b>' + linkify(x.effect) + "</div>" : "") +
        (rows ? '<div class="tablebox scroll"><table class="list top"><thead><tr><th>Fall</th><th>Markt (grob)</th><th>Dein Depot</th><th>Top ' + TOPN + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : "") +
        '<div class="cap">Grobe Rechnung: Marktbewegung × Beta (Empfindlichkeit) der Position. Aktien Ø 1,2, ETFs 1,0, Gold/Silber 0, sofern keine eigene Zahl (Feld beta) hinterlegt ist. Die Marktbewegungen sind Annahmen typischer Spannen, keine Vorhersage; die tatsächliche Reaktion kann deutlich abweichen.</div></div></details>';
    }).join("");
    return '<div><h4>Termine und Daten, die anstehen</h4><div class="evts">' + items + "</div></div>";
  }
  function basicsBlock() {
    return '<details class="fold basics"><summary>Grundlagen: Woran werden Aktien gemessen und was bewegt den Kurs?</summary><div class="basics-in">' +
      "<p><b>Kurzformel:</b> Der Kurs ist das, was der Markt für die künftigen Gewinne und Cashflows eines Unternehmens zahlt. Er bewegt sich, wenn sich (1) die <b>Erwartungen</b> an diese Gewinne ändern oder (2) der <b>Preis, den der Markt dafür zahlt</b> (Bewertung, KGV), sich ändert, etwa durch Zinsen oder Stimmung. Kurse reagieren auf <i>Veränderungen gegenüber den Erwartungen</i>, nicht auf gute oder schlechte Zahlen an sich.</p>" +
      '<h4>Die wichtigsten Messgrößen</h4><ul>' +
      "<li><b>Umsatzwachstum:</b> wächst das Geschäft, und wie schnell?</li>" +
      "<li><b>Umsatz- und Gewinnbeschleunigung:</b> wird das Wachstum <i>schneller</i> (zum Beispiel +12 % nach +9 %)? Der Markt zahlt oft mehr für beschleunigtes als für hohes, aber gleichbleibendes Wachstum.</li>" +
      "<li><b>Gewinnwachstum über mehrere Jahre:</b> ein einzelnes starkes Quartal ist weniger wert als drei Jahre in Folge.</li>" +
      "<li><b>Marge:</b> bleibt vom Umsatz mehr Gewinn übrig (Preismacht, Skaleneffekte)?</li>" +
      "<li><b>Free Cashflow:</b> echtes Geld nach Investitionen. Es kann nicht so leicht schöngerechnet werden wie der Gewinn.</li>" +
      "<li><b>Verschuldung:</b> wenig Schulden machen Unternehmen in Krisen und bei hohen Zinsen widerstandsfähig.</li>" +
      "<li><b>Bewertung (KGV, KUV, Kurs/FCF):</b> zeigt, wie viel Zukunft schon im Preis steckt. Sie ist ein Risikomaß, kein Kaufsignal.</li>" +
      "<li><b>Erwartungen gegen Ergebnis:</b> übertrifft das Unternehmen die Prognosen und hebt den Ausblick an (&bdquo;beat and raise&ldquo;)?</li>" +
      "<li><b>Gewinnrevisionen der Analysten:</b> steigende Schätzungen sind einer der stärksten Kurstreiber.</li></ul>" +
      "<h4>Warum es einen Rücksetzer gibt</h4><p>Meist <b>nicht</b>, weil das Geschäft schlecht ist, sondern weil es <b>schlechter als erwartet</b> ist: Prognose nicht angehoben, Wachstum verlangsamt sich, Marge unter Plan. Je höher die Bewertung, desto stärker der Kursverlust bei kleiner Enttäuschung. Weitere Auslöser: Sektorrotation, Zinsen und Konjunktur, ein Produkt, das hinter den Hoffnungen zurückbleibt, neue Konkurrenz oder Regulierung. Der Radar hält das je Aktie unter „Frühere Rücksetzer“ fest. Entscheidend ist, ob der Grund <b>vorübergehend</b> (Stimmung, Sektor) oder <b>strukturell</b> (Geschäftsmodell) ist.</p>" +
      "<h4>Warum eine Aktie stetig steigt und neue Meldungen sie weiter treiben</h4><p>Typisch ist eine Kette aus positiven Überraschungen: Zahlen über Plan, Prognose angehoben, Analysten erhöhen Schätzungen und Kursziele, neue Produkte oder Großaufträge erweitern den Markt. Dadurch steigen <b>Gewinn und Bewertung gleichzeitig</b>. Gemessen wird das an Umsatz- und Gewinnbeschleunigung, Prognoseanhebungen, steigenden Analystenschätzungen, Free Cashflow und relativer Stärke gegenüber dem Markt. Ein starkes Thema (zum Beispiel KI) lässt den Markt zusätzlich mehr für künftiges Wachstum zahlen. Das kippt, wenn die Erwartungen höher sind als das, was geliefert werden kann.</p>" +
      "<h4>Und das KGV?</h4><p>Ein niedriges KGV allein hat in den letzten Jahren selten einen Kursanstieg erklärt. Oft ist es billig, weil Wachstum, Marge oder Zukunft schwach sind („Value-Falle“). Umgekehrt trugen Wachstum, Beschleunigung, Qualität und Cashflow viele Gewinner. Ganz bedeutungslos ist die Bewertung aber nicht: Sie entscheidet, wie viel Fehler sich eine Aktie leisten kann. Der Radar prüft deshalb bei jeder Tiefenanalyse, <b>welche dieser Faktoren den Kurs gerade wirklich bewegen</b>.</p>" +
      '<p class="cap">Allgemeine Einordnung zur Orientierung, keine Prognose und keine Anlageberatung. Einzelne Aktien können vom Muster abweichen.</p></div></details>';
  }
  function marketDrivers(m) {
    var a = Array.isArray(m.drivers) ? m.drivers : [];
    if (!a.length) return "";
    return '<div><h4>Was bewegt die Märkte gerade?</h4><ul>' + a.map(function (x) {
      var st = String(x.status || "neutral").toLowerCase(), c = DRV[st] || "n";
      return "<li><span class='vw dv-" + c + "'>" + esc(x.status || "neutral") + "</span><b>" + esc(x.factor) + "</b>: " + linkify(x.text || "") + "</li>";
    }).join("") + "</ul></div>";
  }
  function marketBlock() {
    var r = runsDesc().filter(function (x) { return x.market; })[0];
    if (!r) return "";
    var m = r.market, li = function (a) { return Array.isArray(a) && a.length ? "<ul>" + a.map(function (v) { return "<li>" + linkify(v) + "</li>"; }).join("") + "</ul>" : ""; };
    var mood = ["positiv", "vorsichtig", "negativ", "neutral"].indexOf(m.mood) >= 0 ? m.mood : "neutral";
    var tod = (m.today || []).map(function (x) { return "<li><span class='kt'>" + esc(x.kind || "") + "</span>" + linkify(x.text || "") + "</li>"; }).join("");
    var sec = (m.sectors || []).map(function (x) {
      var v = (x.view || "neutral").toLowerCase(); v = ["chance", "risiko"].indexOf(v) >= 0 ? v : "neutral";
      return "<li><span class='vw v-" + v + "'>" + esc(x.view || "neutral") + "</span><b>" + esc(x.name) + "</b>: " + linkify(x.note || "") + "</li>";
    }).join("");
    var kp = (m.kpis || []).map(function (k) {
      var tn = ["up", "down", "warn"].indexOf(k.tone) >= 0 ? k.tone : "n";
      return '<div class="mkk t-' + tn + '"><span>' + esc(k.label) + "</span><b>" + esc(k.value) + "</b><i>" + esc(k.sub || "") + "</i></div>";
    }).join("");
    var src = (m.sources || []).map(function (x) { return typeof x === "string" ? link(x) : link(x.url, x.title); }).join("");
    return '<details class="mkt box" style="padding:14px 16px"><summary><h2>Markteinschätzung</h2><span class="mood m-' + mood + '">' + esc(m.mood || "neutral") + '</span><span class="meta">' + date(r.date) + (r.time ? ", " + esc(r.time) + " Uhr" : "") + (m.asof ? " · Datenstand " + date(m.asof) : "") + "</span></summary>" +
      '<div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">' +
      (m.headline ? '<p class="mhead">' + linkify(m.headline) + "</p>" : "") +
      (kp ? '<div class="mkpi">' + kp + "</div>" : "") + (m.summary ? "<p>" + linkify(m.summary) + "</p>" : "") +
      (m.asof_note ? '<p class="cap">' + esc(m.asof_note) + "</p>" : "") +
      '<div class="mgrid two"><div><h4>Heute wichtig</h4><ul>' + tod + "</ul></div><div><h4>Sektoren und Branchen</h4><ul>" + sec + "</ul></div></div>" +
      marketDrivers(m) + eventsBlock(m) +
      '<div class="mgrid"><div><h4>Makroökonomie</h4>' + li(m.macro) + "</div><div><h4>Risiken</h4>" + li(m.risks) + "</div><div><h4>Chancen</h4>" + li(m.chances) + "</div></div>" +
      basicsBlock() +
      (src ? '<div class="cap">Quellen:' + src + "</div>" : "") + "</div></details>";
  }
  function top10Table() {
    var list = topList(), keys = runKeys(), cur = keys[keys.length - 1], rp = keys.length > 1 ? rankAt(keys[keys.length - 2]) : null;
    var rows = list.map(function (t, i) {
      var sc = scoreTotal(t), h = histOf(t), last = h[h.length - 1], up = upside(t), rd = rp && rp[t.id] != null ? rp[t.id] - (i + 1) : null;
      return '<tr><td data-l="Rang"><b>' + (i + 1) + '</b></td><td class="wrap" data-l="Aktie"><button type="button" class="linkbtn" data-jump="' + esc(t.id) + '"' + tipAttr(t) + '><b>' + esc(t.name) + "</b></button> <span class='meta'>" + esc(t.ticker) + "</span></td>" +
        '<td data-l="Score"><span class="miniscore ' + scoreClass(sc) + '">' + sc + "</span></td>" +
        '<td data-l="Score zum Lauf davor">' + dlt(last ? last.d1 : null) + '</td><td data-l="Rang zum Lauf davor">' + rdlt(rd) + '</td><td data-l="Kurspotenzial">' + (up != null ? pct(up, true) : "–") + '</td><td data-l="Regeln">' + ruleBadge(t) + "</td></tr>";
    }).join("");
    return '<h2>Top ' + TOPN + ' <span class="count">' + list.length + '</span> <span class="hint">Mouseover auf den Namen zeigt, was die Firma macht</span></h2>' +
      '<div class="tablebox scroll"><table class="list top"><thead><tr><th>Rang</th><th>Aktie</th><th>' + gl("Score") + '</th><th>' + gl("Score Δ") + '</th><th>' + gl("Rang Δ") + '</th><th>' + gl("Kurspotenzial") + '</th><th>' + gl("Regeln") + '</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  function sline(h) {
    var W = 460, H = 190, L = 34, R = 30, T = 14, B = 34, pw = W - L - R, ph = H - T - B, n = h.length;
    var vals = h.map(function (p) { return p.x.score; }), lo = Math.min.apply(null, vals.concat([TH - 6])), hi = Math.max.apply(null, vals.concat([TH + 6]));
    lo = Math.floor(lo / 5) * 5 - 2; hi = Math.ceil(hi / 5) * 5 + 2; if (hi > 100) hi = 100;
    function X(i) { return n === 1 ? L + pw / 2 : L + pw * i / (n - 1); } function Y(v) { return T + ph * (1 - (v - lo) / (hi - lo)); }
    var o = '<svg class="sline" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Score-Verlauf mit Schwelle ' + TH + '">', k;
    for (k = 0; k <= 3; k++) { var v = Math.round(lo + (hi - lo) * k / 3); o += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (L - 5) + '" y="' + (Y(v) + 3.5) + '" text-anchor="end">' + v + "</text>"; }
    o += '<line class="th" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(TH) + '" y2="' + Y(TH) + '"/><text class="thl" x="' + (W - R) + '" y="' + (Y(TH) - 4) + '" text-anchor="end">Schwelle ' + TH + "</text>";
    if (n > 1) o += '<path class="ln" d="' + h.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.x.score).toFixed(1); }).join(" ") + '"/>';
    h.forEach(function (p, i) {
      o += '<circle class="pt' + (p.x.score < TH ? " bad" : "") + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.x.score).toFixed(1) + '" r="4"/><text class="vl" x="' + X(i).toFixed(1) + '" y="' + (Y(p.x.score) - 8).toFixed(1) + '" text-anchor="middle">' + p.x.score + "</text>";
      if (n <= 8 || (n - 1 - i) % Math.ceil(n / 8) === 0) o += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 16) + '" text-anchor="middle">' + esc((p.x.date || "").slice(5).split("-").reverse().join(".")) + "</text><text x=\"" + X(i).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + esc(p.x.time || "") + "</text>";
    });
    return o + "</svg>";
  }
  function compBlock(t) {
    var c = t.competition, p = Array.isArray(t.peers) ? t.peers : [];
    if (!c && !p.length) return "";
    var n = function (v) { return v == null || v === "" ? "–" : String(v).replace(".", ","); };
    var h = '<section class="mobinfo comp" aria-label="Wettbewerb und Vergleich"><div class="mi-r"><b>Wettbewerb' + (t.comp_as_of ? ' <span class="meta">Stand ' + date(t.comp_as_of) + '</span>' : '') + '</b>';
    if (c) {
      h += (c.position ? "<span>" + esc(c.position) + "</span>" : "");
      if (Array.isArray(c.competitors) && c.competitors.length) h += '<ul class="plain">' + c.competitors.map(function (x) { return "<li><b>" + esc(x.name) + "</b>" + (x.ticker ? " (" + esc(x.ticker) + ")" : "") + ": " + esc(x.note || "") + "</li>"; }).join("") + "</ul>";
      if (c.moat) h += '<span><b>Burggraben:</b> ' + esc(String(c.moat).replace(/^Burggraben:\s*/, "")) + "</span>";
    }
    h += "</div>";
    if (p.length) {
      h += '<div class="mi-r"><b>Vergleich mit Konkurrenten</b><div class="tablebox scroll"><table class="list"><thead><tr><th>Firma</th><th>KGV erw.</th><th>EV/EBITDA</th><th>Wachstum</th></tr></thead><tbody>' +
        p.map(function (x, i) { return "<tr" + (i === 0 ? ' style="font-weight:600"' : "") + "><td data-l=\"Firma\">" + esc(x.name) + "</td><td data-l=\"KGV erw.\">" + n(x.fpe) + "</td><td data-l=\"EV/EBITDA\">" + n(x.ev_ebitda) + "</td><td class=\"wrap\" data-l=\"Wachstum\">" + esc(x.growth || "–") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (t.peer_view ? "<span>" + esc(t.peer_view) + "</span>" : "") + "</div>";
    }
    var src = (c && Array.isArray(c.sources) ? c.sources : []).map(function (x) { return link(x.url, x.title); }).join("") + p.map(function (x) { return x.source ? link(x.source, x.name) : ""; }).join("");
    if (src) h += '<details class="thm-src"><summary>Quellen</summary><div class="cap">' + src + "</div></details>";
    return h + "</section>";
  }
  function short(x, n) { x = String(x || "").replace(/\s+/g, " ").trim(); if (x.length <= n) return x; var c = x.slice(0, n), i = c.lastIndexOf(" "); return (i > n * 0.6 ? c.slice(0, i) : c) + "…"; }
  function changeList(h) {
    var ch = h.filter(function (p, i) { return i > 0 && p.d1 != null && p.d1 !== 0; }).slice(-4).reverse();
    var head = '<div class="chl"><h4>Was hat den Score bewegt?</h4>';
    if (!ch.length) return head + '<p class="cap" style="margin:0">Bisher unverändert' + (h.length ? " seit " + date(h[0].x.date) : "") + ". Sobald sich der Score ändert, steht hier kurz warum.</p></div>";
    return head + "<ul>" + ch.map(function (p) {
      return "<li><span class='meta'>" + date(p.x.date) + (p.x.time ? ", " + esc(p.x.time) : "") + "</span> " + dlt(p.d1) + " <span>" + linkify(short(p.x.why, 130)) + "</span></li>";
    }).join("") + "</ul></div>";
  }
  function scoreCard(t, rankNo) {
    var h = histOf(t), sc = scoreTotal(t), last = h[h.length - 1];
    var rows = h.slice().reverse().map(function (p) {
      return '<tr><td data-l="Lauf">' + date(p.x.date) + (p.x.time ? ", " + esc(p.x.time) + " Uhr" : "") + '</td><td data-l="Score"><span class="miniscore ' + scoreClass(p.x.score) + '">' + p.x.score + '</span></td><td data-l="Zum Lauf davor">' + dlt(p.d1) +
        '</td><td data-l="Zu 2 Läufen davor">' + dlt(p.d2) + '</td><td data-l="Zu 3 Läufen davor">' + dlt(p.d3) + '</td><td data-l="Rang">' + (p.rank != null ? p.rank : "–") +
        '</td><td data-l="Warum" class="wrap">' + linkify(p.x.why || "") + (p.x.why_longer ? "<br><span class='meta'>Über mehrere Läufe: " + linkify(p.x.why_longer) + "</span>" : "") + "</td></tr>";
    }).join("");
    return '<article class="scard"><div class="sh"><span class="miniscore ' + scoreClass(sc) + '">' + sc + "</span><b>" + (rankNo ? rankNo + ". " : "") + esc(t.name) + "</b><span class='meta'>" + esc(t.ticker) + "</span> " + validBadge(sc) + "</div>" +
      (h.length < 2 ? '<p class="cap" style="margin:0 0 6px">Erster Messpunkt (' + esc(h[0] ? (h[0].x.date || "") : "") + "). Das Diagramm erscheint ab dem zweiten Lauf." : '<div class="sside">' + sline(h) + changeList(h) + "</div>") +
      '<details class="runs-open"><summary>Läufe mit Begründung (letzte ' + h.length + ' von max. 20)</summary><div class="tablebox scroll"><table class="list top"><thead><tr><th>Lauf</th><th>Score</th><th>Δ Lauf davor</th><th>Δ 2 Läufe</th><th>Δ 3 Läufe</th><th>Rang</th><th>Warum</th></tr></thead><tbody>' + rows + "</tbody></table></div></details></article>";
  }
  var PAL = ["#2457d6", "#12a37f", "#e07a1f", "#c2352d", "#8e44ad", "#0e9aa7", "#b8860b", "#d6336c", "#5c7cfa", "#6b7383"];
  function multiLine(list) {
    var keys = runKeys().slice(-20);
    if (keys.length < 2) return '<p class="cap" style="margin:0 0 10px">Das Liniendiagramm aller Aktien erscheint ab dem zweiten Lauf (aktuell ' + keys.length + " Messpunkt).</p>";
    var W = 700, H = 280, L = 36, R = 16, T = 14, B = 36, pw = W - L - R, ph = H - T - B, n = keys.length, vals = [];
    var ser = list.map(function (t, i) {
      var m = {}; slog(t).forEach(function (x) { m[x.run] = x.score; });
      var v = keys.map(function (k) { return m[k] != null ? m[k] : null; }); v.forEach(function (x) { if (x != null) vals.push(x); });
      return { t: t, v: v, c: PAL[i % PAL.length] };
    });
    var lo = Math.min.apply(null, vals.concat([TH - 4])), hi = Math.max.apply(null, vals.concat([TH + 4]));
    lo = Math.floor(lo / 5) * 5 - 2; hi = Math.min(100, Math.ceil(hi / 5) * 5 + 2);
    function X(i) { return L + pw * i / (n - 1); } function Y(v) { return T + ph * (1 - (v - lo) / (hi - lo)); }
    var o = '<svg class="mline" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Score-Verlauf aller Top-Aktien">', k;
    for (k = 0; k <= 4; k++) { var gv = Math.round(lo + (hi - lo) * k / 4); o += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(gv) + '" y2="' + Y(gv) + '"/><text x="' + (L - 5) + '" y="' + (Y(gv) + 3.5) + '" text-anchor="end">' + gv + "</text>"; }
    o += '<line class="th" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(TH) + '" y2="' + Y(TH) + '"/><text x="' + (W - R) + '" y="' + (Y(TH) - 4) + '" text-anchor="end" style="fill:var(--red)">Schwelle ' + TH + "</text>";
    ser.forEach(function (x) {
      var pts = []; x.v.forEach(function (v, i) { if (v != null) pts.push([X(i), Y(v)]); });
      if (pts.length > 1) o += '<path class="ln" stroke="' + x.c + '" d="' + pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") + '"/>';
      pts.forEach(function (p) { o += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + x.c + '"/>'; });
    });
    keys.forEach(function (kk, i) { if (n > 8 && (n - 1 - i) % Math.ceil(n / 8)) return; var d = kk.split("T"); o += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle">' + esc(d[0].slice(5).split("-").reverse().join(".")) + '</text><text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d[1] || "") + "</text>"; });
    return o + "</svg>" + '<div class="legend">' + ser.map(function (x) { return '<span><i style="background:' + x.c + '"></i>' + esc(x.t.ticker) + "</span>"; }).join("") + "</div>";
  }
  function scoreMini(t) {
    var hh = histOf(t);
    if (hh.length < 2) return '<p class="cap">Erster Messpunkt. Das Diagramm erscheint ab dem zweiten Lauf.</p>';
    var w = hh[hh.length - 1].x.why;
    return '<div class="sside">' + sline(hh) + changeList(hh) + "</div>";
  }

  /* ---------- Muster-Depot (fiktiv): 10.000 € je Aufnahme in die Top 10, Verkauf beim Herausfallen ---------- */
  var MD_STAKE = 10000;
  function mdPrice(t, d) {
    var c = [], ser = PRICES && PRICES[t.id];
    if (ser && Array.isArray(ser.pts)) ser.pts.forEach(function (q) { if (num(q[1]) != null) c.push([q[0], q[1]]); });
    if (t.entry && t.entry.date && num(t.entry.price) != null) c.push([t.entry.date, t.entry.price]);
    if (t.last && t.last.date && num(t.last.price) != null) c.push([t.last.date, t.last.price]);
    var best = null; c.forEach(function (q) { if (q[0] <= d && (!best || q[0] >= best[0])) best = q; });
    return best;
  }
  function mdTop(key) {
    var list = [];
    theses.forEach(function (t) { slog(t).forEach(function (x) { if (x.run === key && x.score >= TH) list.push({ t: t, s: x.score }); }); });
    list = list.map(function (x, i) { x.i = i; return x; }).sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var out = [], used = {}, cap, i;
    for (cap = 2; cap <= 10 && out.length < TOPN; cap++) {
      var cnt = {};
      out.forEach(function (x) { var g = sectorGroup(x.t); cnt[g] = (cnt[g] || 0) + 1; });
      for (i = 0; i < list.length && out.length < TOPN; i++) {
        var x = list[i], g = sectorGroup(x.t);
        if (used[x.t.id] || (cnt[g] || 0) >= cap) continue;
        used[x.t.id] = 1; cnt[g] = (cnt[g] || 0) + 1; out.push(x);
      }
    }
    return out.map(function (x) { return x.t; });
  }
  function mdSim() {
    var keys = runKeys(), pos = {}, log = [], prev = null, invested = 0, realized = 0, closed = [];
    keys.forEach(function (k) {
      var cur = mdTop(k), day = k.slice(0, 10), ids = {};
      cur.forEach(function (t) { ids[t.id] = 1; });
      if (prev) Object.keys(pos).forEach(function (id) {
        if (ids[id]) return;
        var q = pos[id], t = q.t, pr = mdPrice(t, day); if (!pr) return;
        var val = q.sh * pr[1], gain = val - MD_STAKE; realized += gain; delete pos[id];
        closed.push({ t: t, buy: q.buyDay, sell: day, gain: gain, pct: gain / MD_STAKE * 100 });
        log.push({ k: k, day: day, kind: "Verkauf", t: t, pr: pr, gain: gain });
      });
      cur.forEach(function (t) {
        if (pos[t.id]) return;
        var pr = mdPrice(t, day); if (!pr || pr[1] <= 0) return;
        pos[t.id] = { t: t, sh: MD_STAKE / pr[1], buyPr: pr[1], buyDay: day }; invested += MD_STAKE;
        log.push({ k: k, day: day, kind: prev ? "Kauf" : "Start", t: t, pr: pr });
      });
      prev = cur;
    });
    var open = Object.keys(pos).map(function (id) {
      var q = pos[id], t = q.t, lp = t.last && num(t.last.price) != null ? t.last.price : q.buyPr, val = q.sh * lp;
      return { t: t, buy: q.buyDay, val: val, gain: val - MD_STAKE, pct: (val / MD_STAKE - 1) * 100 };
    }).sort(function (a, b) { return b.pct - a.pct; });
    var openVal = open.reduce(function (a, x) { return a + x.val; }, 0), openGain = openVal - open.length * MD_STAKE;
    return { open: open, closed: closed, log: log, invested: invested, realized: realized, openVal: openVal, openGain: openGain, total: realized + openGain, first: keys[0] };
  }
  function mdHtml() {
    var m; try { m = mdSim(); } catch (e) { return ""; }
    if (!m.invested) return "";
    var tot = m.total, tp = tot / m.invested * 100, cls = tot >= 0 ? "up" : "dn", sg = function (v) { return (v >= 0 ? "+" : "−") + nf0.format(Math.abs(v)) + " €"; }, sp = function (v) { return (v >= 0 ? "+" : "−") + nf1.format(Math.abs(v)) + " %"; };
    var o = '<div class="box md" style="margin-top:14px"><div class="boxtitle"><span>Muster-Depot (fiktiv)</span><span>seit ' + date(m.first.slice(0, 10)).slice(0, 6) + "</span></div>" +
      '<div class="md-k"><div class="md-big ' + cls + '"><span>Ergebnis gesamt</span><b>' + sg(tot) + "</b><em>" + sp(tp) + " auf " + nf0.format(m.invested) + " € Käufe insgesamt (" + nf0.format(m.open.length * MD_STAKE) + " € aktuell gebunden)</em></div>" +
      "<div><span>Offene Positionen</span><b>" + nf0.format(m.openVal) + " €</b><em class=\"" + (m.openGain >= 0 ? "up" : "dn") + '">' + sg(m.openGain) + "</em></div>" +
      "<div><span>Verkauft (realisiert)</span><b class=\"" + (m.realized >= 0 ? "up" : "dn") + '">' + sg(m.realized) + "</b><em>" + m.closed.length + " Verkäufe</em></div></div>" +
      '<div class="md-t">' + m.open.map(function (x) { return '<button type="button" class="md-r" data-open="' + esc(x.t.id) + '"><span><b>' + esc(short(x.t.name, 26)) + "</b><i>seit " + date(x.buy).slice(0, 6) + '</i></span><span class="' + (x.gain >= 0 ? "up" : "dn") + '"><b>' + sp(x.pct) + "</b><i>" + sg(x.gain) + "</i></span></button>"; }).join("") + "</div>" +
      (m.closed.length ? '<details class="thm-src"><summary>Verkauft (' + m.closed.length + ")</summary><div class=\"md-t\">" + m.closed.slice().reverse().map(function (x) { return '<div class="md-r"><span><b>' + esc(short(x.t.name, 26)) + "</b><i>" + date(x.buy).slice(0, 6) + " bis " + date(x.sell).slice(0, 6) + '</i></span><span class="' + (x.gain >= 0 ? "up" : "dn") + '"><b>' + sp(x.pct) + "</b><i>" + sg(x.gain) + "</i></span></div>"; }).join("") + "</div></details>" : "") +
      '<details class="thm-src"><summary>Regeln und Grenzen</summary><div class="cap">Jede Aktie, die in die Top ' + TOPN + ' kommt, wird mit ' + nf0.format(MD_STAKE) + ' € gekauft; fällt sie heraus, wird sie verkauft. Der Erlös wird nicht neu angelegt, jede Aufnahme bekommt frische ' + nf0.format(MD_STAKE) + ' €. Grundlage ist die Top-10-Liste jedes gespeicherten Laufs (mit Branchenstreuung). Start war der erste Lauf mit Score-Verlauf. Gerechnet wird mit dem letzten bekannten Schlusskurs am oder vor dem Lauftag, bewertet mit dem aktuellen Kurs. Das Ergebnis ist die Kursentwicklung in Heimatwährung: ohne Gebühren, Steuern, Dividenden und Wechselkurs. Reines Gedankenspiel, keine Anlageberatung und keine Aussage, was kommt.</div></details></div>';
    return o;
  }

  function renderScore() {
    var el = document.getElementById("tab-score");
    var open = theses.filter(isOpen).filter(function (t) { return scoreTotal(t) != null; }).sort(byScore);
    var ov = open.filter(valid), top = divPick(ov, TOPN, 2), plain = ov.slice(0, TOPN);
    if (!top.length) { el.innerHTML = empty("Noch keine Thesen", ""); return; }
    function spark(h) {
      var v = h.slice(-8).map(function (p) { return p.x.score; });
      if (v.length < 2) return '<svg class="t10-sp" viewBox="0 0 60 22" aria-hidden="true"><circle cx="30" cy="11" r="2.5" fill="var(--muted)"/></svg>';
      var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (hi - lo < 6) { var mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
      var pts = v.map(function (x, i) { return (2 + 56 * i / (v.length - 1)).toFixed(1) + "," + (19 - 16 * (x - lo) / (hi - lo)).toFixed(1); });
      var up = v[v.length - 1] >= v[0];
      return '<svg class="t10-sp" viewBox="0 0 60 22" aria-hidden="true"><polyline points="' + pts.join(" ") + '" fill="none" stroke="' + (up ? "var(--green)" : "var(--red)") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + pts[pts.length - 1].split(",")[0] + '" cy="' + pts[pts.length - 1].split(",")[1] + '" r="2.6" fill="' + (up ? "var(--green)" : "var(--red)") + '"/></svg>';
    }
    var B0 = 40, gc = {}, grp;
    top.forEach(function (t) { var g = sectorGroup(t); gc[g] = (gc[g] || 0) + 1; });
    grp = Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).map(function (g) { return esc(g) + " " + gc[g]; }).join(" · ");
    var skippedN = plain.filter(function (t) { return top.indexOf(t) < 0; }).length;
    if (skippedN) grp += " (" + skippedN + " Aktien mit höherem Score ausgelassen, weil ihre Gruppe schon zweimal vertreten ist)";
    var rows = top.map(function (t, i) {
      var h = histOf(t), sc = scoreTotal(t), last = h[h.length - 1], d1 = last ? last.d1 : null;
      var w = Math.max(3, Math.min(100, (sc - B0) / (100 - B0) * 100)), thp = (TH - B0) / (100 - B0) * 100;
      return '<button type="button" class="t10" data-open="' + esc(t.id) + '"><span class="t10-n">' + (i + 1) + '</span><span class="t10-m"><b>' + esc(t.name) + "</b><i>" + esc(t.ticker) + " · " + esc(sectorGroup(t)) +
        '</i><span class="t10-bar ' + scoreClass(sc) + '"><u style="width:' + w.toFixed(1) + '%"></u><s style="left:' + thp.toFixed(1) + '%" title="Schwelle ' + TH + '"></s></span></span><span class="t10-r"><span class="miniscore ' + scoreClass(sc) + '">' + sc + "</span>" +
        (d1 ? '<em class="' + (d1 > 0 ? "up" : "dn") + '">' + (d1 > 0 ? "▲ +" : "▼ −") + Math.abs(d1) + "</em>" : '<em class="eq">±0</em>') + spark(h) + "</span></button>";
    }).join("");
    /* Chance-Risiko-Matrix: Chance = Weg bis zum Ø-Ziel, Risiko = Weg bis zum schwächsten Analystenziel */
    var pts = [], skipped = 0;
    top.forEach(function (t) {
      var ch = upside(t), pr = t.last && num(t.last.price), lw = t.potential && num(t.potential.low);
      if (ch == null || !pr || lw == null) { skipped++; return; }
      pts.push({ t: t, ch: Math.max(0, ch), rk: Math.max(0, (1 - lw / pr) * 100) });
    });
    var mat = "";
    if (pts.length) {
      var W = 360, H = 430, L = 46, R = 10, T = 10, B = 40, pw = W - L - R, ph = H - T - B, XM = 20, YM = 20;
      var xmax = Math.max(40, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.rk; })) / 10) * 10 + 5), ymax = Math.max(40, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.ch; })) / 10) * 10 + 5);
      var X = function (v) { return L + pw * v / xmax; }, Y = function (v) { return T + ph * (1 - v / ymax); };
      var o = '<svg class="cmx" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Chance-Risiko-Matrix der Top 10">';
      o += '<rect x="' + L + '" y="' + T + '" width="' + (X(XM) - L) + '" height="' + (Y(YM) - T) + '" class="q-g"/><rect x="' + X(XM) + '" y="' + T + '" width="' + (W - R - X(XM)) + '" height="' + (Y(YM) - T) + '" class="q-y"/>' +
        '<rect x="' + L + '" y="' + Y(YM) + '" width="' + (X(XM) - L) + '" height="' + (H - B - Y(YM)) + '" class="q-n"/><rect x="' + X(XM) + '" y="' + Y(YM) + '" width="' + (W - R - X(XM)) + '" height="' + (H - B - Y(YM)) + '" class="q-r"/>';
      o += '<text class="ql" x="' + (L + 6) + '" y="' + (Y(YM) - 6) + '">Attraktiv</text><text class="ql" x="' + (W - R - 6) + '" y="' + (T + 14) + '" text-anchor="end">Spekulativ</text><text class="ql" x="' + (L + 6) + '" y="' + (H - B - 6) + '">Wenig los</text><text class="ql" x="' + (W - R - 6) + '" y="' + (H - B - 6) + '" text-anchor="end">Eher meiden</text>';
      var k;
      for (k = 0; k <= xmax; k += (xmax > 50 ? 20 : 10)) o += '<text x="' + X(k) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + k + "%</text>";
      for (k = 0; k <= ymax; k += (ymax > 100 ? 40 : 20)) o += '<text x="' + (L - 6) + '" y="' + (Y(k) + 4) + '" text-anchor="end">' + k + "%</text>";
      o += '<text x="' + (L + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="ax">Risiko: Weg bis zum schwächsten Ziel →</text><text transform="translate(8 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle" class="ax">Chance: Weg bis zum Ø-Ziel →</text>';
      var lab = pts.map(function (p) { return { p: p, x: X(p.rk), y: Y(p.ch) }; }).sort(function (a, b) { return a.y - b.y; }), placed = [];
      lab.forEach(function (q) {
        var ly = q.y + 4, lx = q.x > W - 70 ? q.x - 10 : q.x + 10, anc = q.x > W - 70 ? "end" : "start";
        placed.forEach(function (r) { if (Math.abs(r.lx - lx) < 60 && Math.abs(r.ly - ly) < 12) ly = r.ly + 12; });
        placed.push({ lx: lx, ly: ly }); q.lx = lx; q.ly = ly; q.anc = anc;
      });
      lab.forEach(function (q) {
        var good = q.p.ch >= q.p.rk;
        o += '<g class="bub" data-open="' + esc(q.p.t.id) + '" role="button" tabindex="0"><circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="6" fill="' + (good ? "var(--green)" : "var(--red)") + '" stroke="var(--surface)" stroke-width="2"/><text x="' + q.lx.toFixed(1) + '" y="' + q.ly.toFixed(1) + '" text-anchor="' + q.anc + '" class="bt">' + esc(String(q.p.t.ticker).slice(0, 8)) + "</text></g>";
      });
      mat = '<div class="box" style="margin-top:14px"><div class="boxtitle"><span>Chance gegen Risiko</span><span>Top ' + top.length + "</span></div>" + o + "</svg>" +
        '<p class="cap" style="margin:6px 0 0">Oben links ist am besten: viel Chance, wenig Abwärtsrisiko. Punkte am linken Rand: Das schwächste Analystenziel liegt über dem Kurs. Grün: Chance größer als Risiko. Tippe auf einen Punkt, um die Aktie zu öffnen.' + (skipped ? " " + skipped + " ohne Analysten-Spanne nicht gezeigt." : "") + "</p></div>";
    }
    el.innerHTML = "";
    var mtab = document.getElementById("tab-muster"); if (mtab) mtab.innerHTML = mdHtml() || empty("Muster-Depot", "Noch keine Daten.");
    var tx = document.getElementById("t10extra");
    if (tx) {
      tx.innerHTML = "";
      tx.onclick = function (ev) { var o2 = ev.target.closest && ev.target.closest("[data-open]"); if (o2) openDetail(o2.getAttribute("data-open"), o2); };
    }
  }

  (function () {
    var mt = document.getElementById("tab-muster"); if (!mt) return;
    mt.onclick = function (ev) { var o2 = ev.target.closest && ev.target.closest("[data-open]"); if (o2) openDetail(o2.getAttribute("data-open"), o2); };
  })();
  /* ---------- Depot ---------- */
  function inDepot(t) { return !!t.depot || dpos.some(function (p) { return p.ticker && p.ticker === t.ticker; }); }
  function thesisFor(p) { return p.ticker ? theses.filter(function (t) { return t.ticker === p.ticker; })[0] : null; }
  function eur(v, signed) { if (v == null) return "–"; return (signed && v > 0 ? "+" : v < 0 ? "−" : "") + nf2.format(Math.abs(v)) + " €"; }
  function eur0(v) { return nf0.format(v) + " €"; }
  var KIND = { aktie: "Aktie", etf: "ETF", rohstoff: "Rohstoff" };
  function renderDepot() {
    var el = document.getElementById("tab-depot");
    var btn = document.querySelector('nav.tabs button[data-tab="depot"]');
    if (!dpos.length) { if (btn) btn.hidden = true; el.innerHTML = ""; return; }
    if (btn) btn.hidden = false;
    var list = dpos.slice().sort(function (a, b) { return b.value - a.value; });
    var tot = list.reduce(function (a, p) { return a + p.value; }, 0), gain = list.reduce(function (a, p) { return a + p.gain_eur; }, 0), day = list.reduce(function (a, p) { return a + (p.day_eur || 0); }, 0);
    var cost = tot - gain, gp = cost ? gain / cost * 100 : 0, dp = (tot - day) ? day / (tot - day) * 100 : 0;
    var byKind = {}; list.forEach(function (p) { byKind[p.kind] = (byKind[p.kind] || 0) + p.value; });
    var kinds = ["aktie", "etf", "rohstoff"].filter(function (k) { return byKind[k]; });
    var top = list[0];
    var tn = function (v) { return v > 0 ? "up" : v < 0 ? "down" : "n"; };
    var kp = [
      { l: "Depotwert", v: eur0(tot), sub: list.length + " Positionen", t: "n" },
      { l: "Gewinn gesamt", v: eur(gain, true), sub: pct(gp, true) + " auf " + eur0(cost) + " Einsatz", t: tn(gain) },
      { l: "Heute", v: eur(day, true), sub: pct(dp, true) + " seit Vortag", t: tn(day) },
      { l: "Einzelaktien", v: nf0.format((byKind.aktie || 0) / tot * 100) + " %", sub: eur0(byKind.aktie || 0) + " von " + eur0(tot), t: "n" },
      { l: "Größte Position", v: nf0.format(top.value / tot * 100) + " %", sub: top.name, t: "n" }
    ].map(function (k) { return '<div class="mkk t-' + k.t + '"><span>' + esc(k.l) + "</span><b>" + esc(k.v) + "</b><i>" + esc(k.sub) + "</i></div>"; }).join("");
    var alloc = '<div class="alloc" role="img" aria-label="Aufteilung nach Art">' + kinds.map(function (k) { return '<i class="a-' + k + '" style="width:' + (byKind[k] / tot * 100).toFixed(2) + '%" title="' + KIND[k] + '"></i>'; }).join("") + "</div>" +
      '<div class="legend">' + kinds.map(function (k) { return '<span><i class="a-' + k + '"></i>' + (k === "aktie" ? "Einzelaktien" : k === "etf" ? "ETFs" : "Rohstoffe") + " " + nf0.format(byKind[k] / tot * 100) + " % (" + eur0(byKind[k]) + ")</span>"; }).join("") + "</div>";
    var wmax = list[0].value / tot * 100;
    var weights = list.slice(0, 10).map(function (p) { var w = p.value / tot * 100; return '<div class="wrow"><span title="' + esc(p.name) + '">' + esc(p.name) + '</span><span class="wb"><i style="width:' + (w / wmax * 100).toFixed(1) + '%"></i></span><span>' + nf1.format(w) + " %</span></div>"; }).join("");
    var inR = list.filter(function (p) { return p.kind === "aktie" && thesisFor(p); }), notR = list.filter(function (p) { return p.kind === "aktie" && !thesisFor(p); });
    var radar = '<div class="chgbox"><div class="boxtitle"><span>Abgleich mit dem Radar</span></div><ul>' +
      (inR.length ? "<li><b>Schon im Radar:</b> " + inR.map(function (p) { var t = thesisFor(p), sc = scoreTotal(t); return esc(p.name) + (sc != null ? " (Score " + sc + ")" : ""); }).join(", ") + ".</li>" : "") +
      (notR.length ? "<li><b>Noch nicht im Radar:</b> " + notR.map(function (p) { return esc(p.name); }).join(", ") + ". Der nächste <code>/radar deep</code> bewertet sie und nimmt sie auf.</li>" : "") +
      "<li>ETFs und Rohstoffe werden nicht als Einzelthese bewertet.</li></ul></div>" + calcBox(list, tot) +
      '<div class="box" style="margin-bottom:14px"><div class="boxtitle"><span>Anstehende Quartalszahlen deiner Positionen</span><span>nächste 60 Tage</span></div>' + termsTable(termsRows(theses.filter(function (t) { return isOpen(t) && inDepot(t); }), 60)) + "</div>";
    var rows = list.map(function (p) {
      var t = thesisFor(p), sc = t ? scoreTotal(t) : null, g = p.gain_eur >= 0 ? "up" : "dn";
      return '<tr><td class="wrap" data-l="Instrument"><b>' + esc(p.name) + "</b> <span class='meta'>" + (KIND[p.kind] || "") + '</span></td><td data-l="Bestand">' + nf2.format(p.shares).replace(/,00$/, "") + '</td><td data-l="Kurs">' + eur(p.price) + '</td><td data-l="Heute"><span class="' + (p.day_pct >= 0 ? "up" : "dn") + '">' + pct(p.day_pct, true) + '</span></td><td data-l="Marktwert"><b>' + eur(p.value) + '</b></td><td data-l="Anteil">' + nf1.format(p.value / tot * 100) + ' %' + (p.kind === "aktie" && p.value / tot * 100 > limOf("maxpos") ? ' <span class="dn" title="über deiner Grenze von ' + limOf("maxpos") + ' % je Aktie">⚠</span>' : "") + '</td><td data-l="Einstand">' + eur(p.cost_price) + '</td><td data-l="Gewinn"><span class="' + g + '">' + eur(p.gain_eur, true) + " · " + pct(p.gain_pct, true) + '</span></td><td data-l="Radar">' + (sc != null ? '<span class="miniscore ' + scoreClass(sc) + '">' + sc + "</span>" : '<span class="meta">–</span>') + "</td></tr>";
    }).join("");
    var table = '<h2>Positionen <span class="count">' + list.length + '</span></h2><div class="tablebox scroll"><table class="list top"><thead><tr><th>Instrument</th><th>Bestand</th><th>Kurs</th><th>Heute</th><th>Marktwert</th><th>Anteil</th><th>' + gl("Einstand") + '</th><th>Gewinn</th><th>Radar</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    var tiles = list.map(function (p) {
      var t = thesisFor(p), sc = t ? scoreTotal(t) : null, up = p.gain_eur >= 0;
      return '<article class="dtile"' + (t ? ' data-open="' + esc(t.id) + '" data-card="' + esc(t.id) + '" role="button" tabindex="0"' : "") + '><div class="dt-top"><div><h3>' + esc(p.name) + "</h3><div class='meta'>" + (KIND[p.kind] || "") + (p.ticker ? " · " + esc(p.ticker) : "") + " · " + nf1.format(p.value / tot * 100) + ' % vom Depot</div></div>' + (p.day_pct != null ? '<span class="miniscore ' + (p.day_pct >= 0 ? "sc-hi" : "sc-bad") + '" title="Veränderung heute">' + pct(p.day_pct, true) + "</span>" : "") + "</div>" +
        '<div class="dt-val ' + (up ? "up" : "dn") + '"><div><span class="lb">Gewinn / Verlust</span><span class="big">' + pct(p.gain_pct, true) + '</span></div><div class="rt">' + eur(p.gain_eur, true) + "<small>Marktwert " + eur(p.value) + "</small></div></div>" +
        '<div class="dt-kv"><div><span>Bestand</span><b>' + nf2.format(p.shares).replace(/,00$/, "") + '</b></div><div><span>Kurs</span><b>' + eur(p.price) + '</b></div><div><span>Einstand</span><b>' + eur(p.cost_price) + "</b></div></div>" +
        '<div class="dt-kv"><div><span>Erster Kauf</span><b>' + (p.first_buy ? date(p.first_buy) : "–") + '</b></div><div><span>Heute</span><b>' + eur(p.day_eur, true) + '</b></div><div><span>Dividenden</span><b>' + (p.dividends_eur ? eur(p.dividends_eur) : "–") + "</b></div></div>" +
        '<div class="dt-radar">' + (t ? '<span class="miniscore ' + (sc != null ? scoreClass(sc) : "") + '">' + (sc != null ? sc : "–") + "</span><span>Radar: Score " + (sc != null ? sc : "offen") + (sc != null && sc < TH ? " (unter " + TH + ")" : "") + ". Klick öffnet die Details.</span>" : (p.kind === "aktie" ? "Noch nicht im Radar. Wird beim nächsten /radar deep bewertet." : "ETF/Rohstoff: keine Einzelaktien-Bewertung.")) + "</div></article>";
    }).join("");
    el.innerHTML = '<h2>Aktuelles Depot <span class="hint">Stand ' + date(depot.asof) + (depot.time ? ", " + esc(depot.time) + " Uhr" : "") + '</span></h2><div class="mkpi" style="margin-bottom:14px">' + kp + "</div>" +
      '<div class="box" style="margin-bottom:14px"><div class="boxtitle"><span>Aufteilung</span></div>' + alloc + '<div class="boxtitle" style="margin-top:12px"><span>Größte Positionen</span></div>' + weights + "</div>" + klumpenBox(list, tot) +
      '<h2 style="margin-top:22px">Positionen <span class="count">' + list.length + '</span> <span class="hint">antippen für Details</span></h2><div class="dgrid2">' + tiles + "</div>" +
      '<details class="fold arch"><summary>Mehr: Tabelle, Abgleich mit dem Radar, Positionsrechner, Termine</summary>' + radar + table + "</details>" +
      '<p class="cap" style="margin-top:14px">' + esc(depot.source || "") + " Zahlen sind ein Stand zum genannten Zeitpunkt und werden nicht automatisch aktualisiert. Information, keine Anlageberatung.</p>";
    calcUpdate();
  }
  /* ---------- Rangliste ---------- */
  function rankStrip(open) {
    var items = open.filter(function (t) { return scoreTotal(t) != null; }).sort(byScore);
    if (items.length < 2) return "";
    return '<h2>Rangliste <span class="count">' + items.length + '</span> <span class="hint">anklicken springt zur Karte</span></h2><div class="rank" aria-label="Rangliste nach Score">' + items.map(function (t, i) {
      var s = scoreTotal(t), up = upside(t);
      return '<button type="button" class="chip" data-jump="' + esc(t.id) + '" title="' + esc(t.name) + '"><div class="ring ' + ringClass(s) + '" style="--p:' + s + '"><span data-count="' + s + '">' + s + "</span></div><div><b>" + (i + 1) + ". " + esc(t.ticker) + (isHG(t) ? ' <span class="tag hg">HG</span>' : "") + "</b><small>" + (up != null ? pct(up, true) + " bis Ziel" : "kein Kursziel") + "</small></div></button>";
    }).join("") + "</div>";
  }

  var activeFilter = "alle", sortKey = "score";
  var SORTS = [["score", "Score"], ["potenzial", "Kurspotenzial"], ["abstand", "Abstand zum Hoch"], ["zahlen", "Nächste Zahlen"], ["beschl", "Beschleunigung"]];
  function sorter(k) {
    var big = 1e12;
    if (k === "potenzial") return function (a, b) { var x = upside(a), y = upside(b); return (y == null ? -big : y) - (x == null ? -big : x); };
    if (k === "abstand") return function (a, b) { var x = num(a.entry && a.entry.drawdown_pct), y = num(b.entry && b.entry.drawdown_pct); return (x == null ? big : x) - (y == null ? big : y); };
    if (k === "beschl") return function (a, b) { return accScore(b) - accScore(a); };
    if (k === "zahlen") return function (a, b) { return ((a.catalyst && a.catalyst.date) || "9999").localeCompare((b.catalyst && b.catalyst.date) || "9999"); };
    return byScore;
  }
  function renderTheses() {
    var el = document.getElementById("tab-thesen");
    var open = theses.filter(isOpen);
    if (!open.length) { el.innerHTML = empty("Keine offenen Thesen", "Sobald ein Lauf Kandidaten aufnimmt, erscheinen sie hier."); return; }
    var hgN = open.filter(isHG).length, acN = open.filter(isAccel).length;
    var opts = ["alle"].concat(hgN ? ["high-growth"] : [], acN ? ["beschleunigt"] : [], STATUS.filter(function (s) { return s !== "geschlossen"; }));
    if (opts.indexOf(activeFilter) < 0) activeFilter = "alle";
    var chips = '<div class="fbar"><label><span>Filter</span><select data-filter-sel aria-label="Filter">' + opts.map(function (o) {
      var n = o === "alle" ? open.length : (o === "high-growth" ? hgN : o === "beschleunigt" ? acN : open.filter(function (t) { return status(t) === o; }).length);
      var lab = o === "alle" ? "Alle" : o === "high-growth" ? "High Growth" : o === "beschleunigt" ? "Beschleunigt" : o.charAt(0).toUpperCase() + o.slice(1);
      return '<option value="' + o + '"' + (o === activeFilter ? " selected" : "") + ">" + lab + " (" + n + ")</option>";
    }).join("") + '</select></label><label><span>Sortieren</span><select data-sort-sel aria-label="Sortieren">' + SORTS.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === sortKey ? " selected" : "") + ">" + x[1] + "</option>";
    }).join("") + "</select></label></div>";
    var list = open.filter(function (t) { return activeFilter === "alle" || (activeFilter === "high-growth" ? isHG(t) : activeFilter === "beschleunigt" ? isAccel(t) : status(t) === activeFilter); });
    el.innerHTML = (smallScr() ? "" : foldRank(open) + chips) + (list.length ? '<div class="grid tiles">' + list.slice().sort(sorter(sortKey)).map(function (t) { return tile(t); }).join("") + "</div>" : empty("Nichts in diesem Filter", ""));
    var fsel = el.querySelector("[data-filter-sel]"), ssel = el.querySelector("[data-sort-sel]");
    if (fsel) fsel.addEventListener("change", function () { activeFilter = fsel.value; renderTheses(); armCharts(); fx(); });
    if (ssel) ssel.addEventListener("change", function () { sortKey = ssel.value; renderTheses(); armCharts(); fx(); });
  }

  /* ---------- Universum: alle vorgeprüften Aktien ---------- */
  var UV = null, uvF = { q: "", st: "alle", sort: "rang", n: 60 };
  function uvLoad() {
    if (UV) return UV;
    try { var el = document.getElementById("radar-universe"), o = JSON.parse(el.textContent); UV = o && Array.isArray(o.rows) ? o : { rows: [], asof: "" }; } catch (e) { UV = { rows: [], asof: "" }; }
    var base = {};
    theses.forEach(function (t) { var k = String(t.ticker || "").toUpperCase().replace(/^0+/, ""); if (k) base[k] = t; });
    UV.rows.forEach(function (r) { r._t = base[String(r.s.split(".")[0]).toUpperCase().replace(/^0+/, "")] || null; r._q = norm0(r.n + " " + r.s + " " + (r.i || "") + " " + (r.sc || "") + " " + (r.ind || "")); });
    return UV;
  }
  function norm0(x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function uvGroup(r) {
    var st = r.st || "";
    if (st.indexOf("Treffer") === 0) return "treffer";
    if (st.indexOf("Im Filter") === 0) return "filter";
    if (st.indexOf("Gefiltert") === 0) return "gefiltert";
    return "luecke";
  }
  function uvPf(x, d, suf) { return x == null ? "–" : (d ? nf1 : nf0).format(x) + (suf || ""); }
  function uvRow(r, i) {
    var g = uvGroup(r), cls = g === "treffer" ? "hit" : g === "filter" ? "ok" : g === "luecke" ? "bad" : "";
    var lab = r.l ? "Liste: " + r.l : g === "filter" ? "im Filter" : g === "gefiltert" ? (r.st || "").replace("Gefiltert: ", "gefiltert: ") : (r.st || "").split(":")[0] || "–";
    return '<div class="uv-row" data-i="' + i + '"><button type="button" aria-expanded="false"><span><span class="uv-n">' + esc(r.n) + (r.pub ? '<i class="uv-pub" title="enthält öffentliche Ersatzwerte"></i>' : "") + '</span><span class="uv-m">' + esc(r.s) + " · " + esc(r.i || "") + '</span></span><span class="uv-st ' + cls + '">' + esc(lab) + '</span>' +
      '<span class="uv-k"><span>Wachstum <b>' + uvPf(r.g, 0, " %") + "</b></span><span>Marge <b>" + uvPf(r.o, 0, " %") + "</b></span><span>Wert <b>" + (r.m == null ? "–" : eurShort(r.m * 1e6)) + "</b></span><span>vom Hoch <b>" + (r.d == null ? "–" : "−" + nf0.format(r.d) + " %") + "</b></span>" + (r.r != null ? "<span>Rang <b>" + r.r + "</b></span>" : "") + "</span></button></div>";
  }
  function uvEur(v, r) { if (v == null) return "–"; var t = Math.abs(v) >= 1 ? nf2.format(v) : new Intl.NumberFormat("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v); return r.u ? t + " " + esc(r.c || "") : "≈ " + t + " €"; }
  function uvDetail(r) {
    var S = r.src || {};
    function tag(k) { var c = S[k]; return c ? '<span class="uv-s ' + c + '">' + (c === "P" ? "öffentlich" : c === "N" ? "Näherung" : "EODHD") + "</span>" : ""; }
    function cell(lab, v, k) { return "<tr><td>" + lab + "</td><td>" + v + tag(k) + "</td></tr>"; }
    var cu = r.c ? " " + r.c : "";
    var h = "<table><tbody>" +
      cell("Börsenwert", r.m == null ? "–" : "≈ " + eurShort(r.m * 1e6), "mcap") +
      cell("Umsatzwachstum, letztes Quartal", uvPf(r.g, 1, " %"), "g") +
      cell("Erwartetes Wachstum (Analysten)", uvPf(r.e, 1, " %"), "est") +
      cell("Operative Marge", uvPf(r.o, 1, " %"), "om") +
      cell("KGV auf Erwartung", uvPf(r.p, 1), "fpe") +
      cell("Kurs", uvEur(r.px, r), "px") +
      cell("52-Wochen-Hoch / -Tief", uvEur(r.hi, r) + " / " + uvEur(r.lo, r), "hi52") +
      cell("Abstand zum Hoch", r.d == null ? "–" : "−" + nf1.format(r.d) + " %", "hi52") +
      cell("Position in der 52-Wochen-Spanne", r.x == null ? "–" : nf0.format(r.x) + " %", "hi52") +
      cell("Abstand zur 200-Tage-Linie", r.a == null ? "–" : (r.a > 0 ? "+" : "") + nf1.format(r.a) + " %", "ma200") +
      (r.sc || r.ind ? "<tr><td>Branche</td><td style=\"white-space:normal\">" + esc(r.ind || r.sc) + (r.ind && r.sc ? ' <span class="meta">(' + esc(r.sc) + ")</span>" : "") + "</td></tr>" : "") +
      cell("Vorauswahl-Rang (0–100)", r.r == null ? "–" : String(r.r), "") +
      "</tbody></table>" +
      '<p class="cap" style="margin:10px 0 0">Status: ' + esc(r.st || "–") + ". Index: " + esc(r.i || "–") + ". Quelle der Zahlen: EODHD-Fundamentaldaten (Stand " + esc(UV.asof) + "); „Näherung“ = Kurs aus KGV × Gewinn oder Börsenwert ÷ Aktien" + (r.pub ? "; „öffentlich“ = von Hand ergänzt aus: " + esc(r.pub) : "") + ". Alle Beträge grob in Euro umgerechnet" + (r.c && r.c !== "EUR" ? " (Börsenwährung: " + esc(r.c) + ")" : "") + ". Nur zur Vorauswahl, keine Bewertung.</p>";
    if (r._t) h += '<button type="button" class="uv-link" data-open="' + esc(r._t.id) + '">Zur These öffnen</button>';
    return h;
  }
  function faktorBox() {
    var F = null; try { var _f = document.getElementById("radar-faktor"); F = _f ? JSON.parse(_f.textContent) : null; } catch (e) { F = null; }
    if (!F || !F.top || !F.top.length) return "";
    var inR = F.top.filter(function (x) { return x.radar; }).length, nm = F.messung && F.messung.length;
    var names = { W: "Wachstum", Q: "Qualität", B: "Bewertung", T: "Trend", E: "Einstieg" };
    var rows = F.top.map(function (x, i) {
      var ch = ["W", "Q", "B", "T", "E"].map(function (k) { return '<span class="' + (x.f[k] >= 70 ? "hi" : "") + '" title="' + names[k] + " (Rangplatz 0 bis 100)" + '">' + k + " " + x.f[k] + "</span>"; }).join("") + (x.hype != null ? '<span class="' + (x.hype >= 70 ? "new" : "") + '" title="Hype 0 bis 100 (Kurs-Hitze, Bewertung' + (x.med ? ", Medien" : "") + ')">Hype ' + x.hype + "</span>" : "") + (x.radar ? '<span class="hi">im Radar</span>' : '<span class="new">neu</span>');
      return '<div class="fk-r"><span class="rk">' + (i + 1) + '</span><span><b>' + esc(x.n || x.s) + "</b><small>" + esc(x.s) + (x.gr ? " · " + esc(x.gr) : "") + (x.g != null ? " · Umsatz " + (x.g > 0 ? "+" : "") + x.g + " %" : "") + (x.p != null ? " · KGV " + x.p : "") + (x.med ? " · Medien: " + x.med[1] + (x.med[1] >= 100 ? "+" : "") + " Meldungen in 7 Tagen, " + x.med[2] + (x.med[2] >= 100 ? "+" : "") + " in 30" : "") + '</small></span><span class="sc">' + x.score + (x.abzug ? '<small title="Abzug für Hype">−' + String(x.abzug).replace(".", ",") + "</small>" : "") + '</span><span class="fk-ch">' + ch + "</span></div>";
    }).join("");
    return '<section class="fk"><h3>Faktor-Ranking <span class="count">' + F.top.length + "</span></h3>" +
      '<p class="cap">Zahlenbasierte Rangliste aus ' + F.n_bewertet + " Aktien (Stand " + date(F.asof) + "). Eine Aktie kommt nur hinein, wenn mindestens 3 von 4 Faktoren (Wachstum, Qualität, Bewertung, Trend) zugleich im oberen Drittel liegen. Davon sind " + inR + " bereits im Radar, " + (F.top.length - inR) + " neu. Hype (Kurs-Hitze, hohe Bewertung, bei den ersten 100 auch Medienzahl und Meistgehandelt) kostet bis zu 7,5 Punkte. Die Gewichte sind Startwerte und ungemessen; " + (nm ? "erste Messung: siehe unten." : "die Messung gegen das Universum läuft seit " + date(F.gerechnet) + ", erste Aussage nach etwa 3 Monaten.") + " Keine Empfehlung.</p>" +
      '<details><summary>Rangliste anzeigen</summary>' + rows + "</details>" +
      (nm ? '<p class="cap" style="margin-top:8px">' + F.messung.map(function (m) { return "Auswahl vom " + date(m.date) + ": Median " + (m.auswahl_median_pct > 0 ? "+" : "") + m.auswahl_median_pct + " % gegen Universum " + (m.universum_median_pct > 0 ? "+" : "") + m.universum_median_pct + " % nach " + m.tage + " Tagen (lokale Währung)"; }).join("; ") + ".</p>" : "") + "</section>";
  }
  function renderUniverse() {
    var el = document.getElementById("tab-universum"); if (!el) return;
    uvLoad();
    if (!UV.rows.length) { el.innerHTML = empty("Noch keine Universum-Daten", "Nach „python screen_update.py --rank-only“ und „python build.py“ erscheinen hier alle vorgeprüften Aktien."); return; }
    var cnt = { alle: UV.rows.length, treffer: 0, filter: 0, gefiltert: 0, luecke: 0, pub: 0, these: 0 };
    UV.rows.forEach(function (r) { cnt[uvGroup(r)]++; if (r.pub) cnt.pub++; if (r._t) cnt.these++; });
    var opts = [["alle", "Alle"], ["treffer", "Treffer in den Listen"], ["filter", "Im Filter"], ["gefiltert", "Gefiltert (zu klein, zu langsam, …)"], ["luecke", "Daten fehlen oder Fehler"], ["pub", "Mit öffentlichen Ersatzwerten"], ["these", "Hat eine These"]];
    var sorts = [["rang", "Vorauswahl-Rang"], ["g", "Wachstum"], ["o", "Marge"], ["m", "Börsenwert"], ["d", "Abstand zum Hoch (klein zuerst)"], ["n", "Name"]];
    el.innerHTML = faktorBox() + "<h2>Universum <span class=\"count\">" + UV.rows.length + "</span></h2>" +
      '<p class="uv-sum">Alle <b>' + UV.rows.length + "</b> vorgeprüften Aktien weltweit, Stand " + date(UV.asof) + ". Volle Detailansicht gibt es nur für die <b>" + cnt.these + "</b> Aktien mit These; für alle anderen zeigt die Karte die Kennzahlen der Vorauswahl und ihre Herkunft. Orangefarbener Punkt: enthält öffentliche Ersatzwerte.</p>" +
      '<input class="uv-q" type="search" placeholder="Suchen: Name, Kürzel oder Index" aria-label="Suchen" value="' + esc(uvF.q) + '">' +
      '<div class="fbar"><label><span>Filter</span><select data-uv="st" aria-label="Filter">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === uvF.st ? " selected" : "") + ">" + o[1] + " (" + (cnt[o[0]] || 0) + ")</option>"; }).join("") + '</select></label><label><span>Sortieren</span><select data-uv="sort" aria-label="Sortieren">' + sorts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === uvF.sort ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="uv-list" id="uvList"></div><div id="uvMore"></div>';
    var q = el.querySelector(".uv-q"), t0;
    q.addEventListener("input", function () { clearTimeout(t0); t0 = setTimeout(function () { uvF.q = q.value; uvF.n = 60; uvList(); }, 180); });
    Array.prototype.forEach.call(el.querySelectorAll("[data-uv]"), function (s) { s.addEventListener("change", function () { uvF[s.getAttribute("data-uv")] = s.value; uvF.n = 60; uvList(); }); });
    el.addEventListener("click", function (ev) {
      var o = ev.target.closest && ev.target.closest("[data-open]");
      if (o) { openDetail(o.getAttribute("data-open"), o); return; }
      var m = ev.target.closest && ev.target.closest("[data-more]");
      if (m) { uvF.n += 60; uvList(); return; }
      var b = ev.target.closest && ev.target.closest(".uv-row > button");
      if (!b) return;
      var row = b.parentNode, d = row.querySelector(".uv-d");
      if (d) { d.remove(); b.setAttribute("aria-expanded", "false"); return; }
      var r = UV.rows[+row.getAttribute("data-i")];
      var div = document.createElement("div"); div.className = "uv-d"; div.innerHTML = uvDetail(r); row.appendChild(div); b.setAttribute("aria-expanded", "true");
    });
    uvList();
  }
  function uvList() {
    var qn = norm0(uvF.q).trim(), f = uvF.st;
    var list = [];
    UV.rows.forEach(function (r, i) {
      if (f === "pub" ? !r.pub : f === "these" ? !r._t : f !== "alle" && uvGroup(r) !== f) return;
      if (qn && r._q.indexOf(qn) < 0) return;
      list.push(i);
    });
    var k = uvF.sort;
    list.sort(function (a, b) {
      var x = UV.rows[a], y = UV.rows[b];
      if (k === "n") return x.n.localeCompare(y.n);
      var key = k === "rang" ? "r" : k, dir = k === "d" ? 1 : -1;
      var vx = x[key], vy = y[key];
      if (vx == null && vy == null) return x.n.localeCompare(y.n);
      if (vx == null) return 1; if (vy == null) return -1;
      return (vx - vy) * dir;
    });
    var shown = list.slice(0, uvF.n);
    document.getElementById("uvList").innerHTML = shown.length ? shown.map(function (i) { return uvRow(UV.rows[i], i); }).join("") : empty("Keine Treffer", "Suche oder Filter lockern.");
    document.getElementById("uvMore").innerHTML = list.length > shown.length ? '<button type="button" class="uv-more" data-more="1">Weitere anzeigen (' + (list.length - shown.length) + " übrig)</button>" : "";
  }
  window.renderUniverse = renderUniverse;
  window.radarUniverseApi = { rows: function () { return uvLoad().rows; }, open: function (sym) { uvF.q = sym; uvF.st = "alle"; uvF.n = 60; show("universum", true); } };

  function renderHistory() {
    var el = document.getElementById("tab-verlauf");
    var entries = [];
    theses.forEach(function (t) {
      (Array.isArray(t.log) ? t.log : []).forEach(function (x) { entries.push({ t: t, x: x }); });
    });
    entries.sort(function (a, b) { return (b.x.date || "").localeCompare(a.x.date || ""); });
    var html = btHtml() + "<h2>Empfehlungen und Revisionen</h2>";
    if (!entries.length) html += empty("Noch kein Verlauf", "Jeder Lauf ergänzt hier Aufnahmen, Updates und Revisionen. Nichts wird gelöscht.");
    else html += '<ul class="timeline">' + entries.map(function (e) {
      var type = e.x.type || "hinweis", s = STATUS.indexOf(e.x.status) >= 0 ? e.x.status : null;
      return '<li class="t-' + esc(type) + '"><div class="when">' + date(e.x.date) + "</div>" +
        '<div class="what">' + esc(e.t.name || e.t.ticker) + " <span class='meta'>" + esc(e.t.ticker) + "</span> " + (s ? '<span class="badge b-' + s + '">' + s + "</span>" : "") + "</div>" +
        "<div>" + esc(e.x.text) + (num(e.x.price) != null ? " <span class='meta'>Kurs " + money(e.x.price, e.t.currency) + "</span>" : "") + link(e.x.source) + "</div></li>";
    }).join("") + "</ul>";
    var closed = theses.filter(function (t) { return !isOpen(t); });
    if (closed.length) html += "<h2>Beendete Thesen</h2>" + '<div class="grid tiles">' + closed.map(function (t) { return tile(t); }).join("") + "</div>";
    if (checked.length) {
      html += "<h2>Geprüft und verworfen <span class=\"count\">" + checked.length + "</span></h2>" +
        '<div class="tablebox scroll"><table class="list"><thead><tr><th>Aktie</th><th>Index</th><th>Datum</th><th>Ergebnis</th><th>Grund</th></tr></thead><tbody>' +
        checked.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).map(function (c) {
          return '<tr><td data-l="Aktie"><b>' + esc(c.name || c.ticker) + "</b> <span class='meta'>" + esc(c.ticker) + '</span></td><td data-l="Index">' + esc(c.index) + '</td><td data-l="Datum">' + date(c.date) + '</td><td data-l="Ergebnis">' + esc(c.result || "verworfen") + '</td><td data-l="Grund">' + esc(c.reason || "") + link(c.source) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    var qr = runsDesc().filter(function (r) { return Array.isArray(r.queue) && r.queue.length; })[0];
    if (qr) {
      html += "<h2>Warteschlange für den nächsten Lauf <span class=\"count\">" + qr.queue.length + "</span></h2>" +
        '<p class="meta" style="margin:-4px 0 10px">Treffer des Screens vom ' + date(qr.date) + ", die der nächste Lauf zuerst einzeln prüft. Sie sind noch keine Empfehlung.</p>" +
        '<div class="tablebox scroll"><table class="list"><thead><tr><th>Aktie</th><th>Land</th><th>Eckdaten aus dem Screen</th></tr></thead><tbody>' +
        qr.queue.map(function (q) {
          return '<tr><td data-l="Aktie"><b>' + esc(q.name || q.ticker) + "</b> <span class='meta'>" + esc(q.ticker || "") + '</span></td><td data-l="Land">' + esc(q.country || "") + '</td><td data-l="Eckdaten">' + esc(q.note || "") + link(q.source) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (runs.length) html += "<h2>Läufe</h2>" + '<div class="runs">' + runsDesc().map(function (r) {
      return "<div><time>" + date(r.date) + "</time><span>" + linkify(r.summary || "") + "</span></div>";
    }).join("") + "</div>";
    el.innerHTML = decisionsHtml() + '<details class="fold arch"><summary>Ausführlicher Verlauf: alle Einträge, Backtest, abgelehnte Aktien, Läufe</summary>' + html + "</details>";
  }

  // Tabs
  var nav = document.querySelector("nav.tabs");
  var tabs = Array.prototype.slice.call(nav.querySelectorAll("button"));
  var ind = nav.querySelector(".tabind");
  var TABNAMES = ["lage", "heute", "muster", "depot", "thesen", "score", "themen", "universum", "verlauf", "methodik"];
  var indReady = false;
  function moveInd() {
    var b = tabs.filter(function (x) { return x.getAttribute("aria-selected") === "true"; })[0];
    if (!b || !ind) return;
    if (!indReady) ind.style.transition = "none";
    ind.style.width = b.offsetWidth + "px";
    ind.style.transform = "translateX(" + b.offsetLeft + "px)";
    if (!indReady) { void ind.offsetWidth; ind.style.transition = ""; indReady = true; }
    if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2), behavior: "smooth" });
  }
  function show(name, user) {
    tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name)); });
    TABNAMES.forEach(function (n) { document.getElementById("tab-" + n).hidden = n !== name; });
    try { sessionStorage.setItem("radar-tab", name); } catch (e) { /* optional */ }
    nav.classList.remove("hide");
    document.documentElement.classList.remove("snap"); /* Kachel-Einrasten entfernt: ruckelte beim Scrollen */
    if (name === "universum" && window.renderUniverse) window.renderUniverse();
    moveInd();
    if (user && window.scrollY > 160) window.scrollTo({ top: 0, behavior: "smooth" });
    armCharts(); fx();
  }
  tabs.forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-tab"), true); }); });
  window.addEventListener("resize", moveInd);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);

  // Darstellung
  var root = document.documentElement;
  try { if (window.self !== window.top) root.classList.add("embedded"); } catch (e) { root.classList.add("embedded"); }
  /* Detail auf dem Handy: Sektionen umschalten */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-dsec]"); if (!b) return;
    var wrap = b.closest(".dsec-wrap"); if (!wrap) return;
    var k = b.getAttribute("data-dsec");
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-dsec]"), function (x) { x.setAttribute("aria-selected", String(x === b)); });
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-dpane]"), function (p) { p.classList.toggle("on", p.getAttribute("data-dpane") === k); });
    var sc = wrap.closest(".dscroll"); if (sc && sc.scrollTop > wrap.offsetTop) sc.scrollTop = wrap.offsetTop;
    b.scrollIntoView({ inline: "center", block: "nearest" });
  });
  /* Rückfall für Kachel-Springen, falls das CSS-Einrasten im Browser nicht greift (z. B. iPhone-WebView) */
  (function () {
    var tm = null, down = false;
    function settle() {
      if (down || !root.classList.contains("snap") || modalOpen) return;
      var pad = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 8), best = null;
      Array.prototype.forEach.call(document.querySelectorAll("#tab-heute .tile:not(.clone), #tab-thesen .tile:not(.clone), #tab-themen .thm"), function (el) {
        if (!el.offsetParent) return;
        var r = el.getBoundingClientRect(), d = r.top - pad;
        if (!best || Math.abs(d) < Math.abs(best.d)) best = { d: d, h: r.height };
      });
      if (!best || Math.abs(best.d) < 3 || Math.abs(best.d) > best.h * 0.5) return;
      var all = Array.prototype.filter.call(document.querySelectorAll("#tab-heute .tile:not(.clone), #tab-thesen .tile:not(.clone), #tab-themen .thm"), function (e) { return e.offsetParent; });
      if (all.length && (all[0].getBoundingClientRect().top - pad > 3 || all[all.length - 1].getBoundingClientRect().top - pad < -3)) return;
      window.scrollTo({ top: window.scrollY + best.d, behavior: "smooth" });
    }
    window.addEventListener("scroll", function () { clearTimeout(tm); tm = setTimeout(settle, 150); }, { passive: true });
    var sOff = 0, sy = 0, sIdx = -1, lY = 0, lT = 0, vel = 0;
    function padv() { var v = parseFloat(getComputedStyle(root).scrollPaddingTop); return isNaN(v) ? 8 : v; }
    function tl() { return Array.prototype.filter.call(document.querySelectorAll("#tab-heute .tile:not(.clone), #tab-thesen .tile:not(.clone), #tab-themen .thm"), function (e) { return e.offsetParent; }); }
    function near() {
      var pad = padv(), ts = tl(), bi = -1, bd = 1e9, bh = 0;
      ts.forEach(function (e, i) { var r = e.getBoundingClientRect(), d = Math.abs(r.top - pad); if (d < bd) { bd = d; bi = i; bh = r.height; } });
      return { i: bd < bh * 0.6 ? bi : -1, ts: ts };
    }
    document.addEventListener("touchstart", function (ev) {
      down = true; clearTimeout(tm); vel = 0; sIdx = -1;
      if (ev.touches.length === 1 && root.classList.contains("snap") && root.classList.contains("embedded") && !modalOpen) { sy = lY = ev.touches[0].clientY; lT = Date.now(); var nn = near(), lt = nn.ts.length ? nn.ts[nn.ts.length - 1].getBoundingClientRect().top - padv() : 0; sIdx = lt < -3 ? -1 : nn.i; sOff = sIdx >= 0 ? nn.ts[sIdx].getBoundingClientRect().top - padv() : 0; }
    }, { passive: true });
    document.addEventListener("touchmove", function (ev) {
      if (sIdx < 0) return;
      var y = ev.touches[0].clientY, now = Date.now(), dt = Math.max(1, now - lT);
      vel = (lY - y) / dt; lY = y; lT = now;
    }, { passive: true });
    document.addEventListener("touchend", function (ev) {
      down = false; clearTimeout(tm);
      if (sIdx >= 0 && ev.changedTouches.length) {
        var total = sy - ev.changedTouches[0].clientY, n = near(), ts = n.ts, dir = 0;
        if (Math.abs(total) > 45 || Math.abs(vel) > 0.3) dir = (Math.abs(vel) > 0.3 ? vel : total) > 0 ? 1 : -1;
        if (dir < 0 && sIdx === 0 && sOff > -3) { sIdx = -1; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        if (dir > 0 && sIdx === ts.length - 1 && sOff <= 3) { sIdx = -1; window.scrollTo({ top: window.scrollY + ts[ts.length - 1].getBoundingClientRect().bottom - padv() + 4, behavior: "smooth" }); return; }
        if (dir > 0 && sOff > 3) dir = 0; else if (dir < 0 && sOff < -3) dir = 0;
        var k = Math.max(0, Math.min(ts.length - 1, sIdx + dir)), el = ts[k];
        sIdx = -1;
        if (el) { window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - padv(), behavior: "smooth" }); return; }
      }
      tm = setTimeout(settle, 150);
    }, { passive: true });
    document.addEventListener("touchcancel", function () { down = false; }, { passive: true });
  })();
  try { var saved = localStorage.getItem("radar-theme"); if (saved) root.setAttribute("data-theme", saved); } catch (e) { /* optional */ }
  document.getElementById("themeBtn").addEventListener("click", function () {
    var next = theme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("radar-theme", next); } catch (e) { /* optional */ }
    armCharts();
  });

  // Treppen-Darstellung (kumuliert / 12 Monate / je Periode), gilt für alle Karten
  function setStair(m) {
    stairMode = m;
    root.setAttribute("data-stair", m);
    Array.prototype.forEach.call(document.querySelectorAll("[data-stair-mode]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-stair-mode") === m)); });
    try { localStorage.setItem("radar-stair", m); } catch (e) { /* optional */ }
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-stair-mode]");
    if (b) setStair(b.getAttribute("data-stair-mode"));
  });

  /* ---------- Effekte: Einblenden, Zähler, Spotlight, Scrollverhalten ---------- */
  var REVEAL = ".card, .tile, .stat, .box.note, .tablebox, .runs, .empty, h2, .chip, .timeline li";
  function countUp(el) {
    var to = parseFloat(el.getAttribute("data-count"));
    if (!isFinite(to)) return;
    var t0 = null, dur = 1100;
    el.textContent = "0";
    function step(ts) {
      if (t0 == null) t0 = ts;
      var kk = Math.min(1, (ts - t0) / dur);
      kk = 1 - Math.pow(1 - kk, 3);
      el.textContent = nf0.format(Math.round(to * kk));
      if (kk < 1) requestAnimationFrame(step); else el.textContent = nf0.format(to);
    }
    requestAnimationFrame(step);
  }
  var io = FX ? new IntersectionObserver(function (entries) {
    var n = 0;
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      io.unobserve(el);
      el.style.setProperty("--d", Math.min(n++, 6) * 70 + "ms");
      el.classList.add("in");
      Array.prototype.forEach.call(el.querySelectorAll("[data-count]"), countUp);
      setTimeout(function () { el.style.removeProperty("--d"); }, 1800);
    });
  }, { threshold: 0.06, rootMargin: "0px 0px -4% 0px" }) : null;
  function fx() {
    if (!FX) return;
    Array.prototype.forEach.call(document.querySelectorAll(REVEAL), function (el) {
      if (el.hasAttribute("data-fx")) return;
      el.setAttribute("data-fx", "1");
      el.classList.add("reveal");
      io.observe(el);
    });
  }
  window.addEventListener("beforeprint", function () {
    Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) { el.classList.add("in"); });
  });
  document.addEventListener("pointermove", function (e) {
    var c = e.target.closest && e.target.closest(".card, .tile");
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
  document.addEventListener("click", function (ev) {
    var j = ev.target.closest && ev.target.closest("[data-jump]");
    if (!j) return;
    var sec = document.querySelector("section:not([hidden])");
    var el = sec && sec.querySelector('[data-card="' + j.getAttribute("data-jump") + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  });

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.xl");
    if (!a) return;
    ev.preventDefault();
    var id = a.getAttribute("data-open-id"), t = byIdMap[id];
    if (!t || modalOpen) return;
    var q = function () { return document.querySelector('[data-card="' + id + '"]'); };
    show(isOpen(t) ? "thesen" : "verlauf", false);
    if (!q() && isOpen(t)) { activeFilter = "alle"; renderTheses(); armCharts(); fx(); }
    var el = q();
    if (!el) return;
    el.classList.add("in");
    el.scrollIntoView({ behavior: "auto", block: "center" });
    setTimeout(function () { openDetail(id, el); }, 90);
  });

  var prog = document.getElementById("prog"), fab = document.getElementById("top"), fabPg = fab.querySelector(".pg"), aur = document.querySelector(".aurora");
  var lastY = window.scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? Math.min(1, Math.max(0, y / h)) : 0;
    prog.style.transform = "scaleX(" + p + ")";
    fabPg.style.strokeDashoffset = String(131.95 * (1 - p));
    fab.classList.toggle("show", y > 700);
    if (aur) aur.style.setProperty("--sy", String(y));
    nav.classList.toggle("stuck", y > 90);
    if (y > 260 && y > lastY + 6) nav.classList.add("hide");
    else if (y < lastY - 6 || y <= 260) nav.classList.remove("hide");
    lastY = y;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  fab.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  try { var sm = localStorage.getItem("radar-stair"); if (sm === "kum" || sm === "ttm" || sm === "per") stairMode = sm; } catch (e) { /* optional */ }
  root.setAttribute("data-stair", stairMode);
  /* ===== Lage v2: einfache Sprache, feste Regeln (06.11.2026) =====
     Farbregel überall: Rot = Vorsicht, Gelb = Beobachten, Grün = in Ordnung / Chance, Grau = Info. */
  var LAGE = null; try { var _lgx = document.getElementById("radar-lage"); LAGE = _lgx ? JSON.parse(_lgx.textContent) : null; } catch (e) { LAGE = null; }
  var LG_TH = {}; LG_TH[THEMES[0]] = ["SMH", "XLK"]; LG_TH[THEMES[1]] = ["XLC", "XLK"]; LG_TH[THEMES[2]] = ["XLI"]; LG_TH[THEMES[3]] = ["XLI"];
  LG_TH[THEMES[4]] = ["XLV"]; LG_TH[THEMES[5]] = ["XLY", "XLF"]; LG_TH[THEMES[7]] = ["GLD"];
  var LG_OF = { XLK: THEMES[0], SMH: THEMES[0], XLC: THEMES[1], XLI: THEMES[3], XLV: THEMES[4], XLY: THEMES[5], XLF: THEMES[5], XLP: THEMES[5], GLD: THEMES[7], XLB: THEMES[7] };
  var LG_TW = {}; LG_TW[THEMES[0]] = "KI- und Chipwerten"; LG_TW[THEMES[1]] = "Software- und Internetwerten"; LG_TW[THEMES[2]] = "Rüstungswerten"; LG_TW[THEMES[3]] = "Industriewerten";
  LG_TW[THEMES[4]] = "Gesundheitswerten"; LG_TW[THEMES[5]] = "Konsum- und Finanzwerten"; LG_TW[THEMES[6]] = "breiten ETFs"; LG_TW[THEMES[7]] = "Rohstoffen";
  var LG_DESC = { "Technologie": "Software, Hardware, Chips", "Halbleiter": "Chiphersteller", "Kommunikation": "Internet, Medien, Telefon", "Zyklischer Konsum": "Autos, Handel, Reisen", "Finanzen": "Banken, Versicherungen", "Gesundheit": "Pharma, Medizintechnik", "Industrie": "Maschinen, Bau, Luftfahrt", "Energie": "Öl und Gas", "Rohstoffe": "Chemie, Metalle", "Basiskonsum": "Lebensmittel, Drogerie", "Versorger": "Strom, Wasser", "Immobilien": "Immobilienfirmen", "Eurozone": "Aktien Euroraum", "Japan": "Aktien Japan", "Schwellenländer": "China, Indien, Brasilien u. a.", "Gold": "Goldpreis", "US-Staatsanleihen lang": "sichere Staatsanleihen" };
  var LG_C = ["gruen", "gelb", "rot"];
  function lgRow(s) { var r = LAGE && Array.isArray(LAGE.rows) ? LAGE.rows : []; for (var i = 0; i < r.length; i++) if (r[i].s === s) return r[i]; return null; }
  function sg1(v) { return v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + nf1.format(Math.abs(v)) + " %"; }
  function thTheme(t) { return sectorGroup(t) === "KI-Hardware" ? THEMES[0] : guessTheme(t.sector); }
  function inDepot(t) { return !!t.depot || dpos.some(function (p) { return p.ticker && p.ticker === t.ticker; }); }
  function nmShort(n) { return String(n || "").replace(/\s*\(.*?\)/g, "").replace(/,? (Inc\.?|Corporation|Corp\.?|Incorporated|N\.V\.|AG|SE|plc|Holdings?|Co\., Ltd\.|Ltd\.|Limited|Technology|Group)$/i, "").replace(/ (USD|EUR)$/, "").trim(); }
  function lgList(a, n) { n = n || 5; return a.slice(0, n).join(", ") + (a.length > n ? " und " + (a.length - n) + " weitere" : ""); }
  function lgExpo() {
    var o = {}, names = {}, cnt = {};
    if (dpos.length) {
      var tot = dpos.reduce(function (a, p) { return a + (num(p.value) || 0); }, 0) || 1;
      dpos.forEach(function (p) { var k = themeOfPos(p); o[k] = (o[k] || 0) + (num(p.value) || 0) / tot * 100; (names[k] = names[k] || []).push(nmShort(String(p.name || p.ticker).replace(/ \(Acc\)| \(A\)/g, ""))); });
      return { src: "dep", m: o, names: names, n: dpos.length };
    }
    var ok = theses.filter(isOpen).filter(valid).sort(byScore);
    ok.forEach(function (t) { var k = thTheme(t); cnt[k] = (cnt[k] || 0) + 1; o[k] = (o[k] || 0) + 100 / (ok.length || 1); (names[k] = names[k] || []).push(nmShort(t.name)); });
    return { src: "radar", m: o, names: names, cnt: cnt, n: ok.length };
  }
  function lgShare(ex, ths) { return (ths || []).reduce(function (a, k) { return a + (ex.m[k] || 0); }, 0); }
  function lgHit(ex, sh) { return ex.src === "dep" ? nf0.format(sh) + " % deines Depots" : nf0.format(sh) + " % der starken Aktien im Radar"; }
  function lgAmpel() {
    var s = [], spx = lgRow("^GSPC"), ndx = lgRow("^NDX"), vix = lgRow("^VIX"), tnx = lgRow("^TNX"), rsp = lgRow("RSP"), spy = lgRow("SPY");
    function add(q, l, a, d, r) { s.push({ q: q, l: l, a: a, d: d, r: r }); }
    function trend(x, nm, q) {
      if (!x || x.ma200 == null) return; var v = x.ma200;
      add(q, v < 0 ? 2 : v < 2 ? 1 : 0, v < 0 ? "Nein" : v < 2 ? "Gerade noch" : "Ja", nm + " liegt " + nf1.format(Math.abs(v)) + " % " + (v >= 0 ? "über" : "unter") + " seinem Durchschnitt der letzten 200 Tage.", "Grün: mehr als 2 % über dem 200-Tage-Durchschnitt. Gelb: knapp darüber. Rot: darunter.");
    }
    trend(spx, "Der S&P 500 (500 größte US-Firmen)", "Geht es mit dem US-Markt langfristig aufwärts?");
    trend(ndx, "Der Nasdaq 100 (große Technologiewerte)", "Geht es mit den großen Technologiewerten aufwärts?");
    if (vix && vix.px != null) add("Wie nervös sind die Anleger?", vix.px >= 25 ? 2 : vix.px >= 20 ? 1 : 0, vix.px >= 25 ? "Sehr nervös" : vix.px >= 20 ? "Unruhig" : "Ruhig", "Angst-Index VIX bei " + nf1.format(vix.px) + ". Ruhige Zeiten liegen bei 12 bis 18.", "Grün: unter 20. Gelb: 20 bis 25. Rot: ab 25.");
    if (spx && spx.m1 != null) add("Wie lief der US-Markt im letzten Monat?", spx.m1 <= -8 ? 2 : spx.m1 <= -4 ? 1 : 0, spx.m1 <= -8 ? "Deutlich gefallen" : spx.m1 <= -4 ? "Spürbar gefallen" : spx.m1 < 0 ? "Leicht gefallen" : "Gestiegen", "S&P 500 " + sg1(spx.m1) + " in einem Monat.", "Grün: besser als −4 %. Gelb: −4 bis −8 %. Rot: mehr als −8 %.");
    if (tnx && tnx.m1abs != null) add("Steigen die Zinsen schnell?", tnx.m1abs >= 0.4 ? 2 : tnx.m1abs >= 0.2 ? 1 : 0, tnx.m1abs >= 0.4 ? "Ja, deutlich" : tnx.m1abs >= 0.2 ? "Etwas" : tnx.m1abs < 0 ? "Nein, sie sinken" : "Nein", "Zins für 10-jährige US-Staatsanleihen: " + nf2.format(tnx.px) + " %, vor einem Monat " + nf2.format(tnx.px - tnx.m1abs) + " %.", "Steigende Zinsen machen Aktien unattraktiver. Gelb ab +0,2, Rot ab +0,4 Prozentpunkte in einem Monat.");
    if (rsp && rsp.m1 != null && spy && spy.m1 != null) { var dlt0 = rsp.m1 - spy.m1;
      add("Fällt der ganze Markt oder nur ein Teil?", dlt0 <= -4 ? 1 : 0, dlt0 >= 0 ? "Nur ein Teil" : dlt0 <= -4 ? "Nur noch wenige Riesen tragen den Markt" : "Breit verteilt", "Die Durchschnittsaktie kam auf " + sg1(rsp.m1) + ", der Index auf " + sg1(spy.m1) + " (letzter Monat).", "Gelb, wenn die Durchschnittsaktie mehr als 4 % hinter dem Index liegt: Dann hängt alles an wenigen großen Firmen."); }
    var red = s.filter(function (x) { return x.l === 2; }).length, yel = s.filter(function (x) { return x.l === 1; }).length;
    return { lvl: !s.length ? "grau" : red >= 2 ? "rot" : (red || yel >= 2) ? "gelb" : "gruen", s: s, red: red, yel: yel };
  }
  function lgFlows() {
    var r = (LAGE && LAGE.rows || []).filter(function (x) { return (x.k === "sec" || x.k === "reg" || x.k === "asset") && x.rs1 != null && x.m1 != null; }).sort(function (a, b) { return b.rs1 - a.rs1; });
    return { inn: r.filter(function (x) { return x.rs1 > 0; }).slice(0, 4), out: r.filter(function (x) { return x.rs1 < 0; }).slice(-4).reverse(), all: r, spy: lgRow("SPY") };
  }
  function lgEvents() { var r = runsDesc().filter(function (x) { return x.market && Array.isArray(x.market.events); })[0]; return r ? r.market.events : []; }
  function lgDay(d) { var n = daysTo(d); if (n === 0) return "Heute"; if (n === 1) return "Morgen"; var w = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(d + "T12:00:00").getDay()]; return w + " " + date(d).slice(0, 6); }
  function lgWarn(amp, ex) {
    var W = [], today = new Date().toISOString().slice(0, 10), in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), spy = lgRow("SPY");
    function w(k, t, x, b, why) { W.push({ k: k, t: t, x: x, b: b || "", why: why || "" }); }
    var mkt = spy && spy.m1 != null ? ", der Gesamtmarkt " + sg1(spy.m1) : "";
    Object.keys(ex.m).forEach(function (k) {
      var sh = ex.m[k], etf = (LG_TH[k] || []).map(lgRow).filter(function (x) { return x && x.rs1 != null; });
      if (sh < 20 || !etf.length) return;
      var worst = etf.slice().sort(function (a, b) { return a.rs1 - b.rs1; })[0], best = etf.slice().sort(function (a, b) { return b.rs1 - a.rs1; })[0];
      if (worst.rs1 <= -5) { w(0, "Anleger ziehen Geld aus " + (LG_TW[k] || k) + " ab", worst.n + " " + sg1(worst.m1) + " im letzten Monat" + mkt + "." + (worst.rsw != null && worst.rsw <= -3 ? " In der letzten Woche hat sich das verstärkt." : worst.rsw != null && worst.rsw >= 3 ? " In der letzten Woche hat es nachgelassen." : ""), "Betrifft " + lgHit(ex, sh) + ": " + lgList(ex.names[k] || []), "Läuft ein Bereich über Wochen klar schlechter als der Gesamtmarkt, verkaufen Anleger dort. Gemessen an einem Fonds, der den ganzen Bereich abbildet (Yahoo-Kurse). Vorsicht ab 5 % schlechter als der Gesamtmarkt in einem Monat."); W[W.length - 1].th = k; }
      else if (best.rs1 >= 5) w(2, "Anleger kaufen " + (LG_TW[k] || k), best.n + " " + sg1(best.m1) + " im letzten Monat" + mkt + ".", "Betrifft " + lgHit(ex, sh), "Der Bereich läuft seit Wochen klar besser als der Gesamtmarkt.");
    });
    var lim = ex.src === "dep" ? limOf("maxtheme") : 40, shown = {}; W.forEach(function (x) { if (x.th) shown[x.th] = 1; });
    Object.keys(ex.m).forEach(function (k) {
      if (k === THEMES[6] || k === THEMES[7] || ex.m[k] <= lim) return;
      var x = ex.src === "dep" ? nf0.format(ex.m[k]) + " % deines Depots stecken in diesem einen Thema. Deine Grenze sind " + lim + " %." : (ex.cnt[k] || 0) + " von " + ex.n + " starken Aktien im Radar gehören zu diesem Thema (" + nf0.format(ex.m[k]) + " %). Die Grenze sind " + lim + " %.";
      w(0, "Zu viel in einem Korb: " + (LG_TW[k] || k).replace(/n$/, ""), x + " Fällt das Thema, fallen sie gemeinsam, wie am 05.11.", shown[k] ? "" : lgList(ex.names[k] || []), "Aktien aus demselben Thema reagieren auf dieselben Nachrichten. Darum gilt eine Obergrenze je Thema (Radar 40 %, Depot laut deinen Regeln).");
    });
    lgEvents().filter(function (e) { return e.date && e.date >= today && e.date <= in7 && (String(e.importance).toLowerCase() === "hoch" || Array.isArray(e.watch)); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).slice(0, 2).forEach(function (e) {
      var cs = Array.isArray(e.watch) ? e.watch : [], tm = /\d{1,2}:\d{2}/.exec(String(e.time || "")), nm = String(e.name || "").replace(/\s*\((Radar-Termin|vorbei)\)/g, "");
      var txt = cs.length ? cs.map(function (c) { var s = lgShare(ex, c.themes); return "<div class='lg-case'><b>" + esc(c.case) + ":</b> " + esc(c.why) + (s ? " <span class='lg-hit" + (c.dir === "up" ? " up" : "") + "'>" + (c.dir === "up" ? "Hilft " : "Trifft ") + lgHit(ex, s) + "</span>" : "") + "</div>"; }).join("") : esc(e.effect || e.why || "");
      W.push({ k: 1, t: lgDay(e.date) + (tm ? ", " + tm[0] + " Uhr" : "") + ": " + nm, x: txt, b: "", why: [e.why, e.expectation].filter(Boolean).join(" "), html: true });
    });
    var topIds = {}; topList().forEach(function (t) { topIds[t.id] = 1; });
    var cat = theses.filter(function (t) { return isOpen(t) && (inDepot(t) || topIds[t.id]) && t.catalyst && t.catalyst.date && t.catalyst.date >= today && t.catalyst.date <= in7; }).sort(function (a, b) { return a.catalyst.date.localeCompare(b.catalyst.date); });
    if (cat.length) w(1, "Quartalszahlen in den nächsten 7 Tagen", cat.map(function (t) { return nmShort(t.name) + " (" + lgDay(t.catalyst.date) + (inDepot(t) ? ", im Depot" : "") + ")"; }).join(", ") + ".", "", "An Zahltagen bewegen sich einzelne Aktien oft stark. Worauf der Markt schaut, steht in der Detailansicht unter Zahlen.");
    var mv = dpos.filter(function (p) { return num(p.day_pct) != null && Math.abs(p.day_pct) >= 5; }).sort(function (a, b) { return a.day_pct - b.day_pct; });
    if (mv.length) w(mv[0].day_pct <= -5 ? 0 : 3, "Große Bewegungen in deinem Depot", lgList(mv.map(function (p) { return nmShort(String(p.name).replace(/ \(Acc\)/g, "")) + " " + sg1(p.day_pct); }), 4) + " (letzter Handelstag).", "", "Ab 5 % an einem Tag lohnt der Blick: Gab es eine eigene Meldung der Firma, oder hat nur der ganze Bereich nachgegeben? Die Antwort steht in der Detailansicht.");
    var keys = runKeys();
    if (keys.length > 1) {
      var cur = keys[keys.length - 1], prv = keys[keys.length - 2], dn = [], up = [];
      theses.forEach(function (t) { var h = slog(t), a = h.filter(function (x) { return x.run === cur; })[0], b = h.filter(function (x) { return x.run === prv; })[0]; if (!a || !b) return; if (b.score >= TH && a.score < TH) dn.push(nmShort(t.name)); if (b.score < TH && a.score >= TH) up.push(nmShort(t.name)); });
      if (dn.length) w(3, dn.length + (dn.length === 1 ? " Aktie ist" : " Aktien sind") + " von der starken Liste gefallen", lgList(dn) + ".", "Gründe: Verlauf → Entscheidungen", "Auf der starken Liste stehen Aktien mit Score ab " + TH + " von 100. Der Score fasst Wachstum, Qualität, Bewertung, Kursziel der Analysten, Abstand zum Hoch, Risiken und Erwartungen zusammen.");
      if (up.length) w(2, (up.length === 1 ? "Eine Aktie ist" : up.length + " Aktien sind") + " zurück auf der starken Liste", lgList(up) + ".", "Gründe: Verlauf → Entscheidungen", "");
    }
    var outs = {}; lgFlows().out.forEach(function (x) { if (LG_OF[x.s] && x.rs1 <= -5) outs[LG_OF[x.s]] = 1; });
    lgFlows().inn.filter(function (x) { return x.rs1 >= 5 && (x.rsw == null || x.rsw >= 0) && LG_OF[x.s] && (ex.m[LG_OF[x.s]] || 0) < 10; }).slice(0, 1).forEach(function (x) {
      w(2, "Anleger kaufen " + x.n + (LG_DESC[x.n] ? " (" + LG_DESC[x.n] + ")" : ""), x.n + " " + sg1(x.m1) + " im letzten Monat" + mkt + ". " + (ex.src === "dep" ? "Du hast dort " + nf0.format(ex.m[LG_OF[x.s]] || 0) + " %." : "Im Radar steht dort kaum eine starke Aktie."), "", "Der Bereich läuft seit Wochen klar besser als der Gesamtmarkt. Das ist ein Hinweis, wo gerade Geld hinfließt, keine Kaufempfehlung. Einzelne Aktien müssen erst geprüft werden.");
    });
    var ch = theses.filter(function (t) { if (!isOpen(t) || !valid(t) || status(t) !== "intakt" || outs[thTheme(t)]) return false; var l = t.last || {}, dd = num(l.price) && num(l.high_52w) ? (1 - l.price / l.high_52w) * 100 : null; return dd != null && dd >= 20 && dd <= 45; }).sort(byScore).slice(0, 3);
    if (ch.length) w(2, "Starke Aktien mit Rücksetzer, ohne Gegenwind im Bereich", ch.map(function (t) { return nmShort(t.name) + " (Score " + scoreTotal(t) + ")"; }).join(", ") + ".", "", "Score ab " + TH + ", Begründung intakt, 20 bis 45 % unter dem Jahreshoch, und aus dem Bereich fließt gerade kein Geld ab. Ein Prüfauftrag, keine Kaufempfehlung.");
    var cap = [3, 3, 2, 1], cn = [0, 0, 0, 0];
    W.sort(function (a, b) { return a.k - b.k; });
    return W.filter(function (x) { return cn[x.k]++ < cap[x.k]; });
  }
  function lgStatus() {
    var st = null; try { var el = document.getElementById("radar-status"); st = el ? JSON.parse(el.textContent) : null; } catch (e) { st = null; }
    if (!st || !st.state) return "";
    return ' · <span class="lg-dot lg-' + esc(st.state) + '"></span>' + ({ gruen: "Lauf sauber", gelb: "Lauf mit Hinweisen", rot: "Lauf mit Fehlern" }[st.state] || "Lauf");
  }
  function renderLage() {
    var el = document.getElementById("tab-lage"); if (!el) return;
    var amp = lgAmpel(), ex = lgExpo(), fl = lgFlows(), W = lgWarn(amp, ex), lr = lastRun();
    var LV = { rot: ["Vorsicht", "Mehrere Warnzeichen gleichzeitig. Große Kursbewegungen sind jetzt wahrscheinlicher als sonst."],
      gelb: ["Beobachten", "Einzelne Warnzeichen. Der Markt ist anfälliger als sonst."],
      gruen: ["In Ordnung", "Keine Warnzeichen. Normale Schwankungen."], grau: ["Keine Daten", "Die Ampel erscheint nach dem nächsten Lauf."] }[amp.lvl];
    var KT = ["Vorsicht", "Beobachten", "Chance", "Info"];
    var h = '<div class="lg-stand">Stand: Kurse vom ' + (LAGE ? date(LAGE.asof) : "–") + ", geprüft " + (lr ? date(lr.date).slice(0, 6) + (lr.time ? " " + esc(lr.time) + " Uhr" : "") : "–") + lgStatus() + '</div><div class="lg-leg"><span><i class="lg-dot lg-rot"></i>Vorsicht</span><span><i class="lg-dot lg-gelb"></i>Beobachten</span><span><i class="lg-dot lg-gruen"></i>In Ordnung / Chance</span><span><i class="lg-dot"></i>Info</span></div>';
    var cnt = (amp.red ? amp.red + " von " + amp.s.length + " Fragen rot" : "") + (amp.red && amp.yel ? ", " : "") + (amp.yel ? amp.yel + " gelb" : "");
    h += '<section class="lg-amp lg-a-' + amp.lvl + '"><div class="lg-ah"><span class="lg-big">' + LV[0] + '</span><span class="lg-al">Markt insgesamt</span></div><p>' + LV[1] + (cnt ? " <span class='lg-cnt'>(" + cnt + ")</span>" : "") + "</p>" +
      '<ul class="lg-sig">' + amp.s.map(function (x) { return '<li><span class="lg-dot lg-' + LG_C[x.l] + '"></span><div><span class="lg-q">' + esc(x.q) + "</span> <b>" + esc(x.a) + "</b><small>" + esc(x.d) + "</small></div></li>"; }).join("") + "</ul>" +
      '<details class="lg-why"><summary>Nach welchen Regeln die Farben vergeben werden</summary><ul class="lg-rules">' + amp.s.map(function (x) { return "<li><b>" + esc(x.q) + "</b> " + esc(x.r) + "</li>"; }).join("") + "<li><b>Gesamtfarbe:</b> Rot, wenn zwei oder mehr Fragen rot sind. Gelb bei einer roten oder zwei gelben. Sonst Grün.</li></ul></details></section>";
    h += '<h2 class="lg-h">Was jetzt wichtig ist</h2>' + (W.length ? '<div class="lg-ws">' + W.map(function (x) {
      return '<div class="lg-w lg-k' + x.k + '"><span class="lg-tag">' + KT[x.k] + "</span><b>" + esc(x.t) + "</b><div class='lg-x'>" + (x.html ? x.x : esc(x.x)) + "</div>" + (x.b ? "<small>" + esc(x.b) + "</small>" : "") + (x.why ? '<details class="lg-why"><summary>Warum?</summary><p>' + esc(x.why) + "</p></details>" : "") + "</div>";
    }).join("") + "</div>" : '<div class="empty"><b>Nichts Dringendes</b>Keine Warnung und kein wichtiger Termin in den nächsten 7 Tagen.</div>');
    function frow(x) { var w0 = Math.min(100, Math.abs(x.rs1) / 25 * 100); return '<div class="lg-fr"><span>' + esc(x.n) + (LG_DESC[x.n] ? "<i>" + esc(LG_DESC[x.n]) + "</i>" : "") + '</span><span class="lg-fb"><u class="' + (x.rs1 >= 0 ? "up" : "dn") + '" style="width:' + w0.toFixed(0) + '%"></u></span><b class="' + (x.rs1 >= 0 ? "up" : "dn") + '">' + sg1(x.m1) + "</b></div>"; }
    if (fl.all.length) h += '<h2 class="lg-h">Wohin das Geld fließt <span class="hint">letzter Monat</span></h2><div class="lg-flow"><p class="lg-ref">Gesamtmarkt (S&amp;P 500): <b>' + sg1(fl.spy && fl.spy.m1) + '</b>. <span class="up">Grün</span> = besser als der Gesamtmarkt, dort fließt Geld hin. <span class="dn">Rot</span> = schlechter, dort wird verkauft.</p><div class="lg-f2"><div><h4>Hier fließt Geld hin</h4>' + fl.inn.map(frow).join("") + "</div><div><h4>Hier wird verkauft</h4>" + fl.out.map(frow).join("") + "</div></div>" +
      '<details class="lg-why"><summary>Alle Bereiche</summary><div class="lg-flow1">' + fl.all.map(frow).join("") + '</div><p>Gemessen an Fonds, die jeweils einen ganzen Bereich abbilden (Yahoo-Kurse vom ' + (LAGE ? date(LAGE.asof) : "–") + "). Echte Fondsflüsse sind kostenpflichtig, das hier ist eine Annäherung.</p></details></div>";
    var ks = Object.keys(ex.m).sort(function (a, b) { return ex.m[b] - ex.m[a]; }).slice(0, 5), lim = ex.src === "dep" ? limOf("maxtheme") : 40, mx = Math.max.apply(null, ks.map(function (k) { return ex.m[k]; }).concat([lim]));
    if (ks.length) h += '<h2 class="lg-h">' + (ex.src === "dep" ? "Wie dein Geld verteilt ist" : "Wie die starken Aktien verteilt sind") + "</h2>" + '<div class="lg-ex"><p class="lg-ref">Der Strich zeigt die Obergrenze je Thema (' + lim + " %). Rot = darüber.</p>" + ks.map(function (k) {
      var v = ex.m[k], over = v > lim && k !== THEMES[6] && k !== THEMES[7], fs = (LG_TH[k] || []).map(lgRow).filter(Boolean)[0];
      return '<div class="lg-er' + (over ? " over" : "") + '"><span>' + esc(k) + (fs && fs.m1 != null ? "<i class='" + (fs.rs1 >= 0 ? "up" : "dn") + "'>Bereich im letzten Monat " + sg1(fs.m1) + "</i>" : "") + '</span><span class="lg-fb"><u style="width:' + (v / mx * 100).toFixed(0) + '%"></u><em style="left:' + (lim / mx * 100).toFixed(0) + '%"></em></span><b>' + (ex.src === "dep" ? nf0.format(v) + " %" : (ex.cnt[k] || 0) + " von " + ex.n) + "</b></div>";
    }).join("") + (ex.src === "dep" ? ((ex.m[THEMES[6]] || 0) > 20 ? '<p class="cap">Breite ETFs wie der Nasdaq 100 enthalten zusätzlich viele Technologie- und KI-Werte. Dein echter KI-Anteil ist deshalb höher als der Balken.</p>' : "") : '<p class="cap">Dein eigenes Depot sieht nur die lokale Fassung (dashboard.html).</p>') + "</div>";
    var tl = topList().slice(0, 5);
    if (tl.length) h += '<h2 class="lg-h">Die stärksten Aktien im Radar <span class="hint">antippen für Details</span></h2><div class="lg-top">' + tl.map(function (t) {
      var l = t.last || {}, dd = num(l.price) && num(l.high_52w) ? (1 - l.price / l.high_52w) * 100 : null, vr = verdict(t);
      return '<div class="dtile lg-t" data-open="' + esc(t.id) + '" tabindex="0" role="button"><span class="miniscore ' + scoreClass(scoreTotal(t)) + '" title="Score von 100">' + scoreTotal(t) + '</span><span class="lg-tn"><b>' + esc(nmShort(t.name)) + "</b><small>" + (dd != null ? nf0.format(dd) + " % unter dem Jahreshoch" : "") + (inDepot(t) ? " · im Depot" : "") + '</small></span><span class="vbadge vv-' + vslug(vr.v) + ' lg-vb">' + esc(vr.v) + "</span></div>";
    }).join("") + '</div><button type="button" class="btn lg-more" data-golage="heute">Alle Aktien ansehen</button>';
    h += '<p class="cap" style="margin-top:18px">Ampel und Geldfluss rechnet jeder Lauf vollständig neu aus Tageskursen (Yahoo Finance). Die Hinweise sind Prüfaufträge, keine Anlageberatung.</p>';
    el.innerHTML = h;
  }
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-golage]"); if (b) { show(b.getAttribute("data-golage"), true); } });
  function decisionsHtml() {
    var E = [];
    theses.forEach(function (t) {
      (Array.isArray(t.log) ? t.log : []).forEach(function (l) {
        var tx = String(l.text || "");
        if (l.type === "neu") E.push({ d: l.date || t.opened, k: "neu", t: t, x: tx.replace(/\s*Kurs\/Kennzahlen:.*$/, "") });
        else if (l.type === "verletzt") E.push({ d: l.date, k: "raus", t: t, x: tx });
        else if (/Schwelle wieder erreicht/.test(tx)) E.push({ d: l.date, k: "rein", t: t, x: tx });
        else if (l.type === "geschlossen") E.push({ d: l.date, k: "ende", t: t, x: tx });
      });
      if (status(t) === "geschlossen" && t.closed && !(t.log || []).some(function (l) { return l.type === "geschlossen"; })) E.push({ d: t.closed, k: "ende", t: t, x: "These beendet." });
    });
    var rej = {}; checked.forEach(function (c) { if (c.date) rej[c.date] = (rej[c.date] || 0) + 1; });
    Object.keys(rej).forEach(function (d) { E.push({ d: d, k: "nein", n: rej[d] }); });
    E.sort(function (a, b) { return String(b.d || "").localeCompare(String(a.d || "")) || ("raus,rein,neu,ende,nein".indexOf(a.k) - "raus,rein,neu,ende,nein".indexOf(b.k)); });
    var LB = { neu: "Aufgenommen", raus: "Von der Liste gefallen", rein: "Zurück auf der Liste", ende: "Beendet", nein: "Geprüft, abgelehnt" };
    var rows = E.slice(0, 25).map(function (e) {
      if (e.k === "nein") return '<li class="lg-dk-nein"><span class="lg-dd">' + date(e.d).slice(0, 6) + '</span><span class="lg-dt">' + LB.nein + "</span><span>" + e.n + " Aktien (Liste und Gründe unten im ausführlichen Verlauf)</span></li>";
      return '<li class="lg-dk-' + e.k + '"><span class="lg-dd">' + date(e.d).slice(0, 6) + '</span><span class="lg-dt">' + LB[e.k] + '</span><span><button type="button" class="linkbtn dtile-link" data-open-v="' + esc(e.t.id) + '"><b>' + esc(short(e.t.name, 28)) + "</b></button> " + esc(short(e.x, 150)) + "</span></li>";
    }).join("");
    return '<h2>Entscheidungen <span class="count">' + E.length + '</span> <span class="hint">neueste zuerst</span></h2><p class="cap" style="margin:-4px 0 10px">Warum eine Aktie aufgenommen wurde, unter ' + TH + " fiel, zurückkam oder beendet wurde. Nichts wird gelöscht.</p><ul class=\"lg-dec\">" + rows + "</ul>" + (E.length > 25 ? '<p class="cap">Ältere Einträge im ausführlichen Verlauf.</p>' : "");
  }
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-open-v]"); if (b && !modalOpen) openDetail(b.getAttribute("data-open-v"), b); });

  computeRanks(); renderHeader(); renderLage(); renderToday(); renderDepot(); renderTheses(); renderScore(); renderThemes(); renderHistory();
  var startTab = "lage";
  try { var st = sessionStorage.getItem("radar-tab"); if (st === "score") st = "lage"; if (st && TABNAMES.indexOf(st) >= 0) startTab = st; } catch (e) { /* optional */ }
  show(startTab, false);
  onScroll();
})();

;

(function () {
  var mq = window.matchMedia("(max-width: 760px)");
  var bar = document.getElementById("apptabs"), sheet = document.getElementById("moresheet"), back = document.getElementById("moreback");
  var nav = document.querySelector("nav.tabs");
  if (!bar || !nav) return;
  function navBtn(n) { return nav.querySelector('button[data-tab="' + n + '"]'); }
  function curTab() { var b = nav.querySelector('button[aria-selected="true"]'); return b ? b.getAttribute("data-tab") : "heute"; }
  function go(n) { var b = navBtn(n); if (b) b.click(); closeMore(); if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" }); }
  function closeMore() { sheet.hidden = true; back.hidden = true; }
  function openMore() {
    var d = navBtn("depot"), db = sheet.querySelector('[data-go="depot"]');
    if (db) db.hidden = !d || d.hidden;
    sync(); sheet.hidden = false; back.hidden = false;
  }
  function sync() {
    var c = curTab(), inMore = ["muster", "thesen", "universum", "methodik", "themen"].indexOf(c) >= 0;
    var dbb = bar.querySelector('[data-go="depot"]'), dnb = navBtn("depot"); if (dbb) dbb.hidden = !dnb || dnb.hidden;
    Array.prototype.forEach.call(bar.querySelectorAll("button"), function (b) {
      var on = b.hasAttribute("data-more") ? inMore : b.getAttribute("data-go") === c;
      b.setAttribute("aria-current", on ? "true" : "false");
    });
    Array.prototype.forEach.call(sheet.querySelectorAll("[data-go]"), function (b) { b.setAttribute("aria-current", String(b.getAttribute("data-go") === c)); });
  }
  bar.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-more")) { sheet.hidden ? openMore() : closeMore(); return; }
    if (b.hasAttribute("data-theme")) { var tb = document.getElementById("themeBtn"); if (tb) tb.click(); return; }
    go(b.getAttribute("data-go"));
  });
  sheet.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-theme")) { var t = document.getElementById("themeBtn"); if (t) t.click(); closeMore(); return; }
    go(b.getAttribute("data-go"));
  });
  back.addEventListener("click", closeMore);
  new MutationObserver(sync).observe(nav, { attributes: true, subtree: true, attributeFilter: ["aria-selected", "hidden"] });
  sync();
  // Wischen zwischen den Bereichen
  function hScroll(el) {
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.scrollWidth > el.clientWidth + 2) {
        var ox = getComputedStyle(el).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      el = el.parentNode;
    }
    return false;
  }
  var sx = 0, sy = 0, st = 0, ok = false;
  document.addEventListener("touchstart", function (ev) {
    ok = false;
    if (!mq.matches || ev.touches.length !== 1 || document.querySelector(".ov") || !sheet.hidden) return;
    var q = ev.touches[0];
    if (q.clientX < 28 || q.clientX > window.innerWidth - 12) return;
    var tg = ev.target; if (tg.closest && tg.closest("input, textarea, select, .tvhost, iframe, .apptabs")) return;
    if (hScroll(tg)) return;
    sx = q.clientX; sy = q.clientY; st = Date.now(); ok = true;
  }, { passive: true });
  document.addEventListener("touchend", function (ev) {
    if (!ok) return; ok = false;
    var q = ev.changedTouches[0], dx = q.clientX - sx, dy = q.clientY - sy;
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.5 || Date.now() - st > 800) return;
    var names = Array.prototype.slice.call(nav.querySelectorAll("button[data-tab]")).filter(function (b) { return !b.hidden; }).map(function (b) { return b.getAttribute("data-tab"); });
    var i = names.indexOf(curTab()); if (i < 0) return;
    var j = dx < 0 ? i + 1 : i - 1;
    if (j >= 0 && j < names.length) go(names[j]);
  }, { passive: true });
})();

;

(function () {
  var box = document.getElementById("gsearch"), q = document.getElementById("gsq"), res = document.getElementById("gsres");
  if (!box || !q || !res) return;
  function norm(x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss"); }
  var cache = null;
  function items() { if (!cache && window.radarSearchApi) cache = window.radarSearchApi.items().map(function (x) { x.n = norm(x.name); x.k = norm(x.ticker); x.e = norm(x.extra); return x; }); return cache || []; }
  var shown = [], sel = -1;
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render() {
    var v = norm(q.value).trim();
    if (!v) { res.hidden = true; shown = []; return; }
    var hits = items().map(function (x) {
      var r = x.k === v ? 0 : x.k.indexOf(v) === 0 ? 1 : x.n.indexOf(v) === 0 ? 2 : x.n.split(/[\s.,-]+/).some(function (w) { return w.indexOf(v) === 0; }) ? 3 : x.n.indexOf(v) >= 0 ? 4 : x.k.indexOf(v) >= 0 ? 5 : x.e.indexOf(v) >= 0 ? 6 : 99;
      return { x: x, r: r };
    }).filter(function (h) { return h.r < 99; }).sort(function (a, b) { return a.r - b.r || (b.x.score || 0) - (a.x.score || 0); }).slice(0, 8);
    shown = hits.map(function (h) { return h.x; });
    if (window.radarUniverseApi) {
      var uh = [];
      window.radarUniverseApi.rows().forEach(function (r) {
        if (r._t) return;
        var n = norm(r.n), k = norm(r.s.split(".")[0]), rk = k === v ? 0 : k.indexOf(v) === 0 ? 1 : n.indexOf(v) === 0 ? 2 : n.split(/[\s.,-]+/).some(function (w) { return w.indexOf(v) === 0; }) ? 3 : n.indexOf(v) >= 0 ? 4 : k.indexOf(v) >= 0 ? 5 : 99;
        if (rk < 99) uh.push({ r: r, rk: rk });
      });
      uh.sort(function (a, b) { return a.rk - b.rk || (b.r.m || 0) - (a.r.m || 0); });
      uh.slice(0, Math.max(4, 8 - shown.length)).forEach(function (h) { shown.push({ uv: h.r.s, name: h.r.n, ticker: h.r.s.split(".")[0] }); });
    }
    sel = shown.length ? 0 : -1;
    res.innerHTML = shown.length ? shown.map(function (x, i) {
      var sc = x.uv ? "Universum" : (x.score != null ? x.score : "–");
      return '<button type="button" data-i="' + i + '" class="' + (i === 0 ? "on" : "") + '"><span class="gn">' + esc(x.name) + '</span><span class="gt">' + esc(x.ticker) + '</span><span class="gsc' + (!x.uv && x.score != null && x.score >= 80 ? "" : " low") + '"' + (x.uv ? ' style="font-size:11px;min-width:0;padding:0 8px"' : "") + '>' + sc + "</span></button>";
    }).join("") : '<div class="gs-none">Keine Aktie gefunden.</div>';
    res.hidden = false;
  }
  function pick(i) {
    var x = shown[i]; if (!x) return;
    var row = res.querySelector('button[data-i="' + i + '"]') || res;
    var rect = row.getBoundingClientRect();
    q.blur();
    if (x.uv) { window.radarUniverseApi.open(x.uv); res.hidden = true; q.value = ""; return; }
    window.radarSearchApi.open(x.id, row);
    res.hidden = true; q.value = "";
  }
  function mark() { Array.prototype.forEach.call(res.querySelectorAll("button"), function (b, i) { b.classList.toggle("on", i === sel); }); var b = res.querySelectorAll("button")[sel]; if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest" }); }
  q.addEventListener("input", render);
  q.addEventListener("focus", function () { if (q.value) render(); });
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown" && shown.length) { ev.preventDefault(); sel = (sel + 1) % shown.length; mark(); }
    else if (ev.key === "ArrowUp" && shown.length) { ev.preventDefault(); sel = (sel - 1 + shown.length) % shown.length; mark(); }
    else if (ev.key === "Enter") { ev.preventDefault(); if (sel >= 0) pick(sel); }
    else if (ev.key === "Escape") { q.value = ""; res.hidden = true; q.blur(); }
  });
  res.addEventListener("click", function (ev) { var b = ev.target.closest("button[data-i]"); if (b) pick(parseInt(b.getAttribute("data-i"), 10)); });
  res.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
  document.addEventListener("click", function (ev) { if (!box.contains(ev.target)) res.hidden = true; });
})();

;

(function(){
  /* Sicherung: Detailfenster nie seitlich verschoben lassen (Fokus/Tab-Wechsel/Touch) */
  function fix(e){
    var t=e.target;
    if(t && t.classList && (t.classList.contains("dscroll")||t.classList.contains("face")||t.classList.contains("dpanel")||t.classList.contains("spin"))){
      if(t.scrollLeft!==0) t.scrollLeft=0;
    }
  }
  document.addEventListener("scroll",fix,true);
  document.addEventListener("click",function(e){
    if(!e.target.closest) return;
    if(e.target.closest(".dscroll")){
      requestAnimationFrame(function(){
        document.querySelectorAll(".dscroll,.face,.dpanel,.spin").forEach(function(n){ if(n.scrollLeft) n.scrollLeft=0; });
      });
    }
  },true);
})();
