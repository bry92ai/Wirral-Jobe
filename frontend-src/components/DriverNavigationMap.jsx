import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import taxiMarker from '../assets/taxi-marker.png';

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

function interpolateHeading(from, to, progress) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * progress;
}

export default function DriverNavigationMap({ myLocation, heading, activeJob, theme, follow, onFollowChange, onRouteInfo, onNavigationProblem, retryKey }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const routeRef = useRef(null);
  const lastRouteFetchRef = useRef(0);
  const routeTargetKeyRef = useRef('');
  const retryKeyRef = useRef(retryKey);
  const routeRequestRef = useRef(0);
  const displayedLocationRef = useRef(null);
  const displayedHeadingRef = useRef(null);
  const samplesRef = useRef([]);
  const animationRef = useRef(null);
  const followRef = useRef(follow);

  useEffect(() => { followRef.current = follow; }, [follow]);

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
    map.setStyle(`mapbox://styles/mapbox/${theme === 'dark' ? 'navigation-night-v1' : 'navigation-day-v1'}`);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myLocation) return;
    const sample = { ...myLocation, heading: Number.isFinite(heading) ? heading : (displayedHeadingRef.current ?? 0), time: Date.now() };
    const previous = samplesRef.current[samplesRef.current.length - 1];
    if (!previous || previous.lat !== sample.lat || previous.lng !== sample.lng || previous.heading !== sample.heading) {
      samplesRef.current = [...samplesRef.current.slice(-7), sample];
    }
    if (!driverMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'wj-navigation-taxi';
      element.innerHTML = `<div class="wj-navigation-taxi-icon"><img src="${taxiMarker}" alt="" style="width:44px;height:44px;display:block;" /></div>`;
      driverMarkerRef.current = new mapboxgl.Marker({ element, rotationAlignment: 'viewport' }).setLngLat([sample.lng, sample.lat]).addTo(map);
      displayedLocationRef.current = sample;
      displayedHeadingRef.current = sample.heading;
    }
  }, [myLocation, heading]);

  useEffect(() => {
    if (!myLocation || animationRef.current) return;
    const render = () => {
      const map = mapRef.current;
      const samples = samplesRef.current;
      if (map && driverMarkerRef.current && samples.length) {
        const displayTime = Date.now() - 1000;
        let from = samples[0];
        let to = samples[samples.length - 1];
        for (let index = 1; index < samples.length; index += 1) {
          if (samples[index].time >= displayTime) { from = samples[index - 1]; to = samples[index]; break; }
          from = samples[index];
        }
        const span = Math.max(1, to.time - from.time);
        const progress = Math.max(0, Math.min(1, (displayTime - from.time) / span));
        const location = { lat: from.lat + (to.lat - from.lat) * progress, lng: from.lng + (to.lng - from.lng) * progress };
        const currentHeading = interpolateHeading(from.heading, to.heading, progress);
        driverMarkerRef.current.setLngLat([location.lng, location.lat]);
        const icon = driverMarkerRef.current.getElement().querySelector('.wj-navigation-taxi-icon');
        if (icon) icon.style.transform = `rotate(${currentHeading - map.getBearing()}deg)`;
        if (followRef.current) map.jumpTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 18.5), bearing: currentHeading, pitch: 62, offset: [0, 190] });
        displayedLocationRef.current = location;
        displayedHeadingRef.current = currentHeading;
        samplesRef.current = samples.filter((sample, index) => index === samples.length - 1 || sample.time >= displayTime - 5000);
      }
      animationRef.current = requestAnimationFrame(render);
    };
    animationRef.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animationRef.current); animationRef.current = null; };
  }, [Boolean(myLocation)]);

  useEffect(() => {
    const map = mapRef.current;
    const target = routeTarget(activeJob);
    if (!map) return;
    if (!myLocation) {
      const warningTimer = window.setTimeout(() => onNavigationProblem?.({ title: 'Driver location unavailable', message: 'We still can’t get a GPS position. Check location services or refresh your location.', action: 'location' }), 10000);
      routeRef.current = null;
      routeTargetKeyRef.current = '';
      if (map.isStyleLoaded()) clearRouteLayer(map);
      if (targetMarkerRef.current) { targetMarkerRef.current.remove(); targetMarkerRef.current = null; }
      onRouteInfo(null);
      return () => window.clearTimeout(warningTimer);
    }
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
      if (!target) onNavigationProblem?.(null);
      else onNavigationProblem?.({ title: 'Can’t start navigation', message: `The ${target.label.toLowerCase()} pin appears to be invalid or missing.`, action: 'external' });
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
    if (retryKeyRef.current !== retryKey) {
      retryKeyRef.current = retryKey;
      lastRouteFetchRef.current = 0;
    }
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 4000) return;
    lastRouteFetchRef.current = now;
    const requestedTargetKey = targetKey;
    const requestId = ++routeRequestRef.current;
    fetchRoute(myLocation, target).then(route => {
      if (routeTargetKeyRef.current !== requestedTargetKey || routeRequestRef.current !== requestId) return;
      routeRef.current = route;
      addRouteLayer(map, route);
      onRouteInfo({ ...route, targetLabel: target.label, targetAddress: target.address, updatedAt: Date.now() });
      onNavigationProblem?.(null);
    }).catch(() => {
      if (routeTargetKeyRef.current !== requestedTargetKey || routeRequestRef.current !== requestId) return;
      onNavigationProblem?.({ title: 'Route unavailable', message: `We couldn’t generate a road route to the ${target.label.toLowerCase()}.`, action: 'retry' });
    });
  }, [myLocation?.lat, myLocation?.lng, activeJob?.status, activeJob?.pickupLat, activeJob?.pickupLng, activeJob?.dropoffLat, activeJob?.dropoffLng, retryKey, onRouteInfo]);

  if (!ACCESS_TOKEN) return <div className="error">Mapbox access token is missing.</div>;
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
