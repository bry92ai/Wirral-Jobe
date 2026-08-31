import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { vehicleIconHtml } from '../lib/leaflet.js';

const ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const API_BASE = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

function decodePolyline(encoded, precision = 5) {
  const factor = Math.pow(10, precision);
  const coordinates = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

function routeTarget(job) {
  if (!job) return null;
  if (['ASSIGNED', 'ON_WAY'].includes(job.status)) return { label: 'Pickup', address: job.pickupAddress, lat: Number(job.pickupLat), lng: Number(job.pickupLng) };
  if (['ARRIVED', 'POB'].includes(job.status)) return { label: 'Drop-off', address: job.dropoffAddress, lat: Number(job.dropoffLat), lng: Number(job.dropoffLng) };
  return null;
}

async function fetchRoute(origin, target) {
  const url = `${API_BASE}/api/directions?origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}&destination=${encodeURIComponent(`${target.lat},${target.lng}`)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Directions request failed');
  const data = await response.json();
  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) throw new Error('No route found');
  return {
    coordinates: decodePolyline(route.overview_polyline.points),
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    etaSeconds: leg.duration.value,
    steps: leg.steps.map((step, index) => ({
      instruction: step.html_instructions?.replace(/<[^>]+>/g, '') || '',
      distance: step.distance?.text,
      distanceValue: step.distance?.value,
      duration: step.duration?.text,
      maneuver: step.maneuver || (index === 0 ? 'straight' : ''),
      road: (step.html_instructions?.match(/<b>([^<]+)<\/b>/g) || []).map(value => value.replace(/<\/?b>/g, '')).pop() || ''
    }))
  };
}

function clearRouteLayer(map) {
  if (map.getLayer('driver-route-line')) map.removeLayer('driver-route-line');
  if (map.getLayer('driver-route-outline')) map.removeLayer('driver-route-outline');
  if (map.getLayer('driver-route-casing')) map.removeLayer('driver-route-casing');
  if (map.getSource('driver-route')) map.removeSource('driver-route');
}

function addRouteLayer(map, route) {
  if (!map.isStyleLoaded() || !route) return;
  const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } };
  const source = map.getSource('driver-route');
  if (source) source.setData(data);
  else {
    map.addSource('driver-route', { type: 'geojson', data });
    map.addLayer({ id: 'driver-route-casing', type: 'line', source: 'driver-route', paint: { 'line-color': '#111827', 'line-width': 20, 'line-opacity': 0.55, 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'driver-route-outline', type: 'line', source: 'driver-route', paint: { 'line-color': '#4b5563', 'line-width': 14, 'line-opacity': 0.95, 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'driver-route-line', type: 'line', source: 'driver-route', paint: { 'line-color': '#f4bf1b', 'line-width': 9, 'line-opacity': 1, 'line-cap': 'round', 'line-join': 'round' } });
  }
}

export default function DriverNavigationMap({ myLocation, heading, activeJob, theme, follow, onFollowChange, onRouteInfo }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const routeRef = useRef(null);
  const lastRouteFetchRef = useRef(0);
  const routeTargetKeyRef = useRef('');
  const displayedLocationRef = useRef(null);
  const displayedHeadingRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !ACCESS_TOKEN) return;
    mapboxgl.accessToken = ACCESS_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: `mapbox://styles/mapbox/${theme === 'dark' ? 'navigation-night-v1' : 'navigation-day-v1'}`,
      center: myLocation ? [myLocation.lng, myLocation.lat] : [-3.05, 53.393],
      zoom: 17.5,
      pitch: 58,
      bearing: Number.isFinite(heading) ? heading : 0,
      attributionControl: true,
      dragRotate: true,
      pitchWithRotate: true,
      doubleClickZoom: true
    });
    map.touchZoomRotate.enableRotation();
    map.on('dragstart', () => onFollowChange(false));
    map.on('zoomstart', event => { if (event.originalEvent) onFollowChange(false); });
    map.on('pitchstart', event => { if (event.originalEvent) onFollowChange(false); });
    map.on('rotatestart', event => { if (event.originalEvent) onFollowChange(false); });
    map.on('style.load', () => addRouteLayer(map, routeRef.current));
    mapRef.current = map;
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(`mapbox://styles/mapbox/${theme === 'dark' ? 'navigation-night-v1' : 'outdoors-v12'}`);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myLocation) return;
    if (!driverMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'wj-navigation-taxi';
      element.innerHTML = `<div class="wj-navigation-taxi-icon">${vehicleIconHtml('car', '#f4bf1b', null, 48)}</div>`;
      driverMarkerRef.current = new mapboxgl.Marker({ element, rotationAlignment: 'viewport' }).setLngLat([myLocation.lng, myLocation.lat]).addTo(map);
      displayedLocationRef.current = myLocation;
      displayedHeadingRef.current = Number.isFinite(heading) ? heading : 0;
    }

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    const startLocation = displayedLocationRef.current || myLocation;
    const startHeading = displayedHeadingRef.current ?? (Number.isFinite(heading) ? heading : 0);
    const targetHeading = Number.isFinite(heading) ? heading : startHeading;
    const headingDelta = ((targetHeading - startHeading + 540) % 360) - 180;
    const startedAt = performance.now();
    const duration = 150;

    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const location = {
        lat: startLocation.lat + (myLocation.lat - startLocation.lat) * eased,
        lng: startLocation.lng + (myLocation.lng - startLocation.lng) * eased
      };
      const currentHeading = startHeading + headingDelta * eased;
      driverMarkerRef.current?.setLngLat([location.lng, location.lat]);
      const icon = driverMarkerRef.current?.getElement().querySelector('.wj-navigation-taxi-icon');
      if (icon) icon.style.transform = `rotate(${currentHeading - map.getBearing()}deg)`;
      if (follow) map.easeTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 18.5), bearing: currentHeading, pitch: 62, offset: [0, 190], duration, essential: true });
      displayedLocationRef.current = location;
      displayedHeadingRef.current = currentHeading;
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [myLocation, heading, follow]);

  useEffect(() => {
    const map = mapRef.current;
    const target = routeTarget(activeJob);
    if (!map) return;
    if (!myLocation || !target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
      routeRef.current = null;
      routeTargetKeyRef.current = '';
      if (map.isStyleLoaded()) clearRouteLayer(map);
      if (targetMarkerRef.current) { targetMarkerRef.current.remove(); targetMarkerRef.current = null; }
      onRouteInfo(null);
      return;
    }
    const targetKey = `${target.label}:${target.lat}:${target.lng}`;
    if (routeTargetKeyRef.current !== targetKey) {
      routeTargetKeyRef.current = targetKey;
      lastRouteFetchRef.current = 0;
      routeRef.current = null;
      if (map.isStyleLoaded()) clearRouteLayer(map);
      onRouteInfo(null);
    }
    if (!targetMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'wj-navigation-target';
      targetMarkerRef.current = new mapboxgl.Marker({ element }).setLngLat([target.lng, target.lat]).addTo(map);
    } else targetMarkerRef.current.setLngLat([target.lng, target.lat]);
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 8000) return;
    lastRouteFetchRef.current = now;
    let cancelled = false;
    fetchRoute(myLocation, target).then(route => {
      if (cancelled) return;
      routeRef.current = route;
      addRouteLayer(map, route);
      onRouteInfo({ ...route, targetLabel: target.label, targetAddress: target.address });
    }).catch(() => { if (!cancelled) onRouteInfo(null); });
    return () => { cancelled = true; };
  }, [myLocation?.lat, myLocation?.lng, activeJob?.status, activeJob?.pickupLat, activeJob?.pickupLng, activeJob?.dropoffLat, activeJob?.dropoffLng, onRouteInfo]);

  if (!ACCESS_TOKEN) return <div className="error">Mapbox access token is missing.</div>;
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
