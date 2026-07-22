const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const ADMIN_PASSWORD = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || 'admin';

// Polygon zones are loaded from Zones.gs (WIRRAL_TAXI_ZONES + findWirralZone)
function getZone(lat, lng) {
  const f = findWirralZone(lat, lng);
  return f ? f.properties.zoneId : null;
}

const TARIFF = {
  car: { day: { firstMile: 4.50, perMile: 2.20 }, night: { firstMile: 5.50, perMile: 2.80 } },
  mpv: { day: { firstMile: 6.50, perMile: 3.20 }, night: { firstMile: 7.50, perMile: 3.80 } }
};

const AIRPORTS = [
  { name: 'Liverpool', lat: 53.3331, lng: -2.8496, carFare: 60, mpvFare: 75 },
  { name: 'Manchester', lat: 53.3537, lng: -2.2740, carFare: 75, mpvFare: 90 }
];

const JOB_HEADERS = ['created_at','id','status','driver_id','customer_name','customer_phone','pickup_address','dropoff_address','pickup_lat','pickup_lng','dropoff_lat','dropoff_lng','pickup_time','vehicle_type','miles','fare','booking_fee','payment_id','payment_status','commission_rate','commission_amount','tracking_token','on_way_at','arrived_at','pob_at','completed_at'];
const DRIVER_HEADERS = ['id','name','phone','pin','vehicle_type','license_type','vehicle_make_model_colour','reg_last_3','expiry_date','badge_number','status','zone','last_lat','last_lng','last_location_at','commission_rate','settle_balance','available_since'];
const OFFER_HEADERS = ['jobId','currentDriverId','offeredDrivers','expiresAt','pickupLat','pickupLng'];

const SEED_DRIVERS = [
  { id: 'DRV-001', name: 'Dave', phone: '07700111000', pin: '1234', vehicle_type: 'car', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: 0 },
  { id: 'DRV-002', name: 'Sarah', phone: '07700222000', pin: '5678', vehicle_type: 'mpv', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: 0 }
];

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const pathInfo = (e.pathInfo || '').replace(/^\//, '');
    const params = e.parameter || {};
    let body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) {}
    }
    if ((!body || Object.keys(body).length === 0) && params.payload) {
      try { body = JSON.parse(params.payload); } catch (err) {}
    }
    body = { ...params, ...body };
    const route = body.route || params.route || (pathInfo ? '/' + pathInfo : '') || '';
    const driverId = body.driverId || params.driverId || '';
    const adminToken = body.adminToken || params.adminToken || '';
    const result = routeRequest(route, body, params, driverId, adminToken);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

