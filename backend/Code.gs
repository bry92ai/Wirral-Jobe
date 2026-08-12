const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const ADMIN_PASSWORD = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
const FUTURE_ALLOCATION_WINDOW_MINUTES = 45;
const DRIVER_LOCATION_FRESHNESS_MINUTES = 5;

// Polygon zones are loaded from Zones.gs (WIRRAL_TAXI_ZONES + findWirralZone)
function getZone(lat, lng) {
  const f = findWirralZone(lat, lng);
  return f ? f.properties.zoneId : null;
}

const DEFAULT_TARIFF = {
  car: { day: { firstMile: 4.50, perMile: 2.20, waitingPerMinute: 0.30 }, night: { firstMile: 5.50, perMile: 2.80, waitingPerMinute: 0.40 } },
  mpv: { day: { firstMile: 6.50, perMile: 3.20, waitingPerMinute: 0.45 }, night: { firstMile: 7.50, perMile: 3.80, waitingPerMinute: 0.55 } }
};
function getTariff() {
  const stored = PropertiesService.getScriptProperties().getProperty('TARIFF');
  if (!stored) return DEFAULT_TARIFF;
  try { const parsed = JSON.parse(stored); return { ...DEFAULT_TARIFF, ...parsed }; } catch (e) { return DEFAULT_TARIFF; }
}
function setTariff(tariff) { PropertiesService.getScriptProperties().setProperty('TARIFF', JSON.stringify(tariff)); }
function updateTariff(body) {
  if (!body || typeof body !== 'object') throw new Error('Invalid tariff data');
  const tariff = getTariff();
  ['car', 'mpv'].forEach(type => {
    if (!body[type]) return;
    ['day', 'night'].forEach(period => {
      if (!body[type][period]) return;
      ['firstMile', 'perMile', 'waitingPerMinute'].forEach(key => {
        const v = Number(body[type][period][key]);
        if (!isNaN(v) && v >= 0) tariff[type][period][key] = v;
      });
    });
  });
  setTariff(tariff);
  return { ok: true, tariff };
}

const AIRPORTS = [
  { name: 'Liverpool', lat: 53.3331, lng: -2.8496, carFare: 60, mpvFare: 75 },
  { name: 'Manchester', lat: 53.3537, lng: -2.2740, carFare: 75, mpvFare: 90 }
];

const JOB_HEADERS = ['created_at','id','status','driver_id','customer_name','customer_phone','pickup_address','dropoff_address','pickup_lat','pickup_lng','dropoff_lat','dropoff_lng','pickup_time','vehicle_type','miles','fare','booking_fee','payment_id','payment_status','commission_rate','commission_amount','tracking_token','on_way_at','arrived_at','pob_at','completed_at','customer_id','passengers','notes','return_job_id','cancelled_at','updated_at','journey_pin'];
const DRIVER_HEADERS = ['id','name','phone','pin','vehicle_type','license_type','vehicle_make_model_colour','reg_last_3','expiry_date','badge_number','status','zone','last_lat','last_lng','last_location_at','commission_rate','settle_balance','available_since','created_at','updated_at','pin_hash','fcm_token'];
const OFFER_HEADERS = ['jobId','currentDriverId','offeredDrivers','expiresAt','pickupLat','pickupLng'];
const BID_HEADERS = ['created_at','job_id','driver_id','amount','status'];
const CUSTOMER_HEADERS = ['id','name','phone','email','pin_hash','created_at','status','updated_at','last_login_at','fcm_token'];
const PLACE_HEADERS = ['id','customer_id','label','address','lat','lng','type','created_at'];
const DRIVER_APPLICATION_HEADERS = ['id','status','badge_url','badge_public_id','continuation_token','name','phone','pin_hash','vehicle_type','license_type','vehicle_make_model_colour','reg_last_3','expiry_date','badge_number','created_at','submitted_at','reviewed_at','reviewed_by','rejection_reason','driver_id'];


