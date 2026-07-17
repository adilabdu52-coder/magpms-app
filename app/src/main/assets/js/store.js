/* MAGPMS data layer — everything persisted in localStorage. */
(function () {
  "use strict";

  var KEY = "magpms.v1";

  var DEFAULTS = {
    settings: {
      theme: "auto",          // auto | light | dark
      layer: "street",        // street | satellite
      units: "metric",        // metric | imperial
      pin: "1234"             // admin PIN (device-local gate, not real auth)
    },
    categories: [
      { id: "site",    name: "Site",     color: "#2563eb" },
      { id: "office",  name: "Office",   color: "#16a34a" },
      { id: "warning", name: "Attention", color: "#f59e0b" },
      { id: "other",   name: "Other",    color: "#8b5cf6" }
    ],
    markers: [],
    seeded: false
  };

  var SAMPLE_MARKERS = [
    { name: "Head Office",  category: "office",  lat: 9.0108,  lng: 38.7613, notes: "Main administration building." },
    { name: "Site A",       category: "site",    lat: 9.0301,  lng: 38.7402, notes: "Primary field site." },
    { name: "Site B",       category: "site",    lat: 8.9936,  lng: 38.7867, notes: "" },
    { name: "Depot",        category: "other",   lat: 9.0452,  lng: 38.7994, notes: "Storage and dispatch." },
    { name: "Inspection due", category: "warning", lat: 9.0203, lng: 38.8021, notes: "Needs review this week." }
  ];

  function uid() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
    var data;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    if (!data || typeof data !== "object") data = JSON.parse(JSON.stringify(DEFAULTS));
    // Merge defaults for forward compatibility
    data.settings = Object.assign({}, DEFAULTS.settings, data.settings || {});
    if (!Array.isArray(data.categories) || !data.categories.length) {
      data.categories = JSON.parse(JSON.stringify(DEFAULTS.categories));
    }
    if (!Array.isArray(data.markers)) data.markers = [];
    if (!data.seeded) {
      data.markers = SAMPLE_MARKERS.map(function (m) {
        return Object.assign({ id: uid(), createdAt: Date.now() }, m);
      });
      data.seeded = true;
      persist(data);
    }
    return data;
  }

  function persist(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  var state = load();

  var Store = {
    /* ---- settings ---- */
    getSettings: function () { return Object.assign({}, state.settings); },
    saveSettings: function (patch) {
      state.settings = Object.assign({}, state.settings, patch || {});
      persist(state);
      return Store.getSettings();
    },

    /* ---- role/session (kept separate so clearAll doesn't log out) ---- */
    getRole: function () {
      try { return sessionStorage.getItem("magpms.role") || localStorage.getItem("magpms.lastRole"); }
      catch (e) { return null; }
    },
    getActiveRole: function () {
      try { return sessionStorage.getItem("magpms.role"); } catch (e) { return null; }
    },
    setRole: function (role) {
      try {
        sessionStorage.setItem("magpms.role", role);
        localStorage.setItem("magpms.lastRole", role);
      } catch (e) { /* ignore */ }
    },
    clearRole: function () {
      try { sessionStorage.removeItem("magpms.role"); } catch (e) { /* ignore */ }
    },

    /* ---- categories ---- */
    getCategories: function () { return state.categories.slice(); },
    getCategory: function (id) {
      for (var i = 0; i < state.categories.length; i++) {
        if (state.categories[i].id === id) return state.categories[i];
      }
      return { id: "other", name: "Other", color: "#8b5cf6" };
    },
    addCategory: function (name, color) {
      var cat = { id: uid(), name: String(name).trim(), color: color || "#2563eb" };
      state.categories.push(cat);
      persist(state);
      return cat;
    },
    deleteCategory: function (id) {
      state.categories = state.categories.filter(function (c) { return c.id !== id; });
      // Reassign orphaned markers to "other"
      state.markers.forEach(function (m) { if (m.category === id) m.category = "other"; });
      persist(state);
    },

    /* ---- markers ---- */
    getMarkers: function () { return state.markers.slice(); },
    getMarker: function (id) {
      for (var i = 0; i < state.markers.length; i++) {
        if (state.markers[i].id === id) return state.markers[i];
      }
      return null;
    },
    addMarker: function (m) {
      var marker = {
        id: uid(),
        name: String(m.name || "Untitled").trim(),
        category: m.category || "other",
        lat: Number(m.lat),
        lng: Number(m.lng),
        notes: String(m.notes || ""),
        createdAt: Date.now()
      };
      state.markers.push(marker);
      persist(state);
      return marker;
    },
    updateMarker: function (id, patch) {
      var m = Store.getMarker(id);
      if (!m) return null;
      if (patch.name !== undefined) m.name = String(patch.name).trim();
      if (patch.category !== undefined) m.category = patch.category;
      if (patch.lat !== undefined) m.lat = Number(patch.lat);
      if (patch.lng !== undefined) m.lng = Number(patch.lng);
      if (patch.notes !== undefined) m.notes = String(patch.notes);
      persist(state);
      return m;
    },
    deleteMarker: function (id) {
      state.markers = state.markers.filter(function (m) { return m.id !== id; });
      persist(state);
    },

    /* ---- bulk data controls ---- */
    exportJSON: function () {
      return JSON.stringify({
        app: "MAGPMS",
        version: 1,
        exportedAt: new Date().toISOString(),
        categories: state.categories,
        markers: state.markers
      }, null, 2);
    },
    importJSON: function (text) {
      var data = JSON.parse(text); // throws on bad JSON — caller handles
      if (!data || !Array.isArray(data.markers)) {
        throw new Error("Not a MAGPMS export: missing markers array");
      }
      var added = 0;
      if (Array.isArray(data.categories)) {
        data.categories.forEach(function (c) {
          if (!c || !c.id || !c.name) return;
          var exists = state.categories.some(function (x) { return x.id === c.id; });
          if (!exists) state.categories.push({ id: c.id, name: String(c.name), color: c.color || "#2563eb" });
        });
      }
      data.markers.forEach(function (m) {
        if (!m || typeof m.lat !== "number" || typeof m.lng !== "number") return;
        var exists = m.id && state.markers.some(function (x) { return x.id === m.id; });
        if (exists) return;
        state.markers.push({
          id: m.id || uid(),
          name: String(m.name || "Untitled"),
          category: m.category || "other",
          lat: m.lat,
          lng: m.lng,
          notes: String(m.notes || ""),
          createdAt: m.createdAt || Date.now()
        });
        added++;
      });
      persist(state);
      return added;
    },
    clearAll: function () {
      state = JSON.parse(JSON.stringify(DEFAULTS));
      state.seeded = true; // don't re-seed samples after an explicit wipe
      persist(state);
    }
  };

  window.Store = Store;
})();