function jsonResponse(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function routeRequest(route, body, params, driverId, adminToken) {
  const r = route.replace(/^\/api\//, '').replace(/^\//, '');
  const parts = r.split('/').filter(Boolean);

  if (r === 'ping') return { ok: true, time: new Date().toISOString() };
  if (r === 'setup') return setupSeed();
  if (r === 'drivers') return { drivers: getAvailableDrivers() };
  if (r === 'booking') return createBooking(body);
  if (r === 'booking/confirm') return confirmBooking(body);
  if (r === 'tracking' && parts.length >= 2) return getTracking(parts[1]);
  if (r === 'driver/login') return driverLogin(body);
  if (r === 'driver/me') return getDriverMe(driverId);
  if (r === 'driver/jobs') return getDriverJobs(driverId);
  if (r === 'driver/offers') return getDriverOffers(driverId);
  if (parts[0] === 'driver' && parts[1] === 'offers' && parts[3] === 'accept') return acceptOffer(parts[2], driverId);
  if (parts[0] === 'driver' && parts[1] === 'offers' && parts[3] === 'decline') return declineOffer(parts[2], driverId);
  if (parts[0] === 'driver' && parts[1] === 'jobs' && parts[3] === 'status') return setJobStatus(parts[2], body, driverId);
  if (r === 'driver/location') return updateDriverLocation(body, driverId);
  if (r === 'admin/login') return adminLogin(body);
  if (r === 'admin/jobs') return requireAdmin(adminToken, () => ({ jobs: getAllJobs() }));
  if (r === 'admin/drivers') return requireAdmin(adminToken, () => ({ drivers: getAllDrivers() }));
  if (r === 'admin/assign') return requireAdmin(adminToken, () => adminAssign(body));

  if (parts[0] === 'admin' && parts[1] === 'drivers') {
    if (parts.length === 2) return requireAdmin(adminToken, () => createAdminDriver(body));
    if (parts.length === 3) return requireAdmin(adminToken, () => updateAdminDriver(parts[2], body));
  }

  return { error: 'Not found: ' + r };
}

function requireAdmin(token, fn) {
  if (!token) throw new Error('Admin not authenticated');
  const cache = CacheService.getScriptCache();
  if (!cache.get(token)) throw new Error('Admin not authenticated');
  return fn();
}

// ---------- Spreadsheet helpers ----------

function getSpreadsheet() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID script property not set');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function getJobsSheet() { return ensureSheet('Jobs', JOB_HEADERS); }
function getDriversSheet() { return ensureSheet('Drivers', DRIVER_HEADERS); }
function getOffersSheet() { return ensureSheet('Offers', OFFER_HEADERS); }

function setupSeed() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Drivers');
  if (sheet) ss.deleteSheet(sheet);
  ensureDrivers();
  return { ok: true, drivers: getDrivers().map(d => ({ id: d.id, name: d.name, status: d.status })) };
}

function rowsToObjects(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = values[i][j];
    out.push(obj);
  }
  return out;
}

function findRowIndex(sheet, predicate) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (predicate(values[i], i)) return i + 1;
  return -1;
}

function ensureDrivers() {
  const sheet = getDriversSheet();
  if (sheet.getLastRow() <= 1) {
    const now = new Date().toISOString();
    SEED_DRIVERS.forEach(d => {
      sheet.appendRow([
        d.id, d.name, d.phone, d.pin, d.vehicle_type, d.license_type, d.vehicle_make_model_colour,
        d.reg_last_3, d.expiry_date, d.badge_number, 'AVAILABLE', '', '', '', '', d.commission_rate, 0, now
      ]);
    });
  }
}

// ---------- Drivers ----------