const SMS_TEMPLATES = [
  {
    key: "customer-ride-now-booking-received-1-confirmed",
    recipient: "Customer",
    jobType: "Ride now",
    message: "Booking received + \u00a31 confirmed",
    template: "Hi {customer_first_name}, your \u00a31 booking fee has been confirmed and your Wirral Jobe ride request is now active. We\u2019re finding a suitable local driver. Booking reference: {booking_reference}."
  },
  {
    key: "customer-ride-now-driver-allocated-on-the-way",
    recipient: "Customer",
    jobType: "Ride now",
    message: "Driver allocated + on the way",
    template: "Good news \u2014 {driver_first_name} is your driver for booking {booking_reference} and is now on the way. Vehicle: {vehicle_make_model}. Registration: {vehicle_registration}. Estimated arrival: {eta_minutes} minutes. Track your driver: {tracking_link}"
  },
  {
    key: "customer-ride-now-driver-arrived-journey-pin",
    recipient: "Customer",
    jobType: "Ride now",
    message: "Driver arrived + journey PIN",
    template: "Your Wirral Jobe driver has arrived at the pickup point. Your journey PIN is {journey_pin}. Please give this PIN to your driver before the journey begins. Booking reference: {booking_reference}."
  },
  {
    key: "customer-ride-now-journey-completed",
    recipient: "Customer",
    jobType: "Ride now",
    message: "Journey completed",
    template: "Thanks for travelling with The Wirral Jobe. Booking {booking_reference} is now complete. We hope you had a good journey."
  },
  {
    key: "customer-future-booking-booking-received-1-confirmed",
    recipient: "Customer",
    jobType: "Future booking",
    message: "Booking received + \u00a31 confirmed",
    template: "Hi {customer_first_name}, your \u00a31 booking fee has been confirmed and your Wirral Jobe booking is active for {journey_date} at {journey_time}. Pickup: {pickup_area}. Destination: {destination_area}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-future-booking-one-week-reminder",
    recipient: "Customer",
    jobType: "Future booking",
    message: "One-week reminder",
    template: "Reminder: your Wirral Jobe booking is one week away. {journey_date} at {journey_time}, from {pickup_area} to {destination_area}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-future-booking-24-hour-reminder",
    recipient: "Customer",
    jobType: "Future booking",
    message: "24-hour reminder",
    template: "Your Wirral Jobe booking is tomorrow at {journey_time}. Please check your pickup details here: {booking_link}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-future-booking-journey-completed",
    recipient: "Customer",
    jobType: "Future booking",
    message: "Journey completed",
    template: "Thanks for travelling with The Wirral Jobe. Booking {booking_reference} is now complete. We hope you had a good journey."
  },
  {
    key: "customer-airport-one-way-outward-booking-received-1-confirmed",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way outward",
    message: "Booking received + \u00a31 confirmed",
    template: "Hi {customer_first_name}, your \u00a31 booking fee has been confirmed and your transfer to {airport_name} is active for {journey_date} at {pickup_time}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-outward-one-week-reminder",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way outward",
    message: "One-week reminder",
    template: "Reminder: your Wirral Jobe airport transfer to {airport_name} is one week away. Pickup is {journey_date} at {pickup_time}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-outward-24-hour-outward-reminder",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way outward",
    message: "24-hour outward reminder",
    template: "Your Wirral Jobe airport transfer to {airport_name} is tomorrow at {pickup_time}. Please be ready at the confirmed pickup point. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-outward-journey-completed",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way outward",
    message: "Journey completed",
    template: "Your Wirral Jobe journey to {airport_name} is now complete. Thank you for travelling with us. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-return-booking-received-1-confirmed",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way return",
    message: "Booking received + \u00a31 confirmed",
    template: "Hi {customer_first_name}, your \u00a31 booking fee has been confirmed and your return transfer from {airport_name} is active for flight {flight_number} on {flight_date}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-return-one-week-reminder",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way return",
    message: "One-week reminder",
    template: "Reminder: your Wirral Jobe airport return from {airport_name} is one week away. Flight: {flight_number} on {flight_date}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-return-24-hour-return-flight-monitoring",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way return",
    message: "24-hour return + flight monitoring",
    template: "Your Wirral Jobe airport return is tomorrow. We\u2019ll monitor flight {flight_number} and adjust your pickup planning if the arrival time changes. No action is needed unless we contact you. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-one-way-return-journey-completed",
    recipient: "Customer",
    jobType: "Airport \u2014 one-way return",
    message: "Journey completed",
    template: "Your Wirral Jobe airport return journey is now complete. Thank you for travelling with us. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-two-way-outward-leg-two-way-booking-received-1-confirmed",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way outward leg",
    message: "Two-way booking received + \u00a31 confirmed",
    template: "Hi {customer_first_name}, your \u00a31 booking fee has been confirmed and both journeys in your Wirral Jobe airport booking are active. Outward: {outward_date} at {outward_time} to {airport_name}. Return flight: {return_flight_number} on {return_date}. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-two-way-outward-leg-one-week-outward-reminder",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way outward leg",
    message: "One-week outward reminder",
    template: "Reminder: the outward journey for booking {booking_reference} is one week away. Pickup is {outward_date} at {outward_time} for {airport_name}. Your return journey remains active."
  },
  {
    key: "customer-airport-two-way-outward-leg-24-hour-outward-reminder",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way outward leg",
    message: "24-hour outward reminder",
    template: "Your outward Wirral Jobe airport transfer to {airport_name} is tomorrow at {outward_time}. Please be ready at the confirmed pickup point. Booking reference: {booking_reference}."
  },
  {
    key: "customer-airport-two-way-outward-leg-outward-leg-completed",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way outward leg",
    message: "Outward leg completed",
    template: "The outward journey on booking {booking_reference} is now complete. Your return journey remains active."
  },
  {
    key: "customer-airport-two-way-return-leg-24-hour-return-flight-monitoring",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way return leg",
    message: "24-hour return + flight monitoring",
    template: "Your return journey for booking {booking_reference} is tomorrow. We\u2019ll monitor flight {flight_number} and adjust your pickup planning if the arrival time changes. No action is needed unless we contact you."
  },
  {
    key: "customer-airport-two-way-return-leg-return-leg-completed",
    recipient: "Customer",
    jobType: "Airport \u2014 two-way return leg",
    message: "Return leg completed",
    template: "Your return journey is now complete, and both legs of booking {booking_reference} have been completed. Thank you for travelling with The Wirral Jobe."
  },
  {
    key: "customer-all-job-types-customer-cancelled",
    recipient: "Customer",
    jobType: "All job types",
    message: "Customer cancelled",
    template: "Hi {customer_first_name}, {cancelled_scope} on booking {booking_reference} has been cancelled as requested. {remaining_leg_status} Any applicable refund will be processed automatically."
  },
  {
    key: "customer-all-job-types-customer-no-show",
    recipient: "Customer",
    jobType: "All job types",
    message: "Customer no-show",
    template: "Hi {customer_first_name}, your driver attended the confirmed pickup point for booking {booking_reference}, but was unable to locate you. The journey has been recorded as a customer no-show. Please contact Wirral Jobe if you believe this is incorrect."
  },
  {
    key: "driver-future-booking-future-job-offer",
    recipient: "Driver",
    jobType: "Future booking",
    message: "Future job offer",
    template: "Future booking available: {journey_date} at {journey_time}. Pickup: {pickup_area}. Destination: {destination_area}. Passengers: {passenger_count}. Vehicle required: {vehicle_type}. Accept job: {secure_accept_link} Decline job: {secure_decline_link} This offer expires in 12 hours."
  },
  {
    key: "driver-airport-one-way-outward-airport-outward-job-offer",
    recipient: "Driver",
    jobType: "Airport \u2014 one-way outward",
    message: "Airport outward job offer",
    template: "Airport job available: {journey_date} at {pickup_time}. Pickup: {pickup_area}. Airport: {airport_name}. Passengers: {passenger_count}. Vehicle required: {vehicle_type}. Accept job: {secure_accept_link} Decline job: {secure_decline_link} This offer expires in 12 hours."
  },
  {
    key: "driver-airport-one-way-return-airport-return-job-offer",
    recipient: "Driver",
    jobType: "Airport \u2014 one-way return",
    message: "Airport return job offer",
    template: "Airport return job available: {flight_date}. Airport: {airport_name}. Flight: {flight_number}. Destination: {destination_area}. Passengers: {passenger_count}. Vehicle required: {vehicle_type}. Accept job: {secure_accept_link} Decline job: {secure_decline_link} This offer expires in 12 hours."
  },
  {
    key: "driver-airport-two-way-booking-two-way-airport-job-offer",
    recipient: "Driver",
    jobType: "Airport \u2014 two-way booking",
    message: "Two-way airport job offer",
    template: "Two-way airport booking available. Outward: {outward_date} at {outward_time}, {pickup_area} to {airport_name}. Return: flight {return_flight_number} on {return_date}, {airport_name} to {return_destination_area}. Accept both jobs: {secure_accept_link} Decline both jobs: {secure_decline_link} This offer expires in 12 hours."
  },
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
    if (body.payload && typeof body.payload === 'object') body = { ...body, ...body.payload };
    if (body.auth && typeof body.auth === 'object') body = { ...body, ...body.auth };
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
  if (r === 'drivers') return { drivers: getAvailableDrivers() };
  if (r === 'booking') return createBooking(body);
  if (r === 'booking/return-pair') return createReturnPair(body);
  if (r === 'booking/confirm') return confirmBooking(body);
  if (r === 'booking/confirm-pair') return confirmReturnPair(body);
  if (r === 'tracking' && parts.length >= 2) return getTracking(parts[1]);
  if (r === 'customer/request-otp') return customerRequestOtp(body);
  if (r === 'customer/register') return customerRegister(body);
  if (r === 'customer/login') return customerLogin(body);
  if (r === 'customer/logout') return customerLogout(body);
  if (r === 'customer/forgot-pin') return customerForgotPin(body);
  if (r === 'customer/me') return getCustomerMe(body.customerToken);
  if (r === 'customer/jobs') return getCustomerJobs(body.customerToken);
  if (r === 'customer/places') return getCustomerPlaces(body.customerToken);
  if (r === 'customer/places/add') return addCustomerPlace(body.customerToken, body);
  if (r === 'customer/places/delete') return deleteCustomerPlace(body.customerToken, body.placeId);
  if (r === 'customer/register-push') return customerRegisterPush(body);
  if (r === 'driver/applications/upload-signature') return driverBadgeUploadSignature();
  if (r === 'driver/applications/start') return startDriverApplication(body);
  if (parts[0] === 'driver' && parts[1] === 'applications' && parts.length === 3) return getDriverApplication(parts[2]);
  if (parts[0] === 'driver' && parts[1] === 'applications' && parts[3] === 'submit') return submitDriverApplication(parts[2], body);
  if (r === 'driver/register-push') return driverRegisterPush(body);
  if (r === 'driver/login') return driverLogin(body);
  if (r === 'driver/logout') return driverLogout(body, driverId, driverToken);
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
  if (r === 'driver/future-offers') return getDriverFutureOffers(requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'future-offers' && parts[3] === 'accept') return acceptFutureOffer(parts[2], requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'future-offers' && parts[3] === 'decline') return declineFutureOffer(parts[2], requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'jobs' && parts[3] === 'status') return setJobStatus(parts[2], body, requireDriver(driverId, driverToken).id);
  if (parts[0] === 'driver' && parts[1] === 'jobs' && parts[3] === 'vehicle') return changeJobVehicle(parts[2], body, requireDriver(driverId, driverToken).id);
  if (r === 'driver/location') return updateDriverLocation(body, requireDriver(driverId, driverToken).id);
  if (r === 'driver/secure-action') return handleSecureDriverAction(body);
  if (r === 'admin/login') return adminLogin(body);
  if (r === 'admin/sms-templates') return requireAdmin(adminToken, () => ({ templates: getSmsTemplatesWithConfig() }));
  if (r === 'admin/pending-sms') return requireAdmin(adminToken, () => ({ messages: getAdminPendingSms() }));
  if (r === 'admin/sms-config') return requireAdmin(adminToken, () => body ? updateSmsConfig(body) : { disabled: getSmsDisabledKeys() });
  if (r === 'admin/jobs') return requireAdmin(adminToken, () => ({ jobs: getAllJobs() }));
  if (r === 'admin/drivers') return requireAdmin(adminToken, () => (body && body.id && body.name ? createAdminDriver(body) : { drivers: getAllDrivers() }));
  if (r === 'admin/process-future-bookings') return requireAdmin(adminToken, () => { processFutureBookings(); return { ok: true }; });
  if (r === 'admin/future-offers') return requireAdmin(adminToken, () => ({ futureOffers: getAllFutureOffers() }));
  if (r === 'admin/future-offers/dispatch') return requireAdmin(adminToken, () => dispatchFutureBooking(body.jobId));
  if (r === 'admin/tariff') return requireAdmin(adminToken, () => body ? updateTariff(body) : { tariff: getTariff() });
  if (r === 'admin/audit-log') return requireAdmin(adminToken, () => ({ logs: getAuditLogs(body.limit || 200) }));
  if (r === 'admin/bids') return requireAdmin(adminToken, () => ({ bids: getAllBids() }));
  if (parts[0] === 'admin' && parts[1] === 'drivers' && parts[3] === 'letter') return requireAdmin(adminToken, () => { setDriverLetter(parts[2], (body || {}).letter); return { ok: true, driverId: parts[2], letter: (body || {}).letter }; });
  if (parts[0] === 'admin' && parts[1] === 'drivers' && parts[3] === 'settle') return requireAdmin(adminToken, () => adjustDriverSettleBalance(parts[2], body));
  if (r === 'admin/drivers/bulk') return requireAdmin(adminToken, () => bulkUpdateDrivers(body));
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
function getFutureOffersSheet() { return ensureSheet('FutureOffers', ['jobId','currentDriverId','offeredDrivers','expiresAt','pickupLat','pickupLng','currentLetter','offeredLetters']); }
function getFutureOffers() { return rowsToObjects(getFutureOffersSheet(), ['jobId','currentDriverId','offeredDrivers','expiresAt','pickupLat','pickupLng','currentLetter','offeredLetters']); }
function futureOfferRowIndex(jobId) { return findRowIndex(getFutureOffersSheet(), row => row[0] === jobId); }
function getAuditLogSheet() { return ensureSheet('Audit Log', ['id', 'actor_type', 'actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at']); }
function writeAudit(actorType, actorId, action, entityType, entityId, metadata) {
  getAuditLogSheet().appendRow([Utilities.getUuid(), actorType, actorId || '', action, entityType, entityId || '', JSON.stringify(metadata || {}), new Date().toISOString()]);
}

function getDriverTokensSheet() { return ensureSheet('DriverTokens', ['driverId', 'token', 'created_at']); }
function setDriverToken(driverId, token) {
  const sheet = getDriverTokensSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === driverId || rows[i][1] === token) sheet.deleteRow(i + 1);
  }
  sheet.appendRow([driverId, token, new Date().toISOString()]);
}
function getDriverIdByToken(token) {
  if (!token) return null;
  const rows = getDriverTokensSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][1] === token) return String(rows[i][0]);
  return null;
}
function getDriverToken(driverId) {
  const rows = getDriverTokensSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === driverId) return String(rows[i][1]);
  return null;
}
function revokeDriverToken(driverId) {
  const sheet = getDriverTokensSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (rows[i][0] === driverId) sheet.deleteRow(i + 1);
}
function revokeDriverTokenByToken(token) {
  const sheet = getDriverTokensSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (rows[i][1] === token) sheet.deleteRow(i + 1);
}

