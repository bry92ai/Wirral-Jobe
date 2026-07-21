import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { calculateFare, calculateAirportFare } from './src/lib/fare.js';
import { getZone, ZONES } from './src/lib/zones.js';
import { distanceMiles } from './src/lib/geo.js';
import { appendBookingRow, findRowByJobId, updateBookingRow, syncSheetHeaders, appendDriverRow, findRowByDriverId, updateDriverRow } from './src/lib/sheets.js';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const adminTokens = new Set();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'NEW',
    driver_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    pickup_address TEXT,
    dropoff_address TEXT,
    pickup_lat REAL,
    pickup_lng REAL,
    dropoff_lat REAL,
    dropoff_lng REAL,
    pickup_time TEXT,
    vehicle_type TEXT,
    miles REAL,
    fare REAL,
    booking_fee REAL DEFAULT 1.0,
    payment_id TEXT,
    payment_status TEXT DEFAULT 'PENDING',
    commission_rate REAL,
    commission_amount REAL,
    tracking_token TEXT,
    created_at TEXT,
    on_way_at TEXT,
    arrived_at TEXT,
    pob_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    pin TEXT,
    vehicle_type TEXT,
    license_type TEXT DEFAULT 'private_hire',
    vehicle_make_model_colour TEXT,
    reg_last_3 TEXT,
    expiry_date TEXT,
    badge_number TEXT,
    last_lat REAL,
    last_lng REAL,
    last_location_at TEXT,
    zone TEXT,
    available_since TEXT,
    commission_rate REAL DEFAULT 0,
    settle_balance REAL DEFAULT 0,
    status TEXT DEFAULT 'AVAILABLE'
  );
