import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../lib/api.js';
import { loadLeaflet } from '../lib/leaflet.js';

export default function TrackingPage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const LRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await apiGet(`/tracking/${token}`);
        if (alive) setJob(data);
      } catch (err) {
        if (alive) setError(err.message);
      }
    }
    load();
    const id = setInterval(load, 7000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  useEffect(() => {
    if (!mapRef.current || mapObjRef.current) return;
    loadLeaflet().then(L => {
      LRef.current = L;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([53.38, -3.03], 11);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
        maxZoom: 19
      }).addTo(map);
      mapObjRef.current = map;
    });
    return () => { if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, []);

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
      const m = L.marker([pickupLat, pickupLng]).addTo(map).bindPopup('Pickup: ' + (job.pickupAddress || ''));
      markersRef.current.push(m);
      points.push([pickupLat, pickupLng]);
    }

    if (Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)) {
      const m = L.marker([dropoffLat, dropoffLng], { icon: L.divIcon({ className: 'wj-track-marker-dropoff', html: '<div style="background:#ef4444;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #ef4444;"></div>', iconSize: [14, 14] }) }).addTo(map).bindPopup('Drop-off: ' + (job.dropoffAddress || ''));
      markersRef.current.push(m);
      points.push([dropoffLat, dropoffLng]);
    }

    if (Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
      const m = L.marker([driverLat, driverLng], { icon: L.divIcon({ className: 'wj-track-marker-driver', html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px #22c55e;"></div>', iconSize: [16, 16] }) }).addTo(map).bindPopup('Driver location');
      markersRef.current.push(m);
      points.push([driverLat, driverLng]);
    }

    if (points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
  }, [job]);

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

  const stages = ['NEW', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB'];
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
            <div className="wj-track-status"><span className={`wj-dot ${job.status === 'CANCELLED' ? 'wj-dot-red' : 'wj-dot-green'}`} /><strong>{label}</strong></div>
            <div className="wj-track-route">
              <div><span>Pickup</span><strong>{job.pickupAddress}</strong></div>
              <i />
              <div><span>Destination</span><strong>{job.dropoffAddress}</strong></div>
            </div>
            <div className="wj-track-meta"><div><small>Reference</small><strong>{job.jobId}</strong></div><div><small>Fare</small><strong>£{Number(job.fare || 0).toFixed(2)}</strong></div></div>
            {job.driverId && <div className="wj-track-driver"><span>Driver</span><strong>{job.driverId}</strong>{job.driverLat != null && job.driverLocationAt && <small>Location updated {new Date(job.driverLocationAt).toLocaleTimeString()}</small>}</div>}

            <div ref={mapRef} style={{ width: '100%', height: 280, borderRadius: 14, marginBottom: '0.75rem', background: '#1a1a1a' }} />

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
