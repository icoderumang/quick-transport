// ===== MAP.JS — Real geocoding (Nominatim), OSRM routing, smooth vehicle animation =====

window.qtMap     = null;
let pickupMarker = null;
let dropMarker   = null;
let vehicleMarker= null;
let glowLayer    = null;
let routeLayer   = null;
let animTimer    = null;
let animIndex    = 0;
let animPath     = [];
let isAnimating  = false;
let pickupCoords = null;
let dropCoords   = null;

// ── Icon factory ──────────────────────────────────────────────────
function makeIcon(emoji, size) {
  size = size || 30;
  return L.divIcon({
    html: '<div style="font-size:' + size + 'px;line-height:1;' +
          'filter:drop-shadow(0 3px 6px rgba(0,0,0,0.7))">' + emoji + '</div>',
    className: '',
    iconAnchor: [size / 2, size],
    iconSize:   [size, size],
  });
}

// ── Init map ──────────────────────────────────────────────────────
function initMap() {
  if (window.qtMap) return;
  window.qtMap = L.map('realMap', {
    center: [22.5, 80.0], zoom: 5,
    minZoom: 4, maxZoom: 18,
  });
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19 }
  ).addTo(window.qtMap);
}

// ── Geocode a place name using Nominatim ─────────────────────────
function geocodePlace(name, callback) {
  if (!name) return;
  var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(name) + '&countrycodes=in';
  fetch(url, { headers: { 'Accept-Language': 'en' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.length > 0) {
        callback([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      } else {
        callback(null);
      }
    })
    .catch(function() { callback(null); });
}

// ── Pickup pin ────────────────────────────────────────────────────
function setPickupOnMap(name, lat, lng) {
  if (!window.qtMap) initMap();
  if (lat !== undefined && lng !== undefined) {
    pickupCoords = [lat, lng];
    _placePickupPin(name);
    return;
  }
  geocodePlace(name, function(coords) {
    if (!coords) return;
    pickupCoords = coords;
    _placePickupPin(name);
  });
}

function _placePickupPin(name) {
  if (pickupMarker) window.qtMap.removeLayer(pickupMarker);
  pickupMarker = L.marker(pickupCoords, { icon: makeIcon('📍', 36), zIndexOffset: 500 })
    .addTo(window.qtMap)
    .bindTooltip('<b>Pickup:</b> ' + name, { direction: 'top' });
  if (!dropCoords) window.qtMap.setView(pickupCoords, 13);
  tryDrawRoute();
}

// ── Drop pin ──────────────────────────────────────────────────────
function setDropOnMap(name, lat, lng) {
  if (!window.qtMap) initMap();
  if (lat !== undefined && lng !== undefined) {
    dropCoords = [lat, lng];
    _placeDropPin(name);
    return;
  }
  geocodePlace(name, function(coords) {
    if (!coords) return;
    dropCoords = coords;
    _placeDropPin(name);
  });
}

function _placeDropPin(name) {
  if (dropMarker) window.qtMap.removeLayer(dropMarker);
  dropMarker = L.marker(dropCoords, { icon: makeIcon('🏁', 36), zIndexOffset: 500 })
    .addTo(window.qtMap)
    .bindTooltip('<b>Drop:</b> ' + name, { direction: 'top' });
  if (!pickupCoords) window.qtMap.setView(dropCoords, 13);
  tryDrawRoute();
}

// ── Request route from OSRM ───────────────────────────────────────
function tryDrawRoute() {
  if (!pickupCoords || !dropCoords) return;
  clearRoute();

  var lat1 = pickupCoords[0], lon1 = pickupCoords[1];
  var lat2 = dropCoords[0],   lon2 = dropCoords[1];
  var url = 'https://router.project-osrm.org/route/v1/driving/' +
    lon1 + ',' + lat1 + ';' + lon2 + ',' + lat2 +
    '?overview=full&geometries=geojson';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        startWithPath(curvePath(pickupCoords, dropCoords, 100));
        return;
      }
      var raw = data.routes[0].geometry.coordinates.map(function(c) {
        return [c[1], c[0]];
      });
      var dense = densify(raw, 200);
      startWithPath(dense);

      var km = +(data.routes[0].distance / 1000).toFixed(1);
      if (window.bookingData) window.bookingData.distance = km;
      if (typeof updateMapInfo === 'function') updateMapInfo();
      var el = document.getElementById('rsDist');
      if (el) el.innerHTML = 'Est. distance: <span>' + km + ' km</span>';
      var el2 = document.getElementById('cfDist');
      if (el2) el2.textContent = km + ' km';
    })
    .catch(function() {
      startWithPath(curvePath(pickupCoords, dropCoords, 100));
    });
}