`);

const seedDrivers = [
  { id: 'DRV-001', name: 'Dave', phone: '07700111000', pin: '1234', vehicle_type: 'car' },
  { id: 'DRV-002', name: 'Sarah', phone: '07700222000', pin: '5678', vehicle_type: 'mpv' }
];

const insertDriver = db.prepare('INSERT OR IGNORE INTO drivers (id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, available_since, commission_rate, settle_balance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
seedDrivers.forEach(d => {
  const now = new Date().toISOString();
  insertDriver.run(d.id, d.name, d.phone, d.pin, d.vehicle_type, 'private_hire', '', '', '', '', now, 0, 0, 'AVAILABLE');
  syncDriverToSheet(d.id);
});

function uuid() { return crypto.randomUUID().split('-')[0].toUpperCase(); }
function trackingToken() { return crypto.randomUUID(); }

function sendSmsStub(to, body) {
  console.log(`[SMS to ${to}] ${body}`);
}

function sendDriverStatement(to, body) {
  console.log(`[DRIVER STATEMENT to ${to}]\n${body}`);
}

function createPaymentStub(jobId) {
  return { id: `PAY-${uuid()}`, status: 'HELD' };
}

function buildBookingSheetRow(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return [];
  return [
    job.created_at,
    job.id,
    job.customer_name,
    job.customer_phone,
    job.pickup_address,
    job.dropoff_address,
    job.miles != null ? Number(job.miles).toFixed(2) : '',
    job.vehicle_type,
    Number(job.fare).toFixed(2),
    Number(job.booking_fee).toFixed(2),
    job.payment_status,
    job.status,
    job.driver_id || ''
  ];
}

function buildDriverSheetRow(driverId) {
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
  if (!d) return [];
  return [
    d.id,
    d.name,
    d.phone,
    d.vehicle_type,
    d.license_type,
    d.vehicle_make_model_colour,
    d.reg_last_3,
    d.expiry_date,
    d.badge_number,
    d.status,
    d.zone || '',
    d.last_lat != null ? Number(d.last_lat).toFixed(4) : '',
    d.last_lng != null ? Number(d.last_lng).toFixed(4) : '',
    d.last_location_at || ''
  ];
}

function syncJobToSheet(jobId) {
  if (!process.env.GOOGLE_SHEET_ID) return;
  const values = buildBookingSheetRow(jobId);
  findRowByJobId(jobId)
    .then(row => {
      if (row) updateBookingRow(row, values).catch(err => console.error('Sheets update failed:', err.message));
    })
    .catch(err => console.error('Sheets find failed:', err.message));
}

function syncDriverToSheet(driverId) {
  if (!process.env.GOOGLE_SHEET_ID) return;
  const values = buildDriverSheetRow(driverId);
  findRowByDriverId(driverId)
    .then(row => {
      if (row) updateDriverRow(row, values).catch(err => console.error('Sheets driver update failed:', err.message));
      else appendDriverRow(values).catch(err => console.error('Sheets driver append failed:', err.message));
    })
    .catch(err => console.error('Sheets driver find failed:', err.message));
}

const pendingOffers = new Map();

function findNextQueuedDriver(pickupLat, pickupLng, excludeIds = []) {
  if (pickupLat == null || pickupLng == null) return null;
  const drivers = db.prepare('SELECT * FROM drivers WHERE status = ?').all('AVAILABLE');
  const candidates = drivers.filter(d => d.zone && !excludeIds.includes(d.id));
  if (candidates.length === 0) return null;
  const zoneDistances = new Map();
  for (const zone of ZONES) {
    zoneDistances.set(zone.id, distanceMiles(pickupLat, pickupLng, zone.lat, zone.lng));
  }
  candidates.sort((a, b) => {
    const da = zoneDistances.get(a.zone) ?? Infinity;
    const db = zoneDistances.get(b.zone) ?? Infinity;
    if (da !== db) return da - db;
    return new Date(a.available_since || 0).getTime() - new Date(b.available_since || 0).getTime();
  });
  return candidates[0];
}

function offerNextDriver(jobId, pickupLat, pickupLng) {
  const state = pendingOffers.get(jobId);
  if (!state) return;
  const driver = findNextQueuedDriver(pickupLat, pickupLng, Array.from(state.offered));
  if (!driver) {
    pendingOffers.delete(jobId);
    return;
  }
  state.current = driver.id;
  state.offered.add(driver.id);
  state.expiresAt = Date.now() + 60000;
  if (state.timeout) clearTimeout(state.timeout);
  state.timeout = setTimeout(() => {
    offerNextDriver(jobId, pickupLat, pickupLng);
  }, 60000);
  console.log(`Offered job ${jobId} to ${driver.id} in zone ${driver.zone}`);
}

function startOfferProcess(jobId, pickupLat, pickupLng) {
  if (pendingOffers.has(jobId)) return;
  pendingOffers.set(jobId, { jobId, offered: new Set(), current: null, timeout: null, expiresAt: null, pickupLat, pickupLng });
  offerNextDriver(jobId, pickupLat, pickupLng);
}

function cancelOffer(jobId) {
  const state = pendingOffers.get(jobId);
  if (!state) return;
  if (state.timeout) clearTimeout(state.timeout);
  pendingOffers.delete(jobId);
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Admin not authenticated' });
  }
  next();
}

app.get('/api/ping', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  const token = crypto.randomUUID();
  adminTokens.add(token);
  res.json({ token });
});

app.post('/api/booking', async (req, res) => {
  const p = req.body;
  if (!p.pickupAddress || !p.dropoffAddress || !p.customerName || !p.customerPhone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const miles = Number(p.miles || 0);
  const airportFare = calculateAirportFare({
    pickupLat: p.pickupLat, pickupLng: p.pickupLng,
    dropoffLat: p.dropoffLat, dropoffLng: p.dropoffLng,
    vehicleType: p.vehicleType || 'car'
  });
  const fare = airportFare != null ? airportFare : calculateFare({ miles, vehicleType: p.vehicleType || 'car', timeOfDay: p.timeOfDay || 'day' });
  const bookingFee = 1.00;
  const bookingFeePence = 100;

  const jobId = `WF-${uuid()}`;
  const token = trackingToken();

  let paymentId = null;
  let paymentStatus = 'HELD';
  let clientSecret = null;

  if (stripe) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: bookingFeePence,
        currency: 'gbp',
        metadata: { jobId },
        automatic_payment_methods: { enabled: true }
      });
      paymentId = paymentIntent.id;
      paymentStatus = 'PENDING_PAYMENT';
      clientSecret = paymentIntent.client_secret;
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create payment: ' + err.message });
    }
  } else {
    const payment = createPaymentStub(jobId);
    paymentId = payment.id;
    paymentStatus = payment.status;
  }

  const insert = db.prepare(`
    INSERT INTO jobs (id, status, customer_name, customer_phone, pickup_address, dropoff_address,
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_time, vehicle_type, miles, fare, booking_fee,
      payment_id, payment_status, commission_rate, commission_amount, tracking_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    jobId, 'NEW', p.customerName, p.customerPhone, p.pickupAddress, p.dropoffAddress,
    p.pickupLat || 0, p.pickupLng || 0, p.dropoffLat || 0, p.dropoffLng || 0,
    p.pickupTime || new Date().toISOString(), p.vehicleType || 'car', miles, fare, bookingFee,
    paymentId, paymentStatus, null, null, token, new Date().toISOString()
  );

  sendSmsStub(p.customerPhone, `Wirral Flightpath booking ${jobId} confirmed. Fare £${fare.toFixed(2)}. Track at /track/${token}`);
  appendBookingRow(buildBookingSheetRow(jobId)).catch(err => console.error('Sheets append failed:', err.message));

  const queuedDriver = findNextQueuedDriver(p.pickupLat || 0, p.pickupLng || 0);
  let assignedDriver = null;
  if (queuedDriver) {
    assignedDriver = queuedDriver;
    db.prepare('UPDATE jobs SET status = ?, driver_id = ?, commission_rate = ? WHERE id = ?')
      .run('ASSIGNED', assignedDriver.id, assignedDriver.commission_rate || 0, jobId);
    db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run('BUSY', assignedDriver.id);
    syncJobToSheet(jobId);
    syncDriverToSheet(assignedDriver.id);
    sendSmsStub(p.customerPhone, `Driver ${assignedDriver.name} has been assigned to booking ${jobId}.`);
  } else {
    startOfferProcess(jobId, p.pickupLat || 0, p.pickupLng || 0);
  }

  res.json({ ok: true, jobId, fare, bookingFee, trackingToken: token, clientSecret });
});

