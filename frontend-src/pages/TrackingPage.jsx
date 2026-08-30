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

export default function TrackingPage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapTheme, setMapTheme] = useState(localStorage.getItem('mapTheme') || 'dark');
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
        const encoded = data.routes?.[0]?.overview_polyline?.points;
        if (!encoded) return;
        if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
        const coordinates = decodePolyline(encoded);
        routeLayerRef.current = L.polyline(coordinates, { color: '#f4bf1b', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
        map.fitBounds(L.latLngBounds(coordinates), { padding: [48, 48], maxZoom: 16 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [job?.status, job?.driverLat, job?.driverLng, job?.pickupLat, job?.pickupLng, job?.dropoffLat, job?.dropoffLng, mapReady]);

  const label = {
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

  const stages = ['NEW', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB', 'COMPLETE'];
  const activeStage = stages.indexOf(job?.status);

  return (
    <div className="wj-shell">
      <div className="wj-frame wj-track-screen">
        <div className="wj-track-kicker">The Wirral Jobe</div>
        <h1 className="wj-track-title">Track your ride</h1>
        {error && <p className="error">{error}</p>}
        {!job && !error && <p className="wj-track-loading">Loading your booking…</p>}
        {job && (
          <>
            <div className="wj-track-status"><span className={`wj-dot ${['CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(job.status) ? 'wj-dot-red' : 'wj-dot-green'}`} /><strong>{label}</strong></div>
            <div className="wj-track-route">
              <div><span>Pickup</span><strong>{job.pickupAddress}</strong></div>
              <i />
              <div><span>Destination</span><strong>{job.dropoffAddress}</strong></div>
            </div>
            <div className="wj-track-meta"><div><small>Reference</small><strong>{job.jobId}</strong></div><div><small>Fare</small><strong>£{Number(job.fare || 0).toFixed(2)}</strong></div></div>
            {job.driverId && <div className="wj-track-driver"><span>Driver</span><strong>{job.driverId}</strong>{job.driverLat != null && job.driverLocationAt && <small>Location updated {new Date(job.driverLocationAt).toLocaleTimeString()}</small>}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setMapTheme(theme => {
                const next = theme === 'dark' ? 'light' : 'dark';
                localStorage.setItem('mapTheme', next);
                return next;
              })}>{mapTheme === 'dark' ? 'Light map' : 'Dark map'}</button>
            </div>
            <div className="wj-track-map-wrap"><div ref={mapRef} className="wj-track-live-map" style={{ background: mapTheme === 'dark' ? '#1a1a1a' : '#eef2f7' }} /><div className="wj-track-map-caption"><strong>{label}</strong><span>{['ASSIGNED', 'ON_WAY', 'ARRIVED'].includes(job.status) ? 'Driver heading to pickup' : job.status === 'POB' ? 'Heading to destination' : 'Live journey map'}</span></div></div>

            <div className="wj-track-progress">
              {stages.map((stage, index) => <div key={stage} className={activeStage >= index ? 'active' : ''}><i /> <span>{stage.replace('_', ' ')}</span></div>)}
            </div>
            <p className="wj-track-footer">Safe, reliable &amp; always on call.</p>
          </>
        )}
      </div>
    </div>
  );
}
