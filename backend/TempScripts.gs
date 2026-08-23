// Temporary cleanup script. Copy this into the Apps Script editor and run resetJobsAndDrivers().
function resetJobsAndDrivers() {
  // Delete all job rows except header
  const jobsSheet = getJobsSheet();
  const jobRows = jobsSheet.getLastRow();
  if (jobRows > 1) jobsSheet.deleteRows(2, jobRows - 1);

  // Delete all offer rows except header
  const offersSheet = getOffersSheet();
  const offerRows = offersSheet.getLastRow();
  if (offerRows > 1) offersSheet.deleteRows(2, offerRows - 1);

  // Reset every driver to AVAILABLE
  getDrivers().forEach(d => {
    updateDriver(d.id, { status: 'AVAILABLE', available_since: new Date().toISOString() });
  });

  Logger.log('All jobs deleted, offers cleared, drivers set to AVAILABLE.');
}