app.post('/api/booking/confirm', async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.payment_status === 'BOOKING_FEE_PAID') {
    return res.json({ ok: true, jobId, fare: job.fare, bookingFee: job.booking_fee, trackingToken: job.tracking_token });
  }

  if (!stripe) {
    db.prepare('UPDATE jobs SET payment_status = ? WHERE id = ?').run('HELD', jobId);
    syncJobToSheet(jobId);
    return res.json({ ok: true, jobId, fare: job.fare, bookingFee: job.booking_fee, trackingToken: job.tracking_token });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(job.payment_id);
    if (intent.status === 'succeeded') {
      db.prepare('UPDATE jobs SET payment_status = ? WHERE id = ?').run('BOOKING_FEE_PAID', jobId);
      syncJobToSheet(jobId);
      return res.json({ ok: true, jobId, fare: job.fare, bookingFee: job.booking_fee, trackingToken: job.tracking_token });
    }
    return res.status(400).json({ error: 'Payment not completed', status: intent.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/tracking/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE tracking_token = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Tracking link not found' });
  res.json(jobResponse(row));
});

app.post('/api/driver/login', (req, res) => {
  const { driverId, pin } = req.body;
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ? AND pin = ?').get(driverId, pin);
  if (!driver) return res.status(401).json({ error: 'Invalid driver ID or PIN' });
  res.json({ ok: true, driverId: driver.id, name: driver.name, token: crypto.randomUUID() });
});

app.get('/api/driver/me', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  if (!driverId) return res.status(401).json({ error: 'No driver ID' });
  const driver = db.prepare('SELECT id, name, phone, vehicle_type, status, settle_balance, commission_rate, zone, last_lat, last_lng, last_location_at FROM drivers WHERE id = ?').get(driverId);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json({
    id: driver.id,
    name: driver.name,
    vehicleType: driver.vehicle_type,
    status: driver.status,
    settleBalance: driver.settle_balance,
    commissionRate: driver.commission_rate,
    zone: driver.zone,
    lastLat: driver.last_lat,
    lastLng: driver.last_lng,
    lastLocationAt: driver.last_location_at
  });
});

