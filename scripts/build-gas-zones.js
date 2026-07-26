import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const geojson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'wirralTaxiZones.geojson'), 'utf8'));

const header = `// Auto-generated Wirral Flightpath operational taxi zones
const WIRRAL_TAXI_ZONES = `;
const footer = `;

function _distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _pointInRing(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const onSeg = (lat - yi) * (xj - xi) === (lng - xi) * (yj - yi) &&
      Math.min(xi, xj) <= lng && lng <= Math.max(xi, xj) &&
      Math.min(yi, yj) <= lat && lat <= Math.max(yi, yj);
    if (onSeg) return 'boundary';
    const inter = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (inter) inside = !inside;
  }
  return inside;
}

function _pointInGeometry(lng, lat, geometry) {
  if (geometry.type === 'Polygon') {
    const outer = _pointInRing(lng, lat, geometry.coordinates[0]);
    if (outer !== true) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (_pointInRing(lng, lat, geometry.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (let p = 0; p < geometry.coordinates.length; p++) {
      const polygon = geometry.coordinates[p];
      if (_pointInRing(lng, lat, polygon[0]) !== true) continue;
      let inHole = false;
      for (let i = 1; i < polygon.length; i++) {
        if (_pointInRing(lng, lat, polygon[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

function findWirralZone(lat, lng) {
  if (lat == null || lng == null) return null;
  const matches = [];
  for (const f of WIRRAL_TAXI_ZONES.features) {
    if (_pointInGeometry(lng, lat, f.geometry)) matches.push(f);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  let best = matches[0];
  let bestDist = Infinity;
  for (const f of matches) {
    const p = f.properties;
    const d = _distanceMetres(lat, lng, p.labelLat, p.labelLng);
    if (d < bestDist - 0.001) {
      bestDist = d;
      best = f;
    } else if (Math.abs(d - bestDist) < 0.001 && p.displayOrder < best.properties.displayOrder) {
      best = f;
    }
  }
  return best;
}

function getZoneName(zoneId) {
  const f = WIRRAL_TAXI_ZONES.features.find(z => z.properties.zoneId === zoneId);
  return f ? f.properties.zoneName : zoneId || 'Unknown';
}
`;

const content = header + JSON.stringify(geojson) + footer;
fs.writeFileSync(path.join(__dirname, '..', 'backend', 'Zones.gs'), content);
console.log('backend/Zones.gs written');
