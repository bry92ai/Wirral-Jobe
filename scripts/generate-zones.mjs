import fs from 'fs';

const INPUT = 'src/data/wirralTaxiZones.geojson';
const OUTPUT = 'src/data/flightpathZones.geojson';
const BACKEND = 'backend/Zones.gs';

const wirral = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

function outerRings(feature) {
  const coords = feature.geometry.coordinates;
  if (feature.geometry.type === 'Polygon') return [coords[0]];
  if (feature.geometry.type === 'MultiPolygon') return coords.map(p => p[0]);
  return [];
}

const wirralHoles = wirral.features.flatMap(outerRings);

const EXTERNAL_BOUNDS = { latMin: 45, latMax: 60, lngMin: -10, lngMax: 5 };
const LAT_SPLITS = [EXTERNAL_BOUNDS.latMax, 53.5, 51.0, EXTERNAL_BOUNDS.latMin];
const LNG_SPLITS = [EXTERNAL_BOUNDS.lngMin, -3.5, -0.5, EXTERNAL_BOUNDS.lngMax];

const CELL_NAMES = [
  ['lancashire', 'liverpool', 'manchester'],
  ['north-wales', 'merseyside', 'warrington'],
  ['shropshire', 'chester', 'runcorn-widnes']
];

const CELL_LABELS = {
  'lancashire': [-6.75, 56.75],
  'liverpool': [-2.0, 56.75],
  'manchester': [2.25, 56.75],
  'north-wales': [-6.75, 52.25],
  'merseyside': [-2.0, 52.25],
  'warrington': [2.25, 52.25],
  'shropshire': [-6.75, 48.0],
  'chester': [-2.0, 48.0],
  'runcorn-widnes': [2.25, 48.0]
};

const externalFeatures = [];
let displayOrder = 100;

for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    const zoneId = CELL_NAMES[row][col];
    const lngMin = LNG_SPLITS[col];
    const lngMax = LNG_SPLITS[col + 1];
    const latMax = LAT_SPLITS[row];
    const latMin = LAT_SPLITS[row + 1];
    const ring = [
      [lngMin, latMin],
      [lngMax, latMin],
      [lngMax, latMax],
      [lngMin, latMax],
      [lngMin, latMin]
    ];
    const [labelLng, labelLat] = CELL_LABELS[zoneId];
    externalFeatures.push({
      type: 'Feature',
      properties: {
        zoneId,
        zoneName: zoneId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        displayOrder: displayOrder++,
        labelLat,
        labelLng,
        external: true
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring, ...wirralHoles]
      }
    });
  }
}

const worldRing = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90]
];
const worldHoles = [
  ...wirralHoles,
  ...externalFeatures.flatMap(outerRings)
];
externalFeatures.push({
  type: 'Feature',
  properties: {
    zoneId: 'international',
    zoneName: 'International',
    displayOrder: displayOrder++,
    labelLat: 0,
    labelLng: 0,
    external: true
  },
  geometry: {
    type: 'Polygon',
    coordinates: [worldRing, ...worldHoles]
  }
});

const combined = {
  type: 'FeatureCollection',
  name: 'Flightpath operational zones',
  source: 'Wirral wards + generated regional zones',
  generated: new Date().toISOString(),
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  features: [...wirral.features, ...externalFeatures]
};

fs.writeFileSync(OUTPUT, JSON.stringify(combined));

const JS_OUTPUT = 'src/data/flightpathZones.js';
fs.writeFileSync(JS_OUTPUT, `export default ${JSON.stringify(combined)};\n`);

const geoJsonString = JSON.stringify(combined);

const backendCode = `// Auto-generated Flightpath operational zones
const FLIGHTPATH_ZONES = ${geoJsonString};

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
  return findZone(lat, lng);
}

function findZone(lat, lng) {
  if (lat == null || lng == null) return null;
  const matches = [];
  for (const f of FLIGHTPATH_ZONES.features) {
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
  const f = FLIGHTPATH_ZONES.features.find(z => z.properties.zoneId === zoneId);
  return f ? f.properties.zoneName : zoneId || 'Unknown';
}
`;

fs.writeFileSync(BACKEND, backendCode);

console.log(`Wrote ${OUTPUT} with ${combined.features.length} features`);
console.log(`Wrote ${JS_OUTPUT}`);
console.log(`Wrote ${BACKEND}`);

function _containsPoint(lat, lng, geometry) {
  if (geometry.type === 'Polygon') {
    const outer = _ringContains(lng, lat, geometry.coordinates[0]);
    if (outer !== true) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (_ringContains(lng, lat, geometry.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      const outer = _ringContains(lng, lat, polygon[0]);
      if (outer !== true) continue;
      let inHole = false;
      for (let i = 1; i < polygon.length; i++) {
        if (_ringContains(lng, lat, polygon[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

function _ringContains(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const inter = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (inter) inside = !inside;
  }
  return inside;
}

function _distance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _findZone(lat, lng) {
  if (lat == null || lng == null) return null;
  const matches = [];
  for (const f of combined.features) {
    if (_containsPoint(lat, lng, f.geometry)) matches.push(f);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  let best = matches[0];
  let bestDist = Infinity;
  for (const f of matches) {
    const p = f.properties;
    const d = _distance(lat, lng, p.labelLat, p.labelLng);
    if (d < bestDist - 0.001) { bestDist = d; best = f; }
    else if (Math.abs(d - bestDist) < 0.001 && p.displayOrder < best.properties.displayOrder) { best = f; }
  }
  return best;
}

function validate() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  function countMatches(lat, lng) {
    let n = 0;
    for (const f of combined.features) {
      if (_containsPoint(lat, lng, f.geometry)) n++;
    }
    return n;
  }

  for (const f of combined.features) {
    const p = f.properties;
    const zone = _findZone(p.labelLat, p.labelLng);
    assert(zone, `No zone at label for ${p.zoneId}`);
    assert(zone.properties.zoneId === p.zoneId, `Label point for ${p.zoneId} resolved to ${zone.properties.zoneId}`);
    const matches = countMatches(p.labelLat, p.labelLng);
    assert(matches === 1, `Expected exactly 1 match at label for ${p.zoneId}, got ${matches}`);
  }

  const farPoints = [
    { lat: 40.71, lng: -74.01 },
    { lat: 70.0, lng: 0.0 },
    { lat: -33.87, lng: 151.21 }
  ];
  for (const pt of farPoints) {
    const zone = _findZone(pt.lat, pt.lng);
    assert(zone && zone.properties.zoneId === 'international', `Far point ${JSON.stringify(pt)} should be international, got ${zone?.properties.zoneId}`);
    assert(countMatches(pt.lat, pt.lng) === 1, `Far point ${JSON.stringify(pt)} did not have exactly one match`);
  }

  const randomChecks = 200;
  for (let i = 0; i < randomChecks; i++) {
    const lat = 45 + Math.random() * 15;
    const lng = -10 + Math.random() * 15;
    const matches = countMatches(lat, lng);
    assert(matches === 1, `Random point ${lat},${lng} had ${matches} matches`);
  }

  console.log('Validation passed');
}

validate();
