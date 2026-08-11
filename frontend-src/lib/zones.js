import FLIGHTPATH_ZONES_DATA from '../data/flightpathZones.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

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

function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findZone(lat, lng, collection = FLIGHTPATH_ZONES) {
  if (lat == null || lng == null) return null;
  const matches = collection.features.filter(f => {
    try { return booleanPointInPolygon([lng, lat], f); } catch { return false; }
  });
  if (matches.length === 0) return findNearestZone(lat, lng, collection);

  const internal = matches.filter(f => !f.properties.external && f.properties.zoneId !== 'international');
  const candidates = internal.length ? internal : matches;

  return pickBestZone(candidates, lat, lng);
}

function pickBestZone(features, lat, lng) {
  let best = features[0];
  let bestDist = Infinity;
  for (const f of features) {
    const props = f.properties;
    const d = distanceMetres(lat, lng, props.labelLat, props.labelLng);
    if (d < bestDist - 0.001) {
      bestDist = d;
      best = f;
    } else if (Math.abs(d - bestDist) < 0.001 && props.displayOrder < best.properties.displayOrder) {
      best = f;
    }
  }
  return best;
}

function findNearestZone(lat, lng, collection = FLIGHTPATH_ZONES, maxMetres = 5000) {
  let best = null;
  let bestDist = Infinity;
  for (const f of collection.features) {
    const props = f.properties;
    if (props.zoneId === 'international') continue;
    const lat2 = props.centerLat != null ? props.centerLat : props.labelLat;
    const lng2 = props.centerLng != null ? props.centerLng : props.labelLng;
    if (lat2 == null || lng2 == null) continue;
    const d = distanceMetres(lat, lng, lat2, lng2);
    if (d < bestDist) { bestDist = d; best = f; }
  }
  if (bestDist <= maxMetres) return best;
  const intl = collection.features.find(f => f.properties.zoneId === 'international');
  return intl || null;
}

export const findWirralZone = findZone;
