const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const ADMIN_PASSWORD = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
const FUTURE_ALLOCATION_WINDOW_MINUTES = 45;
const DRIVER_LOCATION_FRESHNESS_MINUTES = 5;

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

const JOB_HEADERS = ['created_at','id','status','driver_id','customer_name','customer_phone','pickup_address','dropoff_address','pickup_lat','pickup_lng','dropoff_lat','dropoff_lng','pickup_time','vehicle_type','miles','fare','booking_fee','payment_id','payment_status','commission_rate','commission_amount','tracking_token','on_way_at','arrived_at','pob_at','completed_at','customer_id','passengers','notes','return_job_id','cancelled_at','updated_at'];
const DRIVER_HEADERS = ['id','name','phone','pin','vehicle_type','license_type','vehicle_make_model_colour','reg_last_3','expiry_date','badge_number','status','zone','last_lat','last_lng','last_location_at','commission_rate','settle_balance','available_since','created_at','updated_at','pin_hash'];
const OFFER_HEADERS = ['jobId','currentDriverId','offeredDrivers','expiresAt','pickupLat','pickupLng'];
const BID_HEADERS = ['created_at','job_id','driver_id','amount','status'];
const CUSTOMER_HEADERS = ['id','name','phone','pin_hash','created_at'];
const PLACE_HEADERS = ['id','customer_id','label','address','lat','lng','type','created_at'];
const DRIVER_APPLICATION_HEADERS = ['id','status','badge_url','badge_public_id','continuation_token','name','phone','pin_hash','vehicle_type','license_type','vehicle_make_model_colour','reg_last_3','expiry_date','badge_number','created_at','submitted_at','reviewed_at','reviewed_by','rejection_reason','driver_id'];

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
    const driverToken = body.driverToken || params.driverToken || '';
    const adminToken = body.adminToken || params.adminToken || '';
    const result = routeRequest(route, body, params, driverId, driverToken, adminToken);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