function getCustomerTokensSheet() { return ensureSheet('CustomerTokens', ['customerId', 'token', 'created_at']); }
function setCustomerToken(customerId, token) {
  const sheet = getCustomerTokensSheet();
  sheet.appendRow([customerId, token, new Date().toISOString()]);
}
function getCustomerIdByToken(token) {
  if (!token) return null;
  const rows = getCustomerTokensSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][1] === token) return String(rows[i][0]);
  return null;
}
function revokeCustomerToken(token) {
  const sheet = getCustomerTokensSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (rows[i][1] === token) sheet.deleteRow(i + 1);
}
function getCustomerOtpsSheet() { return ensureSheet('CustomerOTPs', ['phone', 'otp', 'name', 'email', 'verified', 'expiresAt', 'created_at']); }
function cleanupCustomerOtps(phone) {
  const sheet = getCustomerOtpsSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (normalizePhone(rows[i][0]) === phone) sheet.deleteRow(i + 1);
}
function createCustomerOtp(phone, name, email) {
  cleanupCustomerOtps(phone);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60000;
  getCustomerOtpsSheet().appendRow([phone, otp, name, email || '', 'false', expiresAt, new Date().toISOString()]);
  Logger.log('OTP created for %s, expiresAt=%s', phone, expiresAt);
  return { otp, expiresAt };
}
function verifyCustomerOtp(phone, otp) {
  const sheet = getCustomerOtpsSheet();
  const rows = sheet.getDataRange().getValues();
  const entered = String(otp || '').trim();
  Logger.log('verifyCustomerOtp phone=%s enteredOtp=%s rows=%s', phone, entered, rows.length);
  for (let i = 1; i < rows.length; i++) {
    Logger.log('  row %s: phone=%s otp=%s expiresAt=%s', i, rows[i][0], rows[i][1], rows[i][5]);
  }
  let found = false;
  for (let i = 1; i < rows.length; i++) {
    if (normalizePhone(rows[i][0]) === phone && String(rows[i][1]).trim() === entered) {
      found = true;
      if (Date.now() > Number(rows[i][5])) throw new Error('This code has expired. Please request a new one.');
      return { name: rows[i][2], email: rows[i][3] };
    }
  }
  if (found) throw new Error('This code has expired. Please request a new one.');
  throw new Error('The code you entered is incorrect. Please check your messages and try again.');
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
  return getDriversSheet();
}

// ---------- Customers ----------

function getCustomersSheet() {
  const sheet = ensureSheet('Customers', CUSTOMER_HEADERS);
  maybeMigrateCustomersSheet();
  return sheet;
}

function maybeMigrateCustomersSheet() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('customersMigratedV2') === 'true') return;
  try {
    migrateCustomersSheet();
    props.setProperty('customersMigratedV2', 'true');
  } catch (e) {
    Logger.log('Customer sheet migration failed: %s', e.message || e);
  }
}

function migrateCustomersSheet() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Customers');
  if (!sheet) return;
  const target = CUSTOMER_HEADERS;
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (currentHeaders.length === target.length && currentHeaders.every((h, i) => h === target[i])) return;

  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const id = String(r[0] || '');
    if (!id) continue;
    const name = String(r[1] || '');
    const phone = String(r[2] || '');
    const colD = String(r[3] || '');
    const colE = String(r[4] || '');

    let email = '';
    let pinHash = '';
    let createdAt = '';
    let status = '';
    let updatedAt = '';
    let lastLoginAt = '';
    let fcmToken = '';

    if (/^[a-f0-9]{64}$/i.test(colD)) {
      // Current schema: no email column, pin_hash is in col D
      pinHash = colD;
      createdAt = String(r[4] || '');
      status = String(r[5] || '');
      updatedAt = String(r[6] || '');
      lastLoginAt = String(r[7] || '');
      fcmToken = String(r[8] || '');
    } else if (/^[a-f0-9]{64}$/i.test(colE)) {
      // Old schema with email in col D and pin_hash in col E
      email = colD;
      pinHash = colE;
      createdAt = String(r[5] || '');
      status = String(r[6] || '');
      updatedAt = String(r[7] || '');
      lastLoginAt = String(r[8] || '');
      fcmToken = String(r[9] || '');
    } else {
      // Unrecognised row - preserve col D as email and col E as pin_hash if it looks like a hash, otherwise empty
      email = colD;
      pinHash = /^[a-f0-9]{64}$/i.test(colE) ? colE : '';
      createdAt = String(r[5] || '');
      status = String(r[6] || '');
      updatedAt = String(r[7] || '');
      lastLoginAt = String(r[8] || '');
      fcmToken = String(r[9] || '');
    }

    rows.push([id, name, phone, email, pinHash, createdAt, status, updatedAt, lastLoginAt, fcmToken]);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, target.length).setValues([target]);
  if (rows.length) sheet.getRange(2, 1, rows.length, target.length).setValues(rows);
  SpreadsheetApp.flush();
  Logger.log('Migrated Customers sheet to %s columns, %s rows', target.length, rows.length);
}
function getPlacesSheet() { return ensureSheet('Saved Places', PLACE_HEADERS); }
function normalizePhone(phone) {
  let raw = String(phone || '').replace(/[\s().-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('44') && raw.length >= 10) return '+' + raw;
  if (raw.startsWith('0')) return '+44' + raw.substring(1);
  if (raw.startsWith('7') && raw.length >= 10) return '+44' + raw;
  return raw;
}
function hashPin(pin) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin));
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
function newPin() { return String(Math.floor(100000 + Math.random() * 900000)); }
function getCustomers() { return rowsToObjects(getCustomersSheet(), CUSTOMER_HEADERS); }
function findCustomerByPhone(phone) { return getCustomers().find(c => normalizePhone(c.phone) === normalizePhone(phone)); }
function customerSession(customerId) {
  const token = Utilities.getUuid();
  setCustomerToken(customerId, token);
  return token;
}
function requireCustomer(token) {
  const id = getCustomerIdByToken(token);
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
function customerResponse(customer) { return { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email || '' }; }
function customerSmsEnabled() { return PropertiesService.getScriptProperties().getProperty('SMS_ENABLED') === 'true'; }

function getSmsTemplate(key) { return SMS_TEMPLATES.find(t => t.key === key); }

function getSmsDisabledKeys() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SMS_DISABLED_KEYS') || '[]'); } catch (e) { return []; }
}
function setSmsDisabledKeys(keys) { PropertiesService.getScriptProperties().setProperty('SMS_DISABLED_KEYS', JSON.stringify(keys)); }
function isSmsEnabled(key) { return customerSmsEnabled() && !getSmsDisabledKeys().includes(key); }

function areaFrom(address) { return String(address || '').split(',')[0].trim(); }
function formatSmsDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatSmsTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function generateJourneyPin() { return String(Math.floor(1000 + Math.random() * 9000)); }

function publicAppUrl() { return PropertiesService.getScriptProperties().getProperty('PUBLIC_APP_URL') || ''; }
function buildTrackingLink(token) { const base = publicAppUrl(); return base ? base + '/track/' + encodeURIComponent(token) : ''; }
function buildBookingLink(job) { const base = publicAppUrl(); return base ? base + '/booking/' + encodeURIComponent(job.id) + '?token=' + encodeURIComponent(job.tracking_token) : ''; }

function secureActionToken(jobId, driverId, action) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECURE_LINK_SECRET');
  if (!secret) return '';
  const signature = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, jobId + ':' + driverId + ':' + action, secret);
  return signature.map(b => (b + 256).toString(16).slice(-2)).join('');
}
function buildSecureActionLink(jobId, driverId, action) {
  const base = publicAppUrl();
  const token = secureActionToken(jobId, driverId, action);
  if (!base || !token) return '';
  return base + '/driver-action?jobId=' + encodeURIComponent(jobId) + '&driverId=' + encodeURIComponent(driverId) + '&action=' + encodeURIComponent(action) + '&token=' + token;
}

function renderSmsBody(key, data) {
  const template = getSmsTemplate(key);
  if (!template) return null;
  let body = template.template;
  Object.keys(data).forEach(placeholder => {
    body = body.split('{' + placeholder + '}').join(String(data[placeholder] || ''));
  });
  return body;
}

function sendTemplatedSms(phone, key, data) {
  const template = getSmsTemplate(key);
  if (!template) { Logger.log('SMS template not found: %s', key); return false; }
  if (!isSmsEnabled(key)) { Logger.log('SMS disabled by config: %s', key); return false; }
  const body = renderSmsBody(key, data);
  if (!body || !phone) { Logger.log('No phone number for SMS %s', key); return false; }
  try { sendTwilioSms(phone, body); return true; } catch (e) { Logger.log('Failed to send SMS %s: %s', key, e.message); return false; }
}

function sendCustomerOtpSms(phone, otp) {
  if (!customerSmsEnabled() || !phone) { Logger.log('OTP SMS not sent: disabled or no phone'); return false; }
  const body = 'Your Wirral Jobe verification code is ' + otp + '. It expires in 10 minutes.';
  try { sendTwilioSms(phone, body); return true; } catch (e) { Logger.log('Failed to send OTP SMS: %s', e.message); return false; }
}

function isAirportJob(job) {
  const p = { pickupLat: Number(job.pickup_lat), pickupLng: Number(job.pickup_lng), dropoffLat: Number(job.dropoff_lat), dropoffLng: Number(job.dropoff_lng), vehicleType: job.vehicle_type || 'car' };
  return calculateAirportFare(p) != null;
}

