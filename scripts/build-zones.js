import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import union from '@turf/union';
import booleanOverlap from '@turf/boolean-overlap';
import booleanValid from '@turf/boolean-valid';
import { area } from '@turf/area';
import { point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import centroid from '@turf/centroid';
import pointOnFeature from '@turf/point-on-feature';
import intersect from '@turf/intersect';
import difference from '@turf/difference';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'wirral_wards_raw.geojson'), 'utf8'));

const sourceWards = raw.features.filter(f => f.properties.WD24CD && f.properties.WD24CD.match(/^E050009(5[4-9]|6[0-9]|7[0-5])$/));

// Map operational zones to one or more official 2024 Wirral ward names.
const ZONE_PLAN = [
  { zoneId: 'new-brighton', zoneName: 'New Brighton', wards: ['New Brighton'], displayOrder: 1 },
  { zoneId: 'wallasey', zoneName: 'Wallasey', wards: ['Wallasey'], displayOrder: 2 },
  { zoneId: 'liscard-egremont', zoneName: 'Liscard & Egremont', wards: ['Liscard'], displayOrder: 3 },
  { zoneId: 'seacombe', zoneName: 'Seacombe', wards: ['Seacombe'], displayOrder: 4 },
  { zoneId: 'leasowe-moreton-east', zoneName: 'Leasowe & Moreton East', wards: ['Leasowe and Moreton East'], displayOrder: 5 },
  { zoneId: 'moreton-west-saughall-massie', zoneName: 'Moreton West & Saughall Massie', wards: ['Moreton West and Saughall Massie'], displayOrder: 6 },
  { zoneId: 'hoylake-meols', zoneName: 'Hoylake & Meols', wards: ['Hoylake and Meols'], displayOrder: 7 },
  { zoneId: 'west-kirby-thurstaston', zoneName: 'West Kirby & Thurstaston', wards: ['West Kirby and Thurstaston'], displayOrder: 8 },
  { zoneId: 'greasby-frankby-irby', zoneName: 'Greasby, Frankby & Irby', wards: ['Greasby, Frankby and Irby'], displayOrder: 9 },
  { zoneId: 'upton-woodchurch', zoneName: 'Upton & Woodchurch', wards: ['Upton'], displayOrder: 10 },
  { zoneId: 'bidston-st-james', zoneName: 'Bidston & St James', wards: ['Bidston and St James'], displayOrder: 11 },
  { zoneId: 'claughton-noctorum', zoneName: 'Claughton & Noctorum', wards: ['Claughton'], displayOrder: 12 },
  { zoneId: 'birkenhead-tranmere', zoneName: 'Birkenhead & Tranmere', wards: ['Birkenhead and Tranmere'], displayOrder: 13 },
  { zoneId: 'oxton-prenton', zoneName: 'Oxton & Prenton', wards: ['Oxton', 'Prenton'], displayOrder: 14 },
  { zoneId: 'rock-ferry-bebington', zoneName: 'Rock Ferry & Bebington', wards: ['Rock Ferry', 'Bebington'], displayOrder: 15 },
  { zoneId: 'bromborough-eastham', zoneName: 'Bromborough & Eastham', wards: ['Bromborough', 'Eastham'], displayOrder: 16 },
  { zoneId: 'heswall-pensby-thingwall', zoneName: 'Heswall, Pensby & Thingwall', wards: ['Heswall', 'Pensby and Thingwall'], displayOrder: 17 },
  { zoneId: 'clatterbridge', zoneName: 'Clatterbridge', wards: ['Clatterbridge'], displayOrder: 18 }
];

function findWard(name) {
  const w = sourceWards.find(f => f.properties.WD24NM === name);
  if (!w) throw new Error(`Ward not found: ${name}`);
  return w;
}

function mergeFeatures(features) {
  if (features.length === 1) return JSON.parse(JSON.stringify(features[0]));
  const fc = { type: 'FeatureCollection', features };
  const merged = union(fc);
  if (!merged) throw new Error('Union failed');
  // turf.union may return MultiPolygon; keep it.
  merged.properties = {};
  return merged;
}

const features = [];

