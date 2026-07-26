import { google } from 'googleapis';
import fs from 'fs';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const BOOKINGS_SHEET = process.env.GOOGLE_BOOKINGS_SHEET_NAME || 'Bookings';
const DRIVERS_SHEET = process.env.GOOGLE_DRIVERS_SHEET_NAME || 'Drivers';

let sheetsClient = null;

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  return null;
}

function initSheets() {
  if (!SHEET_ID) {
    console.warn('GOOGLE_SHEET_ID is not set; Google Sheets integration disabled.');
    return null;
  }
  const credentials = getCredentials();
  if (!credentials) {
    console.warn('Google Sheets service account credentials not found; integration disabled.');
    return null;
  }
  try {
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('Failed to initialise Google Sheets:', err.message);
    return null;
  }
}

async function ensureTabs() {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = (meta.data.sheets || []).map(s => s.properties.title);
  const missing = [];
  if (!existing.includes(BOOKINGS_SHEET)) missing.push(BOOKINGS_SHEET);
  if (!existing.includes(DRIVERS_SHEET)) missing.push(DRIVERS_SHEET);
  if (missing.length === 0) return;
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: missing.map(title => ({ addSheet: { properties: { title } } }))
    }
  });
}

export async function appendBookingRow(row) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  await ensureTabs();
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

export async function appendDriverRow(row) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  await ensureTabs();
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${DRIVERS_SHEET}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function findRow(sheetName, id, idColumnIndex = 0) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return null;
  await ensureTabs();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][idColumnIndex] === id) return i + 1;
  }
  return null;
}

export async function findRowByJobId(jobId) {
  return findRow(BOOKINGS_SHEET, jobId, 1);
}

export async function findRowByDriverId(driverId) {
  return findRow(DRIVERS_SHEET, driverId, 0);
}

export async function updateBookingRow(rowNumber, values) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A${rowNumber}:M${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  });
}

export async function updateDriverRow(rowNumber, values) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${DRIVERS_SHEET}!A${rowNumber}:N${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] }
  });
}

export async function syncSheetHeaders() {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  await ensureTabs();
  const bookingHeaders = ['Timestamp', 'Job ID', 'Customer name', 'Phone', 'Pickup address', 'Drop-off address', 'Miles', 'Vehicle type', 'Fare', 'Booking fee', 'Payment status', 'Status', 'Driver ID'];
  const driverHeaders = ['Driver ID', 'Name', 'Phone', 'Vehicle type', 'License type', 'Vehicle make/model/colour', 'Reg last 3', 'Expiry date', 'Badge number', 'Status', 'Zone', 'Last lat', 'Last lng', 'Last location at'];
  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${BOOKINGS_SHEET}!A1:M1`, values: [bookingHeaders] },
        { range: `${DRIVERS_SHEET}!A1:N1`, values: [driverHeaders] }
      ]
    }
  });
}
