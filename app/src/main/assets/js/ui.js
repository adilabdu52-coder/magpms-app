/* MAGPMS shared UI: theme, navigation, toasts, modals, connection banner.
   Must load AFTER config.js (wraps rpc for connection feedback). */
(function () {
  "use strict";

  /* ---------- theme ---------- */
  var THEMES = ["dark", "light", "auto"];
  var THEME_ICONS = { dark: "🌙", light: "☀️", auto: "🌓" };

  function getTheme() {
    try { return localStorage.getItem("magpms_theme") || "dark"; } catch (e) { return "dark"; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    var b = document.getElementById("themeBtn");
    if (b) { b.textContent = THEME_ICONS[t]; b.title = "Theme: " + t; }
  }
  function cycleTheme() {
    var next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
    try { localStorage.setItem("magpms_theme", next); } catch (e) {}
    applyTheme(next);
    toast("Theme: " + next);
  }

  /* ---------- navigation (drawer + sections + bottom nav) ---------- */
  function isDesktop() { return window.innerWidth >= 900; }

  function toggleMenu() {
    if (isDesktop()) return; // permanent sidebar on desktop
    var m = document.getElementById("sideMenu");
    var o = document.getElementById("menuOverlay");
    if (m) m.classList.toggle("open");
    if (o) o.classList.toggle("show");
    syncBridge();
  }

  function go(sec, el) {
    document.querySelectorAll(".section").forEach(function (s) { s.classList.remove("show"); });
    var target = document.getElementById("sec-" + sec);
    if (target) target.classList.add("show");
    document.querySelectorAll(".mi").forEach(function (m) {
      m.classList.toggle("active", m.getAttribute("data-s") === sec);
    });
    document.querySelectorAll(".bn-item").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-s") === sec);
    });
    if (el && el.classList.contains("mi")) toggleMenu();
    window.scrollTo(0, 0);
  }

  /* ---------- helpers shared with page scripts ---------- */
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
  function msg(id, text, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "msg " + type;
  }
  function tick() {
    var n = new Date();
    var d = document.getElementById("clockDate");
    var t = document.getElementById("clockTime");
    if (d) d.textContent = n.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (t) t.textContent = n.toLocaleTimeString("en-GB");
  }

  /* ---------- toast ---------- */
  function toast(text, kind) {
    var host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      document.body.appendChild(host);
    }
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = text;
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 320);
    }, 2400);
  }

  /* ---------- modal dialogs (replace alert/confirm/prompt) ---------- */
  function ensureModal() {
    var bd = document.getElementById("uiModal");
    if (bd) return bd;
    bd = document.createElement("div");
    bd.id = "uiModal";
    bd.className = "modal-backdrop";
    bd.innerHTML =
      '<div class="modal">' +
      '<h3 id="umTitle"></h3>' +
      '<p id="umText"></p>' +
      '<div class="field hidden" id="umField" style="margin-top:12px">' +
      '<label id="umLabel"></label>' +
      '<input id="umInput" type="number" step="0.01" min="0" inputmode="decimal"/>' +
      "</div>" +
      '<div class="m-actions">' +
      '<button class="btn btn-ghost" id="umCancel">Cancel</button>' +
      '<button class="btn" id="umOk">OK</button>' +
      "</div></div>";
    document.body.appendChild(bd);
    bd.addEventListener("click", function (e) { if (e.target === bd) closeDialog(null); });
    return bd;
  }
  var pendingResolve = null;
  function closeDialog(value) {
    var bd = document.getElementById("uiModal");
    if (bd) bd.classList.remove("open");
    if (pendingResolve) { pendingResolve(value); pendingResolve = null; }
    syncBridge();
  }
  function openDialog(opts) {
    var bd = ensureModal();
    bd.querySelector("#umTitle").textContent = opts.title || "";
    bd.querySelector("#umText").textContent = opts.text || "";
    var field = bd.querySelector("#umField");
    var input = bd.querySelector("#umInput");
    if (opts.input) {
      field.classList.remove("hidden");
      bd.querySelector("#umLabel").textContent = opts.inputLabel || "";
      input.value = "";
      input.type = opts.inputType || "number";
    } else {
      field.classList.add("hidden");
    }
    var ok = bd.querySelector("#umOk");
    ok.textContent = opts.okText || "OK";
    ok.className = "btn " + (opts.danger ? "btn-no" : "btn-gold");
    ok.style.width = "auto";
    var okFresh = ok.cloneNode(true);
    ok.parentNode.replaceChild(okFresh, ok);
    okFresh.addEventListener("click", function () {
      closeDialog(opts.input ? input.value : true);
    });
    var cancel = bd.querySelector("#umCancel");
    var cancelFresh = cancel.cloneNode(true);
    cancel.parentNode.replaceChild(cancelFresh, cancel);
    cancelFresh.addEventListener("click", function () { closeDialog(null); });
    return new Promise(function (resolve) {
      pendingResolve = resolve;
      bd.classList.add("open");
      syncBridge();
      if (opts.input) setTimeout(function () { input.focus(); }, 80);
    });
  }
  function confirmDlg(title, text, okText, danger) {
    return openDialog({ title: title, text: text, okText: okText || "Confirm", danger: danger !== false });
  }
  function promptNumber(title, text, label) {
    return openDialog({ title: title, text: text, input: true, inputLabel: label, okText: "Save", danger: false })
      .then(function (v) {
        if (v === null) return null;
        var n = parseFloat(v);
        return isNaN(n) ? null : n;
      });
  }

  /* ---------- connection banner + rpc wrapper ---------- */
  function ensureBanner() {
    var b = document.getElementById("netBanner");
    if (!b) {
      b = document.createElement("div");
      b.id = "netBanner";
      b.textContent = "⚠ Connection problem — some data did not load. Check internet.";
      document.body.appendChild(b);
    }
    return b;
  }
  function netFail() { ensureBanner().classList.add("show"); }
  function netOk() {
    var b = document.getElementById("netBanner");
    if (b) b.classList.remove("show");
  }
  if (typeof window.rpc === "function") {
    var _rpc = window.rpc;
    window.rpc = function (fn, params) {
      return _rpc(fn, params).then(function (r) { netOk(); return r; },
        function (e) { netFail(); throw e; });
    };
  }

  /* ---------- tank level rendering ---------- */
  function tankRow(t) {
    var pct = Math.max(0, Math.min(100, (t.current_liters / t.capacity_liters) * 100));
    var lvl = pct < 15 ? " lvl-low" : (pct < 30 ? " lvl-warn" : "");
    return '<div class="tank"><span>' + esc(t.tank_name) + " · " + esc(t.fuel_type) + "</span>" +
      '<span class="mono">' + Number(t.current_liters).toLocaleString() + " / " +
      Number(t.capacity_liters).toLocaleString() + ' L</span>' +
      '<span class="bar"><i class="' + lvl.trim() + '" style="width:' + pct + '%"></i></span></div>';
  }
  function lowTankCount(tanks) {
    return tanks.filter(function (t) {
      return (t.current_liters / t.capacity_liters) * 100 < 15;
    }).length;
  }

  /* ---------- "last updated" stamp ---------- */
  function stampUpdated(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = "Updated " + new Date().toLocaleTimeString("en-GB");
  }

  /* ---------- Android shell bridge: pull-to-refresh guard ---------- */
  function syncBridge() {
    if (!window.AndroidBridge || !AndroidBridge.setPullToRefresh) return;
    var drawerOpen = !isDesktop() && document.getElementById("sideMenu") &&
      document.getElementById("sideMenu").classList.contains("open");
    var modalOpen = document.querySelector(".modal-backdrop.open");
    var scrolled = window.scrollY > 4;
    AndroidBridge.setPullToRefresh(!drawerOpen && !modalOpen && !scrolled);
  }
  window.addEventListener("scroll", syncBridge, { passive: true });

  /* ---------- init ---------- */
  applyTheme(getTheme());
  document.addEventListener("DOMContentLoaded", function () {
    var tb = document.getElementById("themeBtn");
    if (tb) { tb.addEventListener("click", cycleTheme); applyTheme(getTheme()); }
    if (document.getElementById("sideMenu")) document.body.classList.add("has-sidebar");
    setInterval(tick, 1000);
    tick();
    syncBridge();
  });

  /* expose globals used by the page scripts */
  window.UI = {
    toast: toast, confirmDlg: confirmDlg, promptNumber: promptNumber,
    tankRow: tankRow, lowTankCount: lowTankCount, stampUpdated: stampUpdated,
    netFail: netFail, netOk: netOk
  };
  window.toggleMenu = toggleMenu;
  window.go = go;
  window.esc = esc;
  window.msg = msg;
})();