app.get('/api/driver/jobs', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  if (!driverId) return res.status(401).json({ error: 'No driver ID' });
  const rows = db.prepare('SELECT * FROM jobs WHERE driver_id = ? ORDER BY created_at DESC').all(driverId);
  res.json({ jobs: rows.map(jobResponse) });
});

app.post('/api/driver/location', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  const { lat, lng } = req.body;
  if (!driverId) return res.status(401).json({ error: 'No driver ID' });
  if (lat == null || lng == null) return res.status(400).json({ error: 'Missing coordinates' });
  const zone = getZone(lat, lng);
  const info = db.prepare('UPDATE drivers SET last_lat = ?, last_lng = ?, last_location_at = ?, zone = ? WHERE id = ?')
    .run(lat, lng, new Date().toISOString(), zone, driverId);
  if (info.changes === 0) return res.status(404).json({ error: 'Driver not found' });
  syncDriverToSheet(driverId);
  res.json({ ok: true });
});

app.get('/api/driver/offers', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  if (!driverId) return res.status(401).json({ error: 'No driver ID' });
  const offers = [];
  for (const state of pendingOffers.values()) {
    if (state.current === driverId) {
      const job = db.prepare('SELECT id, pickup_address, dropoff_address, pickup_lat, pickup_lng, fare, vehicle_type FROM jobs WHERE id = ?').get(state.jobId);
      if (job) {
        offers.push({
          jobId: job.id,
          pickupAddress: job.pickup_address,
          dropoffAddress: job.dropoff_address,
          pickupLat: job.pickup_lat,
          pickupLng: job.pickup_lng,
          fare: job.fare,
          vehicleType: job.vehicle_type,
          expiresAt: state.expiresAt
        });
      }
    }
  }
  res.json({ offers });
});

app.post('/api/driver/offers/:jobId/accept', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  const { jobId } = req.params;
  const state = pendingOffers.get(jobId);
  if (!state || state.current !== driverId) return res.status(403).json({ error: 'No active offer' });
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
  if (!job || !driver) return res.status(404).json({ error: 'Job or driver not found' });
  db.prepare('UPDATE jobs SET status = ?, driver_id = ?, commission_rate = ? WHERE id = ?')
    .run('ASSIGNED', driverId, driver.commission_rate || 0, jobId);
  db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run('BUSY', driverId);
  cancelOffer(jobId);
  syncJobToSheet(jobId);
  syncDriverToSheet(driverId);
  sendSmsStub(job.customer_phone, `Driver ${driver.name} has been assigned to booking ${jobId}.`);
  res.json({ ok: true, status: 'ASSIGNED', driverId });
});

app.post('/api/driver/offers/:jobId/decline', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  const { jobId } = req.params;
  const state = pendingOffers.get(jobId);
  if (!state || state.current !== driverId) return res.status(403).json({ error: 'No active offer' });
  offerNextDriver(jobId, state.pickupLat, state.pickupLng);
  res.json({ ok: true });
});