function jsonResponse(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function routeRequest(route, body, params, driverId, driverToken, adminToken) {
  const r = route.replace(/^\/api\//, '').replace(/^\//, '');
  const parts = r.split('/').filter(Boolean);

  if (r === 'ping') return { ok: true, time: new Date().toISOString() };
  if (r === 'setup') return requireAdmin(adminToken, () => setupSeed());
  if (r === 'drivers') return { drivers: getAvailableDrivers() };
  if (r === 'booking') return createBooking(body);
  if (r === 'booking/confirm') return confirmBooking(body);
  if (r === 'tracking' && parts.length >= 2) return getTracking(parts[1]);
  if (r === 'customer/register') return customerRegister(body);
  if (r === 'customer/login') return customerLogin(body);
  if (r === 'customer/forgot-pin') return customerForgotPin(body);
  if (r === 'customer/me') return getCustomerMe(body.customerToken);
  if (r === 'customer/jobs') return getCustomerJobs(body.customerToken);
  if (r === 'customer/places') return getCustomerPlaces(body.customerToken);
  if (r === 'customer/places/add') return addCustomerPlace(body.customerToken, body);
  if (r === 'customer/places/delete') return deleteCustomerPlace(body.customerToken, body.placeId);
  if (r === 'driver/applications/upload-signature') return driverBadgeUploadSignature();
  if (r === 'driver/applications/start') return startDriverApplication(body);
  if (parts[0] === 'driver' && parts[1] === 'applications' && parts.length === 3) return getDriverApplication(parts[2]);
  if (parts[0] === 'driver' && parts[1] === 'applications' && parts[3] === 'submit') return submitDriverApplication(parts[2], body);
  if (r === 'driver/login') return driverLogin(body);
  if (r === 'driver/me') return getDriverMe(requireDriver(driverId, driverToken).id);
  if (r === 'driver/jobs') return getDriverJobs(requireDriver(driverId, driverToken).id);
  if (r === 'driver/availability') return setDriverAvailability(body, requireDriver(driverId, driverToken).id);
  if (r === 'driver/offers') return getDriverOffers(requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'offers' && parts[3] === 'accept') return acceptOffer(parts[2], requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'offers' && parts[3] === 'decline') return declineOffer(parts[2], requireDriver(driverId, driverToken).id);
  if (r === 'driver/bid-board') return getBidBoard(requireDriver(driverId, driverToken).id);
  if (r === 'driver/my-bids') return getMyBids(requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'bid-board' && parts[3] === 'bid') return placeBid(parts[2], body, requireDriver(driverId, driverToken).id);
  if (r === 'driver/future-bookings') return getDriverFutureBookings(requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'future-bookings' && parts[3] === 'accept') return acceptFutureBooking(parts[2], requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'jobs' && parts[3] === 'status') return setJobStatus(parts[2], body, requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'jobs' && parts[3] === 'vehicle') return changeJobVehicle(parts[2], body, requireDriver(driverId, driverToken).id);
  if (r === 'driver/location') return updateDriverLocation(body, requireDriver(driverId, driverToken).id);
  if (r === 'admin/login') return adminLogin(body);
  if (r === 'admin/jobs') return requireAdmin(adminToken, () => ({ jobs: getAllJobs() }));
  if (r === 'admin/drivers') return requireAdmin(adminToken, () => ({ drivers: getAllDrivers() }));
  if (r === 'admin/assign') return requireAdmin(adminToken, () => adminAssign(body));
  if (r === 'admin/driver-applications') return requireAdmin(adminToken, () => ({ applications: getDriverApplications() }));
  if (parts[0] === 'admin' && parts[1] === 'driver-applications' && parts[3] === 'approve-badge') return requireAdmin(adminToken, () => approveDriverBadge(parts[2]));
  if (parts[0] === 'admin' && parts[1] === 'driver-applications' && parts[3] === 'approve') return requireAdmin(adminToken, () => approveDriverApplication(parts[2]));
  if (parts[0] === 'admin' && parts[1] === 'driver-applications' && parts[3] === 'reject') return requireAdmin(adminToken, () => rejectDriverApplication(parts[2], body));

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
function getBidsSheet() { return ensureSheet('Bids', BID_HEADERS); }
function getDriverApplicationsSheet() { return ensureSheet('Driver Applications', DRIVER_APPLICATION_HEADERS); }
function getAuditLogSheet() { return ensureSheet('Audit Log', ['id', 'actor_type', 'actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at']); }
function writeAudit(actorType, actorId, action, entityType, entityId, metadata) {
  getAuditLogSheet().appendRow([Utilities.getUuid(), actorType, actorId || '', action, entityType, entityId || '', JSON.stringify(metadata || {}), new Date().toISOString()]);
}

function setupSeed() {
  ensureDrivers();
  return { ok: true, drivers: getDrivers().map(d => ({ id: d.id, name: d.name, status: d.status })) };
}

function seedDemoDrivers() {
  ensureDrivers();
  return { ok: true, drivers: getDrivers().map(d => ({ id: d.id, name: d.name, pin: d.pin, status: d.status })) };
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

// ---------- Customers ----------

function getCustomersSheet() { return ensureSheet('Customers', CUSTOMER_HEADERS); }
function getPlacesSheet() { return ensureSheet('Saved Places', PLACE_HEADERS); }
function normalizePhone(phone) {
  const raw = String(phone || '').replace(/[\s()-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('0')) return '+44' + raw.substring(1);
  return raw;
}
function hashPin(pin) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin));
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
function newPin() { return String(Math.floor(100000 + Math.random() * 900000)); }
function getCustomers() { return rowsToObjects(getCustomersSheet(), CUSTOMER_HEADERS); }
function findCustomerByPhone(phone) { return getCustomers().find(c => c.phone === normalizePhone(phone)); }
function customerSession(customerId) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('customer:' + token, customerId, 21600);
  return token;
}
function requireCustomer(token) {
  const id = token ? CacheService.getScriptCache().get('customer:' + token) : null;
  if (!id) throw new Error('Customer session expired. Please log in again.');
  const customer = getCustomers().find(c => c.id === id);
  if (!customer) throw new Error('Customer account not found');
  return customer;
}
function sendTwilioSms(to, body) {
  const properties = PropertiesService.getScriptProperties();
  const sid = properties.getProperty('TWILIO_ACCOUNT_SID');
  const authToken = properties.getProperty('TWILIO_AUTH_TOKEN');
  const from = properties.getProperty('TWILIO_FROM_NUMBER');
  const serviceSid = properties.getProperty('TWILIO_MESSAGING_SERVICE_SID');
  if (!sid || !authToken || (!from && !serviceSid)) throw new Error('SMS service is not configured');
  const payload = { To: normalizePhone(to), Body: body };
  if (serviceSid) payload.MessagingServiceSid = serviceSid; else payload.From = from;
  const response = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'post', payload: payload,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + authToken) },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error('Unable to send SMS');
}
function customerResponse(customer) { return { id: customer.id, name: customer.name, phone: customer.phone }; }
function customerSmsEnabled() { return PropertiesService.getScriptProperties().getProperty('SMS_ENABLED') === 'true'; }
function squarePaymentsEnabled() {
  const properties = PropertiesService.getScriptProperties();
  return Boolean(properties.getProperty('SQUARE_ACCESS_TOKEN') && properties.getProperty('SQUARE_LOCATION_ID'));
}
function squareIdempotencyKey(jobId, sourceId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sourceId)
    .map(byte => (byte + 256).toString(16).slice(-2))
    .join('');
  return 'w-' + jobId + '-' + digest.slice(0, 30);
}

