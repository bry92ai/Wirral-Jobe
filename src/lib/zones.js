import { distanceMiles } from './geo.js';

export const ZONES = [
  // Wirral districts
  { id: 'wallasey', name: 'Wallasey', lat: 53.423, lng: -3.035, radiusMiles: 1.5 },
  { id: 'birkenhead', name: 'Birkenhead', lat: 53.393, lng: -3.017, radiusMiles: 1.5 },
  { id: 'prenton', name: 'Prenton', lat: 53.373, lng: -3.035, radiusMiles: 1.2 },
  { id: 'oxton', name: 'Oxton', lat: 53.383, lng: -3.050, radiusMiles: 1.0 },
  { id: 'moreton', name: 'Moreton', lat: 53.403, lng: -3.113, radiusMiles: 1.5 },
  { id: 'hoylake', name: 'Hoylake', lat: 53.390, lng: -3.180, radiusMiles: 1.5 },
  { id: 'west_kirby', name: 'West Kirby', lat: 53.373, lng: -3.184, radiusMiles: 1.5 },
  { id: 'heswall', name: 'Heswall', lat: 53.338, lng: -3.105, radiusMiles: 1.8 },
  { id: 'bebington', name: 'Bebington', lat: 53.349, lng: -2.997, radiusMiles: 1.5 },
  { id: 'bromborough', name: 'Bromborough', lat: 53.330, lng: -2.974, radiusMiles: 1.5 },
  { id: 'port_sunlight', name: 'Port Sunlight', lat: 53.350, lng: -2.990, radiusMiles: 1.0 },
  { id: 'new_brighton', name: 'New Brighton', lat: 53.438, lng: -3.045, radiusMiles: 1.2 },
  { id: 'seacombe', name: 'Seacombe', lat: 53.414, lng: -3.025, radiusMiles: 1.0 },
  { id: 'woodside', name: 'Woodside', lat: 53.397, lng: -3.010, radiusMiles: 1.0 },
  { id: 'upton', name: 'Upton', lat: 53.383, lng: -3.100, radiusMiles: 1.5 },
  { id: 'greasby', name: 'Greasby', lat: 53.373, lng: -3.133, radiusMiles: 1.5 },
  { id: 'thingwall', name: 'Thingwall', lat: 53.360, lng: -3.080, radiusMiles: 1.2 },
  { id: 'irby', name: 'Irby', lat: 53.350, lng: -3.130, radiusMiles: 1.2 },
  { id: 'pensby', name: 'Pensby', lat: 53.340, lng: -3.100, radiusMiles: 1.2 },
  { id: 'barnston', name: 'Barnston', lat: 53.330, lng: -3.080, radiusMiles: 1.2 },
  // Broader zones
  { id: 'lpool', name: 'Liverpool', lat: 53.4084, lng: -2.9916, radiusMiles: 4 },
  { id: 'lpl_airport', name: 'Liverpool Airport', lat: 53.3331, lng: -2.8496, radiusMiles: 3 },
  { id: 'man_airport', name: 'Manchester Airport', lat: 53.3537, lng: -2.2740, radiusMiles: 4 }
];

export function getZone(lat, lng) {
  if (lat == null || lng == null) return null;
  for (const zone of ZONES) {
    if (distanceMiles(lat, lng, zone.lat, zone.lng) <= zone.radiusMiles) return zone.id;
  }
  return null;
}

export function getZoneName(id) {
  const zone = ZONES.find(z => z.id === id);
  return zone ? zone.name : id;
}