function getAirportName(job) {
  const p = { pickupLat: Number(job.pickup_lat), pickupLng: Number(job.pickup_lng), dropoffLat: Number(job.dropoff_lat), dropoffLng: Number(job.dropoff_lng), vehicleType: job.vehicle_type || 'car' };
  for (const a of AIRPORTS) {
    if (distanceMiles(p.pickupLat, p.pickupLng, a.lat, a.lng) <= 2 || distanceMiles(p.dropoffLat, p.dropoffLng, a.lat, a.lng) <= 2) return a.name;
  }
  return '';
}

function isDropoffNearAirport(job) {
  for (const a of AIRPORTS) if (distanceMiles(Number(job.dropoff_lat), Number(job.dropoff_lng), a.lat, a.lng) <= 2) return true;
  return false;
}
function isPickupNearAirport(job) {
  for (const a of AIRPORTS) if (distanceMiles(Number(job.pickup_lat), Number(job.pickup_lng), a.lat, a.lng) <= 2) return true;
  return false;
}

function isFutureBooking(job) {
  const pickupTime = new Date(job.pickup_time || new Date().toISOString()).getTime();
  return pickupTime > Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
}

function etaMinutes(job, driver) {
  if (!driver || driver.last_lat === '' || driver.last_lng === '') return '';
  const miles = distanceMiles(Number(driver.last_lat), Number(driver.last_lng), Number(job.pickup_lat), Number(job.pickup_lng));
  const minutes = Math.round(miles / 20 * 60);
  return minutes < 1 ? '1' : String(minutes);
}

function customerSmsData(job, extra) {
  const data = {
    customer_first_name: String(job.customer_name || '').split(' ')[0],
    booking_reference: job.id,
    journey_date: formatSmsDate(job.pickup_time),
    journey_time: formatSmsTime(job.pickup_time),
    pickup_time: formatSmsTime(job.pickup_time),
    pickup_area: areaFrom(job.pickup_address),
    destination_area: areaFrom(job.dropoff_address),
    airport_name: getAirportName(job),
    flight_number: '',
    flight_date: '',
    outward_date: formatSmsDate(job.pickup_time),
    outward_time: formatSmsTime(job.pickup_time),
    return_flight_number: '',
    return_date: '',
    return_destination_area: '',
    driver_first_name: '',
    vehicle_make_model: '',
    vehicle_registration: '',
    eta_minutes: '',
    tracking_link: '',
    journey_pin: '',
    booking_link: buildBookingLink(job),
    cancelled_scope: 'The journey',
    remaining_leg_status: ''
  };
  if (extra) Object.keys(extra).forEach(k => { if (extra[k] !== undefined) data[k] = extra[k]; });
  return data;
}

function driverSmsData(job, driver, extra) {
  const data = customerSmsData(job, extra || {});
  data.passenger_count = Number(job.passengers) || 1;
  data.vehicle_type = job.vehicle_type || 'car';
  data.secure_accept_link = buildSecureActionLink(job.id, driver.id, 'accept');
  data.secure_decline_link = buildSecureActionLink(job.id, driver.id, 'decline');
  return data;
}

function customerJobTypeKey(baseMessage, job) {
  if (job.return_job_id) return 'customer-airport-two-way-outward-leg-' + baseMessage;
  if (isAirportJob(job)) {
    if (isDropoffNearAirport(job)) return 'customer-airport-one-way-outward-' + baseMessage;
    return 'customer-airport-one-way-return-' + baseMessage;
  }
  if (isFutureBooking(job)) return 'customer-future-booking-' + baseMessage;
  return 'customer-ride-now-' + baseMessage;
}

function driverOfferKey(job) {
  if (job.return_job_id) return 'driver-airport-two-way-booking-two-way-airport-job-offer';
  if (isAirportJob(job)) {
    if (isDropoffNearAirport(job)) return 'driver-airport-one-way-outward-airport-outward-job-offer';
    return 'driver-airport-one-way-return-airport-return-job-offer';
  }
  return 'driver-future-booking-future-job-offer';
}

function sendCustomerSms(job, key, extra) {
  return sendTemplatedSms(job.customer_phone, key, customerSmsData(job, extra));
}

function sendDriverOfferSms(job, driver) {
  const key = driverOfferKey(job);
  const extra = {};
  if (job.return_job_id) {
    const returnJob = findJobById(job.return_job_id);
    if (returnJob) {
      extra.return_flight_number = returnJob.notes && JSON.parse(returnJob.notes || '{}').flight_number ? JSON.parse(returnJob.notes || '{}').flight_number : '';
      extra.return_date = formatSmsDate(returnJob.pickup_time);
      extra.return_destination_area = areaFrom(returnJob.dropoff_address);
      extra.outward_date = formatSmsDate(job.pickup_time);
      extra.outward_time = formatSmsTime(job.pickup_time);
    }
  }
  return sendTemplatedSms(driver.phone, key, driverSmsData(job, driver, extra));
}

function sendBookingConfirmedSms(job) {
  const key = customerJobTypeKey('booking-received-1-confirmed', job);
  return sendCustomerSms(job, key);
}

function sendDriverAllocatedSms(job, driver) {
  if (!driver) return false;
  const key = customerJobTypeKey('driver-allocated-on-the-way', job);
  if (!getSmsTemplate(key)) return false;
  return sendCustomerSms(job, key, {
    driver_first_name: String(driver.name || '').split(' ')[0],
    vehicle_make_model: driver.vehicle_make_model_colour || '',
    vehicle_registration: driver.reg_last_3 || '',
    eta_minutes: etaMinutes(job, driver),
    tracking_link: buildTrackingLink(job.tracking_token)
  });
}

function sendDriverArrivedSms(job) {
  const key = customerJobTypeKey('driver-arrived-journey-pin', job);
  if (!getSmsTemplate(key)) return false;
  const pin = job.journey_pin || generateJourneyPin();
  if (!job.journey_pin) updateJob(job.id, { journey_pin: pin });
  return sendCustomerSms(job, key, { journey_pin: pin });
}

function sendJourneyCompletedSms(job) {
  const baseMessage = job.return_job_id ? 'outward-leg-completed' : 'journey-completed';
  const key = customerJobTypeKey(baseMessage, job);
  return sendCustomerSms(job, key);
}

function sendCustomerCancelledSms(job, scope, remaining) {
  return sendCustomerSms(job, 'customer-all-job-types-customer-cancelled', { cancelled_scope: scope || 'The journey', remaining_leg_status: remaining || '' });
}

function sendCustomerNoShowSms(job) {
  return sendCustomerSms(job, 'customer-all-job-types-customer-no-show');
}

function getSmsTemplatesWithConfig() {
  const disabled = getSmsDisabledKeys();
  return SMS_TEMPLATES.map(t => ({ key: t.key, recipient: t.recipient, jobType: t.jobType, message: t.message, enabled: !disabled.includes(t.key) }));
}

function updateSmsConfig(body) {
  if (!body || !body.key) throw new Error('Missing template key');
  const enabled = body.enabled === true || body.enabled === 'true';
  const disabled = getSmsDisabledKeys();
  const idx = disabled.indexOf(body.key);
  if (!enabled && idx < 0) disabled.push(body.key);
  if (enabled && idx >= 0) disabled.splice(idx, 1);
  setSmsDisabledKeys(disabled);
  return { ok: true, key: body.key, enabled };
}

function getAdminPendingSms() {
  const now = Date.now();
  const messages = [];
  getJobs().forEach(job => {
    if (['COMPLETE', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(job.status)) return;
    const pickupTime = new Date(job.pickup_time || new Date().toISOString()).getTime();
    const base = {
      id: job.id,
      jobId: job.id,
      recipientName: job.customer_name || 'Customer',
      phone: job.customer_phone || '',
      jobType: customerJobTypeKey('', job).replace(/^customer-|-/g, ' ') || 'Booking'
    };
    const add = (key, scheduledAt) => {
      if (!key || !getSmsTemplate(key)) return;
      const body = renderSmsBody(key, customerSmsData(job));
      if (!body) return;
      messages.push({
        ...base,
        key,
        templateKey: key,
        scheduledAt: new Date(scheduledAt).toISOString(),
        body,
        enabled: isSmsEnabled(key)
      });
    };
    // Future booking customer reminders
    if (pickupTime > now + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000) {
      const oneWeek = pickupTime - 7 * 24 * 60 * 60 * 1000;
      const oneDay = pickupTime - 1 * 24 * 60 * 60 * 1000;
      if (oneWeek > now) add(customerJobTypeKey('one-week-reminder', job), oneWeek);
      if (oneDay > now) add(customerJobTypeKey('24-hour-reminder', job), oneDay);
    }
    // Driver future-job offer is due when the booking enters the allocation window
    if (job.status === 'SCHEDULED') {
      const offerDue = pickupTime - FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
      if (offerDue > now) {
        const key = driverOfferKey(job);
        if (getSmsTemplate(key)) {
          const body = renderSmsBody(key, driverSmsData(job, { id: 'DRIVER', name: 'Driver', phone: '', vehicle_type: job.vehicle_type || 'car', last_lat: '', last_lng: '' }));
          if (body) {
            messages.push({
              ...base,
              key,
              templateKey: key,
              scheduledAt: new Date(offerDue).toISOString(),
              body,
              enabled: isSmsEnabled(key)
            });
          }
        }
      }
    }
  });
  messages.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return messages;
}

function handleSecureDriverAction(body) {
  const { jobId, driverId, action, token } = body || {};
  if (!jobId || !driverId || !action || !token) throw new Error('Missing secure action parameters');
  const expected = secureActionToken(jobId, driverId, action);
  if (token !== expected) throw new Error('Invalid secure link');
  if (action === 'accept') {
    try { return acceptOffer(jobId, driverId); } catch (e) {
      try { return acceptFutureOffer(jobId, driverId); } catch (e2) { throw e; }
    }
  }
  if (action === 'decline') {
    try { return declineOffer(jobId, driverId); } catch (e) {
      try { return declineFutureOffer(jobId, driverId); } catch (e2) { throw e; }
    }
  }
  throw new Error('Invalid action');
}

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
  return createSquarePaymentForAmount(Number(job.booking_fee) || 0, sourceId, job.id, 'The Wirral Jobe booking fee for ' + job.id);
}

