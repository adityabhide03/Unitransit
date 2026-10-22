/* UniTransit - shared helpers, fake auth, and logic for each page. Vanilla JS. */
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};
const rupee = n => '₹' + n;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const say = (id, t, bad) => { $('#' + id).innerHTML = `<div class="${bad ? 'err' : 'msg'}">${esc(t)}</div>`; };

/* ---- Auth (prototype). Replace these methods with fetch() calls to a real backend later. ---- */
const Auth = {
  users: () => store.get('ut_users', []),
  user: () => store.get('ut_session', null),
  hash: p => btoa(p), // DEMO ONLY - a real backend must hash passwords with bcrypt/argon2
  register(name, email, pw) {
    const users = this.users();
    if (users.some(u => u.email === email)) throw new Error('An account with this email already exists.');
    users.push({ name, email, pass: this.hash(pw), phone: '' });
    store.set('ut_users', users);
    this.login(email, pw);
  },
  login(email, pw) {
    const u = this.users().find(u => u.email === email && u.pass === this.hash(pw));
    if (!u) throw new Error('Incorrect email or password.');
    store.set('ut_session', { name: u.name, email: u.email });
  },
  logout() { localStorage.removeItem('ut_session'); location.href = 'index.html'; },
  require() { // blocks account pages for logged-out visitors
    if (this.user()) return true;
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return false;
  }
};

/* ---- Navbar + search form shared by pages ---- */
function renderNav(page) {
  const u = Auth.user();
  const links = [['index.html', 'Home', 'home'], ['search.html', 'Search', 'search']];
  if (u) links.push(['profile.html#bookings', 'My Bookings', ''], ['profile.html', 'Profile', 'profile']);
  $('#nav').innerHTML = `<div class="wrap nav"><a class="logo" href="index.html">🚆 Uni<b>Transit</b></a><button id="menuBtn" aria-label="Menu">☰</button><nav id="links">`
    + links.map(l => `<a href="${l[0]}" class="${l[2] === page ? 'on' : ''}">${l[1]}</a>`).join('')
    + (u ? '<a href="#" id="out">Logout</a>' : '<a class="btn sm" href="login.html">Login</a>') + '</nav></div>';
  $('#menuBtn').onclick = () => $('#links').classList.toggle('open');
  if (u) $('#out').onclick = e => { e.preventDefault(); Auth.logout(); };
}
function searchForm(q = {}) {
  const opt = (arr, cur) => arr.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
  const st = [['', 'Select place'], ...STATIONS.map(s => [s.name, s.name])];
  return `<form class="row" action="search.html" id="sf" novalidate>
    <label>From<select name="from">${opt(st, q.from)}</select></label>
    <label>To<select name="to">${opt(st, q.to)}</select></label>
    <label>Date<input type="date" name="date" min="${today()}" value="${esc(q.date || today())}"></label>
    <label>Passengers<input type="number" name="pax" min="1" max="6" value="${esc(q.pax || 1)}"></label>
    <label>Transport<select name="type">${opt(TYPES, q.type || 'all')}</select></label>
    <button class="btn" type="submit" style="margin-bottom:10px">Search</button>
    <div class="err" id="sfErr" style="grid-column:1/-1" hidden></div></form>`;
}
function bindSearchForm() {
  $('#sf').onsubmit = e => {
    const f = e.target; let m = '';
    if (!f.from.value || !f.to.value) m = 'Choose both a source and a destination.';
    else if (f.from.value === f.to.value) m = 'Source and destination must be different.';
    else if (!f.date.value || f.date.value < today()) m = 'Pick today or a future date.';
    else if (!(f.pax.value >= 1 && f.pax.value <= 6)) m = 'Passengers must be between 1 and 6.';
    if (m) { e.preventDefault(); $('#sfErr').textContent = m; $('#sfErr').hidden = false; }
  };
}

