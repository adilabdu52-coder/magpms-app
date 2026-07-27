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

  /* ---------- modal dialogs (replace alert/confirm/prompt) ----------
     openDialog({title, text, fields:[...], okText, danger, countdown, validate})
       fields   — [{key,label,type,value,placeholder,hint,step,options}]
                  type: text | password | number | select
       validate — fn(values) -> error string keeps the dialog open
       countdown— seconds the OK button stays disabled (destructive actions)
     Resolves with {key:value} when fields are used, true for a plain
     confirm, or null when cancelled. ---------------------------------- */
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
      '<div id="umFields" style="margin-top:12px"></div>' +
      '<div class="msg" id="umMsg"></div>' +
      '<div class="m-actions">' +
      '<button class="btn btn-ghost" id="umCancel">Cancel</button>' +
      '<button class="btn" id="umOk">OK</button>' +
      "</div></div>";
    document.body.appendChild(bd);
    bd.addEventListener("click", function (e) { if (e.target === bd) closeDialog(null); });
    return bd;
  }
  var pendingResolve = null, countdownTimer = null;

  function closeDialog(value) {
    var bd = document.getElementById("uiModal");
    if (bd) bd.classList.remove("open");
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (pendingResolve) { pendingResolve(value); pendingResolve = null; }
    syncBridge();
  }

  function buildFields(host, fields) {
    host.innerHTML = "";
    fields.forEach(function (f) {
      var wrap = document.createElement("div");
      wrap.className = "field";
      var lab = document.createElement("label");
      lab.textContent = f.label || f.key;
      wrap.appendChild(lab);
      var input;
      if (f.type === "select") {
        input = document.createElement("select");
        (f.options || []).forEach(function (o) {
          var op = document.createElement("option");
          op.value = o.value;
          op.textContent = o.label;
          if (String(o.value) === String(f.value)) op.selected = true;
          input.appendChild(op);
        });
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        if (f.type === "number") { input.step = f.step || "0.01"; input.inputMode = "decimal"; }
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.autocomplete) input.autocomplete = f.autocomplete;
        if (f.value !== undefined && f.value !== null) input.value = f.value;
      }
      input.setAttribute("data-key", f.key);
      wrap.appendChild(input);
      if (f.hint) {
        var h = document.createElement("div");
        h.className = "field-hint";
        h.style.textAlign = "left";
        h.textContent = f.hint;
        wrap.appendChild(h);
      }
      host.appendChild(wrap);
    });
  }

  function readFields(host) {
    var out = {};
    host.querySelectorAll("[data-key]").forEach(function (el) {
      out[el.getAttribute("data-key")] = el.value;
    });
    return out;
  }

  function openDialog(opts) {
    var bd = ensureModal();
    bd.querySelector("#umTitle").textContent = opts.title || "";
    var textEl = bd.querySelector("#umText");
    textEl.textContent = opts.text || "";
    textEl.style.display = opts.text ? "" : "none";

    var fields = opts.fields || [];
    var host = bd.querySelector("#umFields");
    buildFields(host, fields);

    var errEl = bd.querySelector("#umMsg");
    errEl.className = "msg";
    errEl.textContent = "";

    var ok = bd.querySelector("#umOk");
    var okFresh = ok.cloneNode(true);
    ok.parentNode.replaceChild(okFresh, ok);
    var okLabel = opts.okText || "OK";
    okFresh.textContent = okLabel;
    okFresh.className = "btn " + (opts.danger ? "btn-no" : "btn-gold");
    okFresh.style.width = "auto";
    okFresh.disabled = false;

    function submit() {
      if (okFresh.disabled) return;
      var vals = fields.length ? readFields(host) : {};
      if (opts.validate) {
        var err = opts.validate(vals);
        if (err) { errEl.textContent = err; errEl.className = "msg error"; return; }
      }
      closeDialog(fields.length ? vals : true);
    }
    okFresh.addEventListener("click", submit);
    host.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); }
    });

    var cancel = bd.querySelector("#umCancel");
    var cancelFresh = cancel.cloneNode(true);
    cancel.parentNode.replaceChild(cancelFresh, cancel);
    cancelFresh.addEventListener("click", function () { closeDialog(null); });

    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (opts.countdown > 0) {
      var left = opts.countdown;
      okFresh.disabled = true;
      okFresh.textContent = okLabel + " (" + left + ")";
      countdownTimer = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(countdownTimer); countdownTimer = null;
          okFresh.disabled = false;
          okFresh.textContent = okLabel;
        } else {
          okFresh.textContent = okLabel + " (" + left + ")";
        }
      }, 1000);
    }

    return new Promise(function (resolve) {
      pendingResolve = resolve;
      bd.classList.add("open");
      syncBridge();
      var first = host.querySelector("[data-key]");
      if (first) setTimeout(function () { first.focus(); }, 80);
    });
  }
  function confirmDlg(title, text, okText, danger) {
    return openDialog({ title: title, text: text, okText: okText || "Confirm", danger: danger !== false });
  }
  function promptNumber(title, text, label) {
    return openDialog({
      title: title, text: text, okText: "Save", danger: false,
      fields: [{ key: "value", label: label, type: "number", step: "0.01" }]
    }).then(function (v) {
      if (!v) return null;
      var n = parseFloat(v.value);
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

  /* ---------- JSON export (Android SAF when available, else download) ---------- */
  function saveJson(filename, obj) {
    var text = JSON.stringify(obj, null, 2);
    if (window.AndroidBridge && AndroidBridge.saveFile) {
      AndroidBridge.saveFile(filename, text);
      return "android";
    }
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return "browser";
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
    toast: toast, confirmDlg: confirmDlg, promptNumber: promptNumber, form: openDialog,
    tankRow: tankRow, lowTankCount: lowTankCount, stampUpdated: stampUpdated,
    netFail: netFail, netOk: netOk, saveJson: saveJson
  };
  window.toggleMenu = toggleMenu;
  window.go = go;
  window.esc = esc;
  window.msg = msg;
})();