function createSquarePayment(job, sourceId) {
  if (!sourceId) throw new Error('Card details are required');
  const properties = PropertiesService.getScriptProperties();
  const accessToken = properties.getProperty('SQUARE_ACCESS_TOKEN');
  const locationId = properties.getProperty('SQUARE_LOCATION_ID');
  if (!accessToken || !locationId) throw new Error('Square payments are not configured');
  const payload = {
    source_id: sourceId,
    idempotency_key: squareIdempotencyKey(job.id, sourceId),
    amount_money: { amount: Math.round(Number(job.booking_fee) * 100), currency: 'GBP' },
    location_id: locationId,
    reference_id: job.id,
    note: 'The Wirral Jobe booking fee for ' + job.id
  };
  const response = UrlFetchApp.fetch('https://connect.squareup.com/v2/payments', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken, 'Square-Version': '2024-06-04' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() >= 300 || !data.payment) {
    const message = data.errors && data.errors[0] && data.errors[0].detail;
    throw new Error(message || 'Square could not process the payment');
  }
  if (data.payment.status !== 'COMPLETED') throw new Error('Square payment status: ' + data.payment.status);
  return data.payment;
}
function customerRegister(body) {
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const smsEnabled = customerSmsEnabled();
  const pin = smsEnabled ? newPin() : String(body.pin || '');
  if (!name || !phone || phone.length < 10) throw new Error('Please enter your name and mobile number');
  if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit PIN');
  if (findCustomerByPhone(phone)) throw new Error('An account already exists for this mobile number. Please log in.');
  const customer = { id: 'CUS-' + shortUuid(), name: name, phone: phone, pin_hash: hashPin(pin), created_at: new Date().toISOString() };
  getCustomersSheet().appendRow(CUSTOMER_HEADERS.map(h => customer[h]));
  if (smsEnabled) sendTwilioSms(phone, 'The Wirral Jobe: your customer PIN is ' + pin + '. Keep it safe; you will need it to log in.');
  return { ok: true, customer: customerResponse(customer), customerToken: customerSession(customer.id), developmentPin: smsEnabled ? null : pin };
}
function customerLogin(body) {
  const customer = findCustomerByPhone(body.phone);
  if (!customer || customer.pin_hash !== hashPin(body.pin || '')) throw new Error('Invalid mobile number or PIN');
  return { ok: true, customer: customerResponse(customer), customerToken: customerSession(customer.id) };
}
function customerForgotPin(body) {
  const customer = findCustomerByPhone(body.phone);
  if (!customer) return { ok: true };
  const pin = newPin();
  const row = findRowIndex(getCustomersSheet(), row => row[0] === customer.id);
  getCustomersSheet().getRange(row, 4).setValue(hashPin(pin));
  const smsEnabled = customerSmsEnabled();
  if (smsEnabled) sendTwilioSms(customer.phone, 'The Wirral Jobe: your new customer PIN is ' + pin + '. Use it to log in.');
  return { ok: true, developmentPin: smsEnabled ? null : pin };
}
function getCustomerMe(token) { return { customer: customerResponse(requireCustomer(token)) }; }
function getCustomerJobs(token) {
  const customer = requireCustomer(token);
  return { jobs: getJobs().filter(job => job.customer_id === customer.id || (!job.customer_id && normalizePhone(job.customer_phone) === customer.phone)).map(jobResponse).sort((a, b) => new Date(b.pickupTime) - new Date(a.pickupTime)) };
}
function getCustomerPlaces(token) {
  const customer = requireCustomer(token);
  return { places: rowsToObjects(getPlacesSheet(), PLACE_HEADERS).filter(place => place.customer_id === customer.id).map(place => ({ id: place.id, label: place.label, address: place.address, lat: Number(place.lat), lng: Number(place.lng), type: place.type })) };
}
function addCustomerPlace(token, body) {
  const customer = requireCustomer(token);
  if (!body.label || !body.address || body.lat == null || body.lng == null) throw new Error('Please provide a label, address and location');
  const place = { id: 'PLC-' + shortUuid(), customer_id: customer.id, label: String(body.label).trim(), address: String(body.address).trim(), lat: Number(body.lat), lng: Number(body.lng), type: body.type === 'dropoff' ? 'dropoff' : 'pickup', created_at: new Date().toISOString() };
  getPlacesSheet().appendRow(PLACE_HEADERS.map(h => place[h]));
  return { ok: true, place: place };
}
function deleteCustomerPlace(token, placeId) {
  const customer = requireCustomer(token);
  const sheet = getPlacesSheet();
  const row = findRowIndex(sheet, row => row[0] === placeId && row[1] === customer.id);
  if (row < 0) throw new Error('Saved place not found');
  sheet.deleteRow(row);
  return { ok: true };
}

// ---------- Drivers ----------

