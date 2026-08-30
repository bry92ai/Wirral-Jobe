import { Capacitor, registerPlugin } from '@capacitor/core';

const LocationPermission = registerPlugin('LocationPermission');

export async function checkBackgroundLocationPermission() {
  if (!Capacitor.isNativePlatform()) return { backgroundLocation: 'granted', needsSettings: false };
  try {
    return await LocationPermission.checkLocationPermissions();
  } catch (e) {
    console.warn('checkLocationPermissions failed:', e);
    return { backgroundLocation: 'denied', needsSettings: false };
  }
}

export async function requestBackgroundLocationPermission() {
  if (!Capacitor.isNativePlatform()) return { backgroundLocation: 'granted', needsSettings: false };
  try {
    return await LocationPermission.requestBackgroundLocation();
  } catch (e) {
    console.warn('requestBackgroundLocation failed:', e);
    return { backgroundLocation: 'denied', needsSettings: true };
  }
}

export async function openAppSettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocationPermission.openSettings();
  } catch (e) {
    console.warn('openAppSettings failed:', e);
    throw e;
  }
}
