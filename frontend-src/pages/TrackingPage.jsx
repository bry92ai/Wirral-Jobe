import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../lib/api.js';
import { loadLeaflet, vehicleIcon, divIcon, pickupIconSvg, dropoffIconSvg } from '../lib/leaflet.js';
import { getMapTiles } from '../lib/mapTiles.js';

const API_BASE = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? '1 min ago' : `${minutes} min ago`;
}

const TrackIcon = {
  pin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s7-7.75 7-13a7 7 0 1 0-14 0c0 5.25 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  flag: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 22V4M5 5c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></svg>,
  car: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 17-1-5 2-5h12l2 5-1 5zM7 7l1-3h8l1 3" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>,
  phone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 2 2.4z" /></svg>,
  message: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
};

export default function TrackingPage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [routeMeta, setRouteMeta] = useState(null);
  const mapTheme = 'dark';
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerRef = useRef(null);
  const LRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let timeoutId;
    async function load() {
      try {
        const data = await apiGet(`/tracking/${token}`);
        if (!alive) return;
        setJob(data);
        setError('');
        if (!['COMPLETE', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(data.status)) timeoutId = setTimeout(load, 7000);
      } catch (err) {
        if (!alive) return;
        setError(err.message);
        timeoutId = setTimeout(load, 10000);
      }
    }
    load();
    return () => { alive = false; clearTimeout(timeoutId); };
  }, [token]);

  useEffect(() => {
    if (!mapRef.current || mapObjRef.current) return;
    loadLeaflet().then(L => {
      LRef.current = L;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([53.38, -3.03], 11);
      const tiles = getMapTiles(mapTheme);
      tileLayerRef.current = L.tileLayer(tiles.url, tiles.options).addTo(map);
      mapObjRef.current = map;
      setMapReady(true);
    });
    return () => {
      setMapReady(false);
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
    };
  }, [job?.jobId]);

  useEffect(() => {
    if (tileLayerRef.current) tileLayerRef.current.setUrl(getMapTiles(mapTheme).url);
  }, [mapTheme]);

  useEffect(() => {
    if (!mapObjRef.current || !LRef.current || !job) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const pickupLat = Number(job.pickupLat);
    const pickupLng = Number(job.pickupLng);
    const dropoffLat = Number(job.dropoffLat);
    const dropoffLng = Number(job.dropoffLng);
    const driverLat = Number(job.driverLat);
    const driverLng = Number(job.driverLng);

    const points = [];

    if (Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
      const m = L.marker([pickupLat, pickupLng], { icon: divIcon(L, pickupIconSvg, 'wj-track-marker-pickup', 36) }).addTo(map).bindPopup('Pickup: ' + (job.pickupAddress || ''));
      markersRef.current.push(m);
      points.push([pickupLat, pickupLng]);
    }

    if (Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)) {
      const m = L.marker([dropoffLat, dropoffLng], { icon: divIcon(L, dropoffIconSvg, 'wj-track-marker-dropoff', 36) }).addTo(map).bindPopup('Drop-off: ' + (job.dropoffAddress || ''));
      markersRef.current.push(m);
      points.push([dropoffLat, dropoffLng]);
    }

    if (Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
      const m = L.marker([driverLat, driverLng], { icon: vehicleIcon(L, job.vehicleType || 'car', '#f4bf1b', Number(job.driverHeading) || null, 42, 'wj-track-marker-driver') }).addTo(map).bindPopup('Driver location');
      markersRef.current.push(m);
      points.push([driverLat, driverLng]);
    }

    if (points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
  }, [job, mapReady]);

  useEffect(() => {
    const map = mapObjRef.current;
    const L = LRef.current;
    if (!map || !L || !job) return;
    const driver = { lat: Number(job.driverLat), lng: Number(job.driverLng) };
    const pickup = { lat: Number(job.pickupLat), lng: Number(job.pickupLng) };
    const dropoff = { lat: Number(job.dropoffLat), lng: Number(job.dropoffLng) };
    const headingToPickup = ['ASSIGNED', 'ON_WAY', 'ARRIVED'].includes(job.status);
    const origin = Number.isFinite(driver.lat) && Number.isFinite(driver.lng) ? driver : pickup;
    const target = headingToPickup ? pickup : dropoff;
    if (![origin.lat, origin.lng, target.lat, target.lng].every(Number.isFinite)) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/directions?origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}&destination=${encodeURIComponent(`${target.lat},${target.lng}`)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Route unavailable')))
      .then(data => {
        if (cancelled) return;
        const route = data.routes?.[0];
        const leg = route?.legs?.[0];
        const encoded = route?.overview_polyline?.points;
        if (!encoded) return;
        setRouteMeta({ duration: leg?.duration?.text || '', distance: leg?.distance?.text || '' });
        if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
        const coordinates = decodePolyline(encoded);
        routeLayerRef.current = L.polyline(coordinates, { color: '#f4bf1b', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
        map.fitBounds(L.latLngBounds(coordinates), { padding: [48, 48], maxZoom: 16 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [job?.status, job?.driverLat, job?.driverLng, job?.pickupLat, job?.pickupLng, job?.dropoffLat, job?.dropoffLng, mapReady]);

  const label = {
    SCHEDULED: 'Journey scheduled',
    NEW: 'Finding a driver',
    BIDDING: 'Finding a driver',
    ASSIGNED: 'Driver assigned',
    ON_WAY: 'Driver on the way',
    ARRIVED: 'Driver has arrived',
    POB: 'Journey in progress',
    COMPLETE: 'Journey complete',
    CANCELLED: 'Booking cancelled',
    NO_SHOW: 'Booking cancelled',
    CUSTOMER_CANCELLED: 'Booking cancelled'
  }[job?.status] || 'Loading…';

  const stages = ['SCHEDULED', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB', 'COMPLETE'];
  const activeStage = job?.status === 'NEW' || job?.status === 'BIDDING' ? 0 : stages.indexOf(job?.status);
  const headline = {
    SCHEDULED: 'Journey scheduled', NEW: 'Finding your driver', BIDDING: 'Finding your driver', ASSIGNED: 'Driver assigned', ON_WAY: 'Driver on the way', ARRIVED: 'Driver has arrived', POB: 'Journey in progress', COMPLETE: 'Journey complete', CANCELLED: 'Booking cancelled', NO_SHOW: 'Booking cancelled', CUSTOMER_CANCELLED: 'Booking cancelled'
  }[job?.status] || 'Track your ride';
  const statusCopy = ['ASSIGNED', 'ON_WAY'].includes(job?.status) ? 'Your driver is on the way to pickup' : job?.status === 'ARRIVED' ? 'Your driver is waiting at pickup' : job?.status === 'POB' ? 'You are heading to your destination' : label;
  const paymentLabel = job?.paymentStatus && job.paymentStatus !== 'FREE' ? job.paymentStatus : 'Pay driver';
  const recenterMap = () => {
    const map = mapObjRef.current;
    if (!map) return;
    if (routeLayerRef.current?.getBounds) map.fitBounds(routeLayerRef.current.getBounds(), { padding: [48, 48], maxZoom: 16 });
    else if (markersRef.current.length) map.fitBounds(LRef.current.featureGroup(markersRef.current).getBounds(), { padding: [40, 40], maxZoom: 16 });
  };

  return (
    <div className="wj-shell">
      <div className="wj-frame wj-track-screen">
        <nav className="wj-customer-topnav"><a className="active" href="/">Book</a><a href="/driver">Driver</a></nav>
        {error && <p className="error">{error}</p>}
        {!job && !error && <p className="wj-track-loading">Loading your booking…</p>}
        {job && <>
          <header className="wj-track-hero"><div className="wj-track-kicker">Track your ride</div><h1 className="wj-track-title">{headline}</h1><div className="wj-track-status"><span className={`wj-dot ${['CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(job.status) ? 'wj-dot-red' : 'wj-dot-green'}`} /><span>{statusCopy}</span></div></header>
          <section className="wj-track-trip-card">
            <div className="wj-track-route-premium">
              <div><span className="wj-track-route-icon"><TrackIcon.pin /></span><span><small>Pickup</small><strong>{job.pickupAddress}</strong></span><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${job.pickupLat},${job.pickupLng}`)}`} target="_blank" rel="noreferrer">Navigate</a></div>
              <div><span className="wj-track-route-icon"><TrackIcon.flag /></span><span><small>Destination</small><strong>{job.dropoffAddress}</strong></span></div>
            </div>
            <div className="wj-track-meta-premium"><div><small>Reference</small><button type="button" onClick={() => navigator.clipboard?.writeText(job.jobId)}>{job.jobId} ⧉</button></div><div><small>Fare</small><strong>£{Number(job.fare || 0).toFixed(2)}</strong></div><div><small>Payment</small><strong>{paymentLabel}</strong></div></div>
            {job.driverId && <div className="wj-track-driver-premium"><span className="wj-track-route-icon"><TrackIcon.car /></span><div><small>Your driver</small><strong>{job.driverId}</strong><span><i className="wj-dot wj-dot-green" /> Driver location updated {relativeTime(job.driverLocationAt) || 'recently'}</span></div><div className="wj-track-contact-actions">{job.driverPhone && <a href={`tel:${job.driverPhone}`}><TrackIcon.phone /><small>Call</small></a>}{job.driverPhone && <a href={`sms:${job.driverPhone}`}><TrackIcon.message /><small>Message</small></a>}</div></div>}
          </section>
          <div className="wj-track-map-wrap"><div ref={mapRef} className="wj-track-live-map" /><button type="button" className="wj-track-recenter" onClick={recenterMap} aria-label="Recenter journey map">◎</button><div className="wj-track-map-caption"><TrackIcon.car /><span><small>Est. arrival</small><strong>{routeMeta?.duration || 'Calculating…'}</strong></span><b>{routeMeta?.distance || ''}</b></div></div>
          <div className="wj-track-progress">{stages.map((stage, index) => <div key={stage} className={activeStage >= index ? 'active' : ''}><i /><span>{stage.replace('_', ' ')}</span></div>)}</div>
          <p className="wj-track-footer">Safe, reliable &amp; always on call.</p>
        </>}
      </div>
    </div>
  );
}
