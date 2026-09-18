// ===== BOOK.JS =====
const RATES = { Bike: 7, Auto: 10, Car: 15, SUV: 22 };
const BASE = 30;

let currentStep = 1;
let bookingData = {
  pickup: '', dropoff: '', vehicle: '',
  date: '', time: '', distance: 0, fare: 0, payment: 'Cash'
};

// ── Nominatim autocomplete (debounced) ────────────────────────────
let _suggTimers = {};

function suggestLocation(inp, listId) {
  const q = inp.value.trim();
  const list = document.getElementById(listId);
  if (!q || q.length < 3) { list.innerHTML = ''; return; }

  list.innerHTML = '<div class="sugg-searching">Searching…</div>';
  clearTimeout(_suggTimers[listId]);
  _suggTimers[listId] = setTimeout(function() {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' +
      encodeURIComponent(q) + '&countrycodes=in&addressdetails=1';
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.length) { list.innerHTML = '<div class="sugg-item" style="opacity:.5;cursor:default">No results found</div>'; return; }
        list.innerHTML = data.map(function(item) {
          const label = item.display_name;
          const short = label.split(',').slice(0, 3).join(',');
          const safeLabel = label.replace(/'/g, "\\'");
          const safeLat   = item.lat;
          const safeLon   = item.lon;
          return '<div class="sugg-item" onclick="selectSugg(\'' + inp.id + '\',\'' + listId + '\',\'' +
            safeLabel.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',' + safeLat + ',' + safeLon + ')">' +
            '<span class="si-icon">📍</span>' + short + '</div>';
        }).join('');
      })
      .catch(function() {
        list.innerHTML = '<div class="sugg-item" style="opacity:.5;cursor:default">Search unavailable</div>';
      });
  }, 350); // debounce 350ms
}

function selectSugg(inputId, listId, value, lat, lng) {
  // Short display name (first 3 parts)
  const shortName = value.split(',').slice(0, 3).join(',');
  document.getElementById(inputId).value = shortName;
  document.getElementById(listId).innerHTML = '';
  if (inputId === 'pickup'  && typeof setPickupOnMap === 'function') setPickupOnMap(shortName, parseFloat(lat), parseFloat(lng));
  if (inputId === 'dropoff' && typeof setDropOnMap   === 'function') setDropOnMap(shortName, parseFloat(lat), parseFloat(lng));
  updateMapInfo();
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sp = sessionStorage.getItem('qt_pickup');
  const sd = sessionStorage.getItem('qt_drop');
  const sv = sessionStorage.getItem('qt_vehicle');
  if (sp) document.getElementById('pickup').value = sp;
  if (sd) document.getElementById('dropoff').value = sd;
  if (sv && sp && sd) { goToStep(2); selectVehicle(sv); }

  document.getElementById('rideDate').min = new Date().toISOString().split('T')[0];

  document.querySelectorAll('input[name=vehicle]').forEach(r => {
    r.addEventListener('change', () => {
      updateFare();
      updateVehicleOnMap();
    });
  });
});

function goToStep(step) {
  if (step > currentStep) {
    if (currentStep === 1) {
      const p = document.getElementById('pickup').value.trim();
      const d = document.getElementById('dropoff').value.trim();
      if (!p) { showBookAlert('Enter your pickup location', 'error'); return; }
      if (!d) { showBookAlert('Enter your drop-off location', 'error'); return; }
      bookingData.pickup = p;
      bookingData.dropoff = d;
      bookingData.date = document.getElementById('rideDate').value;
      bookingData.time = document.getElementById('rideTime').value;
      bookingData.distance = +(4 + Math.random() * 20).toFixed(1);
      updateRouteSummary();
      updateVehiclePrices();
    }
    if (currentStep === 2) {
      const v = document.querySelector('input[name=vehicle]:checked');
      if (!v) { showBookAlert('Please select a vehicle type', 'error'); return; }
      bookingData.vehicle = v.value;
      bookingData.fare = calcFare(v.value, bookingData.distance);
      updateConfirmCard();
    }
  }

  [1, 2, 3].forEach(s => {
    document.getElementById('step' + s).classList.add('hidden');
    const ind = document.getElementById('step' + s + 'Ind');
    if (s < step) { ind.classList.add('done'); ind.classList.remove('active'); }
    else if (s === step) { ind.classList.add('active'); ind.classList.remove('done'); }
    else { ind.classList.remove('active', 'done'); }
  });
  const lines = document.querySelectorAll('.bp-line');
  lines.forEach((l, i) => l.classList.toggle('done', i + 1 < step));

  document.getElementById('step' + step).classList.remove('hidden');
  currentStep = step;
  hideBookAlert();

  if (window.qtMap) {
    setTimeout(() => window.qtMap.invalidateSize(), 100);
  }
}

function calcFare(vehicle, dist) {
  return Math.round(BASE + dist * RATES[vehicle]);
}

function updateVehiclePrices() {
  const d = bookingData.distance;
  document.getElementById('bikePr').textContent = '₹' + calcFare('Bike', d);
  document.getElementById('autoPr').textContent = '₹' + calcFare('Auto', d);
  document.getElementById('carPr').textContent  = '₹' + calcFare('Car',  d);
  document.getElementById('suvPr').textContent  = '₹' + calcFare('SUV',  d);
  updateMapInfo();
}

function updateFare() {
  const v = document.querySelector('input[name=vehicle]:checked');
  if (v) updateMapInfo(v.value);
}