function getDrivers() { ensureDrivers(); return rowsToObjects(getDriversSheet(), DRIVER_HEADERS); }
function getAvailableDrivers() {
  return getDrivers().filter(d => d.status === 'AVAILABLE' && d.last_lat !== '' && d.last_lng !== '').map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, zone: d.zone, available_since: d.available_since || null,
    last_lat: Number(d.last_lat) || null, last_lng: Number(d.last_lng) || null, status: d.status
  }));
}
function getAllDrivers() {
  return getDrivers().map(d => ({
    id: d.id, name: d.name, phone: d.phone, vehicle_type: d.vehicle_type, license_type: d.license_type,
    vehicle_make_model_colour: d.vehicle_make_model_colour, reg_last_3: d.reg_last_3,
    expiry_date: d.expiry_date, badge_number: d.badge_number, zone: d.zone, commission_rate: Number(d.commission_rate) || 0,
    settle_balance: Number(d.settle_balance) || 0, last_lat: Number(d.last_lat) || null, last_lng: Number(d.last_lng) || null,
    status: d.status
  }));
}
function findDriverById(id) { return getDrivers().find(d => d.id === id); }
function updateDriver(id, updates) {
  const sheet = getDriversSheet();
  const idx = findRowIndex(sheet, row => row[0] === id);
  if (idx < 0) return false;
  const headers = DRIVER_HEADERS;
  const current = {};
  const row = sheet.getRange(idx, 1, 1, headers.length).getValues()[0];
  headers.forEach((h, i) => current[h] = row[i]);
  Object.keys(updates).forEach(k => { if (updates[k] !== undefined) current[k] = updates[k]; });
  const values = headers.map(h => current[h]);
  sheet.getRange(idx, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
  return true;
}

function driverLogin(body) {
  const { driverId, pin } = body || {};
  ensureDrivers();
  const d = findDriverById(String(driverId || ''));
  if (!d || String(d.pin) !== String(pin)) throw new Error('Invalid driver ID or PIN');
  return { ok: true, driverId: d.id, name: d.name, token: Utilities.getUuid() };
}

function getDriverMe(driverId) {
  if (!driverId) throw new Error('No driver ID');
  const d = findDriverById(driverId);
  if (!d) throw new Error('Driver not found');
  return {
    id: d.id, name: d.name, vehicleType: d.vehicle_type, status: d.status,
    settleBalance: Number(d.settle_balance) || 0, commissionRate: Number(d.commission_rate) || 0,
    zone: d.zone, lastLat: Number(d.last_lat) || null, lastLng: Number(d.last_lng) || null,
    lastLocationAt: d.last_location_at || null, availableSince: d.available_since || null
  };
}

function updateDriverLocation(body, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const { lat, lng } = body || {};
  if (lat == null || lng == null) throw new Error('Missing coordinates');
  const d = findDriverById(driverId);
  if (!d) throw new Error('Driver not found');
  updateDriver(driverId, { last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString(), zone: getZone(lat, lng) });
  return { ok: true };
}

// ---------- Jobs ----------

function getJobs() { return rowsToObjects(getJobsSheet(), JOB_HEADERS); }
function getAllJobs() { return getJobs().map(jobResponse); }
function findJobById(id) { return getJobs().find(j => j.id === id); }

function jobResponse(job) {
  const d = job.driver_id ? findDriverById(job.driver_id) : null;
  return {
    jobId: job.id, status: job.status, driverId: job.driver_id || null,
    driverLat: d ? Number(d.last_lat) || null : null, driverLng: d ? Number(d.last_lng) || null : null,
    driverLocationAt: d ? d.last_location_at || null : null,
    customerName: job.customer_name, customerPhone: job.customer_phone,
    pickupAddress: job.pickup_address, dropoffAddress: job.dropoff_address,
    pickupLat: Number(job.pickup_lat) || 0, pickupLng: Number(job.pickup_lng) || 0,
    dropoffLat: Number(job.dropoff_lat) || 0, dropoffLng: Number(job.dropoff_lng) || 0,
    pickupTime: job.pickup_time, vehicleType: job.vehicle_type,
    fare: Number(job.fare) || 0, bookingFee: Number(job.booking_fee) || 0,
    commissionRate: Number(job.commission_rate) || 0, commissionAmount: Number(job.commission_amount) || 0,
    paymentStatus: job.payment_status, trackingToken: job.tracking_token,
    createdAt: job.created_at, onWayAt: job.on_way_at, arrivedAt: job.arrived_at,
    pobAt: job.pob_at, completedAt: job.completed_at
  };
}

function getDriverJobs(driverId) {
  if (!driverId) throw new Error('No driver ID');
  return { jobs: getJobs().filter(j => j.driver_id === driverId).map(jobResponse) };
}

function getTracking(token) {
  const job = getJobs().find(j => j.tracking_token === token);
  if (!job) throw new Error('Tracking link not found');
  return jobResponse(job);
}

function appendJob(valuesMap) {
  const sheet = getJobsSheet();
  const values = JOB_HEADERS.map(h => valuesMap[h] !== undefined ? valuesMap[h] : '');
  sheet.appendRow(values);
  SpreadsheetApp.flush();
}

function updateJob(id, updates) {
  const sheet = getJobsSheet();
  const idx = findRowIndex(sheet, row => row[1] === id);
  if (idx < 0) return false;
  const headers = JOB_HEADERS;
  const current = {};
  const row = sheet.getRange(idx, 1, 1, headers.length).getValues()[0];
  headers.forEach((h, i) => current[h] = row[i]);
  Object.keys(updates).forEach(k => { if (updates[k] !== undefined) current[k] = updates[k]; });
  const values = headers.map(h => current[h]);
  sheet.getRange(idx, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
  return true;
}

// ---------- Booking ----------

function createBooking(body) {
  const p = body || {};
  if (!p.pickupAddress || !p.dropoffAddress || !p.customerName || !p.customerPhone) throw new Error('Missing required fields');
  const miles = Number(p.miles || 0);
  const airportFare = calculateAirportFare(p);
  const fare = airportFare != null ? airportFare : calculateFare({ miles, vehicleType: p.vehicleType || 'car', timeOfDay: p.timeOfDay || 'day' });
  const bookingFee = 1.0;
  const jobId = 'WF-' + shortUuid();
  const token = Utilities.getUuid();

  const queued = findNextQueuedDriver(p.pickupLat || 0, p.pickupLng || 0);
  let assigned = null;
  if (queued) {
    assigned = queued;
    updateDriver(assigned.id, { status: 'BUSY' });
  } else {
    startOffer(jobId, p.pickupLat || 0, p.pickupLng || 0);
  }

  appendJob({
    created_at: new Date().toISOString(),
    id: jobId,
    status: assigned ? 'ASSIGNED' : 'NEW',
    driver_id: assigned ? assigned.id : '',
    customer_name: p.customerName,
    customer_phone: p.customerPhone,
    pickup_address: p.pickupAddress,
    dropoff_address: p.dropoffAddress,
    pickup_lat: p.pickupLat || 0,
    pickup_lng: p.pickupLng || 0,
    dropoff_lat: p.dropoffLat || 0,
    dropoff_lng: p.dropoffLng || 0,
    pickup_time: p.pickupTime || new Date().toISOString(),
    vehicle_type: p.vehicleType || 'car',
    miles: miles,
    fare: fare,
    booking_fee: bookingFee,
    payment_id: '',
    payment_status: 'HELD',
    commission_rate: assigned ? Number(assigned.commission_rate) || 0 : 0,
    commission_amount: '',
    tracking_token: token
  });

  return { ok: true, jobId, fare, bookingFee, trackingToken: token, clientSecret: null };
}

function confirmBooking(body) {
  const { jobId } = body || {};
  if (!jobId) throw new Error('Missing jobId');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.payment_status === 'BOOKING_FEE_PAID') return { ok: true, jobId, fare: Number(job.fare), bookingFee: Number(job.booking_fee), trackingToken: job.tracking_token };
  updateJob(jobId, { payment_status: 'HELD' });
  return { ok: true, jobId, fare: Number(job.fare), bookingFee: Number(job.booking_fee), trackingToken: job.tracking_token };
}

// ---------- Status ----------

function setJobStatus(jobId, body, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const { status } = body || {};
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.driver_id && job.driver_id !== driverId) throw new Error('Not assigned to you');
  if (!['ON_WAY','ARRIVED','POB','COMPLETE'].includes(status)) throw new Error('Invalid status');
  const now = new Date().toISOString();
  const updates = { status };
  if (status === 'ON_WAY') updates.on_way_at = now;
  if (status === 'ARRIVED') updates.arrived_at = now;
  if (status === 'POB') updates.pob_at = now;
  if (status === 'COMPLETE') updates.completed_at = now;
  updateJob(jobId, updates);

  if (status === 'COMPLETE') {
    const driver = findDriverById(driverId);
    const rate = Number(driver?.commission_rate) || 0;
    const commission = rate > 0 ? Math.round(job.fare * rate) / 100 : 0;
    updateDriver(driverId, {
      status: 'AVAILABLE',
      available_since: now,
      settle_balance: (Number(driver?.settle_balance) || 0) + commission
    });
    updateJob(jobId, { commission_amount: commission });
  }
  return { ok: true, status };
}

