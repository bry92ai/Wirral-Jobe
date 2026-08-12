const WJ_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

const WJ_SCHEMAS = {
  Settings: ['key', 'value', 'updated_at'],
  Customers: ['id', 'name', 'phone', 'email', 'pin_hash', 'created_at', 'status', 'updated_at', 'last_login_at', 'fcm_token'],
  'Saved Places': ['id', 'customer_id', 'label', 'address', 'lat', 'lng', 'type', 'created_at', 'updated_at'],
  Jobs: ['created_at', 'id', 'status', 'driver_id', 'customer_name', 'customer_phone', 'pickup_address', 'dropoff_address', 'pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng', 'pickup_time', 'vehicle_type', 'miles', 'fare', 'booking_fee', 'payment_id', 'payment_status', 'commission_rate', 'commission_amount', 'tracking_token', 'on_way_at', 'arrived_at', 'pob_at', 'completed_at', 'customer_id', 'passengers', 'notes', 'return_job_id', 'cancelled_at', 'updated_at'],
  Drivers: ['id', 'name', 'phone', 'pin', 'vehicle_type', 'license_type', 'vehicle_make_model_colour', 'reg_last_3', 'expiry_date', 'badge_number', 'status', 'zone', 'last_lat', 'last_lng', 'last_location_at', 'commission_rate', 'settle_balance', 'available_since', 'created_at', 'updated_at', 'pin_hash'],
  Offers: ['jobId', 'currentDriverId', 'offeredDrivers', 'expiresAt', 'pickupLat', 'pickupLng'], 
  'Driver Locations': ['id', 'driver_id', 'lat', 'lng', 'zone', 'recorded_at'],
  'Driver Applications': ['id', 'status', 'badge_url', 'badge_public_id', 'continuation_token', 'name', 'phone', 'pin_hash', 'vehicle_type', 'license_type', 'vehicle_make_model_colour', 'reg_last_3', 'expiry_date', 'badge_number', 'created_at', 'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason', 'driver_id'],
  Payments: ['id', 'job_id', 'customer_id', 'provider', 'provider_reference', 'amount', 'currency', 'status', 'created_at', 'updated_at'],
  'SMS Log': ['id', 'customer_id', 'phone', 'message_type', 'provider_reference', 'status', 'created_at'],
  'Audit Log': ['id', 'actor_type', 'actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at']
};

function buildWirralJobeSpreadsheet() {
  const spreadsheet = WJ_SPREADSHEET_ID ? SpreadsheetApp.openById(WJ_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Set SPREADSHEET_ID or run this script from the target spreadsheet.');
  Object.keys(WJ_SCHEMAS).forEach(name => upgradeWirralJobeSheet(spreadsheet, name, WJ_SCHEMAS[name]));
  seedWirralJobeSettings(spreadsheet);
  return { ok: true, spreadsheetId: spreadsheet.getId(), sheets: Object.keys(WJ_SCHEMAS) };
}

function upgradeWirralJobeSheet(spreadsheet, name, requiredHeaders) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    const existingWidth = Math.max(sheet.getLastColumn(), 1);
    const existingHeaders = sheet.getRange(1, 1, 1, existingWidth).getValues()[0].map(value => String(value || '').trim());
    const missingHeaders = requiredHeaders.filter(header => !existingHeaders.includes(header));
    if (missingHeaders.length) sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#f4bf1b').setFontColor('#080704');
  sheet.autoResizeColumns(1, Math.min(sheet.getLastColumn(), 12));
}

function seedWirralJobeSettings(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('Settings');
  const values = sheet.getDataRange().getValues();
  const present = values.slice(1).map(row => row[0]);
  const now = new Date().toISOString();
  const defaults = {
    business_name: 'The Wirral Jobe',
    currency: 'GBP',
    default_country: 'GB',
    sms_enabled: 'false',
    payment_provider: 'disabled',
    customer_pin_delivery: 'screen'
  };
  Object.keys(defaults).forEach(key => {
    if (!present.includes(key)) sheet.appendRow([key, defaults[key], now]);
  });
}