function createSquarePaymentForAmount(amount, sourceId, referenceId, note) {
  if (!sourceId) throw new Error('Card details are required');
  const properties = PropertiesService.getScriptProperties();
  const accessToken = properties.getProperty('SQUARE_ACCESS_TOKEN');
  const locationId = properties.getProperty('SQUARE_LOCATION_ID');
  if (!accessToken || !locationId) throw new Error('Square payments are not configured');
  const payload = {
    source_id: sourceId,
    idempotency_key: squareIdempotencyKey(referenceId, sourceId),
    amount_money: { amount: Math.round(amount * 100), currency: 'GBP' },
    location_id: locationId,
    reference_id: referenceId,
    note: note || 'The Wirral Jobe booking fee'
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
function customerRequestOtp(body) {
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim();
  if (!name || !phone || phone.length < 10) throw new Error('Please enter your name and mobile number');
  const result = createCustomerOtp(phone, name, email);
  const sent = sendCustomerOtpSms(phone, result.otp);
  if (!sent) throw new Error('We could not send the SMS. Please check your number and try again.');
  return { ok: true, message: 'Check your phone for the verification code.' };
}
function customerRegister(body) {
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim();
  const pin = String(body.pin || '');
  if (!name || !phone || phone.length < 10) throw new Error('Please enter your name and mobile number');
  if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit PIN');
  verifyCustomerOtp(phone, String(body.otp || ''));
  if (findCustomerByPhone(phone)) throw new Error('An account already exists for this mobile number. Please log in.');
  const now = new Date().toISOString();
  const customer = { id: 'CUS-' + shortUuid(), name, phone, email: email || '', pin_hash: hashPin(pin), created_at: now, status: '', updated_at: now, last_login_at: '', fcm_token: '' };
  getCustomersSheet().appendRow(CUSTOMER_HEADERS.map(h => customer[h]));
  cleanupCustomerOtps(phone);
  writeAudit('customer', customer.id, 'account_created', 'customer', customer.id, { phone });
  return { ok: true, customer: customerResponse(customer), customerToken: customerSession(customer.id) };
}
function customerLogin(body) {
  const phone = normalizePhone(body.phone || '');
  const pin = String(body.pin || '');
  if (!pin) throw new Error('Please enter your PIN');
  const customer = findCustomerByPhone(phone);
  if (!customer) throw new Error('Invalid mobile number or PIN');

  const expectedHash = hashPin(pin);

  // The migration in getCustomersSheet should keep rows aligned, but this
  // still tolerates legacy rows where the PIN hash ended up in the email column.
  let storedHash = String(customer.pin_hash || '');
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
    const row = findRowIndex(getCustomersSheet(), row => row[0] === customer.id);
    const raw = row > 0 ? getCustomersSheet().getRange(row, 1, 1, CUSTOMER_HEADERS.length).getValues()[0] : [];
    if (raw.length > 4) {
      const shifted = String(raw[4] || '');
      if (/^[a-f0-9]{64}$/i.test(shifted)) storedHash = shifted;
    }
  }

  if (storedHash === expectedHash) {
    return { ok: true, customer: customerResponse(customer), customerToken: customerSession(customer.id) };
  }
  throw new Error('Invalid mobile number or PIN');
}
function customerLogout(body) {
  revokeCustomerToken(body.customerToken);
  return { ok: true };
}
function customerForgotPin(body) {
  const phone = normalizePhone(body.phone);
  const customer = findCustomerByPhone(phone);
  if (!customer) throw new Error('No account found for this number');
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  cleanupCustomerOtps(phone);
  const bodyText = 'Your new Wirral Jobe login PIN is ' + pin + '. You can now log in with this PIN.';
  if (customerSmsEnabled()) {
    try { sendTwilioSms(phone, bodyText); }
    catch (e) { Logger.log('Failed to send PIN reset SMS: %s', e.message); throw new Error('We could not send the SMS. Please try again.'); }
  } else {
    throw new Error('SMS is not enabled. Please contact support.');
  }
  const row = findRowIndex(getCustomersSheet(), row => row[0] === customer.id);
  if (row > 0) getCustomersSheet().getRange(row, CUSTOMER_HEADERS.indexOf('pin_hash') + 1).setValue(hashPin(pin));
  writeAudit('customer', customer.id, 'pin_reset', 'customer', customer.id, { phone });
  return { ok: true, message: 'A new PIN has been sent to your phone.' };
}
function customerRegisterPush(body) {
  const { customerToken, fcmToken } = body || {};
  if (!customerToken || !fcmToken) throw new Error('Missing token');
  const customer = requireCustomer(customerToken);
  const sheet = getCustomersSheet();
  const row = findRowIndex(sheet, r => r[0] === customer.id);
  if (row > 0) {
    const col = CUSTOMER_HEADERS.indexOf('fcm_token') + 1;
    sheet.getRange(row, col).setValue(fcmToken);
  }
  return { ok: true };
}

function driverRegisterPush(body) {
  const { driverToken, fcmToken } = body || {};
  if (!driverToken || !fcmToken) throw new Error('Missing token');
  const session = getDriverSessions().find(s => s.token === driverToken);
  if (!session) throw new Error('Invalid driver token');
  const driverId = session.driverId || session.driver_id;
  updateDriver(driverId, { fcm_token: fcmToken });
  return { ok: true };
}

function getFcmAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('FCM_CLIENT_EMAIL');
  const key = props.getProperty('FCM_PRIVATE_KEY');
  const projectId = props.getProperty('FCM_PROJECT_ID');
  if (!email || !key || !projectId) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: email, sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  }));
  const signInput = header + '.' + claim;
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(signInput, key));
  const jwt = signInput + '.' + signature;
  const tokenRes = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    muteHttpExceptions: true
  });
  const tokenData = JSON.parse(tokenRes.getContentText() || '{}');
  return tokenData.access_token || null;
}

function sendPushNotification(fcmToken, title, body, data) {
  if (!fcmToken) return false;
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FCM_PROJECT_ID');
  if (!projectId) return false;
  const accessToken = getFcmAccessToken();
  if (!accessToken) return false;
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: data || {},
    android: { priority: 'high', notification: { channel_id: 'job_offers', priority: 'max', default_vibrate_timings: true } }
  };
  try {
    const res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + accessToken },
      payload: JSON.stringify({ message }),
      muteHttpExceptions: true
    });
    Logger.log('FCM send result: %s %s', res.getResponseCode(), res.getContentText().slice(0, 200));
    return res.getResponseCode() < 300;
  } catch (e) {
    Logger.log('FCM send error: %s', e.message);
    return false;
  }
}

function sendPushToCustomer(customerId, title, body, data) {
  const customer = getCustomers().find(c => c.id === customerId);
  if (!customer || !customer.fcm_token) return false;
  return sendPushNotification(customer.fcm_token, title, body, data);
}

function sendPushToDriver(driverId, title, body, data) {
  const driver = findDriverById(driverId);
  if (!driver || !driver.fcm_token) return false;
  return sendPushNotification(driver.fcm_token, title, body, data);
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
    status: d.status, letter: getDriverLetter(d.id) || ''
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
  setDriverToken(driverId, token);
  return token;
}

