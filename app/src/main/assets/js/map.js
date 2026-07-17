/* MAGPMS map module — Leaflet (loaded from CDN at runtime) + map controls.
   Degrades to a styled offline panel when Leaflet or tiles can't load. */
(function () {
  "use strict";

  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var DEFAULT_CENTER = [9.0192, 38.7525];
  var DEFAULT_ZOOM = 12;

  var map = null;
  var baseLayers = null;
  var markerLayer = null;
  var locateCircle = null;
  var opts = {};

  function loadLeaflet(onReady, onFail) {
    if (window.L) { onReady(); return; }
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);

    var js = document.createElement("script");
    js.src = LEAFLET_JS;
    var timer = setTimeout(function () { onFail(); }, 15000);
    js.onload = function () { clearTimeout(timer); onReady(); };
    js.onerror = function () { clearTimeout(timer); onFail(); };
    document.head.appendChild(js);
  }

  function showFallback(show) {
    var fb = document.getElementById("map-fallback");
    if (fb) fb.classList.toggle("hidden", !show);
    var fabs = document.querySelector(".map-fabs");
    if (fabs) fabs.classList.toggle("hidden", show);
  }

  function makeBaseLayers() {
    var street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    });
    var satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles &copy; Esri" }
    );
    return { street: street, satellite: satellite };
  }

  function markerIcon(color) {
    return L.divIcon({
      className: "",
      iconSize: [26, 36],
      iconAnchor: [13, 34],
      popupAnchor: [0, -30],
      html:
        '<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M13 1C6.4 1 1 6.4 1 13c0 8.6 12 22 12 22s12-13.4 12-22C25 6.4 19.6 1 13 1z" ' +
        'fill="' + color + '" stroke="#fff" stroke-width="1.6"/>' +
        '<circle cx="13" cy="13" r="4.6" fill="#fff"/></svg>'
    });
  }

  function render() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    Store.getMarkers().forEach(function (m) {
      var cat = Store.getCategory(m.category);
      var mk = L.marker([m.lat, m.lng], { icon: markerIcon(cat.color) });
      mk.bindPopup(
        '<strong>' + App.escapeHtml(m.name) + "</strong><br>" +
        '<span style="color:' + cat.color + '">&#9679;</span> ' + App.escapeHtml(cat.name) +
        (m.notes ? "<br>" + App.escapeHtml(m.notes) : "")
      );
      mk.on("click", function () {
        if (opts.onMarkerClick) opts.onMarkerClick(m.id);
      });
      mk.addTo(markerLayer);
    });
  }

  function initControls() {
    L.control.scale({ metric: true, imperial: true, position: "bottomleft" }).addTo(map);
    L.control.layers(
      { "Street": baseLayers.street, "Satellite": baseLayers.satellite },
      null,
      { position: "topleft" }
    ).addTo(map);

    var locateBtn = document.getElementById("fab-locate");
    if (locateBtn) locateBtn.addEventListener("click", locate);

    var fsBtn = document.getElementById("fab-fullscreen");
    if (fsBtn) fsBtn.addEventListener("click", function () {
      var el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    });

    var layerBtn = document.getElementById("fab-layer");
    if (layerBtn) layerBtn.addEventListener("click", function () {
      var next = Store.getSettings().layer === "street" ? "satellite" : "street";
      Store.saveSettings({ layer: next });
      MagMap.setBaseLayer(next);
      App.toast(next === "street" ? "Street map" : "Satellite view");
    });

    var addBtn = document.getElementById("fab-add");
    if (addBtn && opts.onMapClick) {
      addBtn.addEventListener("click", function () {
        App.toast("Tap the map to place a marker");
        map.once("click", function (e) {
          opts.onMapClick(e.latlng.lat, e.latlng.lng);
        });
      });
    }
  }

  function locate() {
    if (!navigator.geolocation) { App.toast("Geolocation not available", "danger"); return; }
    App.toast("Locating…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (locateCircle) locateCircle.remove();
      locateCircle = L.circleMarker(ll, {
        radius: 8, color: "#fff", weight: 2.5, fillColor: "#2563eb", fillOpacity: 1
      }).addTo(map);
      map.setView(ll, Math.max(map.getZoom(), 15));
    }, function () {
      App.toast("Could not get your location", "danger");
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  var MagMap = {
    init: function (options) {
      opts = options || {};
      var retry = document.getElementById("btn-map-retry");
      if (retry) retry.addEventListener("click", function () { MagMap.init(opts); });

      loadLeaflet(function () {
        showFallback(false);
        if (map) { render(); return; }
        map = L.map("map", { zoomControl: true, attributionControl: true })
          .setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        baseLayers = makeBaseLayers();
        baseLayers[Store.getSettings().layer === "satellite" ? "satellite" : "street"].addTo(map);
        markerLayer = L.layerGroup().addTo(map);
        initControls();
        render();
        if (markerLayer.getLayers().length) {
          var group = L.featureGroup(markerLayer.getLayers());
          map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 14 });
        }
        // Map lives in a display-toggled view — recalc size when shown
        document.addEventListener("viewchange", function (e) {
          if (e.detail.view === "map") setTimeout(function () { map.invalidateSize(); }, 60);
        });
      }, function () {
        showFallback(true);
      });
    },
    render: render,
    setBaseLayer: function (name) {
      if (!map || !baseLayers) return;
      map.removeLayer(baseLayers.street);
      map.removeLayer(baseLayers.satellite);
      baseLayers[name === "satellite" ? "satellite" : "street"].addTo(map);
    },
    focus: function (lat, lng, zoom) {
      if (!map) return false;
      map.setView([lat, lng], zoom || 16);
      return true;
    },
    isReady: function () { return !!map; }
  };

  window.MagMap = MagMap;
})();