function getDrivers() { ensureDrivers(); return rowsToObjects(getDriversSheet(), DRIVER_HEADERS); }
function isDriverLocationFresh(driver) {
  const timestamp = new Date(driver.last_location_at || 0).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - DRIVER_LOCATION_FRESHNESS_MINUTES * 60000;
}
function getAvailableDrivers() {
  return getDrivers().filter(d => d.status === 'AVAILABLE').map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, zone: driverZone(d), available_since: d.available_since || null,
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

function cloudinarySignature(value, secret) {
  return Utilities.computeHmacSha1Signature(value, secret).map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

function driverBadgeUploadSignature() {
  const properties = PropertiesService.getScriptProperties();
  const cloudName = properties.getProperty('CLOUDINARY_CLOUD_NAME');
  const apiKey = properties.getProperty('CLOUDINARY_API_KEY');
  const apiSecret = properties.getProperty('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Driver badge uploads are not configured yet');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'wirral-jobe/driver-badges';
  return { cloudName, apiKey, timestamp, folder, signature: cloudinarySignature('folder=' + folder + '&timestamp=' + timestamp, apiSecret) };
}

function getDriverApplications() {
  return rowsToObjects(getDriverApplicationsSheet(), DRIVER_APPLICATION_HEADERS).map(applicationResponse).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function findDriverApplication(token) {
  return rowsToObjects(getDriverApplicationsSheet(), DRIVER_APPLICATION_HEADERS).find(application => application.continuation_token === token);
}

function applicationResponse(application) {
  return {
    id: application.id, status: application.status, badgeUrl: application.badge_url, continuationToken: application.continuation_token,
    name: application.name, phone: application.phone, vehicleType: application.vehicle_type, licenseType: application.license_type,
    vehicleMakeModelColour: application.vehicle_make_model_colour, regLast3: application.reg_last_3, expiryDate: application.expiry_date,
    badgeNumber: application.badge_number, createdAt: application.created_at, submittedAt: application.submitted_at,
    reviewedAt: application.reviewed_at, rejectionReason: application.rejection_reason, driverId: application.driver_id
  };
}

function updateDriverApplication(id, updates) {
  const sheet = getDriverApplicationsSheet();
  const rowNumber = findRowIndex(sheet, row => row[0] === id);
  if (rowNumber < 0) throw new Error('Driver application not found');
  const current = {};
  const row = sheet.getRange(rowNumber, 1, 1, DRIVER_APPLICATION_HEADERS.length).getValues()[0];
  DRIVER_APPLICATION_HEADERS.forEach((header, index) => current[header] = row[index]);
  Object.keys(updates).forEach(key => { if (updates[key] !== undefined) current[key] = updates[key]; });
  sheet.getRange(rowNumber, 1, 1, DRIVER_APPLICATION_HEADERS.length).setValues([DRIVER_APPLICATION_HEADERS.map(header => current[header])]);
  SpreadsheetApp.flush();
}

function startDriverApplication(body) {
  const badgeUrl = String(body.badgeUrl || '');
  const badgePublicId = String(body.badgePublicId || '');
  if (!/^https:\/\//.test(badgeUrl) || !badgePublicId) throw new Error('Please upload a clear badge photo first');
  const application = {
    id: 'APP-' + shortUuid(), status: 'BADGE_REVIEW', badge_url: badgeUrl, badge_public_id: badgePublicId,
    continuation_token: Utilities.getUuid(), created_at: new Date().toISOString()
  };
  getDriverApplicationsSheet().appendRow(DRIVER_APPLICATION_HEADERS.map(header => application[header] || ''));
  return { ok: true, status: 'BADGE_REVIEW' };
}

function getDriverApplication(token) {
  const application = findDriverApplication(token);
  if (!application || application.status !== 'BADGE_APPROVED') throw new Error('This application link is invalid or is not ready yet');
  return { application: applicationResponse(application) };
}

function submitDriverApplication(token, body) {
  const application = findDriverApplication(token);
  if (!application || application.status !== 'BADGE_APPROVED') throw new Error('This application cannot be submitted');
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const pin = String(body.pin || '');
  const vehicleType = body.vehicleType === 'mpv' ? 'mpv' : 'car';
  if (!name || phone.length < 10 || !/^\d{4,8}$/.test(pin)) throw new Error('Enter your name, mobile number, and a 4 to 8 digit PIN');
  if (getDrivers().some(driver => normalizePhone(driver.phone) === phone)) throw new Error('A driver account already exists for this mobile number');
  updateDriverApplication(application.id, {
    status: 'PENDING_REVIEW', name, phone, pin_hash: hashPin(pin), vehicle_type: vehicleType,
    license_type: body.licenseType === 'hackney' ? 'hackney' : 'private_hire',
    vehicle_make_model_colour: String(body.vehicleMakeModelColour || '').trim(), reg_last_3: String(body.regLast3 || '').trim().toUpperCase(),
    expiry_date: String(body.expiryDate || ''), badge_number: String(body.badgeNumber || '').trim(), submitted_at: new Date().toISOString()
  });
  return { ok: true, status: 'PENDING_REVIEW' };
}

function approveDriverBadge(applicationId) {
  const application = rowsToObjects(getDriverApplicationsSheet(), DRIVER_APPLICATION_HEADERS).find(item => item.id === applicationId);
  if (!application || application.status !== 'BADGE_REVIEW') throw new Error('Badge is not awaiting review');
  updateDriverApplication(application.id, { status: 'BADGE_APPROVED', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' });
  return { ok: true, continuationToken: application.continuation_token };
}

function approveDriverApplication(applicationId) {
  const application = rowsToObjects(getDriverApplicationsSheet(), DRIVER_APPLICATION_HEADERS).find(item => item.id === applicationId);
  if (!application || application.status !== 'PENDING_REVIEW') throw new Error('Driver application is not awaiting review');
  if (getDrivers().some(driver => normalizePhone(driver.phone) === normalizePhone(application.phone))) throw new Error('A driver account already exists for this mobile number');
  const driverId = 'DRV-' + shortUuid().toUpperCase();
  const now = new Date().toISOString();
  const driver = {
    id: driverId, name: application.name, phone: application.phone, pin: '', pin_hash: application.pin_hash, vehicle_type: application.vehicle_type,
    license_type: application.license_type, vehicle_make_model_colour: application.vehicle_make_model_colour, reg_last_3: application.reg_last_3,
    expiry_date: application.expiry_date, badge_number: application.badge_number, status: 'AVAILABLE', zone: '', last_lat: '', last_lng: '',
    last_location_at: '', commission_rate: 0, settle_balance: 0, available_since: now
  };
  getDriversSheet().appendRow(DRIVER_HEADERS.map(header => driver[header] !== undefined ? driver[header] : ''));
  updateDriverApplication(application.id, { status: 'APPROVED', reviewed_at: now, reviewed_by: 'admin', driver_id: driverId });
  return { ok: true, driverId };
}

function rejectDriverApplication(applicationId, body) {
  const application = rowsToObjects(getDriverApplicationsSheet(), DRIVER_APPLICATION_HEADERS).find(item => item.id === applicationId);
  if (!application || !['BADGE_REVIEW', 'PENDING_REVIEW'].includes(application.status)) throw new Error('Driver application is not awaiting review');
  updateDriverApplication(application.id, { status: 'REJECTED', reviewed_at: new Date().toISOString(), reviewed_by: 'admin', rejection_reason: String(body.reason || 'Application not approved') });
  return { ok: true };
}

function driverSession(driverId) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('driver:' + token, driverId, 21600);
  return token;
}

function requireDriver(driverId, token) {
  const sessionDriverId = token ? CacheService.getScriptCache().get('driver:' + token) : null;
  if (!sessionDriverId || sessionDriverId !== driverId) throw new Error('Driver session expired. Please log in again.');
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver account not found');
  return driver;
}

function driverPinMatches(driver, pin) {
  if (driver.pin_hash) return driver.pin_hash === hashPin(pin);
  if (String(driver.pin || '') !== String(pin || '')) return false;
  updateDriver(driver.id, { pin: '', pin_hash: hashPin(pin) });
  return true;
}

function driverLogin(body) {
  const { driverId, pin } = body || {};
  ensureDrivers();
  const d = findDriverById(String(driverId || ''));
  if (!d || !driverPinMatches(d, pin)) throw new Error('Invalid driver ID or PIN');
  return { ok: true, driverId: d.id, name: d.name, token: driverSession(d.id) };
}

function driverZone(d) {
  const lat = Number(d.last_lat);
  const lng = Number(d.last_lng);
  if (lat && lng) return getZone(lat, lng) || d.zone || null;
  return d.zone || null;
}

function getDriverMe(driverId) {
  if (!driverId) throw new Error('No driver ID');
  const d = findDriverById(driverId);
  if (!d) throw new Error('Driver not found');
  return {
    id: d.id, name: d.name, vehicleType: d.vehicle_type, status: d.status,
    settleBalance: Number(d.settle_balance) || 0, commissionRate: Number(d.commission_rate) || 0,
    zone: driverZone(d), lastLat: Number(d.last_lat) || null, lastLng: Number(d.last_lng) || null,
    lastLocationAt: d.last_location_at || null, availableSince: d.available_since || null
  };
}

function setDriverAvailability(body, driverId) {
  const status = String(body.status || '').toUpperCase();
  if (!['AVAILABLE', 'BREAK', 'OFFLINE'].includes(status)) throw new Error('Invalid availability status');
  const activeJob = getJobs().some(job => job.driver_id === driverId && !['COMPLETE', 'CANCELLED'].includes(job.status));
  if (status !== 'AVAILABLE' && activeJob) throw new Error('Finish your active job before taking a break or logging out.');
  const now = new Date().toISOString();
  updateDriver(driverId, { status, available_since: status === 'AVAILABLE' ? now : '' });
  if (status === 'AVAILABLE') allocatePendingAsapJobs();
  return { ok: true, status };
}

function updateDriverLocation(body, driverId) {
  Logger.log('updateDriverLocation: driverId=%s lat=%s lng=%s', driverId, body ? body.lat : null, body ? body.lng : null);
  if (!driverId) throw new Error('No driver ID');
  const { lat, lng } = body || {};
  if (lat == null || lng == null) throw new Error('Missing coordinates');
  const d = findDriverById(driverId);
  if (!d) throw new Error('Driver not found');
  updateDriver(driverId, { last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString(), zone: getZone(lat, lng) });
  Logger.log('updateDriverLocation: driver %s location updated, zone=%s', driverId, getZone(lat, lng));
  allocatePendingAsapJobs();
  return { ok: true };
}

// ---------- Jobs ----------

function getJobs() { return rowsToObjects(getJobsSheet(), JOB_HEADERS); }
function getAllJobs() { allocateScheduledJobs(); return getJobs().map(jobResponse); }
function runScheduledAllocation() {
  allocateScheduledJobs();
}

function allocateScheduledJobs() {
  const cutoff = Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  getJobs().filter(job => job.status === 'SCHEDULED' && new Date(job.pickup_time).getTime() <= cutoff).forEach(job => {
    startOffer(job.id, Number(job.pickup_lat), Number(job.pickup_lng));
    updateJob(job.id, { status: 'NEW', updated_at: new Date().toISOString() });
  });
}
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

function getDriverFutureBookings(driverId) {
  if (!driverId) throw new Error('No driver ID');
  const cutoff = Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  const jobs = getJobs().filter(j => {
    const pickupTime = new Date(j.pickup_time).getTime();
    const isFuture = pickupTime > cutoff;
    return (j.status === 'SCHEDULED' || (j.status === 'NEW' && isFuture)) && (j.driver_id === '' || j.driver_id === driverId);
  });
  return { jobs: jobs.map(jobResponse) };
}

function acceptFutureBooking(jobId, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.driver_id && job.driver_id !== driverId) throw new Error('Already assigned to another driver');
  if (!['SCHEDULED', 'NEW'].includes(job.status)) throw new Error('Job is no longer a future booking');
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver not found');
  const now = new Date().toISOString();
  updateJob(jobId, { driver_id: driverId, commission_rate: Number(driver.commission_rate) || 0, updated_at: now });
  writeAudit('driver', driverId, 'future_booking_accepted', 'job', jobId, {});
  return { ok: true, jobId, driverId };
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

function allocateImmediateJob(jobId) {
  Logger.log('allocateImmediateJob: jobId=%s', jobId);
  const job = findJobById(jobId);
  if (!job || job.status !== 'NEW') {
    Logger.log('allocateImmediateJob: job not found or status=%s', job ? job.status : 'null');
    return;
  }
  if (offerRowIndex(jobId) < 0) {
    Logger.log('allocateImmediateJob: no existing offer, starting offer');
    startOffer(jobId, Number(job.pickup_lat), Number(job.pickup_lng));
    writeAudit('system', '', 'job_offered', 'job', jobId, {});
  } else {
    Logger.log('allocateImmediateJob: offer already exists');
  }
}

function isJobReadyForOffer(job) {
  if (job.status !== 'NEW') return false;
  if (job.payment_status === 'BOOKING_FEE_PAID') return true;
  return !squarePaymentsEnabled();
}

function allocatePendingAsapJobs() {
  getJobs().filter(isJobReadyForOffer).forEach(job => allocateImmediateJob(job.id));
}

function createBooking(body) {
  const p = body || {};
  const customer = p.customerToken ? requireCustomer(p.customerToken) : null;
  const customerName = customer ? customer.name : String(p.customerName || '').trim();
  const customerPhone = customer ? customer.phone : normalizePhone(p.customerPhone);
  if (!p.pickupAddress || !p.dropoffAddress || !customerName || !customerPhone) throw new Error('Missing required fields');
  if (![p.pickupLat, p.pickupLng, p.dropoffLat, p.dropoffLng].every(value => Number.isFinite(Number(value)))) throw new Error('Please select valid pickup and destination addresses');
  const miles = Number(p.miles || 0);
  const airportFare = calculateAirportFare(p);
  const fare = airportFare != null ? airportFare : calculateFare({ miles, vehicleType: p.vehicleType || 'car', timeOfDay: p.timeOfDay || 'day' });
  const bookingFee = 1.0;
  const jobId = 'WF-' + shortUuid();
  const token = Utilities.getUuid();

  const pickupTime = new Date(p.pickupTime || new Date().toISOString());
  if (Number.isNaN(pickupTime.getTime()) || pickupTime.getTime() < Date.now() - 60000) throw new Error('Please choose a valid pickup time');
  const isFutureBooking = pickupTime.getTime() > Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  const paymentRequired = squarePaymentsEnabled();
  Logger.log('createBooking: jobId=%s isFuture=%s paymentRequired=%s', jobId, isFutureBooking, paymentRequired);
  if (!isFutureBooking && !paymentRequired) {
    Logger.log('createBooking: starting offer immediately for job %s', jobId);
    startOffer(jobId, p.pickupLat || 0, p.pickupLng || 0);
  }

  appendJob({
    created_at: new Date().toISOString(),
    id: jobId,
    status: isFutureBooking ? 'SCHEDULED' : 'NEW',
    driver_id: '',
    customer_name: customerName,
    customer_phone: customerPhone,
    pickup_address: p.pickupAddress,
    dropoff_address: p.dropoffAddress,
    pickup_lat: p.pickupLat || 0,
    pickup_lng: p.pickupLng || 0,
    dropoff_lat: p.dropoffLat || 0,
    dropoff_lng: p.dropoffLng || 0,
    pickup_time: pickupTime.toISOString(),
    vehicle_type: p.vehicleType || 'car',
    miles: miles,
    fare: fare,
    booking_fee: bookingFee,
    payment_id: '',
    payment_status: 'HELD',
    commission_rate: 0,
    commission_amount: '',
    tracking_token: token,
    customer_id: customer ? customer.id : '',
    passengers: Number(p.passengers) || 1,
    updated_at: new Date().toISOString()
  });

  writeAudit(customer ? 'customer' : 'guest', customer ? customer.id : customerPhone, 'booking_created', 'job', jobId, { status: isFutureBooking ? 'SCHEDULED' : 'NEW' });
  return { ok: true, jobId, fare, bookingFee, trackingToken: token, clientSecret: squarePaymentsEnabled() ? 'square' : null };
}

function confirmBooking(body) {
  const { jobId, sourceId } = body || {};
  Logger.log('confirmBooking: jobId=%s sourceId=%s', jobId, sourceId ? 'present' : 'missing');
  if (!jobId) throw new Error('Missing jobId');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.payment_status === 'BOOKING_FEE_PAID') return { ok: true, jobId, fare: Number(job.fare), bookingFee: Number(job.booking_fee), trackingToken: job.tracking_token };
  if (squarePaymentsEnabled()) {
    const payment = createSquarePayment(job, sourceId);
    updateJob(jobId, { payment_id: payment.id, payment_status: 'BOOKING_FEE_PAID', updated_at: new Date().toISOString() });
    writeAudit('customer', job.customer_id || job.customer_phone, 'booking_fee_paid', 'job', jobId, { provider: 'square', paymentId: payment.id, amount: Number(job.booking_fee) });
    allocateImmediateJob(jobId);
  } else {
    updateJob(jobId, { payment_status: 'HELD', updated_at: new Date().toISOString() });
  }
  return { ok: true, jobId, fare: Number(job.fare), bookingFee: Number(job.booking_fee), trackingToken: job.tracking_token };
}

// ---------- Status ----------

function setJobStatus(jobId, body, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const { status } = body || {};
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.driver_id && job.driver_id !== driverId) throw new Error('Not assigned to you');
  const cancelStatuses = ['NO_SHOW', 'CUSTOMER_CANCELLED'];
  if (cancelStatuses.includes(status)) {
    if (!['ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB'].includes(job.status)) throw new Error('Job cannot be cancelled at this stage');
    const now = new Date().toISOString();
    updateJob(jobId, { status, cancelled_at: now });
    updateDriver(driverId, { status: 'AVAILABLE', available_since: now });
    writeAudit('driver', driverId, 'job_status_changed', 'job', jobId, { from: job.status, to: status });
    return { ok: true, status };
  }
  const nextStatus = { ASSIGNED: 'ON_WAY', ON_WAY: 'ARRIVED', ARRIVED: 'POB', POB: 'COMPLETE' };
  if (nextStatus[job.status] !== status) throw new Error('Job status must progress in order');
  const now = new Date().toISOString();
  const updates = { status };
  if (status === 'ON_WAY') updates.on_way_at = now;
  if (status === 'ARRIVED') updates.arrived_at = now;
  if (status === 'POB') updates.pob_at = now;
  if (status === 'COMPLETE') updates.completed_at = now;
  updateJob(jobId, updates);
  writeAudit('driver', driverId, 'job_status_changed', 'job', jobId, { from: job.status, to: status });

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

function changeJobVehicle(jobId, body, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const { vehicleType } = body || {};
  if (vehicleType !== 'car' && vehicleType !== 'mpv') throw new Error('Invalid vehicle type');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.driver_id !== driverId) throw new Error('Not assigned to you');
  if (['COMPLETE', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(job.status)) throw new Error('Job is already finished');
  const pickupLat = Number(job.pickup_lat);
  const pickupLng = Number(job.pickup_lng);
  const dropoffLat = Number(job.dropoff_lat);
  const dropoffLng = Number(job.dropoff_lng);
  let fare = calculateAirportFare({ pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType });
  if (fare == null) {
    const timeOfDay = getTimeOfDay(job.pickup_time) || getTimeOfDay(job.created_at);
    fare = calculateFare({ miles: Number(job.miles) || 0, vehicleType, timeOfDay });
  }
  const now = new Date().toISOString();
  updateJob(jobId, { vehicle_type: vehicleType, fare: fare.toFixed(2), updated_at: now });
  writeAudit('driver', driverId, 'job_vehicle_changed', 'job', jobId, { vehicleType, fare });
  return { ok: true, fare, vehicleType };
}

// ---------- Offers ----------

function getOffers() { return rowsToObjects(getOffersSheet(), OFFER_HEADERS); }
function getBids() { return rowsToObjects(getBidsSheet(), BID_HEADERS); }

function startOffer(jobId, pickupLat, pickupLng) {
  Logger.log('startOffer: jobId=%s lat=%s lng=%s', jobId, pickupLat, pickupLng);
  const driver = findNextQueuedDriver(pickupLat, pickupLng, []);
  if (!driver) {
    Logger.log('startOffer: no queued driver found for job %s', jobId);
    return;
  }
  Logger.log('startOffer: offering job %s to driver %s', jobId, driver.id);
  startOfferToDriver(jobId, pickupLat, pickupLng, driver.id);
}

function startOfferToDriver(jobId, pickupLat, pickupLng, driverId) {
  if (offerRowIndex(jobId) >= 0) return;
  const offered = JSON.stringify([driverId]);
  const expiresAt = Date.now() + 60000;
  getOffersSheet().appendRow([jobId, driverId, offered, expiresAt, pickupLat, pickupLng]);
  SpreadsheetApp.flush();
  Logger.log('startOfferToDriver: offering job %s to driver %s', jobId, driverId);
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
    updateJob(jobId, { status: 'BIDDING', updated_at: new Date().toISOString() });
    writeAudit('system', '', 'offer_exhausted', 'job', jobId, { status: 'BIDDING' });
  } else {
    offered.push(next.id);
    sheet.getRange(idx, 2, 1, 3).setValues([[next.id, JSON.stringify(offered), Date.now() + 60000]]);
  }
  SpreadsheetApp.flush();
  return { ok: true };
}

// ---------- Bids ----------

function getBidBoard(driverId) {
  const jobs = getJobs().filter(j => j.status === 'BIDDING');
  const bids = getBids();
  return { jobs: jobs.map(job => {
    const resp = jobResponse(job);
    resp.myBid = bids.find(b => b.job_id === job.id && b.driver_id === driverId) || null;
    return resp;
  }) };
}

function getMyBids(driverId) {
  const jobs = getJobs();
  const bids = getBids().filter(b => b.driver_id === driverId).map(b => {
    const job = jobs.find(j => j.id === b.job_id);
    return { ...b, job: job ? jobResponse(job) : null };
  });
  return { bids };
}

function placeBid(jobId, body, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const amount = Number((body || {}).amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid bid amount');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver not found');
  if (job.status !== 'BIDDING') throw new Error('Job is no longer open for bids');
  if (offerRowIndex(jobId) >= 0) throw new Error('This job is already being offered to another driver');
  const now = new Date().toISOString();
  getBidsSheet().appendRow([now, jobId, driverId, amount, 'pending']);
  startOfferToDriver(jobId, Number(job.pickup_lat), Number(job.pickup_lng), driverId);
  writeAudit('driver', driverId, 'bid_placed', 'job', jobId, { amount });
  return { ok: true, status: 'OFFERED', driverId, fare: Number(job.fare) || 0 };
}

// ---------- Allocation ----------

function findNextQueuedDriver(pickupLat, pickupLng, excludeIds) {
  ensureDrivers();
  excludeIds = excludeIds || [];
  const drivers = getDrivers().filter(d => d.status === 'AVAILABLE' && !excludeIds.includes(d.id));
  if (drivers.length === 0) return null;
  const pickupZone = getZone(pickupLat, pickupLng);
  const hasCoords = d => d.last_lat !== '' && d.last_lng !== '' && isDriverLocationFresh(d);
  drivers.sort((a, b) => {
    const aFresh = hasCoords(a) ? 0 : 1;
    const bFresh = hasCoords(b) ? 0 : 1;
    if (aFresh !== bFresh) return aFresh - bFresh;
    const aSame = a.zone === pickupZone ? 0 : 1;
    const bSame = b.zone === pickupZone ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    const da = hasCoords(a) ? distanceMiles(pickupLat, pickupLng, Number(a.last_lat), Number(a.last_lng)) : Infinity;
    const db = hasCoords(b) ? distanceMiles(pickupLat, pickupLng, Number(b.last_lat), Number(b.last_lng)) : Infinity;
    if ((da === Infinity) !== (db === Infinity)) return da === Infinity ? 1 : -1;
    if (da !== db) return da - db;
    const ta = a.available_since ? new Date(a.available_since).getTime() : 0;
    const tb = b.available_since ? new Date(b.available_since).getTime() : 0;
    return ta - tb;
  });
  Logger.log('findNextQueuedDriver: pickupZone=%s candidates=%s selected=%s fresh=%s', pickupZone, drivers.length, drivers[0] ? drivers[0].id : 'none', hasCoords(drivers[0]));
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
  if (driver.status !== 'AVAILABLE') throw new Error('Driver is not available');
  const idx = offerRowIndex(jobId);
  if (idx >= 0) getOffersSheet().deleteRow(idx);
  updateJob(jobId, { status: 'ASSIGNED', driver_id: driverId, commission_rate: Number(driver.commission_rate) || 0 });
  updateDriver(driverId, { status: 'BUSY' });
  writeAudit('admin', 'admin', 'job_manually_assigned', 'job', jobId, { driverId });
  return { ok: true, status: 'ASSIGNED', driverId };
}

function createAdminDriver(body) {
  const { id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate } = body || {};
  if (!id || !name || !phone || !pin || !vehicle_type) throw new Error('Missing driver fields');
  const now = new Date().toISOString();
  const driver = {
    id, name, phone, pin: '', pin_hash: hashPin(pin), vehicle_type, license_type: license_type || 'private_hire',
    vehicle_make_model_colour: vehicle_make_model_colour || '', reg_last_3: reg_last_3 || '', expiry_date: expiry_date || '', badge_number: badge_number || '',
    status: 'AVAILABLE', zone: '', last_lat: '', last_lng: '', last_location_at: '', commission_rate: Number(commission_rate) || 0,
    settle_balance: 0, available_since: now, created_at: now, updated_at: now
  };
  getDriversSheet().appendRow(DRIVER_HEADERS.map(header => driver[header] !== undefined ? driver[header] : ''));
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

function getTimeOfDay(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return 'day';
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes >= 21 * 60 || minutes < 5 * 60 + 30) return 'night';
  return 'day';
}

function shortUuid() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}
