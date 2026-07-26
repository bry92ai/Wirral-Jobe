export function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (document.querySelector('script[data-leaflet-js]')) {
      const script = document.querySelector('script[data-leaflet-js]');
      script.addEventListener('load', () => resolve(window.L));
      script.addEventListener('error', () => reject(new Error('Leaflet script failed')));
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.leafletJs = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

export function vehicleIconHtml(type, color, heading = null, size = 28) {
  const isMpv = type === 'mpv';
  const body = isMpv
    ? `<rect x="4" y="6" width="16" height="10" rx="2" fill="${color}"/><rect x="6" y="8" width="8" height="4" rx="1" fill="rgba(255,255,255,0.25)"/><circle cx="7.5" cy="16.5" r="1.8" fill="#333"/><circle cx="16.5" cy="16.5" r="1.8" fill="#333"/><rect x="9" y="3" width="6" height="4" rx="1" fill="${color}"/>`
    : `<rect x="5" y="6" width="14" height="9" rx="2" fill="${color}"/><rect x="7" y="8" width="6" height="3" rx="1" fill="rgba(255,255,255,0.25)"/><circle cx="7" cy="16" r="1.8" fill="#333"/><circle cx="17" cy="16" r="1.8" fill="#333"/><rect x="8" y="3" width="8" height="4" rx="1" fill="${color}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
  const rotate = heading != null && !Number.isNaN(heading) ? `transform:rotate(${heading}deg);` : '';
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${rotate}">${svg}</div>`;
}

export function divIcon(L, html, className = '', size = 28) {
  return L.divIcon({
    className: `custom-marker ${className}`,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

export function vehicleIcon(L, type, color, heading = null, size = 28, className = '') {
  return divIcon(L, vehicleIconHtml(type, color, heading, size), className, size);
}

export function headingIconHtml(color, heading = null, size = 36) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36"><path d="M18 2 L26 30 L18 24 L10 30 Z" fill="${color}" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><circle cx="18" cy="24" r="3" fill="white"/></svg>`;
  const rotate = heading != null && !Number.isNaN(heading) ? `transform:rotate(${heading}deg);` : '';
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${rotate}">${svg}</div>`;
}

export function headingIcon(L, color, heading, size = 36, className = '') {
  return divIcon(L, headingIconHtml(color, heading, size), className, size);
}

export const pickupIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#22c55e" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
export const dropoffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#ef4444" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