function updateRouteSummary() {
  const d = bookingData;
  document.getElementById('rsSrc').textContent = d.pickup;
  document.getElementById('rsDst').textContent = d.dropoff;
  document.getElementById('rsDist').innerHTML =
    'Est. distance: <span>' + d.distance + ' km</span>';
  updateMapInfo();
  if (typeof setPickupOnMap === 'function') setPickupOnMap(d.pickup);
  if (typeof setDropOnMap   === 'function') setDropOnMap(d.dropoff);
}

function updateMapInfo(vehicle) {
  const v = vehicle ||
    (document.querySelector('input[name=vehicle]:checked')
      ? document.querySelector('input[name=vehicle]:checked').value
      : 'Car');
  const d = bookingData.distance || 8;
  const eta = Math.round(d * 2.5 + Math.random() * 5);
  document.getElementById('mapEta').textContent  = eta + ' min';
  document.getElementById('mapDist').textContent = d + ' km';
  document.getElementById('mapFare').textContent = '₹' + calcFare(v, d);
}

function selectVehicle(type) {
  const r = document.querySelector('input[name=vehicle][value="' + type + '"]');
  if (r) { r.checked = true; updateFare(); }
}

function updateConfirmCard() {
  const d = bookingData;
  document.getElementById('cfFrom').textContent     = d.pickup;
  document.getElementById('cfTo').textContent       = d.dropoff;
  document.getElementById('cfVehicle').textContent  = vehicleIcon(d.vehicle) + ' ' + d.vehicle;
  let dt = 'Immediate';
  if (d.date) dt = d.date + (d.time ? ' ' + d.time : '');
  document.getElementById('cfDateTime').textContent = dt;
  document.getElementById('cfDist').textContent     = d.distance + ' km';
  document.getElementById('cfFare').textContent     = '₹' + d.fare;
  updateMapInfo(d.vehicle);
}

function confirmBooking() {
  const pm = document.querySelector('input[name=payment]:checked');
  bookingData.payment = pm ? pm.value : 'Cash';
  const btn = document.getElementById('bookBtn');
  btn.textContent = 'Processing...';
  btn.disabled = true;

  setTimeout(() => {
    const rides = getRides();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const id = 'QT-' + now.replace(/\D/g, '').slice(0, 8) + '-' +
      String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    const DRIVERS = ['Rajesh Kumar','Amit Singh','Suresh Yadav','Vikram Malhotra','Pradeep Chauhan'];
    const PLATES  = ['DL-01-AB-1234','DL-02-CD-5678','HR-26-EF-9012','UP-16-GH-3456','MH-12-IJ-7890'];
    const idx = Math.floor(Math.random() * DRIVERS.length);
    const newRide = {
      id, pickup: bookingData.pickup, dropoff: bookingData.dropoff,
      vehicle: bookingData.vehicle, fare: bookingData.fare,
      distance: bookingData.distance, status: 'completed',
      date: now, driver: DRIVERS[idx], plate: PLATES[idx],
      rating: null, payment: bookingData.payment
    };
    rides.unshift(newRide);
    setRides(rides);

    const txns = getTransactions();
    txns.unshift({
      id: 'TXN-' + Date.now(), type: 'debit',
      label: 'Ride: ' + bookingData.pickup.split(',')[0] + ' → ' + bookingData.dropoff.split(',')[0],
      amount: bookingData.fare, date: now,
      method: bookingData.payment, icon: vehicleIcon(bookingData.vehicle)
    });
    setTransactions(txns);

    if (bookingData.payment === 'Wallet') {
      const w = getWallet();
      setWallet(Math.max(0, w - bookingData.fare));
    }

    document.getElementById('bookingId').textContent    = id;
    document.getElementById('driverName').textContent   = DRIVERS[idx];
    document.getElementById('driverVehicle').textContent =
      bookingData.vehicle + ' • ' + PLATES[idx];
    showModal('successModal');
    btn.textContent = 'Confirm Booking ✓';
    btn.disabled = false;

    sessionStorage.removeItem('qt_pickup');
    sessionStorage.removeItem('qt_drop');
    sessionStorage.removeItem('qt_vehicle');
  }, 1800);
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.add('hidden');
  document.body.style.overflow = '';
  window.location.href = 'book.html';
}
function closeModal() { closeSuccessModal(); }

function swapLocations() {
  const p = document.getElementById('pickup');
  const d = document.getElementById('dropoff');
  [p.value, d.value] = [d.value, p.value];
}

function getCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Reverse geocode using Nominatim
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng, {
          headers: { 'Accept-Language': 'en' }
        })
        .then(r => r.json())
        .then(data => {
          const name = data.display_name
            ? data.display_name.split(',').slice(0,3).join(',')
            : 'Current Location';
          document.getElementById('pickup').value = name;
          if (typeof setPickupOnMap === 'function') setPickupOnMap(name, lat, lng);
        })
        .catch(() => {
          document.getElementById('pickup').value = 'Current Location';
          if (typeof setPickupOnMap === 'function') setPickupOnMap('Current Location', lat, lng);
        });
      },
      () => {
        document.getElementById('pickup').value = 'Connaught Place, Delhi';
        if (typeof setPickupOnMap === 'function') setPickupOnMap('Connaught Place, Delhi');
      }
    );
  }
}

function showBookAlert(msg, type) {
  type = type || 'info';
  const el = document.getElementById('bookingAlert');
  if (!el) return;
  el.className = 'alert ' + type;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideBookAlert() {
  const el = document.getElementById('bookingAlert');
  if (el) el.classList.add('hidden');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.suggest-wrap'))
    document.querySelectorAll('.suggestions').forEach(s => s.innerHTML = '');
});
