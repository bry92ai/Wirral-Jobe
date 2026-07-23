import { useState, useEffect, useMemo, useRef } from 'react';
import { api, apiGet } from '../lib/api.js';
import { FLIGHTPATH_ZONES, findZone, getZoneName } from '../lib/zones.js';

const STATUS_FLOW = ['ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB', 'COMPLETE'];
const STATUS_LABELS = {
  ASSIGNED: 'Assigned',
  ON_WAY: 'On the way',
  ARRIVED: 'Arrived',
  POB: 'Passenger on board',
  COMPLETE: 'Complete'
};
const STATUS_ACTIONS = {
  ASSIGNED: { next: 'ON_WAY', label: 'On the way to pickup' },
  ON_WAY: { next: 'ARRIVED', label: 'Arrived at pickup' },
  ARRIVED: { next: 'POB', label: 'Passenger on board' },
  POB: { next: 'COMPLETE', label: 'Complete journey' }
};

const MAP_CENTER_DEFAULT = { lat: 53.393, lng: -3.05 };

function getZoneStyle(feature, currentZoneId) {
  const external = feature.properties.external;
  const active = currentZoneId === feature.properties.zoneId;
  return {
    color: external ? '#94a3b8' : '#005eb8',
    weight: active ? 3 : 1,
    opacity: external ? 0.5 : 0.7,
    fillColor: external ? '#94a3b8' : '#005eb8',
    fillOpacity: external ? 0.05 : (active ? 0.22 : 0.08),
    dashArray: external ? '4 4' : undefined
  };
}

