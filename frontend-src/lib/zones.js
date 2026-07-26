import FLIGHTPATH_ZONES_DATA from '../data/flightpathZones.js';

export const FLIGHTPATH_ZONES = FLIGHTPATH_ZONES_DATA;

export const ZONES = FLIGHTPATH_ZONES.features.map(f => ({
  id: f.properties.zoneId,
  lat: f.properties.labelLat,
  lng: f.properties.labelLng
}));

export function getZone(lat, lng) {
  const feature = findZone(lat, lng);
  return feature ? feature.properties.zoneId : null;
}

export function getZoneById(zoneId) {
  return FLIGHTPATH_ZONES.features.find(f => f.properties.zoneId === zoneId) || null;
}

export function getZoneName(zoneId) {
  const f = getZoneById(zoneId);
  return f ? f.properties.zoneName : zoneId || 'Unknown';
}

// Haversine distance in metres between two WGS84 points.
function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const onSegment = (lat - yi) * (xj - xi) === (lng - xi) * (yj - yi) &&
      Math.min(xi, xj) <= lng && lng <= Math.max(xi, xj) &&
      Math.min(yi, yj) <= lat && lat <= Math.max(yi, yj);
    if (onSegment) return 'boundary';
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(lng, lat, geometry) {
  const type = geometry.type;
  if (type === 'Polygon') {
    const outer = pointInRing(lng, lat, geometry.coordinates[0]);
    if (outer === true) {
      for (let i = 1; i < geometry.coordinates.length; i++) {
        if (pointInRing(lng, lat, geometry.coordinates[i])) return false;
      }
      return true;
    }
    return false;
  }
  if (type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      const outer = pointInRing(lng, lat, polygon[0]);
      if (outer !== true) continue;
      let inHole = false;
      for (let i = 1; i < polygon.length; i++) {
        if (pointInRing(lng, lat, polygon[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

export function findZone(lat, lng, collection = FLIGHTPATH_ZONES) {
  if (lat == null || lng == null) return null;
  const matches = collection.features.filter(f => pointInPolygonGeometry(lng, lat, f.geometry));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  let best = matches[0];
  let bestDist = Infinity;
  for (const f of matches) {
    const props = f.properties;
    const d = distanceMetres(lat, lng, props.labelLat, props.labelLng);
    if (d < bestDist - 0.001) {
      bestDist = d;
      best = f;
    } else if (Math.abs(d - bestDist) < 0.001) {
      if (props.displayOrder < best.properties.displayOrder) best = f;
    }
  }
  return best;
}

export const findWirralZone = findZone;
