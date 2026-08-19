// Temporary cleanup script. Paste this into the Apps Script editor and run resetAll().
function resetAll() {
  clearSheetRows(getJobsSheet());
  clearSheetRows(getPendingBookingsSheet());
  clearSheetRows(getOffersSheet());
  clearSheetRows(getFutureOffersSheet());
  clearSheetRows(getBidsSheet());
  clearSheetRows(getDriverApplicationsSheet());
  clearSheetRows(getCustomersSheet());
  clearSheetRows(getPlacesSheet());
  clearSheetRows(getCustomerOtpsSheet());
  clearSheetRows(getCustomerTokensSheet());
  clearSheetRows(getDriversSheet());
  Logger.log('All job, customer, driver and token rows cleared.');
}

function clearSheetRows(sheet) {
  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
}