/* ---- Sample-data search engine ---- */
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
const fromMin = m => { m %= 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const hashOf = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
const km = (a, b) => { const A = STATIONS.find(s => s.name === a), B = STATIONS.find(s => s.name === b); return Math.max(1, Math.round(Math.hypot(A.x - B.x, A.y - B.y) * 1.3)); };
const serves = (m, ...names) => !MODES[m].stops || names.every(n => MODES[m].stops.includes(n));
function rideSvc(v, from, to) { // on-demand ride: fare = base + distance + time, x1.3 at peak hours
  const d = km(from, to), mins = Math.round(d / v.speed * 60) + 3, parts = [v.base, Math.round(v.perKm * d), Math.round(v.perMin * mins)];
  const hr = new Date().getHours(), surge = (hr >= 8 && hr < 11) || (hr >= 17 && hr < 21) ? 1.3 : 1, h = hashOf(v.key + from + to);
  return { id: `${v.key}-${from}-${to}`, mode: v.type, ride: true, veh: v.key, label: v.label, prov: v.prov, from, to, dep: 'Now', arr: '', eta: 2 + h % 8, mins, km: d, parts, surge, fare: Math.round(parts.reduce((a, b) => a + b) * surge), cap: v.cap, seatable: false, seats: 0, h };
}
function findServices(from, to, type) {
  const out = [];
  Object.entries(MODES).forEach(([m, M]) => {
    if ((type && type !== 'all' && type !== m) || !serves(m, from, to)) return;
    if (M.ride) { VEHICLES.filter(v => v.type === m).forEach(v => out.push(rideSvc(v, from, to))); return; }
    const d = km(from, to), mins = Math.round(d / M.speed * 60) + 5, fare = Math.max(10, Math.round(M.base + M.perKm * d));
    M.times.forEach(t => {
      const id = `${m}-${from}-${to}-${t}`, h = hashOf(id);
      out.push({ id, mode: m, label: M.label, km: d, from, to, dep: t, arr: fromMin(toMin(t) + mins), mins, fare, seatable: M.seatable, seats: 8 + h % 30, h });
    });
  });
  return out;
}
// 40-seat layout; exactly (40 - seats) seats are "taken", chosen the same way every time
const takenSeats = s => new Set(Array.from({ length: 40 }, (_, i) => i + 1).filter(n => (n * 13 + s.h) % 40 < 40 - s.seats));

function choose(svc, q) { // Search -> Booking
  store.set('ut_selected', { svc, date: q.date || today(), pax: Math.min(6, Math.max(1, +q.pax || 1)) });
  location.href = 'booking.html';
}
function renderResults(list, q) {
  const tod = $('#tod').value, sort = $('#sort').value;
  const l = list.filter(s => s.ride || tod === 'all' || (tod === 'am' ? s.dep < '12:00' : tod === 'pm' ? s.dep >= '12:00' && s.dep < '17:00' : s.dep >= '17:00'));
  l.sort((a, b) => sort === 'fare' ? a.fare - b.fare : sort === 'time' ? a.mins - b.mins : a.dep.localeCompare(b.dep));
  const pax = Math.min(6, Math.max(1, +q.pax || 1));
  $('#results').innerHTML = l.length ? l.map(s => { const over = s.ride && pax > s.cap; return `<div class="card svc"><div><span class="tag">${MODES[s.mode].icon} ${s.label || MODES[s.mode].label}</span>${s.ride ? `<br><small>${s.prov}</small>` : ''}</div>
    <div>${s.ride ? `<span class="time">Arrives in ${s.eta} min</span><br><small>${s.from} → ${s.to} · ${s.km} km · ${s.mins} min ride${s.surge > 1 ? ' · peak pricing' : ''}</small>` : `<span class="time">${s.dep} → ${s.arr}</span><br><small>${s.from} → ${s.to} · ${s.mins} min</small>`}</div>
    <div><b>${rupee(s.fare)}</b> <small>${s.ride ? 'estimate' : 'per person'}</small><br><small>${s.ride ? 'Up to ' + s.cap + ' rider' + (s.cap > 1 ? 's' : '') : s.seatable ? s.seats + ' seats left' : 'Unreserved seating'}</small></div>
    <button class="btn sm" data-id="${s.id}" ${over ? 'disabled' : ''}>${over ? 'Max ' + s.cap : 'Select'}</button></div>`; }).join('')
    : '<div class="empty card">No services match. Try another transport type, time of day or pair of stations.</div>';
  $('#results').querySelectorAll('button').forEach(b => b.onclick = () => choose(list.find(s => s.id === b.dataset.id), q));
}
function showSmart(q) { // SmartRoute: planned feature - suggests local + metro combinations
  const { from, to } = q;
  if (serves('metro', from, to)) return;
  let best = null;
  STATIONS.forEach(h => {
    if (h.name === from || h.name === to) return;
    [['local', 'metro'], ['metro', 'local'], ['local', 'bike'], ['bike', 'local'], ['metro', 'bike'], ['bike', 'metro']].forEach(([a, b]) => {
      const t = km(from, h.name) + km(h.name, to);
      const lastMile = (a !== 'bike' || !serves('local', from)) && (b !== 'bike' || !serves('local', to)); // bike legs only where there is no station
      if (lastMile && serves(a, from, h.name) && serves(b, h.name, to) && (!best || t < best.t)) best = { a, b, h: h.name, t };
    });
  });
  if (!best) return;
  const s1 = findServices(from, best.h, best.a)[0], s2 = findServices(best.h, to, best.b)[0];
  const A = MODES[best.a].label, B = MODES[best.b].label;
  $('#smart').innerHTML = `<div class="card"><span class="tag">SmartRoute · planned feature</span>
    <p><b>${A} + ${B}</b> via ${best.h}: about ${s1.mins + s2.mins + 10} min, ${rupee(s1.fare + s2.fare)} per person (estimate). Book each leg separately for now.</p>
    <button class="btn alt sm" id="l1">Book ${A}: ${from} → ${best.h}</button> <button class="btn alt sm" id="l2">Book ${B}: ${best.h} → ${to}</button></div>`;
  $('#l1').onclick = () => choose(s1, q); $('#l2').onclick = () => choose(s2, q);
}
function initSearch() {
  const q = Object.fromEntries(new URLSearchParams(location.search)), R = $('#results'), names = STATIONS.map(s => s.name);
  if (!q.from || !q.to) { R.innerHTML = '<div class="empty card">Choose where you are travelling from and to, then press Search.</div>'; return; }
  if (!names.includes(q.from) || !names.includes(q.to) || q.from === q.to) { R.innerHTML = '<div class="err">Please choose two different stations from the lists.</div>'; return; }
  if ((q.date || today()) < today()) { R.innerHTML = '<div class="err">That date has passed. Pick today or a later date.</div>'; return; }
  const list = findServices(q.from, q.to, q.type);
  $('#filters').hidden = false;
  $('#sort').onchange = $('#tod').onchange = () => renderResults(list, q);
  renderResults(list, q);
  if (!q.type || q.type === 'all') showSmart(q);
}

/* ---- Login / Sign up ---- */
function initLogin() {
  if (Auth.user()) { location.href = 'profile.html'; return; }
  const next = new URLSearchParams(location.search).get('next');
  const go = () => { location.href = /^[a-z]+\.html([?#].*)?$/i.test(next || '') ? next : 'index.html'; }; // only same-site pages
  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach(t => t.onclick = () => { $('#lf').hidden = t.dataset.tab !== 'login'; $('#rf').hidden = t.dataset.tab !== 'reg'; tabs.forEach(x => x.classList.toggle('alt', x !== t)); });
  $('#lf').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    if (!f.email.value.trim() || !f.password.value) return say('lErr', 'Enter your email and password.', 1);
    try { Auth.login(f.email.value.trim().toLowerCase(), f.password.value); go(); } catch (err) { say('lErr', err.message, 1); }
  };
  $('#rf').onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const n = f.fullName.value.trim(), em = f.email.value.trim().toLowerCase(), p = f.password.value; let m = '';
    if (n.length < 2) m = 'Enter your full name.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) m = 'Enter a valid email address.';
    else if (p.length < 8 || !/\d/.test(p) || !/[a-zA-Z]/.test(p)) m = 'Password needs 8+ characters, with letters and a number.';
    else if (p !== f.confirmPw.value) m = 'Passwords do not match.';
    if (m) return say('rErr', m, 1);
    try { Auth.register(n, em, p); go(); } catch (err) { say('rErr', err.message, 1); }
  };
}

/* ---- Booking ---- */
const money = a => (a < 0 ? '−' : '') + rupee(Math.abs(a));
const PROMOS = { UNI10: ['10% off (max ₹40)', f => Math.min(40, Math.round(f * 0.1))], WELCOME30: ['₹30 off', () => 30] }; // sample codes
function initBooking() {
  if (!Auth.require()) return;
  const sel = store.get('ut_selected'), box = $('#bookingBox');
  if (!sel) { box.innerHTML = '<div class="empty card">No journey selected yet. <a href="search.html">Search for a service</a> to start booking.</div>'; return; }
  const { svc: s, pax, date } = sel, taken = takenSeats(s), picked = new Set(), user = Auth.user();
  let promo = null;
  const calc = () => { // fare breakdown, shared by trains, buses and rides
    const rows = [], base = s.ride ? s.fare : s.fare * pax, fee = 10;
    if (s.ride) { const [b, d, t] = s.parts; rows.push(['Base fare', b], [`Distance (${s.km} km)`, d], ['Time', t]); if (base > b + d + t) rows.push(['Peak pricing surcharge', base - b - d - t]); }
    else rows.push([`Base fare (${rupee(s.fare)} × ${pax})`, base]);
    const disc = promo ? Math.min(base, PROMOS[promo][1](base)) : 0, gst = Math.round((base + fee - disc) * 0.05), total = base + fee - disc + gst;
    rows.push(['Platform fee', fee]); if (disc) rows.push([`Promo ${promo}`, -disc]); rows.push(['GST (5%)', gst], ['Total', total]);
    return { rows, total };
  };
  box.innerHTML = `<div class="card"><span class="tag">${MODES[s.mode].icon} ${s.label}</span><h2 style="margin:8px 0">${s.from} → ${s.to}</h2>
    <p>${s.ride ? `${date} · Pickup in about ${s.eta} min · ${s.mins} min ride · ${pax} rider(s)` : `${date} · ${s.dep} → ${s.arr} (${s.mins} min) · ${pax} passenger(s)`}</p>
    <p class="note">${s.ride ? `Sample ride from ${s.prov}: estimated fare, fictional driver.` : 'Sample data for demonstration only.'}</p></div>
    <form id="bf" class="card" novalidate><h3>Passenger details</h3>
    ${Array.from({ length: pax }, (_, i) => `<div class="two"><label>Name<input name="pn" value="${i ? '' : esc(user.name)}"></label><label>Age<input name="pa" type="number" min="1" max="120"></label></div>`).join('')}
    ${s.ride ? `<label>Mobile number<input name="ph" inputmode="numeric" maxlength="10" placeholder="10-digit number" autocomplete="off"></label>
      <div class="two"><label>Ride time<select name="rt"><option value="now">Ride now</option><option value="later">Schedule</option></select></label><label id="rtl" hidden>Pickup time<input name="rtime" type="time"></label></div>
      <p class="note">${s.mode === 'bike' ? 'A helmet is mandatory for bike rides.' : 'Luggage space in cabs is limited.'}</p>` : ''}
    ${s.seatable ? `<h3>Choose ${pax} seat(s)</h3><div class="seats">${Array.from({ length: 40 }, (_, i) => `<button type="button" class="seat" data-n="${i + 1}" ${taken.has(i + 1) ? 'disabled' : ''}>${i + 1}</button>`).join('')}</div>` : s.ride ? '' : '<p class="note">Unreserved seating - no seat selection needed.</p>'}
    <h3>Fare breakdown</h3><div id="fareBox"></div>
    ${s.ride ? `<div class="two"><label>Promo code (try UNI10 or WELCOME30)<input name="pc" autocomplete="off"></label><div style="align-self:end"><button type="button" class="btn alt" id="pa" style="margin-bottom:10px">Apply</button></div></div><div id="promoMsg"></div>` : ''}
    <h3>Payment (simulated)</h3><div class="two"><label>Method<select name="pm"><option value="upi">UPI</option><option value="card">Card</option>${s.ride ? '<option value="cash">Cash to driver</option>' : ''}</select></label><label id="pl">UPI ID<input name="pv" placeholder="name@bank" autocomplete="off"></label></div>
    <p class="note">Demo only: no real payment is taken, no real ticket or ride is issued, and payment details are never saved.</p>
    <div class="err" id="bErr" hidden></div><button class="btn" type="submit" id="payBtn">Pay</button></form>`;
  const f = $('#bf');
  const drawFare = () => { const c = calc(); $('#fareBox').innerHTML = `<table class="fare">${c.rows.map(r => `<tr><td>${r[0]}</td><td>${money(r[1])}</td></tr>`).join('')}</table>`; $('#payBtn').textContent = `Pay ${rupee(c.total)} (demo)`; };
  drawFare();
  box.querySelectorAll('.seat').forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    if (picked.has(n)) picked.delete(n); else if (picked.size < pax) picked.add(n);
    b.classList.toggle('sel', picked.has(n));
  });
  f.pm.onchange = () => { const v = f.pm.value; $('#pl').hidden = v === 'cash'; $('#pl').firstChild.textContent = v === 'upi' ? 'UPI ID' : 'Card number (16 digits)'; f.pv.placeholder = v === 'upi' ? 'name@bank' : '1234 5678 9012 3456'; };
  if (s.ride) {
    f.rt.onchange = () => { $('#rtl').hidden = f.rt.value !== 'later'; };
    $('#pa').onclick = () => {
      const c = f.pc.value.trim().toUpperCase();
      if (!Object.hasOwn(PROMOS, c)) { promo = null; say('promoMsg', 'That promo code is not valid.', 1); }
      else { promo = c; say('promoMsg', `${c} applied: ${PROMOS[c][0]}.`); }
      drawFare();
    };
  }
  f.onsubmit = e => {
    e.preventDefault();
    const names = [...f.querySelectorAll('[name=pn]')], ages = [...f.querySelectorAll('[name=pa]')]; let m = '';
    const later = s.ride && f.rt.value === 'later', when = later ? `${date}T${f.rtime.value}` : '';
    if (date < today()) m = 'This journey date has passed. Search again with a new date.';
    else if (names.some(n => n.value.trim().length < 2)) m = 'Enter a name (at least 2 letters) for every passenger.';
    else if (ages.some(a => !(a.value >= 1 && a.value <= 120))) m = 'Enter a valid age (1-120) for every passenger.';
    else if (s.ride && pax > s.cap) m = `${s.label} carries at most ${s.cap} rider(s).`;
    else if (s.ride && !/^[6-9]\d{9}$/.test(f.ph.value.trim())) m = 'Enter a valid 10-digit mobile number.';
    else if (s.ride && !later && date !== today()) m = 'Ride now is only for today. Choose Schedule for a later date.';
    else if (later && (!f.rtime.value || Date.parse(when) <= Date.now())) m = 'Choose a pickup time in the future.';
    else if (s.seatable && picked.size !== pax) m = `Select exactly ${pax} seat(s).`;
    else if (f.pm.value === 'upi' && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(f.pv.value.trim())) m = 'Enter a valid UPI ID, like name@bank.';
    else if (f.pm.value === 'card' && !/^\d{16}$/.test(f.pv.value.replace(/\s/g, ''))) m = 'Enter a 16-digit card number.';
    if (m) { $('#bErr').textContent = m; $('#bErr').hidden = false; return; }
    const ref = 'UT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const all = store.get('ut_bookings', []);
    all.push({ ref, email: user.email, svc: s, date, pax, seats: [...picked].sort((a, b) => a - b), passengers: names.map((n, i) => ({ name: n.value.trim(), age: +ages[i].value })), total: calc().total, promo, when, status: 'Confirmed', created: new Date().toISOString() });
    store.set('ut_bookings', all); localStorage.removeItem('ut_selected');
    location.href = 'ticket.html?id=' + ref; // Booking -> Ticket
  };
}