// ---------- Offers ----------

function getOffers() { return rowsToObjects(getOffersSheet(), OFFER_HEADERS); }

function startOffer(jobId, pickupLat, pickupLng) {
  const driver = findNextQueuedDriver(pickupLat, pickupLng, []);
  if (!driver) return;
  const offered = JSON.stringify([driver.id]);
  const expiresAt = Date.now() + 60000;
  getOffersSheet().appendRow([jobId, driver.id, offered, expiresAt, pickupLat, pickupLng]);
  SpreadsheetApp.flush();
}

function offerRowIndex(jobId) {
  return findRowIndex(getOffersSheet(), row => row[0] === jobId);
}

function advanceOffers() {
  const sheet = getOffersSheet();
  const offers = getOffers();
  const now = Date.now();
  offers.forEach(offer => {
    if (Number(offer.expiresAt) > now) return;
    const offered = JSON.parse(offer.offeredDrivers || '[]');
    const next = findNextQueuedDriver(Number(offer.pickupLat), Number(offer.pickupLng), offered);
    const idx = offerRowIndex(offer.jobId);
    if (!next) {
      sheet.deleteRow(idx);
    } else {
      offered.push(next.id);
      sheet.getRange(idx, 2, 1, 4).setValues([[next.id, JSON.stringify(offered), Date.now() + 60000, offer.pickupLat]]);
    }
  });
  SpreadsheetApp.flush();
}