for (const plan of ZONE_PLAN) {
  const wardFeatures = plan.wards.map(findWard);
  const geometry = mergeFeatures(wardFeatures);
  const labelPoint = pointOnFeature(geometry);
  const [labelLng, labelLat] = labelPoint.geometry.coordinates;
  const centerPoint = centroid(geometry);
  const [centerLng, centerLat] = centerPoint.geometry.coordinates;
  features.push({
    type: 'Feature',
    properties: {
      zoneId: plan.zoneId,
      zoneName: plan.zoneName,
      displayOrder: plan.displayOrder,
      enabled: true,
      sourceWards: plan.wards,
      labelLat,
      labelLng,
      centerLat,
      centerLng
    },
    geometry: geometry.geometry
  });
}

const output = {
  type: 'FeatureCollection',
  name: 'Wirral Flightpath operational taxi zones',
  source: 'ONS / Open Geography Portal, Wards (May 2024) Boundaries UK BGC, clipped to coastline',
  generated: new Date().toISOString(),
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  features
};

const outDir = path.join(__dirname, '..', 'src', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'wirralTaxiZones.geojson'), JSON.stringify(output, null, 2));

// ---- Validation ----
console.log('\n=== Validation ===');
console.log('Feature count:', output.features.length);
const ids = output.features.map(f => f.properties.zoneId);
console.log('Unique zoneIds:', new Set(ids).size === ids.length ? 'PASS' : 'FAIL');

let valid = true;
for (const f of output.features) {
  if (!booleanValid(f)) {
    console.log('INVALID geometry:', f.properties.zoneId);
    valid = false;
  }
}
console.log('All geometries valid:', valid ? 'PASS' : 'FAIL');

let overlaps = 0;
let overlapArea = 0;
for (let i = 0; i < features.length; i++) {
  for (let j = i + 1; j < features.length; j++) {
    const a = features[i], b = features[j];
    if (booleanOverlap(a, b)) {
      const inter = intersect({ type: 'FeatureCollection', features: [a, b] });
      if (inter) {
        const aInter = area(inter);
        if (aInter > 1) {
          console.log(`Overlap ${a.properties.zoneId} / ${b.properties.zoneId}: ${aInter.toFixed(2)} m²`);
          overlaps++;
          overlapArea += aInter;
        }
      }
    }
  }
}
console.log('Overlapping pairs:', overlaps);
console.log('Total overlap area:', overlapArea.toFixed(2), 'm²');

const boroughUnion = union({ type: 'FeatureCollection', features: sourceWards });
const zonesUnion = union({ type: 'FeatureCollection', features });
const gap = difference({ type: 'FeatureCollection', features: [boroughUnion, zonesUnion] });
const gapArea = gap ? area(gap) : 0;
console.log('Gap area vs source wards:', gapArea.toFixed(2), 'm²');

// Test coordinates
const tests = [
  { name: 'New Brighton', lat: 53.437, lng: -3.045 },
  { name: 'Wallasey centre', lat: 53.424, lng: -3.070 },
  { name: 'Hoylake', lat: 53.390, lng: -3.180 },
  { name: 'West Kirby', lat: 53.373, lng: -3.184 },
  { name: 'Birkenhead centre', lat: 53.393, lng: -3.017 },
  { name: 'Bromborough', lat: 53.330, lng: -2.974 },
  { name: 'Eastham', lat: 53.315, lng: -2.950 },
  { name: 'Heswall', lat: 53.338, lng: -3.105 },
  { name: 'Bidston', lat: 53.405, lng: -3.070 },
  { name: 'Upton', lat: 53.383, lng: -3.100 },
  // Border-ish
  { name: 'Wallasey/New Brighton border', lat: 53.430, lng: -3.045 },
  { name: 'Oxton/Prenton border', lat: 53.375, lng: -3.050 },
  // Outside Wirral
  { name: 'Outside Wirral (Liverpool centre)', lat: 53.4084, lng: -2.9916 },
  { name: 'Outside Wirral (sea)', lat: 53.450, lng: -3.20 }
];

for (const t of tests) {
  const found = findWirralZone(t.lat, t.lng, output);
  console.log(`Test ${t.name} (${t.lat}, ${t.lng}): ${found ? found.properties.zoneName : 'Outside Wirral'}`);
}

function findWirralZone(lat, lng, fc) {
  const pt = point([lng, lat]);
  const matches = fc.features.filter(f => booleanPointInPolygon(pt, f, { ignoreBoundary: false }));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Tie-break: closest interior point
  let best = matches[0];
  let bestDist = Infinity;
  for (const f of matches) {
    const onf = pointOnFeature(f);
    const dx = onf.geometry.coordinates[0] - lng;
    const dy = onf.geometry.coordinates[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = f; }
  }
  return best;
}

console.log('\nZones written to src/data/wirralTaxiZones.geojson');
