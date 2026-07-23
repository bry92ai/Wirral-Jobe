export function loadGoogleMapsScript(apiKey, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) return resolve();
    if (!apiKey) return reject(new Error('Google Maps API key is missing.'));

    const existing = document.querySelector('script[data-google-maps]');
    if (existing && existing.dataset.error) return reject(new Error(existing.dataset.error));

    let resolved = false;
    const cleanup = () => {
      if (window.gm_authFailure === onAuthFailure) window.gm_authFailure = null;
      if (window.__gmLoadPromiseResolve === onInit) window.__gmLoadPromiseResolve = null;
    };

    const finish = (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err);
      else resolve();
    };

    const onAuthFailure = () => {
      const msg = 'Google Maps API key is invalid or restricted. Please check the key and ensure the Maps JavaScript API is enabled.';
      const script = document.querySelector('script[data-google-maps]');
      if (script) script.dataset.error = msg;
      finish(new Error(msg));
    };

    const onInit = () => {
      if (window.google?.maps?.Map) finish();
      else finish(new Error('Google Maps script loaded but the maps object is not available.'));
    };

    const timer = setTimeout(() => {
      finish(new Error('Google Maps took too long to load. Check your API key and network connection.'));
    }, timeoutMs);

    window.gm_authFailure = onAuthFailure;
    window.__gmLoadPromiseResolve = onInit;

    if (existing) {
      existing.addEventListener('load', onInit);
      existing.addEventListener('error', () => finish(new Error('Failed to load Google Maps.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=places,geometry&callback=__gmLoadPromiseResolve`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.onerror = () => finish(new Error('Failed to load Google Maps.'));
    document.head.appendChild(script);
  });
}

export function loadLeaflet(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);

    const existingScript = document.querySelector('script[data-leaflet-js]');
    if (existingScript) {
      if (existingScript.dataset.error) return reject(new Error(existingScript.dataset.error));
      existingScript.addEventListener('load', () => resolve(window.L));
      existingScript.addEventListener('error', () => reject(new Error('Leaflet failed to load.')));
      return;
    }

    let resolved = false;
    const finish = (err, L) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (err) {
        const script = document.querySelector('script[data-leaflet-js]');
        if (script) script.dataset.error = err.message;
        reject(err);
      } else {
        resolve(L);
      }
    };

    const timer = setTimeout(() => finish(new Error('Leaflet took too long to load.')), timeoutMs);

    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.dataset.leafletCss = 'true';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.leafletJs = 'true';
    script.onload = () => finish(null, window.L);
    script.onerror = () => finish(new Error('Leaflet failed to load.'));
    document.head.appendChild(script);
  });
}