function getDriverOffers(driverId) {
  if (!driverId) throw new Error('No driver ID');
  advanceOffers();
  const now = Date.now();
  const offers = getOffers().filter(o => o.currentDriverId === driverId && Number(o.expiresAt) > now);
  const out = offers.map(o => {
    const job = findJobById(o.jobId);
    return {
      jobId: o.jobId,
      pickupAddress: job?.pickup_address || '',
      dropoffAddress: job?.dropoff_address || '',
      pickupLat: Number(job?.pickup_lat) || 0,
      pickupLng: Number(job?.pickup_lng) || 0,
      fare: Number(job?.fare) || 0,
      vehicleType: job?.vehicle_type || 'car',
      expiresAt: Number(o.expiresAt)
    };
  });
  return { offers: out };
}

function acceptOffer(jobId, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const idx = offerRowIndex(jobId);
  if (idx < 0) throw new Error('No active offer');
  const sheet = getOffersSheet();
  const row = sheet.getRange(idx, 1, 1, OFFER_HEADERS.length).getValues()[0];
  if (row[1] !== driverId) throw new Error('No active offer');
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver not found');
  updateJob(jobId, { status: 'ASSIGNED', driver_id: driverId, commission_rate: Number(driver.commission_rate) || 0 });
  updateDriver(driverId, { status: 'BUSY' });
  sheet.deleteRow(idx);
  SpreadsheetApp.flush();
  return { ok: true, status: 'ASSIGNED', driverId };
}

function declineOffer(jobId, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const idx = offerRowIndex(jobId);
  if (idx < 0) throw new Error('No active offer');
  const sheet = getOffersSheet();
  const row = sheet.getRange(idx, 1, 1, OFFER_HEADERS.length).getValues()[0];
  if (row[1] !== driverId) throw new Error('No active offer');
  const offered = JSON.parse(row[2] || '[]');
  const next = findNextQueuedDriver(Number(row[4]), Number(row[5]), offered);
  if (!next) {
    sheet.deleteRow(idx);
  } else {
    offered.push(next.id);
    sheet.getRange(idx, 2, 1, 3).setValues([[next.id, JSON.stringify(offered), Date.now() + 60000]]);
  }
  SpreadsheetApp.flush();
  return { ok: true };
}

// ---------- Allocation ----------

function findNextQueuedDriver(pickupLat, pickupLng, excludeIds) {
  ensureDrivers();
  const drivers = getDrivers().filter(d => d.status === 'AVAILABLE' && d.last_lat !== '' && d.last_lng !== '' && !excludeIds.includes(d.id));
  if (drivers.length === 0) return null;
  const pickupZone = getZone(pickupLat, pickupLng);
  drivers.sort((a, b) => {
    const aSame = a.zone === pickupZone ? 0 : 1;
    const bSame = b.zone === pickupZone ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    const da = distanceMiles(pickupLat, pickupLng, Number(a.last_lat), Number(a.last_lng));
    const db = distanceMiles(pickupLat, pickupLng, Number(b.last_lat), Number(b.last_lng));
    if (da !== db) return da - db;
    const ta = a.available_since ? new Date(a.available_since).getTime() : 0;
    const tb = b.available_since ? new Date(b.available_since).getTime() : 0;
    return ta - tb;
  });
  return drivers[0];
}

