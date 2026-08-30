import { Capacitor, registerPlugin } from '@capacitor/core';

const DriverService = registerPlugin('DriverService');
const API_URL = import.meta.env.VITE_API_URL || '';

export async function startDriverService({ driverId, driverToken, status, jobId, fare } = {}) {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    await DriverService.start({
      apiUrl: API_URL,
      driverId: driverId || '',
      driverToken: driverToken || '',
      status: status || 'AVAILABLE',
      jobId: jobId || '',
      fare: String(fare || '0')
    });
    console.log('Driver foreground service started');
    return { ok: true };
  } catch (e) {
    console.warn('Failed to start driver service:', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function updateDriverService({ status, jobId, fare } = {}) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await DriverService.update({
      status: status || 'AVAILABLE',
      jobId: jobId || '',
      fare: String(fare || '0')
    });
    console.log('Driver foreground service updated');
  } catch (e) {
    console.warn('Failed to update driver service:', e);
  }
}

export async function stopDriverService() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await DriverService.stop();
    console.log('Driver foreground service stopped');
  } catch (e) {
    console.warn('Failed to stop driver service:', e);
  }
}
