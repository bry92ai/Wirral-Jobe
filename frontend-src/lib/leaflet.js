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

export const speedCameraIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect x="2" y="7" width="13" height="9" rx="2" fill="#ef4444" stroke="white" stroke-width="1.5"/><circle cx="8.5" cy="11.5" r="2.5" fill="#111"/><circle cx="8.5" cy="11.5" r="1.2" fill="#ef4444"/><path d="M15 9l6-2.5v9L15 13z" fill="#374151"/></svg>`;

export const policeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#3b82f6" stroke="white" stroke-width="1.5"/><path d="M12 7v8M8 11l4-4 4 4" stroke="white" stroke-width="2" fill="none"/></svg>`;

export const hazardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M12 2L1 22h22L12 2z" fill="#f59e0b" stroke="white" stroke-width="1.5"/><path d="M12 8v7M12 17h.01" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;

function arrowPath(maneuver) {
  const m = String(maneuver || '').toLowerCase();
  if (m.includes('sharp-left')) return '<path d="M16 4L6 12l10 8V4z" transform="rotate(-45 11 12)"/>';
  if (m.includes('sharp-right')) return '<path d="M16 4L6 12l10 8V4z" transform="rotate(45 11 12)"/>';
  if (m.includes('uturn')) return '<path d="M12 4v10c0 2.2-1.8 4-4 4s-4-1.8-4-4V6h2v8c0 1.1.9 2 2 2s2-.9 2-2V6h4"/>';
  if (m.includes('roundabout-left') || m.includes('roundabout-right')) return '<path d="M12 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3v4l3 3"/>';
  if (m.includes('ramp-left') || m.includes('fork-left') || m.includes('keep-left') || m.includes('end-of-road-left') || m.includes('turn-left')) return '<path d="M18 6L8 12l10 6V6z"/>';
  if (m.includes('ramp-right') || m.includes('fork-right') || m.includes('keep-right') || m.includes('end-of-road-right') || m.includes('turn-right')) return '<path d="M6 6l10 6-10 6V6z"/>';
  return '<path d="M6 12h12M13 5l7 7-7 7"/>'; // straight / default
}

export function maneuverIconSvg(maneuver, size = 56) {
  const path = arrowPath(maneuver);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export function coinIconHtml(size = 32) {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#ffd700,#d4af37);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#3a2e08;font-weight:900;font-size:${Math.round(size * 0.55)}px;line-height:1">£</div>`;
}

export function coinIcon(L, size = 32, className = '') {
  return divIcon(L, coinIconHtml(size), `coin-marker ${className}`, size);
}