app.post('/api/driver/jobs/:jobId/status', (req, res) => {
  const driverId = req.headers['x-driver-id'];
  const { jobId } = req.params;
  const { status, lat, lng } = req.body;
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.driver_id && job.driver_id !== driverId) return res.status(403).json({ error: 'Not assigned to you' });

  const now = new Date().toISOString();
  let col = '';
  if (status === 'ON_WAY') col = 'on_way_at';
  else if (status === 'ARRIVED') col = 'arrived_at';
  else if (status === 'POB') col = 'pob_at';
  else if (status === 'COMPLETE') col = 'completed_at';
  else return res.status(400).json({ error: 'Invalid status' });

  db.prepare(`UPDATE jobs SET status = ?, ${col} = ? WHERE id = ?`).run(status, now, jobId);
  syncJobToSheet(jobId);

  if (status === 'ON_WAY') {
    sendSmsStub(job.customer_phone, `${driverName(driverId)} is on the way to ${job.pickup_address}.`);
  } else if (status === 'COMPLETE') {
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    const rate = driver?.commission_rate || 0;
    const commission = rate > 0 ? +(job.fare * rate / 100).toFixed(2) : 0;
    db.prepare('UPDATE drivers SET status = ?, available_since = ?, settle_balance = settle_balance + ? WHERE id = ?')
      .run('AVAILABLE', new Date().toISOString(), commission, driverId);
    db.prepare('UPDATE jobs SET commission_amount = ? WHERE id = ?').run(commission, jobId);
    syncDriverToSheet(driverId);
    syncJobToSheet(jobId);
    sendSmsStub(job.customer_phone, `Your Wirral Flightpath journey ${jobId} is complete. Thank you.`);
  }

  res.json({ ok: true, status });
});