// ── Densify polyline ──────────────────────────────────────────────
function densify(pts, minPts) {
  if (pts.length < 2) return pts;
  var extra = Math.max(0, Math.ceil((minPts - pts.length) / (pts.length - 1)));
  var out = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1];
    out.push(a);
    for (var k = 1; k <= extra; k++) {
      var t = k / (extra + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ── Curved fallback path ──────────────────────────────────────────
function curvePath(from, to, n) {
  var out = [];
  var dx = to[1] - from[1], dy = to[0] - from[0];
  var mx = (from[0] + to[0]) / 2 + dx * 0.12;
  var my = (from[1] + to[1]) / 2 - dy * 0.12;
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    out.push([
      (1-t)*(1-t)*from[0] + 2*(1-t)*t*mx + t*t*to[0],
      (1-t)*(1-t)*from[1] + 2*(1-t)*t*my + t*t*to[1],
    ]);
  }
  return out;
}

// ── Draw route + animate vehicle ──────────────────────────────────
function startWithPath(pts) {
  animPath  = pts;
  animIndex = 0;

  glowLayer = L.polyline(pts, { color: '#000', weight: 10, opacity: 0.10 })
    .addTo(window.qtMap);
  routeLayer = L.polyline(pts, {
    color: '#F7A700', weight: 5, opacity: 0.92,
    lineJoin: 'round', lineCap: 'round',
  }).addTo(window.qtMap);

  window.qtMap.fitBounds(routeLayer.getBounds().pad(0.15));

  if (vehicleMarker) window.qtMap.removeLayer(vehicleMarker);
  vehicleMarker = L.marker(pts[0], {
    icon: makeIcon(getVehicleEmoji(), 34),
    zIndexOffset: 2000,
  }).addTo(window.qtMap);

  isAnimating = true;
  scheduleNext();
}

function scheduleNext() {
  if (!isAnimating) return;
  animTimer = setTimeout(function() { stepVehicle(); }, 80);
}

function stepVehicle() {
  if (!isAnimating || !vehicleMarker || !animPath.length) return;
  vehicleMarker.setLatLng(animPath[animIndex]);
  animIndex++;
  if (animIndex < animPath.length) {
    scheduleNext();
  } else {
    animTimer = setTimeout(function() {
      if (!isAnimating || !vehicleMarker) return;
      animIndex = 0;
      vehicleMarker.setLatLng(animPath[0]);
      setTimeout(scheduleNext, 300);
    }, 1500);
  }
}

// ── Clear route ───────────────────────────────────────────────────
function clearRoute() {
  isAnimating = false;
  if (animTimer)    { clearTimeout(animTimer);  animTimer = null; }
  if (vehicleMarker){ window.qtMap.removeLayer(vehicleMarker); vehicleMarker = null; }
  if (glowLayer)    { window.qtMap.removeLayer(glowLayer);     glowLayer = null; }
  if (routeLayer)   { window.qtMap.removeLayer(routeLayer);    routeLayer = null; }
  animPath  = [];
  animIndex = 0;
}

function getVehicleEmoji() {
  var sel = document.querySelector('input[name=vehicle]:checked');
  return ({ Bike:'🏍️', Auto:'🛺', Car:'🚗', SUV:'🚙' })[sel ? sel.value : 'Car'] || '🚗';
}

function updateVehicleOnMap() {
  if (vehicleMarker) vehicleMarker.setIcon(makeIcon(getVehicleEmoji(), 34));
}

document.addEventListener('DOMContentLoaded', function() { initMap(); });
