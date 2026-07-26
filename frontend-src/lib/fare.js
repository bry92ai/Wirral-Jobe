import { distanceMiles } from './geo.js';

export const TARIFF = {
  car: {
    day: { firstMile: 4.50, perMile: 2.20 },
    night: { firstMile: 5.50, perMile: 2.80 }
  },
  mpv: {
    day: { firstMile: 6.50, perMile: 3.20 },
    night: { firstMile: 7.50, perMile: 3.80 }
  }
};

const AIRPORTS = [
  { name: 'Liverpool', lat: 53.3331, lng: -2.8496, carFare: 60, mpvFare: 75 },
  { name: 'Manchester', lat: 53.3537, lng: -2.2740, carFare: 75, mpvFare: 90 }
];

export function calculateAirportFare({ pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType = 'car' }) {
  if (pickupLat == null || pickupLng == null || dropoffLat == null || dropoffLng == null) return null;
  for (const airport of AIRPORTS) {
    const nearPickup = distanceMiles(pickupLat, pickupLng, airport.lat, airport.lng) <= 2;
    const nearDropoff = distanceMiles(dropoffLat, dropoffLng, airport.lat, airport.lng) <= 2;
    if (nearPickup || nearDropoff) {
      return vehicleType === 'mpv' ? airport.mpvFare : airport.carFare;
    }
  }
  return null;
}

export function calculateFare({ miles, vehicleType = 'car', timeOfDay = 'day' }) {
  const m = Math.max(0, Number(miles) || 0);
  const rates = TARIFF[vehicleType]?.[timeOfDay] || TARIFF.car.day;
  if (m <= 1) return rates.firstMile;
  return rates.firstMile + rates.perMile * (m - 1);
}

export function getTimeOfDay(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const minutes = h * 60 + m;
  if (minutes >= 21 * 60 || minutes < 5 * 60 + 30) return 'night';
  return 'day';
}