function requireDriver(driverId, token) {
  const sessionDriverId = token ? getDriverIdByToken(token) : null;
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

function driverLogout(body, driverId, token) {
  if (driverId) {
    revokeDriverToken(driverId);
    updateDriver(driverId, { status: 'OFFLINE' });
    writeAudit('driver', driverId, 'driver_logout', 'driver', driverId, {});
  } else if (token) {
    revokeDriverTokenByToken(token);
  }
  return { ok: true };
}

function driverZone(d) {
  const lat = Number(d.last_lat);
  const lng = Number(d.last_lng);
  if (lat && lng) return getZone(lat, lng) || null;
  if (isDriverLocationFresh(d)) return d.zone || null;
  return null;
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
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const backendZone = getZone(lat, lng);
  const frontendZone = (body || {}).zone;
  const acceptedFrontendZone = !backendZone && frontendZone && isValidZoneId(frontendZone) ? frontendZone : '';
  const storedZone = backendZone || acceptedFrontendZone || (isDriverLocationFresh(d) ? d.zone : '');
  updateDriver(driverId, { last_lat: lat, last_lng: lng, last_location_at: now, zone: storedZone });

  // Update distance meter for any POB job
  getJobs().filter(job => job.driver_id === driverId && job.status === 'POB').forEach(job => {
    let n = {};
    try { n = JSON.parse(job.notes || '{}'); } catch (e) {}
    const lastLat = Number(n.meterLastLat) || Number(job.pickup_lat) || 0;
    const lastLng = Number(n.meterLastLng) || Number(job.pickup_lng) || 0;
    const lastAt = n.meterLastAt ? new Date(n.meterLastAt).getTime() : nowMs;
    const dist = distanceMiles(lastLat, lastLng, Number(lat), Number(lng));
    const dtSeconds = Math.max(0, (nowMs - lastAt) / 1000);
    const speedMph = dtSeconds > 0 ? dist / (dtSeconds / 3600) : Infinity;
    if (speedMph < 5) n.meterWaitingSeconds = (Number(n.meterWaitingSeconds) || 0) + dtSeconds;
    n.meterDistance = (Number(n.meterDistance) || 0) + dist;
    n.meterLastLat = Number(lat);
    n.meterLastLng = Number(lng);
    n.meterLastAt = now;
    updateJob(job.id, { notes: JSON.stringify(n), updated_at: now });
  });

  // Check ETA for ON_WAY jobs and send 5-min notification
  getJobs().filter(job => job.driver_id === driverId && job.status === 'ON_WAY').forEach(job => {
    const miles = distanceMiles(Number(lat), Number(lng), Number(job.pickup_lat), Number(job.pickup_lng));
    const etaMins = Math.round(miles / 20 * 60);
    if (etaMins <= 5 && etaMins >= 0) {
      let n = {};
      try { n = JSON.parse(job.notes || '{}'); } catch (e) {}
      if (!n.fiveMinNotified) {
        n.fiveMinNotified = true;
        updateJob(job.id, { notes: JSON.stringify(n), updated_at: now });
        if (job.customer_id) {
          sendPushToCustomer(job.customer_id, 'Almost There!', 'Your driver is about ' + Math.max(1, etaMins) + ' minutes away.', { route: '/track/' + job.tracking_token });
        }
        if (job.customer_phone) {
          try {
            const smsBody = 'Your Wirral Jobe driver is about ' + Math.max(1, etaMins) + ' minutes away!';
            if (customerSmsEnabled()) sendTwilioSms(job.customer_phone, smsBody);
          } catch (e) { Logger.log('5-min SMS error: %s', e.message); }
        }
        Logger.log('5-min ETA notification sent for job %s (ETA: %s min)', job.id, etaMins);
      }
    }
  });

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
  let notes = {};
  try { notes = JSON.parse(job.notes || '{}'); } catch {}
  const meterDistance = Number(notes.meterDistance) || Number(job.miles) || 0;
  const meterWaitingSeconds = Number(notes.meterWaitingSeconds) || 0;
  const pobAt = job.pob_at || job.pickup_time;
  const meterTimeOfDay = getTimeOfDay(pobAt);
  const distanceFare = calculateFare({ miles: meterDistance, vehicleType: job.vehicle_type || 'car', timeOfDay: meterTimeOfDay });
  const waitingFare = (meterWaitingSeconds / 60) * getWaitingRate(job.vehicle_type || 'car', pobAt);
  const meterFare = distanceFare + waitingFare;
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
    pobAt: job.pob_at, completedAt: job.completed_at,
    pobWaitingRate: Number(notes.pobWaitingRate) || getWaitingRate(job.vehicle_type || 'car', pobAt),
    pobMeterStartedAt: notes.pobMeterStartedAt || null,
    meterDistance, meterWaitingSeconds, meterFare
  };
}

function getDriverJobs(driverId) {
  if (!driverId) throw new Error('No driver ID');
  return { jobs: getJobs().filter(j => j.driver_id === driverId).map(jobResponse) };
}

function getDriverFutureBookings(driverId) {
  if (!driverId) throw new Error('No driver ID');
  const jobs = getJobs().filter(j => {
    const pickupTime = new Date(j.pickup_time).getTime();
    const isFuture = pickupTime > Date.now();
    return isFuture && (j.status === 'SCHEDULED' || j.status === 'NEW') && (j.driver_id === '' || j.driver_id === driverId);
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
  if (!p.customerToken) throw new Error('Please log in to make a booking');
  const customer = requireCustomer(p.customerToken);
  const customerName = customer.name;
  const customerPhone = customer.phone;
  if (!p.pickupAddress || !p.dropoffAddress || !customerName || !customerPhone) throw new Error('Missing required fields');
  if (![p.pickupLat, p.pickupLng, p.dropoffLat, p.dropoffLng].every(value => Number.isFinite(Number(value)))) throw new Error('Please select valid pickup and destination addresses');
  const miles = Number(p.miles || 0);
  const pickupTime = new Date(p.pickupTime || new Date().toISOString());
  const timeOfDay = getTimeOfDay(pickupTime.toISOString());
  const airportFare = calculateAirportFare(p);
  const fare = airportFare != null ? airportFare : calculateFare({ miles, vehicleType: p.vehicleType || 'car', timeOfDay });
  const bookingFee = 1.0;
  const jobId = 'WF-' + shortUuid();
  const token = Utilities.getUuid();
  if (Number.isNaN(pickupTime.getTime()) || pickupTime.getTime() < Date.now() - 60000) throw new Error('Please choose a valid pickup time');
  const isAirport = airportFare != null;
  const isFutureBooking = isAirport || pickupTime.getTime() > Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  const paymentRequired = squarePaymentsEnabled();
  const bookingNotes = {
    luggage: Number(p.luggage) || 0,
    flightNumber: p.flightNumber || '',
    childSeats: p.childSeats || '',
    accessibility: p.accessibility || '',
    customerNotes: p.customerNotes || ''
  };
  Logger.log('createBooking: jobId=%s isFuture=%s paymentRequired=%s', jobId, isFutureBooking, paymentRequired);

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
    notes: JSON.stringify(bookingNotes),
    updated_at: new Date().toISOString()
  });

  if (!isFutureBooking && !paymentRequired) {
    Logger.log('createBooking: starting offer immediately for job %s', jobId);
    try { startOffer(jobId, Number(p.pickupLat) || 0, Number(p.pickupLng) || 0); } catch (e) { Logger.log('startOffer error (non-fatal): %s', e.message); }
  }

  if (isFutureBooking) {
    Logger.log('createBooking: starting future offer cycle for job %s', jobId);
    createFutureOffer(jobId, Number(p.pickupLat) || 0, Number(p.pickupLng) || 0);
  }

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
    sendBookingConfirmedSms(job);
    allocateImmediateJob(jobId);
  } else {
    updateJob(jobId, { payment_status: 'BOOKING_FEE_PAID', updated_at: new Date().toISOString() });
    sendBookingConfirmedSms(job);
    allocateImmediateJob(jobId);
  }
  return { ok: true, jobId, fare: Number(job.fare), bookingFee: Number(job.booking_fee), trackingToken: job.tracking_token };
}

function deleteJobById(id) {
  const sheet = getJobsSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function createReturnPair(body) {
  const { outbound, return: returnPayload } = body || {};
  if (!outbound || !returnPayload) throw new Error('Missing outbound or return booking details');
  const outboundResult = createBooking(outbound);
  let returnResult;
  try {
    returnResult = createBooking(returnPayload);
  } catch (err) {
    Logger.log('createReturnPair: return failed, rolling back outbound job %s: %s', outboundResult.jobId, err.message);
    deleteJobById(outboundResult.jobId);
    throw new Error('Could not create return booking: ' + err.message);
  }
  return { ok: true, outbound: outboundResult, return: returnResult };
}

function confirmReturnPair(body) {
  const { outboundJobId, returnJobId, sourceId } = body || {};
  Logger.log('confirmReturnPair: outbound=%s return=%s', outboundJobId, returnJobId);
  if (!outboundJobId || !returnJobId) throw new Error('Missing job IDs');
  const outbound = findJobById(outboundJobId);
  const ret = findJobById(returnJobId);
  if (!outbound || !ret) throw new Error('Job not found');
  if (outbound.payment_status === 'BOOKING_FEE_PAID' && ret.payment_status === 'BOOKING_FEE_PAID') {
    return { ok: true, outboundJobId, returnJobId, fare: Number(outbound.fare) + Number(ret.fare), bookingFee: Number(outbound.booking_fee) + Number(ret.booking_fee) };
  }
  if (squarePaymentsEnabled()) {
    const totalBookingFee = (Number(outbound.booking_fee) || 0) + (Number(ret.booking_fee) || 0);
    const payment = createSquarePaymentForAmount(totalBookingFee, sourceId, outboundJobId + '-' + returnJobId, 'Booking fees for ' + outboundJobId + ' and ' + returnJobId);
    const now = new Date().toISOString();
    updateJob(outboundJobId, { payment_id: payment.id, payment_status: 'BOOKING_FEE_PAID', updated_at: now });
    updateJob(returnJobId, { payment_id: payment.id, payment_status: 'BOOKING_FEE_PAID', updated_at: now });
    writeAudit('customer', outbound.customer_id || outbound.customer_phone, 'booking_fee_paid', 'job', outboundJobId + ',' + returnJobId, { provider: 'square', paymentId: payment.id, amount: totalBookingFee });
    sendBookingConfirmedSms(outbound);
    sendBookingConfirmedSms(ret);
    allocateImmediateJob(outboundJobId);
    allocateImmediateJob(returnJobId);
  } else {
    const now = new Date().toISOString();
    updateJob(outboundJobId, { payment_status: 'BOOKING_FEE_PAID', updated_at: now });
    updateJob(returnJobId, { payment_status: 'BOOKING_FEE_PAID', updated_at: now });
    sendBookingConfirmedSms(outbound);
    sendBookingConfirmedSms(ret);
    allocateImmediateJob(outboundJobId);
    allocateImmediateJob(returnJobId);
  }
  return { ok: true, outboundJobId, returnJobId, fare: Number(outbound.fare) + Number(ret.fare), bookingFee: Number(outbound.booking_fee) + Number(ret.booking_fee) };
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
    if (status === 'NO_SHOW') sendCustomerNoShowSms(findJobById(jobId));
    if (status === 'CUSTOMER_CANCELLED') sendCustomerCancelledSms(findJobById(jobId));
    return { ok: true, status };
  }
  const nextStatus = { ASSIGNED: 'ON_WAY', ON_WAY: 'ARRIVED', ARRIVED: 'POB', POB: 'COMPLETE' };
  if (nextStatus[job.status] !== status) throw new Error('Job status must progress in order');
  const now = new Date().toISOString();
  const updates = { status };
  if (status === 'ON_WAY') updates.on_way_at = now;
  if (status === 'ARRIVED') updates.arrived_at = now;
  if (status === 'POB') {
    updates.pob_at = now;
    const driver = findDriverById(driverId) || {};
    const startLat = Number(driver.last_lat) || Number(job.pickup_lat) || 0;
    const startLng = Number(driver.last_lng) || Number(job.pickup_lng) || 0;
    const notes = (() => { try { return JSON.parse(job.notes || '{}'); } catch { return {}; } })();
    notes.pobWaitingRate = getWaitingRate(job.vehicle_type || 'car', now);
    notes.pobMeterStartedAt = now;
    notes.meterDistance = 0;
    notes.meterWaitingSeconds = 0;
    notes.meterLastLat = startLat;
    notes.meterLastLng = startLng;
    notes.meterLastAt = now;
    updates.notes = JSON.stringify(notes);
  }
  if (status === 'COMPLETE') updates.completed_at = now;
  updateJob(jobId, updates);
  writeAudit('driver', driverId, 'job_status_changed', 'job', jobId, { from: job.status, to: status });

  if (status === 'ON_WAY') {
    const updatedJob = findJobById(jobId);
    sendDriverAllocatedSms(updatedJob, findDriverById(driverId));
    if (updatedJob.customer_id) sendPushToCustomer(updatedJob.customer_id, 'Driver On The Way', 'Your driver is heading to you now.', { route: '/track/' + updatedJob.tracking_token });
  }
  if (status === 'ARRIVED') {
    const updatedJob = findJobById(jobId);
    sendDriverArrivedSms(updatedJob);
    if (updatedJob.customer_id) sendPushToCustomer(updatedJob.customer_id, 'Driver Arrived', 'Your driver has arrived at the pickup.', { route: '/track/' + updatedJob.tracking_token });
  }

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
    const completedJob = findJobById(jobId);
    sendJourneyCompletedSms(completedJob);
    if (completedJob.customer_id) sendPushToCustomer(completedJob.customer_id, 'Journey Complete', 'Thanks for riding with Wirral Jobe!', {});
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
  const job = findJobById(jobId);
  if (job) {
    sendPushToDriver(driverId, 'New Job Offer!', job.pickup_address + ' → ' + job.dropoff_address + ' £' + Number(job.fare).toFixed(2), { route: '/driver', type: 'job_offer', jobId });
  }
}