function formatCurrency(n) { return `£${Number(n || 0).toFixed(2)}`; }
function formatPhone(tel) {
  if (!tel) return null;
  const cleaned = tel.replace(/\s/g, '');
  return cleaned.startsWith('0') ? `+44${cleaned.slice(1)}` : cleaned;
}
function directionsUrl(address, lat, lng) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (document.querySelector('script[data-leaflet-js]')) {
      const script = document.querySelector('script[data-leaflet-js]');
      script.addEventListener('load', () => resolve(window.L));
      script.addEventListener('error', () => reject(new Error('Leaflet script failed')));
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.leafletJs = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

const offerIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#22c55e" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
const pickupIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#22c55e" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
const dropoffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#ef4444" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;

function vehicleIconHtml(type, color, heading = null, size = 28) {
  const isMpv = type === 'mpv';
  const body = isMpv
    ? `<rect x="4" y="6" width="16" height="10" rx="2" fill="${color}"/><rect x="6" y="8" width="8" height="4" rx="1" fill="rgba(255,255,255,0.25)"/><circle cx="7.5" cy="16.5" r="1.8" fill="#333"/><circle cx="16.5" cy="16.5" r="1.8" fill="#333"/><rect x="9" y="3" width="6" height="4" rx="1" fill="${color}"/>`
    : `<rect x="5" y="6" width="14" height="9" rx="2" fill="${color}"/><rect x="7" y="8" width="6" height="3" rx="1" fill="rgba(255,255,255,0.25)"/><circle cx="7" cy="16" r="1.8" fill="#333"/><circle cx="17" cy="16" r="1.8" fill="#333"/><rect x="8" y="3" width="8" height="4" rx="1" fill="${color}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
  const rotate = heading != null && !Number.isNaN(heading) ? `transform:rotate(${heading}deg);` : '';
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${rotate}">${svg}</div>`;
}

function divIcon(L, html, className = '', size = 28) {
  return L.divIcon({
    className: `custom-marker ${className}`,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function vehicleIcon(L, type, color, heading = null, size = 28, className = '') {
  return divIcon(L, vehicleIconHtml(type, color, heading, size), className, size);
}

function headingIconHtml(color, heading = null, size = 36) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36"><path d="M18 2 L26 30 L18 24 L10 30 Z" fill="${color}" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><circle cx="18" cy="24" r="3" fill="white"/></svg>`;
  const rotate = heading != null && !Number.isNaN(heading) ? `transform:rotate(${heading}deg);` : '';
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${rotate}">${svg}</div>`;
}

function headingIcon(L, color, heading, size = 36, className = '') {
  return divIcon(L, headingIconHtml(color, heading, size), className, size);
}

export default function DriverPage() {
  const [driverId, setDriverId] = useState(localStorage.getItem('driverId') || '');
  const [driverName, setDriverName] = useState(localStorage.getItem('driverName') || '');
  const [pin, setPin] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [offers, setOffers] = useState([]);
  const [otherDrivers, setOtherDrivers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationOk, setLocationOk] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [heading, setHeading] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);
  const [bidBoard, setBidBoard] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [futureBookings, setFutureBookings] = useState([]);
  const [bidAmounts, setBidAmounts] = useState({});

  const mapRef = useRef(null);
  const LRef = useRef(null);
  const mapObjRef = useRef(null);
  const selfMarkerRef = useRef(null);
  const offerMarkersRef = useRef([]);
  const otherDriverMarkersRef = useRef([]);
  const jobMarkersRef = useRef([]);
  const geoJsonLayerRef = useRef(null);
  const zoneLabelsRef = useRef([]);
  const pendingZoneRef = useRef(null);

  const activeJob = useMemo(() => jobs.find(j => !['COMPLETE', 'CANCELLED'].includes(j.status)), [jobs]);

  const queueInfo = useMemo(() => {
    const zoneId = currentZoneId || profile?.zone || null;
    const zoneName = zoneId ? getZoneName(zoneId) : 'Outside Wirral';
    const queue = [profile, ...otherDrivers]
      .filter(Boolean)
      .filter(d => d.status === 'AVAILABLE' && d.zone && d.zone === zoneId)
      .sort((a, b) => String(a.availableSince || '9999').localeCompare(String(b.availableSince || '9999')));
    const position = queue.findIndex(d => d.id === driverId);
    return { zoneId, zoneName, queue, position: position >= 0 ? position + 1 : null };
  }, [currentZoneId, profile, otherDrivers, driverId]);

  async function login(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api('driver/login', { driverId: driverId.toUpperCase(), pin });
      localStorage.setItem('driverId', res.driverId);
      localStorage.setItem('driverName', res.name);
      setDriverName(res.name);
      setLoggedIn(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function logout() {
    localStorage.removeItem('driverId');
    localStorage.removeItem('driverName');
    setLoggedIn(false);
    setDriverId(''); setPin('');
    setJobs([]); setOffers([]); setOtherDrivers([]); setProfile(null);
    setMyLocation(null);
  }

  async function loadProfile(id = driverId) {
    try { const data = await apiGet('/driver/me', { 'x-driver-id': id }); setProfile(data); }
    catch {}
  }

  async function loadJobs(id = driverId) {
    try { const data = await apiGet('/driver/jobs', { 'x-driver-id': id }); setJobs(data.jobs); }
    catch (err) { setError(err.message); }
  }

  async function loadOffers(id = driverId) {
    try { const data = await apiGet('/driver/offers', { 'x-driver-id': id }); setOffers(data.offers); }
    catch {}
  }

  async function loadOtherDrivers() {
    try { const data = await apiGet('/drivers'); setOtherDrivers(data.drivers || []); }
    catch {}
  }

  async function loadBidBoard(id = driverId) {
    try { const data = await apiGet('/driver/bid-board', { 'x-driver-id': id }); setBidBoard(data.jobs || []); }
    catch {}
  }

  async function loadMyBids(id = driverId) {
    try { const data = await apiGet('/driver/my-bids', { 'x-driver-id': id }); setMyBids(data.bids || []); }
    catch {}
  }

  async function loadFutureBookings(id = driverId) {
    try { const data = await apiGet('/driver/future-bookings', { 'x-driver-id': id }); setFutureBookings(data.jobs || []); }
    catch {}
  }

  async function placeBid(jobId) {
    const amount = bidAmounts[jobId];
    if (!amount || Number(amount) <= 0) return setError('Enter a bid amount');
    setLoading(true); setError('');
    try {
      await api(`driver/bid-board/${jobId}/bid`, { amount: Number(amount) }, { 'x-driver-id': driverId });
      await Promise.all([loadBidBoard(), loadMyBids()]);
      setBidAmounts(prev => { const next = { ...prev }; delete next[jobId]; return next; });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function acceptFutureBooking(jobId) {
    setLoading(true); setError('');
    try {
      await api(`driver/future-bookings/${jobId}/accept`, {}, { 'x-driver-id': driverId });
      await Promise.all([loadFutureBookings(), loadJobs()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function acceptOffer(jobId) {
    setLoading(true);
    try {
      await api(`driver/offers/${jobId}/accept`, {}, { 'x-driver-id': driverId });
      await Promise.all([loadOffers(), loadJobs()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function declineOffer(jobId) {
    try { await api(`driver/offers/${jobId}/decline`, {}, { 'x-driver-id': driverId }); loadOffers(); }
    catch (err) { setError(err.message); }
  }

  async function setStatus(jobId, status) {
    setLoading(true);
    try { await api(`driver/jobs/${jobId}/status`, { status }, { 'x-driver-id': driverId }); await loadJobs(); await loadProfile(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!loggedIn) return;
    let mounted = true;
    loadLeaflet().then(L => {
      if (!mounted) return;
      LRef.current = L;
      const start = myLocation || MAP_CENTER_DEFAULT;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([start.lat, start.lng], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
        maxZoom: 19
      }).addTo(map);
      mapObjRef.current = map;

      geoJsonLayerRef.current = L.geoJSON(FLIGHTPATH_ZONES, {
        filter: f => f.properties.zoneId !== 'international',
        style: feature => getZoneStyle(feature, currentZoneId),
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            setCurrentZoneId(feature.properties.zoneId);
          });
        }
      }).addTo(map);

      const labelIcon = (zoneName) => L.divIcon({
        className: 'zone-label',
        html: `<span style="color:#64748b;font-size:9px;font-weight:600;letter-spacing:0.2px;white-space:nowrap;background:rgba(255,255,255,0.7);padding:1px 4px;border-radius:4px">${zoneName}</span>`,
        iconSize: [160, 16],
        iconAnchor: [80, 8]
      });

      const showLabels = () => {
        const zoom = map.getZoom();
        zoneLabelsRef.current.forEach(({ marker, feature }) => {
          const external = feature.properties.external;
          let opacity = 0;
          if (external) opacity = zoom <= 9 ? 0.9 : 0;
          else opacity = zoom >= 12 ? 0.9 : 0;
          marker.setOpacity(opacity);
        });
      };

      zoneLabelsRef.current = FLIGHTPATH_ZONES.features
        .filter(feature => feature.properties.zoneId !== 'international')
        .map(feature => {
          const { labelLat, labelLng, zoneName } = feature.properties;
          const marker = L.marker([labelLat, labelLng], {
            icon: labelIcon(zoneName),
            interactive: false,
            opacity: 0
          }).addTo(map);
          return { marker, feature };
        });

      map.on('zoomend', showLabels);
      const wirralBoundsLayer = L.geoJSON(FLIGHTPATH_ZONES, { filter: f => !f.properties.external });
      map.fitBounds(wirralBoundsLayer.getBounds(), { padding: [40, 40] });
      setTimeout(showLabels, 0);
      setMapReady(true);
    }).catch(err => setError('Map failed: ' + err.message));
    return () => { mounted = false; };
  }, [loggedIn]);

  useEffect(() => {
    if (!mapReady || !geoJsonLayerRef.current) return;
    geoJsonLayerRef.current.setStyle(feature => getZoneStyle(feature, currentZoneId));
  }, [mapReady, currentZoneId]);

  useEffect(() => {
    if (!mapReady || !myLocation || !LRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    if (!selfMarkerRef.current) {
      selfMarkerRef.current = L.marker([myLocation.lat, myLocation.lng], {
        icon: headingIcon(L, '#005eb8', heading, 36, 'self-marker'),
        zIndexOffset: 1000
      }).addTo(map).bindPopup('You');
    } else {
      selfMarkerRef.current.setLatLng([myLocation.lat, myLocation.lng]);
      selfMarkerRef.current.setIcon(headingIcon(L, '#005eb8', heading, 36, 'self-marker'));
    }
    map.panTo([myLocation.lat, myLocation.lng]);
  }, [mapReady, myLocation, heading]);

  useEffect(() => {
    if (!mapReady || !LRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    offerMarkersRef.current.forEach(m => map.removeLayer(m));
    offerMarkersRef.current = offers.map(offer => {
      const m = L.marker([offer.pickupLat, offer.pickupLng], { icon: divIcon(L, offerIconSvg, 'offer-marker') }).addTo(map)
        .bindPopup(`<strong>Offer</strong><br>${formatCurrency(offer.fare)}<br>${offer.pickupAddress}`);
      m.openPopup();
      return m;
    });
  }, [mapReady, offers]);

  useEffect(() => {
    if (!mapReady || !LRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    jobMarkersRef.current.forEach(m => map.removeLayer(m));
    jobMarkersRef.current = [];
    if (!activeJob) return;
    const pickup = L.marker([activeJob.pickupLat, activeJob.pickupLng], { icon: divIcon(L, pickupIconSvg, 'pickup-marker') }).addTo(map).bindPopup(`Pickup: ${activeJob.pickupAddress}`);
    const drop = L.marker([activeJob.dropoffLat, activeJob.dropoffLng], { icon: divIcon(L, dropoffIconSvg, 'dropoff-marker') }).addTo(map).bindPopup(`Drop-off: ${activeJob.dropoffAddress}`);
    jobMarkersRef.current = [pickup, drop];
  }, [mapReady, activeJob]);

  useEffect(() => {
    if (!mapReady || !LRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    otherDriverMarkersRef.current.forEach(m => map.removeLayer(m));
    otherDriverMarkersRef.current = otherDrivers
      .filter(d => d.id !== driverId && d.lastLat != null && d.lastLng != null)
      .map(d => {
        return L.marker([d.lastLat, d.lastLng], {
          icon: vehicleIcon(L, d.vehicle_type || 'car', '#64748b', null, 28, 'driver-marker')
        }).addTo(map)
          .bindPopup(`${d.id} · ${d.vehicle_type || 'car'}`);
      });
  }, [mapReady, otherDrivers]);

  useEffect(() => {
    if (!loggedIn) return;
    loadJobs(); loadOffers(); loadProfile(); loadOtherDrivers();
    const id = setInterval(() => { loadJobs(); loadOffers(); loadOtherDrivers(); loadBidBoard(); loadMyBids(); loadFutureBookings(); }, 5000);
    return () => clearInterval(id);
  }, [loggedIn, driverId]);

  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || !navigator.geolocation) return;
    setLocationError('');
    let watchId;

    function handlePosition(position) {
      const { latitude, longitude, accuracy, heading: h } = position.coords;
      const location = { lat: latitude, lng: longitude };
      setMyLocation(location);
      if (h != null && !Number.isNaN(h)) setHeading(h);

      const zoneFeature = findZone(latitude, longitude);
      const zoneId = zoneFeature ? zoneFeature.properties.zoneId : null;

      const pending = pendingZoneRef.current;
      if (zoneId !== currentZoneId) {
        if (!pending || pending.zoneId !== zoneId) {
          pendingZoneRef.current = { zoneId, since: Date.now(), readings: 1 };
        } else {
          pending.readings += 1;
          const elapsed = Date.now() - pending.since;
          if (pending.readings >= 2 || elapsed >= 20000) {
            setCurrentZoneId(zoneId);
            api('driver/location', { lat: latitude, lng: longitude, zone: zoneId, accuracy }, { 'x-driver-id': driverId })
              .then(() => setLocationOk(true))
              .catch(() => setLocationOk(false));
            pendingZoneRef.current = null;
            return;
          }
        }
      } else {
        pendingZoneRef.current = null;
      }

      api('driver/location', { lat: latitude, lng: longitude, zone: currentZoneId, accuracy }, { 'x-driver-id': driverId })
        .then(() => setLocationOk(true))
        .catch(() => setLocationOk(false));
    }

    function onGeoError() {
      setLocationError('Location access denied or unavailable. Enable location services to share your position.');
      setLocationOk(false);
    }

    navigator.geolocation.getCurrentPosition(handlePosition, onGeoError, { enableHighAccuracy: true });
    watchId = navigator.geolocation.watchPosition(handlePosition, onGeoError, { enableHighAccuracy: true, maximumAge: 10000 });
    const interval = setInterval(() => navigator.geolocation.getCurrentPosition(handlePosition, onGeoError, { enableHighAccuracy: true }), 15000);
    return () => { clearInterval(interval); if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, [loggedIn, driverId, currentZoneId]);

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 420, margin: '2rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Driver Portal</h1>
            <p style={{ color: '#6b7280', margin: '0.25rem 0 0' }}>Log in to start receiving jobs</p>
          </div>
          <form onSubmit={login}>
            <div className="form-group">
              <label>Driver ID</label>
              <input value={driverId} onChange={e => setDriverId(e.target.value.toUpperCase())} placeholder="DRV-001" autoFocus />
            </div>
            <div className="form-group">
              <label>PIN</label>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="1234" />
            </div>
            <button type="submit" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
            {error && <p className="error">{error}</p>}
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', marginTop: '1rem' }}>
              Demo: DRV-001 / 1234 or DRV-002 / 5678
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000,
        background: 'linear-gradient(135deg, #0f172a 0%, #005eb8 100%)', color: 'white',
        borderRadius: 16, padding: '0.85rem 1rem', boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem' }}>WJ</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>The Wirral Jobe</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{driverName || driverId} · {profile ? `${getZoneName(profile.zone)} · ${formatCurrency(profile.settleBalance)}` : driverId}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600,
            padding: '0.3rem 0.6rem', borderRadius: 999,
            background: locationOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: locationOk ? '#bbf7d0' : '#fecaca'
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: locationOk ? '#22c55e' : '#ef4444' }} />
            {locationOk ? 'Online' : 'Loc off'}
          </span>
          <button className="secondary" onClick={() => setOpenPanel('bids')} style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}>Bids</button>
          <button className="secondary" onClick={() => setOpenPanel('future')} style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}>Future</button>
          <button className="secondary" onClick={logout} style={{ margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}>Log out</button>
        </div>
      </div>

      {locationError && (
        <div style={{ position: 'absolute', top: 72, left: 12, right: 12, zIndex: 1000 }}>
          <p className="error" style={{ margin: 0, padding: '0.6rem 0.9rem', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>{locationError}</p>
        </div>
      )}

      <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />

      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
        background: 'white', borderRadius: 12, padding: '0.65rem 0.85rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 280, fontSize: '0.85rem', color: '#1f2937'
      }}>
        <div style={{ fontWeight: 700, color: '#005eb8', marginBottom: '0.25rem', fontSize: '0.95rem' }}>{queueInfo.zoneName}</div>
        {queueInfo.position != null && (
          <div style={{ marginBottom: '0.4rem' }}>Queue: <strong>#{queueInfo.position}</strong> of {queueInfo.queue.length}</div>
        )}
        {queueInfo.queue.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {queueInfo.queue.map((d, i) => (
              <span key={d.id} style={{
                padding: '2px 6px', borderRadius: 999,
                background: d.id === driverId ? 'rgba(0,94,184,0.15)' : 'rgba(0,0,0,0.05)',
                color: d.id === driverId ? '#005eb8' : '#4b5563',
                fontWeight: d.id === driverId ? 700 : 400,
                fontSize: '0.75rem'
              }}>
                {i + 1}. {d.id.replace(/^DRV-/, '')}
              </span>
            ))}
          </div>
        )}
      </div>

      {offers.length > 0 && (
        <div style={{ position: 'absolute', top: 80, left: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
          {offers.map(offer => {
            const secondsLeft = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
            return (
              <div key={offer.jobId} className="card" style={{ pointerEvents: 'auto', background: '#fffbeb', border: '1.5px solid #fde68a', padding: '0.85rem', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>{offer.vehicleType?.toUpperCase() || 'CAR'}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: secondsLeft < 15 ? '#dc2626' : '#92400e' }}>Expires in {secondsLeft}s</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.35rem' }}>{formatCurrency(offer.fare)}</div>
                <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.75rem' }}>{offer.pickupAddress} → {offer.dropoffAddress}</div>
                <div className="row" style={{ gap: '0.75rem' }}>
                  <button onClick={() => acceptOffer(offer.jobId)} disabled={loading} style={{ flex: 1, margin: 0 }}>Accept</button>
                  <button className="secondary" onClick={() => declineOffer(offer.jobId)} disabled={loading} style={{ flex: 1, margin: 0 }}>Decline</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!activeJob && offers.length === 0 && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.5rem 1rem', borderRadius: 999, fontSize: '0.85rem', fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
            Online — waiting for jobs
          </div>
        </div>
      )}

      {activeJob && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 1000 }}>
          <div className="card" style={{ padding: '1rem', borderRadius: 18, boxShadow: '0 12px 30px rgba(0,0,0,0.18)', border: '2px solid #005eb8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className={`badge status-${activeJob.status}`}>{STATUS_LABELS[activeJob.status] || activeJob.status}</span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{formatCurrency(activeJob.fare)}</span>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pickup</span><br />{activeJob.pickupAddress}</div>
              </div>
              <div style={{ width: 2, height: 14, background: '#e5e7eb', marginLeft: 3 }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: '0.25rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Drop-off</span><br />{activeJob.dropoffAddress}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
              <a href={directionsUrl(activeJob.pickupAddress, activeJob.pickupLat, activeJob.pickupLng)} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '0.6rem 0', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem' }}>To pickup</a>
              <a href={directionsUrl(activeJob.dropoffAddress, activeJob.dropoffLat, activeJob.dropoffLng)} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '0.6rem 0', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem' }}>To drop-off</a>
            </div>
            {activeJob.customerPhone && (
              <a href={`tel:${formatPhone(activeJob.customerPhone)}`} className="secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: '0.75rem', padding: '0.6rem 0', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem' }}>Call passenger</a>
            )}
            {STATUS_ACTIONS[activeJob.status] && (
              <button onClick={() => setStatus(activeJob.jobId, STATUS_ACTIONS[activeJob.status].next)} disabled={loading}>
                {loading ? 'Updating…' : STATUS_ACTIONS[activeJob.status].label}
              </button>
            )}
          </div>
        </div>
      )}

      {openPanel && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setOpenPanel(null)}>
          <div style={{
            background: 'white', borderRadius: '18px 18px 0 0',
            maxHeight: '75%', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{openPanel === 'bids' ? 'Bids' : 'Future bookings'}</h2>
              <button className="secondary" onClick={() => setOpenPanel(null)} style={{ width: 'auto', margin: 0, padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0.75rem 1rem 1.5rem' }}>
              {openPanel === 'bids' && (
                <>
                  <h3 style={{ fontSize: '0.85rem', color: '#6b7280', margin: '1rem 0 0.5rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Open jobs</h3>
                  {bidBoard.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No open jobs to bid on right now.</p>}
                  {bidBoard.map(job => (
                    <div key={job.jobId} className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700 }}>{formatCurrency(job.fare)}</span>
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>{job.vehicleType?.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{job.pickupAddress} → {job.dropoffAddress}</div>
                      {job.myBid ? (
                        <div style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>Your bid: {formatCurrency(job.myBid.amount)}</div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Bid amount"
                            value={bidAmounts[job.jobId] || ''}
                            onChange={e => setBidAmounts(prev => ({ ...prev, [job.jobId]: e.target.value }))}
                            style={{ flex: 1, margin: 0 }}
                          />
                          <button onClick={() => placeBid(job.jobId)} disabled={loading} style={{ width: 'auto', margin: 0, padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}>Bid</button>
                        </div>
                      )}
                    </div>
                  ))}

                  <h3 style={{ fontSize: '0.85rem', color: '#6b7280', margin: '1.5rem 0 0.5rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>My bids</h3>
                  {myBids.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>You haven't placed any bids yet.</p>}
                  {myBids.map(bid => (
                    <div key={bid.bidId} className="card" style={{ padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{bid.jobId}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{formatCurrency(bid.amount)} · {bid.status}</div>
                      </div>
                      <span className="badge" style={{ background: bid.status === 'ACCEPTED' ? '#dcfce7' : '#fef3c7', color: bid.status === 'ACCEPTED' ? '#166534' : '#92400e' }}>{bid.status}</span>
                    </div>
                  ))}
                </>
              )}

              {openPanel === 'future' && (
                <>
                  {futureBookings.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No future bookings available.</p>}
                  {futureBookings.map(job => (
                    <div key={job.jobId} className="card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700 }}>{formatCurrency(job.fare)}</span>
                        <span className="badge" style={{ background: '#f3e8ff', color: '#7e22ce' }}>{job.vehicleType?.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>{new Date(job.pickupTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{job.pickupAddress} → {job.dropoffAddress}</div>
                      {job.driverId ? (
                        <div style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>{job.driverId === driverId ? 'Assigned to you' : `Assigned to ${job.driverId}`}</div>
                      ) : (
                        <button onClick={() => acceptFutureBooking(job.jobId)} disabled={loading} style={{ margin: 0 }}>Accept booking</button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
