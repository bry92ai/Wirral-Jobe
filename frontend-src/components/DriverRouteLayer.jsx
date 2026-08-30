import { useEffect, useRef } from 'react';
import { divIcon, pickupIconSvg, dropoffIconSvg, speedCameraIconSvg, policeIconSvg } from '../lib/leaflet.js';

const API_BASE = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

function decodePolyline(encoded, precision = 5) {
  const factor = Math.pow(10, precision);
  const len = encoded.length;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1 ? ~(result >> 1) : result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1 ? ~(result >> 1) : result >> 1);
    lng += dlng;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

function getRouteTarget(job) {
  if (!job) return null;
  const status = job.status;
  if (['ASSIGNED', 'ON_WAY'].includes(status)) {
    return {
      label: 'Pickup',
      address: job.pickupAddress,
      lat: job.pickupLat,
      lng: job.pickupLng
    };
  }
  if (['ARRIVED', 'POB'].includes(status)) {
    return {
      label: 'Drop-off',
      address: job.dropoffAddress,
      lat: job.dropoffLat,
      lng: job.dropoffLng
    };
  }
  return null;
}

function padBounds(points, padding = 0.01) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return [minLat - padding, minLng - padding, maxLat + padding, maxLng + padding];
}

async function fetchDirections(origin, destination) {
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = `${destination.lat},${destination.lng}`;
  const url = `${API_BASE}/api/directions?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Directions request failed');
  const data = await res.json();
  if (data.status && data.status !== 'OK') throw new Error(data.status || 'Directions error');
  if (!data.routes || !data.routes[0] || !data.routes[0].legs[0]) throw new Error('No route found');
  const leg = data.routes[0].legs[0];
  const path = decodePolyline(data.routes[0].overview_polyline.points);
  return {
    path,
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    etaSeconds: leg.duration.value,
    steps: leg.steps.map((s, i) => ({
      instruction: s.html_instructions ? s.html_instructions.replace(/<[^>]+>/g, '') : '',
      distance: s.distance?.text,
      distanceValue: s.distance?.value,
      duration: s.duration?.text,
      maneuver: s.maneuver || (i === 0 ? 'straight' : ''),
      road: s.html_instructions ? extractRoadName(s.html_instructions) : ''
    }))
  };
}

function extractRoadName(html) {
  // Try to pull a road name from <b> tags in the instruction
  const matches = html.match(/<b>([^<]+)<\/b>/g);
  if (!matches) return '';
  const names = matches.map(m => m.replace(/<\/?b>/g, '')).filter(n => n.length > 1);
  return names[names.length - 1] || '';
}

async function fetchOsmHazards(bounds) {
  const [south, west, north, east] = bounds;
  const query = `[out:json][timeout:15];
(
  node["highway"="speed_camera"](${south},${west},${north},${east});
  node["amenity"="police"](${south},${west},${north},${east});
);
out;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!res.ok) throw new Error('Overpass request failed');
  const data = await res.json();
  return (data.elements || []).map(el => {
    const isCamera = el.tags?.highway === 'speed_camera';
    return {
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      type: isCamera ? 'camera' : 'police',
      label: isCamera ? 'Speed camera' : 'Police'
    };
  });
}

export default function DriverRouteLayer({ map, L, myLocation, activeJob, visible, onRouteInfo, fitMap = true }) {
  const polylineRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const hazardMarkersRef = useRef([]);
  const lastFetchRef = useRef(0);

  function clearLayers() {
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    if (targetMarkerRef.current) {
      map.removeLayer(targetMarkerRef.current);
      targetMarkerRef.current = null;
    }
    hazardMarkersRef.current.forEach(m => map.removeLayer(m));
    hazardMarkersRef.current = [];
    onRouteInfo && onRouteInfo(null);
  }

  useEffect(() => {
    if (!visible) {
      clearLayers();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !map || !L || !myLocation || !activeJob) return;
    const target = getRouteTarget(activeJob);
    if (!target || !target.lat || !target.lng) return;

    let cancelled = false;
    const now = Date.now();
    if (now - lastFetchRef.current < 8000) return; // throttle to ~1 call per 8s per move
    lastFetchRef.current = now;

    async function update() {
      try {
        const route = await fetchDirections(myLocation, target);
        if (cancelled) return;

        if (polylineRef.current) map.removeLayer(polylineRef.current);
        polylineRef.current = L.polyline(route.path, { color: '#3b82f6', weight: 6, opacity: 0.85, lineJoin: 'round' }).addTo(map);

        if (targetMarkerRef.current) map.removeLayer(targetMarkerRef.current);
        const icon = target.label === 'Pickup' ? divIcon(L, pickupIconSvg, 'route-pickup-marker') : divIcon(L, dropoffIconSvg, 'route-dropoff-marker');
        targetMarkerRef.current = L.marker([target.lat, target.lng], { icon, zIndexOffset: 500 }).addTo(map).bindPopup(`${target.label}: ${target.address}`);

        const bounds = padBounds([[myLocation.lat, myLocation.lng], [target.lat, target.lng], ...route.path]);
        if (fitMap) {
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: [40, 40] });
        }

        onRouteInfo && onRouteInfo({ ...route, targetLabel: target.label, targetAddress: target.address });

        try {
          const hazards = await fetchOsmHazards(bounds);
          if (cancelled) return;
          hazardMarkersRef.current.forEach(m => map.removeLayer(m));
          hazardMarkersRef.current = hazards.map(h => {
            const icon = h.type === 'camera'
              ? divIcon(L, speedCameraIconSvg, 'hazard-camera-marker', 26)
              : divIcon(L, policeIconSvg, 'hazard-police-marker', 26);
            return L.marker([h.lat, h.lng], { icon, zIndexOffset: 400 }).addTo(map).bindPopup(h.label);
          });
        } catch (err) {
          console.warn('Failed to load hazard data:', err);
        }
      } catch (err) {
        console.warn('Route fetch failed:', err);
        onRouteInfo && onRouteInfo(null);
      }
    }
    update();
    return () => { cancelled = true; };
  }, [visible, map, L, myLocation, activeJob, onRouteInfo]);

  return null;
}