app.post('/api/admin/drivers', requireAdmin, (req, res) => {
  const { id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate } = req.body;
  if (!id || !name || !phone || !pin || !vehicle_type) {
    return res.status(400).json({ error: 'Missing driver fields' });
  }
  const now = new Date().toISOString();
  const rate = Number(commission_rate) || 0;
  db.prepare(`INSERT OR REPLACE INTO drivers
    (id, name, phone, pin, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, available_since, commission_rate, settle_balance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, phone, pin, vehicle_type, license_type || 'private_hire', vehicle_make_model_colour || '', reg_last_3 || '', expiry_date || '', badge_number || '', now, rate, 0, 'AVAILABLE');
  syncDriverToSheet(id);
  res.json({ ok: true, driverId: id });
});

app.patch('/api/admin/drivers/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const { name, phone, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, commission_rate } = req.body;
  db.prepare(`UPDATE drivers SET name = ?, phone = ?, vehicle_type = ?, license_type = ?, vehicle_make_model_colour = ?, reg_last_3 = ?, expiry_date = ?, badge_number = ?, commission_rate = ? WHERE id = ?`)
    .run(
      name ?? driver.name,
      phone ?? driver.phone,
      vehicle_type ?? driver.vehicle_type,
      license_type ?? driver.license_type,
      vehicle_make_model_colour ?? driver.vehicle_make_model_colour,
      reg_last_3 ?? driver.reg_last_3,
      expiry_date ?? driver.expiry_date,
      badge_number ?? driver.badge_number,
      commission_rate ?? driver.commission_rate,
      id
    );
  syncDriverToSheet(id);
  res.json({ ok: true, driverId: id });
});

app.get('/api/drivers', (_req, res) => {
  const rows = db.prepare('SELECT id, vehicle_type, last_lat, last_lng, status FROM drivers WHERE status = ? AND last_lat IS NOT NULL AND last_lng IS NOT NULL').all('AVAILABLE');
  res.json({ drivers: rows });
});

app.get('/api/admin/jobs', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  res.json({ jobs: rows.map(jobResponse) });
});

app.get('/api/admin/drivers', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT id, name, phone, vehicle_type, license_type, vehicle_make_model_colour, reg_last_3, expiry_date, badge_number, zone, commission_rate, settle_balance, last_lat, last_lng, status FROM drivers').all();
  res.json({ drivers: rows });
});

app.post('/api/admin/assign', requireAdmin, (req, res) => {
  const { jobId, driverId } = req.body;
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
  if (!job || !driver) return res.status(404).json({ error: 'Job or driver not found' });
  if (['COMPLETE', 'CANCELLED'].includes(job.status)) return res.status(400).json({ error: 'Job already closed' });

  db.prepare('UPDATE jobs SET status = ?, driver_id = ?, commission_rate = ? WHERE id = ?')
    .run('ASSIGNED', driverId, driver.commission_rate || 0, jobId);
  db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run('BUSY', driverId);
  cancelOffer(jobId);

  syncJobToSheet(jobId);
  syncDriverToSheet(driverId);

  sendSmsStub(job.customer_phone, `Driver ${driver.name} has been assigned to booking ${jobId}.`);
  res.json({ ok: true, status: 'ASSIGNED', driverId });
});

function driverName(id) {
  const d = db.prepare('SELECT name FROM drivers WHERE id = ?').get(id);
  return d ? d.name : 'Your driver';
}

function jobResponse(row) {
  const driver = row.driver_id ? db.prepare('SELECT last_lat, last_lng, last_location_at FROM drivers WHERE id = ?').get(row.driver_id) : null;
  return {
    jobId: row.id,
    status: row.status,
    driverId: row.driver_id,
    driverLat: driver ? driver.last_lat : null,
    driverLng: driver ? driver.last_lng : null,
    driverLocationAt: driver ? driver.last_location_at : null,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    pickupAddress: row.pickup_address,
    dropoffAddress: row.dropoff_address,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    dropoffLat: row.dropoff_lat,
    dropoffLng: row.dropoff_lng,
    pickupTime: row.pickup_time,
    vehicleType: row.vehicle_type,
    fare: row.fare,
    bookingFee: row.booking_fee,
    commissionRate: row.commission_rate,
    commissionAmount: row.commission_amount,
    paymentStatus: row.payment_status,
    trackingToken: row.tracking_token,
    createdAt: row.created_at,
    onWayAt: row.on_way_at,
    arrivedAt: row.arrived_at,
    pobAt: row.pob_at,
    completedAt: row.completed_at
  };
}

function getNextMonday10am() {
  const now = new Date();
  const target = new Date(now);
  const day = now.getDay();
  const daysUntil = (1 - day + 7) % 7 || 7;
  target.setDate(now.getDate() + daysUntil);
  target.setHours(10, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 7);
  return target;
}

function runStatements() {
  console.log('Running weekly driver statements');
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentJobs = db.prepare('SELECT * FROM jobs WHERE status = ? AND commission_amount > 0 AND completed_at >= ?').all('COMPLETE', oneWeekAgo);
  const jobsByDriver = {};
  for (const job of recentJobs) {
    if (!jobsByDriver[job.driver_id]) jobsByDriver[job.driver_id] = [];
    jobsByDriver[job.driver_id].push(job);
  }
  const driversWithBalance = db.prepare('SELECT * FROM drivers WHERE settle_balance > 0').all();
  for (const driver of driversWithBalance) {
    if (!jobsByDriver[driver.id]) jobsByDriver[driver.id] = [];
  }
  for (const driverId of Object.keys(jobsByDriver)) {
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    if (!driver) continue;
    const thisWeekJobs = jobsByDriver[driverId];
    const thisWeekTotal = thisWeekJobs.reduce((sum, j) => sum + (j.commission_amount || 0), 0);
    const previousBalance = Math.max(0, driver.settle_balance - thisWeekTotal);
    let body = `Weekly settle statement for ${driver.name}\n`;
    body += `Previous balance: £${previousBalance.toFixed(2)}\n`;
    body += `This week:\n`;
    if (thisWeekJobs.length === 0) {
      body += `  No new jobs\n`;
    } else {
      for (const j of thisWeekJobs) {
        body += `  ${j.id}: fare £${j.fare.toFixed(2)} @ ${driver.commission_rate || 0}% = £${j.commission_amount.toFixed(2)}\n`;
      }
    }
    body += `Total owed: £${driver.settle_balance.toFixed(2)}`;
    sendDriverStatement(driver.phone, body);
  }
}

function scheduleStatements() {
  const next = getNextMonday10am();
  const delay = next - new Date();
  console.log(`Next driver statement run scheduled for ${next.toISOString()}`);
  setTimeout(() => {
    runStatements();
    setInterval(runStatements, 7 * 24 * 60 * 60 * 1000);
  }, delay);
}

app.listen(PORT, () => {
  console.log(`MVP server running on http://localhost:${PORT}`);
  if (process.env.GOOGLE_SHEET_ID) {
    syncSheetHeaders().catch(err => console.error('Failed to sync sheet headers:', err.message));
  }
  scheduleStatements();
});
