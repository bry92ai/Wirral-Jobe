import { Capacitor, registerPlugin } from '@capacitor/core';

const DriverService = registerPlugin('DriverService');

export async function startDriverService() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await DriverService.start();
    console.log('Driver foreground service started');
  } catch (e) {
    console.warn('Failed to start driver service:', e);
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