function offerRowIndex(jobId) {
  return findRowIndex(getOffersSheet(), row => row[0] === jobId);
}

const BIDDING_COUNTDOWN_DRIVER = '__BIDDING__';

function resolveBidWinner(jobId, pickupLat, pickupLng) {
  const allBids = getBids().filter(b => b.job_id === jobId);
  if (allBids.length === 0) return null;
  const drivers = getDrivers();
  const scored = allBids.map(b => {
    const d = drivers.find(drv => drv.id === b.driver_id);
    const available = d && d.status === 'AVAILABLE';
    let distance = Infinity;
    if (available && d.last_lat !== '' && d.last_lng !== '') {
      distance = distanceMiles(pickupLat, pickupLng, Number(d.last_lat), Number(d.last_lng));
    }
    const waiting = d && d.available_since ? new Date(d.available_since).getTime() : Infinity;
    return { driverId: b.driver_id, distance, waiting, createdAt: new Date(b.created_at).getTime() };
  });
  scored.sort((a, b) => a.distance - b.distance || a.waiting - b.waiting || a.createdAt - b.createdAt);
  return scored[0].driverId;
}

function advanceOffers() {
  const sheet = getOffersSheet();
  const offers = getOffers();
  const nowMs = Date.now();
  offers.forEach(offer => {
    try {
      if (Number(offer.expiresAt) > nowMs) return;
      const idx = offerRowIndex(offer.jobId);
      if (idx < 1) return;
      if (offer.currentDriverId === BIDDING_COUNTDOWN_DRIVER) {
        const winnerId = resolveBidWinner(offer.jobId, Number(offer.pickupLat), Number(offer.pickupLng));
        const nowIso = new Date().toISOString();
        if (winnerId) {
          startOfferToDriver(offer.jobId, Number(offer.pickupLat), Number(offer.pickupLng), winnerId);
          updateJob(offer.jobId, { status: 'OFFERED', updated_at: nowIso });
        } else {
          updateJob(offer.jobId, { status: 'BIDDING', updated_at: nowIso });
        }
        sheet.deleteRow(idx);
        return;
      }
      const offered = JSON.parse(offer.offeredDrivers || '[]');
      const next = findNextQueuedDriver(Number(offer.pickupLat), Number(offer.pickupLng), offered);
      if (!next) {
        sheet.deleteRow(idx);
      } else {
        offered.push(next.id);
        sheet.getRange(idx, 2, 1, 4).setValues([[next.id, JSON.stringify(offered), Date.now() + 60000, offer.pickupLat]]);
      }
    } catch (e) {
      Logger.log('advanceOffers error for job %s: %s', offer && offer.jobId, e.message || e);
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
  const job = findJobById(jobId);
  const pickupTime = new Date(job?.pickup_time || new Date().toISOString()).getTime();
  const dispatchNow = pickupTime <= Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  const now = new Date().toISOString();
  updateJob(jobId, {
    status: dispatchNow ? 'ASSIGNED' : 'SCHEDULED',
    driver_id: driverId,
    commission_rate: Number(driver.commission_rate) || 0,
    updated_at: now
  });
  if (dispatchNow) updateDriver(driverId, { status: 'BUSY' });
  sheet.deleteRow(idx);
  SpreadsheetApp.flush();
  return { ok: true, status: dispatchNow ? 'ASSIGNED' : 'SCHEDULED', driverId };
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
  const existingBid = getBids().some(b => b.job_id === jobId && b.driver_id === driverId);
  if (existingBid) throw new Error('You have already asked for this job');
  const now = new Date().toISOString();
  getBidsSheet().appendRow([now, jobId, driverId, amount, 'pending']);
  const offerIdx = offerRowIndex(jobId);
  if (offerIdx < 0) {
    getOffersSheet().appendRow([jobId, BIDDING_COUNTDOWN_DRIVER, '[]', Date.now() + 60000, Number(job.pickup_lat), Number(job.pickup_lng)]);
    writeAudit('driver', driverId, 'bid_placed', 'job', jobId, { amount, window: 'started' });
  } else {
    const offer = getOffers()[offerIdx - 1];
    if (Number(offer.expiresAt) <= Date.now()) {
      advanceOffers();
    }
    writeAudit('driver', driverId, 'bid_placed', 'job', jobId, { amount });
  }
  SpreadsheetApp.flush();
  return { ok: true, status: 'BIDDING', driverId, fare: Number(job.fare) || 0 };
}

// ---------- Allocation ----------

function getDriverLetter(driverId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('DriverLetters');
  if (!sheet) return '';
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === driverId) return String(rows[i][1] || '').trim().toUpperCase();
  }
  return '';
}

function setDriverLetter(driverId, letter) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('DriverLetters');
  if (!sheet) {
    sheet = ss.insertSheet('DriverLetters');
    sheet.appendRow(['driverId', 'letter']);
  }
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === driverId) {
      sheet.getRange(i + 1, 2).setValue(letter);
      return;
    }
  }
  sheet.appendRow([driverId, letter]);
}

function findNextEligibleDriver(pickupLat, pickupLng, excludeIds, letter) {
  ensureDrivers();
  excludeIds = excludeIds || [];
  const targetLetter = String(letter || '').trim().toUpperCase();
  const drivers = getDrivers().filter(d => {
    if (d.status !== 'AVAILABLE') return false;
    if (excludeIds.includes(d.id)) return false;
    if (!targetLetter) return true;
    return getDriverLetter(d.id) === targetLetter;
  });
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
  Logger.log('findNextEligibleDriver: pickupZone=%s letter=%s candidates=%s selected=%s', pickupZone, targetLetter || 'any', drivers.length, drivers[0] ? drivers[0].id : 'none');
  return drivers[0];
}

function findNextQueuedDriver(pickupLat, pickupLng, excludeIds) {
  return findNextEligibleDriver(pickupLat, pickupLng, excludeIds, null);
}

// ---------- Future booking allocation ----------

function processFutureBookings() {
  // Offer future bookings to A/B/C tiers as soon as they are booked.
  getJobs().forEach(job => {
    if (job.driver_id) return;
    if (job.status !== 'SCHEDULED' && job.status !== 'NEW') return;
    if (futureOfferRowIndex(job.id) >= 0) return;
    createFutureOffer(job.id, Number(job.pickup_lat), Number(job.pickup_lng));
    writeAudit('system', '', 'future_offer_window_opened', 'job', job.id, { pickupTime: job.pickup_time });
  });
  advanceFutureOffers();
  dispatchFutureBookings();
}

function createFutureOffer(jobId, pickupLat, pickupLng) {
  if (futureOfferRowIndex(jobId) >= 0) return;
  getFutureOffersSheet().appendRow([jobId, '', '[]', Date.now() + 60000, pickupLat, pickupLng, '', '[]']);
  SpreadsheetApp.flush();
  advanceFutureOffer(jobId);
}

function advanceFutureOffers() {
  const now = Date.now();
  getFutureOffers().forEach(offer => {
    if (Number(offer.expiresAt) > now) return;
    advanceFutureOffer(offer.jobId);
  });
}