// ---------- Admin ----------

function adminLogin(body) {
  const { password } = body || {};
  if (!password || password !== ADMIN_PASSWORD) throw new Error('Invalid admin password');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(token, '1', 3600);
  return { token };
}

function adminAssign(body) {
  const { jobId, driverId } = body || {};
  const job = findJobById(jobId);
  const driver = findDriverById(driverId);
  if (!job || !driver) throw new Error('Job or driver not found');
  if (['COMPLETE','CANCELLED'].includes(job.status)) throw new Error('Job already closed');
  const idx = offerRowIndex(jobId);
  if (idx >= 0) getOffersSheet().deleteRow(idx);
  updateJob(jobId, { status: 'ASSIGNED', driver_id: driverId, commission_rate: Number(driver.commission_rate) || 0 });
  updateDriver(driverId, { status: 'BUSY' });
  return { ok: true, status: 'ASSIGNED', driverId };
}

function createAdminDriver(body) {
  const { id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate } = body || {};
  if (!id || !name || !phone || !pin || !vehicle_type) throw new Error('Missing driver fields');
  const now = new Date().toISOString();
  getDriversSheet().appendRow([
    id, name, phone, pin, vehicle_type, license_type || 'private_hire', vehicle_make_model_colour || '',
    reg_last_3 || '', expiry_date || '', badge_number || '', 'AVAILABLE', '', '', '', '',
    Number(commission_rate) || 0, 0, now
  ]);
  SpreadsheetApp.flush();
  return { ok: true, driverId: id };
}

function updateAdminDriver(id, body) {
  const d = findDriverById(id);
  if (!d) throw new Error('Driver not found');
  const { name, phone, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate } = body || {};
  updateDriver(id, {
    name: name !== undefined ? name : d.name,
    phone: phone !== undefined ? phone : d.phone,
    vehicle_type: vehicle_type !== undefined ? vehicle_type : d.vehicle_type,
    license_type: license_type !== undefined ? license_type : d.license_type,
    vehicle_make_model_colour: vehicle_make_model_colour !== undefined ? vehicle_make_model_colour : d.vehicle_make_model_colour,
    reg_last_3: reg_last_3 !== undefined ? reg_last_3 : d.reg_last_3,
    expiry_date: expiry_date !== undefined ? expiry_date : d.expiry_date,
    badge_number: badge_number !== undefined ? badge_number : d.badge_number,
    commission_rate: commission_rate !== undefined ? Number(commission_rate) || 0 : Number(d.commission_rate) || 0
  });
  return { ok: true, driverId: id };
}

// ---------- Fare / zone helpers ----------

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getZone(lat, lng) {
  if (lat == null || lng == null) return '';
  for (const z of ZONES) if (distanceMiles(lat, lng, z.lat, z.lng) <= z.radiusMiles) return z.id;
  return '';
}

function calculateAirportFare(p) {
  if (p.pickupLat == null || p.pickupLng == null || p.dropoffLat == null || p.dropoffLng == null) return null;
  for (const a of AIRPORTS) {
    const nearPickup = distanceMiles(p.pickupLat, p.pickupLng, a.lat, a.lng) <= 2;
    const nearDropoff = distanceMiles(p.dropoffLat, p.dropoffLng, a.lat, a.lng) <= 2;
    if (nearPickup || nearDropoff) return p.vehicleType === 'mpv' ? a.mpvFare : a.carFare;
  }
  return null;
}

function calculateFare({ miles, vehicleType, timeOfDay }) {
  const m = Math.max(0, Number(miles) || 0);
  const rates = (TARIFF[vehicleType] && TARIFF[vehicleType][timeOfDay]) ? TARIFF[vehicleType][timeOfDay] : TARIFF.car.day;
  if (m <= 1) return rates.firstMile;
  return rates.firstMile + rates.perMile * (m - 1);
}

function shortUuid() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}