/* ---- Ticket ---- */
function initTicket() {
  if (!Auth.require()) return;
  const id = new URLSearchParams(location.search).get('id'), box = $('#ticketBox');
  const mine = store.get('ut_bookings', []).filter(x => x.email === Auth.user().email);
  const b = id ? mine.find(x => x.ref === id) : mine[mine.length - 1];
  if (!b) { box.innerHTML = '<div class="empty card">No ticket yet. <a href="search.html">Book a journey</a> or open one from <a href="profile.html#bookings">My Bookings</a>.</div>'; return; }
  const s = b.svc, cell = (k, v) => `<div><small>${k}</small><br><b>${v}</b></div>`;
  box.innerHTML = `<div class="card ticket"><div style="display:flex;justify-content:space-between;align-items:center"><b>🚆 UniTransit</b><span class="tag">${esc(b.status)}</span></div>
    <h2 style="margin-top:10px">${s.from} → ${s.to}</h2>
    <div class="two">${cell('Passenger(s)', esc(b.passengers.map(p => p.name).join(', ')))}${cell('Booking reference', b.ref)}${cell('Transport', s.label || MODES[s.mode].label)}${cell('Journey date', b.date)}
    ${cell(s.ride ? 'Pickup' : 'Departure', s.ride ? (b.when ? b.when.slice(11) : 'Ride now') : s.dep)}${cell('Fare (demo)', rupee(b.total))}${b.seats.length ? cell('Seats', b.seats.join(', ')) : ''}</div>
    <div id="rideLive"></div><div id="qr" style="margin:16px auto;width:140px;text-align:center"></div>
    <p class="note">Demo ticket from a college prototype - not valid for travel.</p></div>
    <p class="noprint" style="text-align:center"><button class="btn" onclick="window.print()">Print / Save as PDF</button>${s.ride ? ' <button class="btn alt" id="cp">Copy ride details</button> <button class="btn red" id="sos">Emergency help</button>' : ''} <a class="btn alt" href="profile.html#bookings">My Bookings</a></p>`;
  if (window.QRCode) new QRCode($('#qr'), { text: b.ref, width: 140, height: 140 }); else $('#qr').textContent = b.ref;
  if (s.ride) rideStatus(b, cell);
}
function rideStatus(b, cell) { // demo simulation of driver assignment (accelerated timers, no real driver)
  const s = b.svc, h = hashOf(b.ref), steps = ['Searching for a driver…', 'Driver assigned', 'Driver arriving', 'Ride completed'];
  const drv = ['Ravi K.', 'Sana M.', 'Imran S.', 'Pooja D.', 'Arjun T.'][h % 5] + ' · ★' + (4.2 + h % 8 / 10).toFixed(1);
  const veh = 'MH 00 ZZ ' + (1000 + h % 9000), pin = String(1000 + h * 7 % 9000), details = `UniTransit ride ${b.ref}: ${s.from} → ${s.to}, ${s.label}, driver ${drv}, vehicle ${veh}`;
  let iv;
  const tick = () => {
    const age = (Date.now() - Date.parse(b.created)) / 1000, i = b.status === 'Cancelled' ? -1 : age < 6 ? 0 : age < 15 ? 1 : age < 30 ? 2 : 3;
    $('#rideLive').innerHTML = i < 0 ? '<p class="err">This ride was cancelled.</p>' : `<p class="note">Status: <b>${steps[i]}</b> (demo simulation)</p>` + (i ? `<div class="two">${cell('Driver (fictional)', drv)}${cell('Vehicle no. (fictional)', veh)}${cell('Ride PIN (demo)', pin)}${cell('Pickup ETA', s.eta + ' min')}</div>` : '');
    if (i === 3 || i < 0) clearInterval(iv);
  };
  tick(); iv = setInterval(tick, 1000);
  $('#cp').onclick = () => navigator.clipboard ? navigator.clipboard.writeText(details).then(() => alert('Ride details copied.')).catch(() => alert(details)) : alert(details);
  $('#sos').onclick = () => alert('Demo only: this button does not contact anyone. In a real emergency, call 112.');
}

