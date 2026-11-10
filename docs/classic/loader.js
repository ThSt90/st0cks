(function () {
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
