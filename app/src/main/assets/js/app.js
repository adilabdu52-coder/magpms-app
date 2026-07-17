/* MAGPMS shared UI helpers: theme, icons, toasts, modals, settings panel, role guard. */
(function () {
  "use strict";

  /* ---- inline SVG icon set ---- */
  var ICONS = {
    map: '<path d="M9 20l-6 2V6l6-2m0 16l6-2m-6 2V4m6 14l6 2V6l-6-2m0 16V4M9 4l6 2"/>',
    pin: '<path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    data: '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5V12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5"/><path d="M4 12v6.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
    layers: '<path d="M12 2l10 5.5L12 13 2 7.5 12 2z"/><path d="M2 12.5L12 18l10-5.5"/><path d="M2 17.5L12 23l10-5.5"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    shield: '<path d="M12 2l8 3.5V11c0 5-3.4 8.8-8 11-4.6-2.2-8-6-8-11V5.5L12 2z"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    offline: '<path d="M1 1l22 22M9 9a10 10 0 0 0-4.1 2.6M5.6 5.6A15 15 0 0 0 1.4 8.9M22.6 8.9A15 15 0 0 0 12 5c-.7 0-1.4 0-2 .1M16.5 12.8a10 10 0 0 0-3-1.6M8.5 16.4a5 5 0 0 1 5.4-1"/><circle cx="12" cy="20" r="1"/>',
    warning: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
  };

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---- theme ---- */
  function applyTheme() {
    var theme = window.Store ? Store.getSettings().theme : "auto";
    document.documentElement.setAttribute("data-theme", theme);
  }

  /* ---- toast ---- */
  function toast(msg, kind) {
    var host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    var t = document.createElement("div");
    t.className = "toast" + (kind === "danger" ? " danger" : "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity 0.3s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 320);
    }, 2200);
  }

  /* ---- modal ---- */
  function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("open");
  }
  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }
  // Close on backdrop click / [data-close] buttons — delegated once
  document.addEventListener("click", function (e) {
    var closer = e.target.closest("[data-close]");
    if (closer) {
      var bd = closer.closest(".modal-backdrop");
      if (bd) bd.classList.remove("open");
      return;
    }
    if (e.target.classList && e.target.classList.contains("modal-backdrop")) {
      e.target.classList.remove("open");
    }
  });

  function confirmDialog(title, message, onYes) {
    var id = "magpms-confirm";
    var bd = document.getElementById(id);
    if (!bd) {
      bd = document.createElement("div");
      bd.id = id;
      bd.className = "modal-backdrop";
      bd.innerHTML =
        '<div class="modal">' +
        '<div class="modal-head"><h3 id="cf-title"></h3>' +
        '<button class="icon-btn" data-close aria-label="Close">' + icon("close") + "</button></div>" +
        '<p id="cf-msg" class="muted"></p>' +
        '<div class="modal-actions">' +
        '<button class="btn" data-close>Cancel</button>' +
        '<button class="btn danger" id="cf-yes">Confirm</button>' +
        "</div></div>";
      document.body.appendChild(bd);
    }
    bd.querySelector("#cf-title").textContent = title;
    bd.querySelector("#cf-msg").textContent = message;
    var yes = bd.querySelector("#cf-yes");
    var fresh = yes.cloneNode(true); // drop stale listeners
    yes.parentNode.replaceChild(fresh, yes);
    fresh.addEventListener("click", function () {
      bd.classList.remove("open");
      onYes();
    });
    bd.classList.add("open");
  }

  /* ---- view switching (tab sections within a page) ---- */
  function switchView(name) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.getAttribute("data-view") === name);
    });
    document.querySelectorAll(".nav-item[data-nav]").forEach(function (n) {
      n.classList.toggle("active", n.getAttribute("data-nav") === name);
    });
    var main = document.querySelector(".app-main");
    if (main) main.classList.toggle("is-map", name === "map");
    document.dispatchEvent(new CustomEvent("viewchange", { detail: { view: name } }));
  }
  document.addEventListener("click", function (e) {
    var nav = e.target.closest(".nav-item[data-nav]");
    if (nav) switchView(nav.getAttribute("data-nav"));
  });

  /* ---- segmented controls bound to a setting ---- */
  function bindSegmented(el, current, onPick) {
    el.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-value") === current);
      b.addEventListener("click", function () {
        el.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        onPick(b.getAttribute("data-value"));
      });
    });
  }

  /* ---- settings panel (shared; admin gets extra rows via data-admin-only) ---- */
  function initSettingsPanel(opts) {
    opts = opts || {};
    var s = Store.getSettings();

    var themeSeg = document.getElementById("seg-theme");
    if (themeSeg) bindSegmented(themeSeg, s.theme, function (v) {
      Store.saveSettings({ theme: v });
      applyTheme();
    });

    var layerSeg = document.getElementById("seg-layer");
    if (layerSeg) bindSegmented(layerSeg, s.layer, function (v) {
      Store.saveSettings({ layer: v });
      if (window.MagMap && MagMap.setBaseLayer) MagMap.setBaseLayer(v);
    });

    var unitsSeg = document.getElementById("seg-units");
    if (unitsSeg) bindSegmented(unitsSeg, s.units, function (v) {
      Store.saveSettings({ units: v });
    });

    var pinBtn = document.getElementById("btn-change-pin");
    if (pinBtn) pinBtn.addEventListener("click", function () {
      openModal("modal-pin");
    });
    var pinSave = document.getElementById("btn-save-pin");
    if (pinSave) pinSave.addEventListener("click", function () {
      var cur = document.getElementById("pin-current").value;
      var next = document.getElementById("pin-new").value;
      if (cur !== Store.getSettings().pin) { toast("Current PIN is wrong", "danger"); return; }
      if (!/^\d{4,8}$/.test(next)) { toast("New PIN must be 4–8 digits", "danger"); return; }
      Store.saveSettings({ pin: next });
      closeModal("modal-pin");
      document.getElementById("pin-current").value = "";
      document.getElementById("pin-new").value = "";
      toast("Admin PIN updated");
    });

    var logout = document.getElementById("btn-logout");
    if (logout) logout.addEventListener("click", function () {
      Store.clearRole();
      location.href = "index.html";
    });
  }

  /* ---- role guard ---- */
  function requireRole(role) {
    var active = Store.getActiveRole();
    if (role === "admin" && active !== "admin") {
      location.replace("index.html");
      return false;
    }
    if (!active) {
      location.replace("index.html");
      return false;
    }
    return true;
  }

  /* ---- misc ---- */
  function fmtCoord(n) { return Number(n).toFixed(5); }
  function fmtDistance(meters) {
    var units = Store.getSettings().units;
    if (units === "imperial") {
      var mi = meters / 1609.344;
      return mi >= 0.1 ? mi.toFixed(1) + " mi" : Math.round(meters * 3.28084) + " ft";
    }
    return meters >= 1000 ? (meters / 1000).toFixed(1) + " km" : Math.round(meters) + " m";
  }
  function downloadText(filename, text) {
    // Inside the Android shell, save through the native "create document" dialog
    if (window.AndroidBridge && AndroidBridge.saveFile) {
      AndroidBridge.saveFile(filename, text);
      return;
    }
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // Render all [data-icon] placeholders
  function renderIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = icon(el.getAttribute("data-icon")) + el.innerHTML.replace(/<svg[\s\S]*?<\/svg>/, "");
    });
  }

  window.App = {
    icon: icon,
    escapeHtml: escapeHtml,
    applyTheme: applyTheme,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    switchView: switchView,
    bindSegmented: bindSegmented,
    initSettingsPanel: initSettingsPanel,
    requireRole: requireRole,
    fmtCoord: fmtCoord,
    fmtDistance: fmtDistance,
    downloadText: downloadText,
    renderIcons: renderIcons
  };

  applyTheme();

  /* ---- Android shell integration: only allow pull-to-refresh when it can't
     conflict with map panning or list scrolling ---- */
  (function () {
    if (!window.AndroidBridge || !AndroidBridge.setPullToRefresh) return;
    function update() {
      var main = document.querySelector(".app-main");
      var isMap = !!(main && main.classList.contains("is-map"));
      var scrolled = !!(main && main.scrollTop > 4);
      AndroidBridge.setPullToRefresh(!isMap && !scrolled);
    }
    document.addEventListener("viewchange", update);
    document.addEventListener("DOMContentLoaded", function () {
      var main = document.querySelector(".app-main");
      if (main) main.addEventListener("scroll", update, { passive: true });
      update();
    });
    update();
  })();
})();