/* ---- Profile ---- */
function initProfile() {
  if (!Auth.require()) return;
  const u = Auth.user(), rec = Auth.users().find(x => x.email === u.email) || {};
  $('#pBox').innerHTML = `<div class="card"><h2 style="margin-top:0">Your account</h2><form id="pf" class="two" novalidate>
    <label>Name<input name="fullName" value="${esc(u.name)}"></label><label>Email<input value="${esc(u.email)}" disabled></label>
    <label>Phone (optional)<input name="phone" value="${esc(rec.phone || '')}"></label>
    <div style="align-self:end"><button class="btn" type="submit">Save changes</button> <button type="button" class="btn alt" id="lo">Logout</button></div></form><div id="pMsg"></div></div>`;
  $('#lo').onclick = () => Auth.logout();
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const name = e.target.fullName.value.trim(), phone = e.target.phone.value.trim();
    if (name.length < 2) return say('pMsg', 'Name must be at least 2 characters.', 1);
    if (phone && !/^\d{10}$/.test(phone)) return say('pMsg', 'Phone must be 10 digits.', 1);
    store.set('ut_users', Auth.users().map(x => x.email === u.email ? { ...x, name, phone } : x));
    store.set('ut_session', { name, email: u.email });
    say('pMsg', 'Profile updated.'); renderNav('profile');
  };
  let ft = 'all';
  // rides: "upcoming" while scheduled in the future (or just booked); trains/buses: by journey date
  const upcoming = b => b.status === 'Confirmed' && (b.svc.ride ? (b.when ? Date.parse(b.when) > Date.now() : Date.now() - Date.parse(b.created) < 60000) : b.date >= today());
  const draw = () => {
    const all = store.get('ut_bookings', []).filter(b => b.email === u.email).sort((a, b) => b.created.localeCompare(a.created));
    const live = all.filter(b => b.status !== 'Cancelled'), mine = all.filter(b => ft === 'all' || b.svc.mode === ft);
    const ups = mine.filter(upcoming), rest = mine.filter(b => !upcoming(b));
    const row = b => `<div class="card svc"><div><span class="tag">${MODES[b.svc.mode].icon} ${esc(b.svc.label || MODES[b.svc.mode].label)}</span><br><small>${b.ref}</small></div>
      <div><b>${b.svc.from} → ${b.svc.to}</b><br><small>${b.date} · ${b.svc.ride ? (b.when ? b.when.slice(11) : 'Ride now') : b.svc.dep}</small></div>
      <div><b>${rupee(b.total)}</b><br><small>${b.status === 'Cancelled' ? 'Cancelled' : upcoming(b) ? 'Confirmed · Upcoming' : 'Completed'}</small></div>
      <div><a class="btn sm" href="ticket.html?id=${b.ref}">View ticket</a>${upcoming(b) ? ` <button class="btn sm red" data-c="${b.ref}">Cancel</button>` : ''}
      ${b.svc.ride && b.status !== 'Cancelled' && !upcoming(b) ? (b.rating ? `<br><small>Rated ${'★'.repeat(b.rating)}</small>` : `<br><select data-r="${b.ref}"><option value="">Rate ride</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} ★</option>`).join('')}</select>`) : ''}</div></div>`;
    const stats = [['Bookings', live.length], ['Total spend', rupee(live.reduce((a, b) => a + b.total, 0))], ['Distance', live.reduce((a, b) => a + (b.svc.km || 0), 0) + ' km']];
    $('#bBox').innerHTML = `<div class="grid" style="margin-bottom:16px">${stats.map(([k, v]) => `<div class="card"><b style="font-size:1.4rem">${v}</b><br><small>${k}</small></div>`).join('')}</div>
      <label>Show<select id="ft"><option value="all">All transport</option>${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === ft ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>`
      + (all.length ? `<h3>Upcoming</h3>${ups.map(row).join('') || '<p class="empty">No upcoming journeys.</p>'}<h3>Previous and cancelled</h3>${rest.map(row).join('') || '<p class="empty">Nothing here yet.</p>'}`
        : '<div class="empty card">You have no bookings yet. <a href="search.html">Find a service</a> to get started.</div>');
    $('#ft').onchange = e => { ft = e.target.value; draw(); };
    $('#bBox').querySelectorAll('[data-c]').forEach(btn => btn.onclick = () => {
      const bk = all.find(x => x.ref === btn.dataset.c), fee = bk.svc.ride && Date.now() - Date.parse(bk.created) > 120000 ? 20 : 0; // demo rule: free cancel within 2 minutes
      if (!confirm(fee ? `A ₹${fee} cancellation fee applies (demo). Cancel this ride?` : 'Cancel this booking?')) return;
      store.set('ut_bookings', store.get('ut_bookings', []).map(x => x.ref === bk.ref ? { ...x, status: 'Cancelled', cancelFee: fee } : x)); draw();
    });
    $('#bBox').querySelectorAll('[data-r]').forEach(sl => sl.onchange = () => {
      if (!sl.value) return;
      store.set('ut_bookings', store.get('ut_bookings', []).map(x => x.ref === sl.dataset.r ? { ...x, rating: +sl.value } : x)); draw();
    });
  };
  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  renderNav(page);
  if ($('#searchForm')) { $('#searchForm').innerHTML = searchForm(Object.fromEntries(new URLSearchParams(location.search))); bindSearchForm(); }
  ({ login: initLogin, search: initSearch, booking: initBooking, ticket: initTicket, profile: initProfile }[page] || (() => {}))();
  document.body.insertAdjacentHTML('beforeend', '<footer>UniTransit - college prototype. Sample data only; no real tickets or payments.</footer>');
});