function advanceFutureOffer(jobId) {
  const sheet = getFutureOffersSheet();
  const idx = futureOfferRowIndex(jobId);
  if (idx < 0) return;
  const values = sheet.getRange(idx, 1, 1, 8).getValues()[0];
  const offer = {
    jobId: values[0],
    currentDriverId: values[1],
    offeredDrivers: JSON.parse(values[2] || '[]'),
    expiresAt: Number(values[3]),
    pickupLat: Number(values[4]),
    pickupLng: Number(values[5]),
    currentLetter: values[6],
    offeredLetters: JSON.parse(values[7] || '[]')
  };
  if (offer.currentDriverId) offer.offeredDrivers.push(offer.currentDriverId);

  const letters = ['A', 'B', 'C', 'POOL'];
  let letter = offer.currentLetter || '';
  while (true) {
    const nextIndex = letter ? letters.indexOf(letter) + 1 : 0;
    if (nextIndex >= letters.length) {
      // POOL exhausted with no available driver; retry in 5 minutes without recreating the offer.
      sheet.getRange(idx, 2, 1, 4).setValues([['', JSON.stringify(offer.offeredDrivers), Date.now() + 300000, offer.pickupLat]]);
      sheet.getRange(idx, 7, 1, 2).setValues([['POOL', JSON.stringify(offer.offeredLetters)]]);
      writeAudit('system', '', 'future_offer_pool_retry', 'job', jobId, { status: 'SCHEDULED' });
      return;
    }
    letter = letters[nextIndex];
    if (offer.offeredLetters.includes(letter)) continue;
    offer.offeredLetters.push(letter);
    const driver = letter === 'POOL'
      ? findNextQueuedDriver(offer.pickupLat, offer.pickupLng, offer.offeredDrivers)
      : findNextEligibleDriver(offer.pickupLat, offer.pickupLng, offer.offeredDrivers, letter);
    if (driver) {
      sheet.getRange(idx, 2, 1, 4).setValues([[driver.id, JSON.stringify(offer.offeredDrivers), Date.now() + 60000, offer.pickupLat]]);
      sheet.getRange(idx, 7, 1, 2).setValues([[letter, JSON.stringify(offer.offeredLetters)]]);
      const offerJob = findJobById(jobId);
      if (offerJob) sendDriverOfferSms(offerJob, driver);
      writeAudit('system', '', 'future_offered', 'job', jobId, { driverId: driver.id, letter });
      return;
    }
  }
}

function getDriverFutureOffers(driverId) {
  if (!driverId) throw new Error('No driver ID');
  advanceFutureOffers();
  const now = Date.now();
  const offers = getFutureOffers().filter(o => o.currentDriverId === driverId && Number(o.expiresAt) > now);
  return {
    offers: offers.map(o => {
      const job = findJobById(o.jobId);
      return {
        jobId: o.jobId,
        pickupAddress: job?.pickup_address || '',
        dropoffAddress: job?.dropoff_address || '',
        pickupLat: Number(job?.pickup_lat) || 0,
        pickupLng: Number(job?.pickup_lng) || 0,
        dropoffLat: Number(job?.dropoff_lat) || 0,
        dropoffLng: Number(job?.dropoff_lng) || 0,
        fare: Number(job?.fare) || 0,
        vehicleType: job?.vehicle_type || 'car',
        pickupTime: job?.pickup_time || '',
        expiresAt: Number(o.expiresAt),
        letter: o.currentLetter || ''
      };
    })
  };
}

function acceptFutureOffer(jobId, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const idx = futureOfferRowIndex(jobId);
  if (idx < 0) throw new Error('No active future offer');
  const sheet = getFutureOffersSheet();
  const row = sheet.getRange(idx, 1, 1, 8).getValues()[0];
  if (row[1] !== driverId) throw new Error('No active future offer');
  const job = findJobById(jobId);
  if (!job) throw new Error('Job not found');
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver not found');
  const now = new Date().toISOString();
  const pickupTime = new Date(job.pickup_time).getTime();
  const dispatchNow = pickupTime <= Date.now() + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  updateJob(jobId, {
    status: dispatchNow ? 'ASSIGNED' : 'SCHEDULED',
    driver_id: driverId,
    commission_rate: Number(driver.commission_rate) || 0,
    updated_at: now
  });
  if (dispatchNow) updateDriver(driverId, { status: 'BUSY' });
  sheet.deleteRow(idx);
  writeAudit('driver', driverId, 'future_offer_accepted', 'job', jobId, {});
  return { ok: true, status: dispatchNow ? 'ASSIGNED' : 'SCHEDULED', jobId, driverId };
}

function declineFutureOffer(jobId, driverId) {
  if (!driverId) throw new Error('No driver ID');
  const idx = futureOfferRowIndex(jobId);
  if (idx < 0) throw new Error('No active future offer');
  const row = getFutureOffersSheet().getRange(idx, 1, 1, 8).getValues()[0];
  if (row[1] !== driverId) throw new Error('No active future offer');
  advanceFutureOffer(jobId);
  writeAudit('driver', driverId, 'future_offer_declined', 'job', jobId, {});
  return { ok: true };
}

function dispatchFutureBookings() {
  const now = Date.now();
  const dispatchCutoff = now + FUTURE_ALLOCATION_WINDOW_MINUTES * 60000;
  getJobs().forEach(job => {
    if (!job.driver_id) return;
    if (job.status !== 'SCHEDULED') return;
    const pickupTime = new Date(job.pickup_time).getTime();
    if (pickupTime > dispatchCutoff) return;
    dispatchFutureBooking(job.id);
  });
}

function dispatchFutureBooking(jobId) {
  const job = findJobById(jobId);
  if (!job || !job.driver_id || job.status !== 'SCHEDULED') return { ok: false, error: 'Not a scheduled future booking' };
  const idx = futureOfferRowIndex(jobId);
  if (idx >= 0) getFutureOffersSheet().deleteRow(idx);
  const driver = findDriverById(job.driver_id);
  updateJob(job.id, { status: 'ASSIGNED', updated_at: new Date().toISOString() });
  if (driver) updateDriver(job.driver_id, { status: 'BUSY' });
  writeAudit('system', '', 'future_booking_dispatched', 'job', job.id, { driverId: job.driver_id, source: 'admin_force' });
  return { ok: true, status: 'ASSIGNED', jobId: job.id, driverId: job.driver_id };
}

function getAllFutureOffers() {
  advanceFutureOffers();
  return getFutureOffers().map(o => {
    const job = findJobById(o.jobId);
    return {
      jobId: o.jobId,
      currentDriverId: o.currentDriverId || '',
      currentLetter: o.currentLetter || '',
      offeredLetters: o.offeredLetters || [],
      offeredDrivers: o.offeredDrivers || [],
      expiresAt: Number(o.expiresAt),
      pickupAddress: job?.pickup_address || '',
      dropoffAddress: job?.dropoff_address || '',
      pickupTime: job?.pickup_time || '',
      fare: Number(job?.fare) || 0,
      status: job?.status || ''
    };
  });
}

function getAuditLogs(limit = 100) {
  const sheet = getAuditLogSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || ['id', 'actor_type', 'actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at'];
  const out = [];
  for (let i = rows.length - 1; i >= 1 && out.length < limit; i--) {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = rows[i][idx]);
    try { obj.metadata = JSON.parse(obj.metadata || '{}'); } catch {}
    out.push(obj);
  }
  return out;
}

function getAllBids() {
  return rowsToObjects(getBidsSheet(), BID_HEADERS).map(b => ({
    ...b,
    amount: Number(b.amount) || 0,
    status: b.status || 'pending'
  }));
}

function adjustDriverSettleBalance(driverId, body) {
  const driver = findDriverById(driverId);
  if (!driver) throw new Error('Driver not found');
  const amount = Number(body?.amount) || 0;
  const note = String(body?.note || '');
  if (amount === 0) throw new Error('Amount required');
  const newBalance = (Number(driver.settle_balance) || 0) + amount;
  updateDriver(driverId, { settle_balance: newBalance });
  writeAudit('admin', '', 'driver_settle_adjusted', 'driver', driverId, { amount, note, newBalance });
  return { ok: true, driverId, newBalance };
}

function bulkUpdateDrivers(body) {
  const ids = (body?.driverIds || []).filter(id => id);
  const updates = body?.updates || {};
  const allowed = ['letter', 'commission_rate', 'status'];
  const fields = {};
  allowed.forEach(key => {
    if (updates[key] !== undefined) fields[key] = updates[key];
  });
  if (!Object.keys(fields).length) throw new Error('No fields to update');
  ids.forEach(id => {
    const driver = findDriverById(id);
    if (!driver) return;
    if (fields.letter !== undefined) setDriverLetter(id, fields.letter);
    const updateFields = {};
    if (fields.commission_rate !== undefined) updateFields.commission_rate = Number(fields.commission_rate) || 0;
    if (fields.status !== undefined && ['AVAILABLE', 'BREAK', 'OFFLINE'].includes(fields.status)) updateFields.status = fields.status;
    updateDriver(id, updateFields);
  });
  return { ok: true, updated: ids.length };
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
  const { id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate, letter } = body || {};
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
  if (letter) setDriverLetter(id, letter);
  return { ok: true, driverId: id };
}

function updateAdminDriver(id, body) {
  const d = findDriverById(id);
  if (!d) throw new Error('Driver not found');
  const { name, phone, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate, letter } = body || {};
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
  if (letter !== undefined) setDriverLetter(id, letter);
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
  const tariff = getTariff();
  const rates = (tariff[vehicleType] && tariff[vehicleType][timeOfDay]) ? tariff[vehicleType][timeOfDay] : tariff.car.day;
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
function getWaitingRate(vehicleType, date) {
  const timeOfDay = getTimeOfDay(date);
  const tariff = getTariff();
  const rates = (tariff[vehicleType] && tariff[vehicleType][timeOfDay]) ? tariff[vehicleType][timeOfDay] : tariff.car.day;
  return Number(rates.waitingPerMinute) || 0;
}

function shortUuid() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

