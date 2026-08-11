import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, apiGet } from '../lib/api.js';
import { FLIGHTPATH_ZONES, findZone, getZoneName } from '../lib/zones.js';
import { distanceMiles } from '../lib/geo.js';
import { loadLeaflet, vehicleIcon, headingIcon, divIcon, pickupIconSvg, dropoffIconSvg, coinIcon } from '../lib/leaflet.js';
import { startDriverService, stopDriverService } from '../lib/driverService.js';
import logo from '../assets/logo.jpg';

function playOfferSound() {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('job offer');
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

const NavIcon = {
  map: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" /><path d="M9 3v16M15 5v16" /></svg>),
  bids: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h12v6l-6 5-6-5V2z" /><path d="M6 22h12v-6l-6-5-6 5v6z" /></svg>),
  future: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>),
  menu: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>),
  close: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>),
  locate: (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>)
};

const STATUS_FLOW = ['ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB', 'COMPLETE'];
const STATUS_LABELS = {
  ASSIGNED: 'Assigned',
  ON_WAY: 'On the way',
  ARRIVED: 'Arrived',
  POB: 'Passenger on board',
  COMPLETE: 'Complete',
  NO_SHOW: 'No show',
  CUSTOMER_CANCELLED: 'Customer cancelled'
};
const STATUS_ACTIONS = {
  ASSIGNED: { next: 'ON_WAY', label: 'On the way to pickup' },
  ON_WAY: { next: 'ARRIVED', label: 'Arrived at pickup' },
  ARRIVED: { next: 'POB', label: 'Passenger on board' },
  POB: { next: 'COMPLETE', label: 'Complete journey' }
};

const MAP_CENTER_DEFAULT = { lat: 53.393, lng: -3.05 };

function getZoneStyle(feature, currentZoneId, selectedZoneId) {
  const external = feature.properties.external;
  const active = currentZoneId === feature.properties.zoneId;
  const selected = selectedZoneId === feature.properties.zoneId;
  return {
    color: external ? '#5b5647' : (selected ? '#fff3c4' : '#f4bf1b'),
    weight: selected ? 4 : (active ? 3 : 1),
    opacity: external ? 0.5 : 0.8,
    fillColor: external ? '#5b5647' : (selected ? '#f4bf1b' : '#f4bf1b'),
    fillOpacity: external ? 0.04 : (selected ? 0.3 : (active ? 0.22 : 0.06)),
    dashArray: external ? '4 4' : undefined
  };
}

function formatCurrency(n) { return `£${Number(n || 0).toFixed(2)}`; }
function formatPhone(tel) {
  if (!tel) return null;
  const cleaned = String(tel).replace(/\s/g, '');
  return cleaned.startsWith('0') ? `+44${cleaned.slice(1)}` : cleaned;
}
function directionsUrl(address, lat, lng) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

const offerIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 24 24"><path fill="#22c55e" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;


function DriverPageContent() {
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
  const [lastLocationSentAt, setLastLocationSentAt] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [heading, setHeading] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);
  const [bidBoard, setBidBoard] = useState([]);
  const [selectedBid, setSelectedBid] = useState(null);
  const [bidTab, setBidTab] = useState('open');
  const [myBids, setMyBids] = useState([]);
  const [futureBookings, setFutureBookings] = useState([]);
  const [futureOffers, setFutureOffers] = useState([]);
  const [futureTab, setFutureTab] = useState('upcoming');
  const [followMe, setFollowMe] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [appError, setAppError] = useState('');

  const mapRef = useRef(null);
  const LRef = useRef(null);
  const mapObjRef = useRef(null);
  const selfMarkerRef = useRef(null);
  const offerMarkersRef = useRef([]);
  const otherDriverMarkersRef = useRef([]);
  const jobMarkersRef = useRef([]);
  const bidMarkersRef = useRef([]);
  const geoJsonLayerRef = useRef(null);
  const zoneLabelsRef = useRef([]);
  const pendingZoneRef = useRef(null);
  const lastLocationUpdateRef = useRef(0);
  const lastGpsReadingRef = useRef(0);
  const currentZoneIdRef = useRef(currentZoneId);

  useEffect(() => { currentZoneIdRef.current = currentZoneId; }, [currentZoneId]);

  useEffect(() => {
    const storedId = localStorage.getItem('driverId');
    const storedToken = localStorage.getItem('driverToken');
    if (!storedId || !storedToken) return;
    async function restore() {
      try {
        await apiGet('/driver/me', { 'x-driver-id': storedId, 'x-driver-token': storedToken });
        setDriverId(storedId);
        setDriverName(localStorage.getItem('driverName') || '');
        setLoggedIn(true);
      } catch {
        localStorage.removeItem('driverId');
        localStorage.removeItem('driverName');
        localStorage.removeItem('driverToken');
      }
    }
    restore();
  }, []);

  useEffect(() => {
    function onErr(msg, url, line, col, err) {
      setAppError(String(msg) + (err && err.stack ? '\n' + err.stack : ''));
      return false;
    }
    function onRejection(ev) {
      setAppError('Unhandled promise: ' + String(ev.reason && (ev.reason.message || ev.reason)));
    }
    window.onerror = onErr;
    window.onunhandledrejection = onRejection;
    return () => { window.onerror = null; window.onunhandledrejection = null; };
  }, []);

  const activeJob = useMemo(() => (jobs || []).find(j => !['COMPLETE', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(j.status)), [jobs]);

  const liveMeter = useMemo(() => {
    if (!activeJob || activeJob.status !== 'POB') return null;
    const start = new Date(activeJob.pobAt || activeJob.pobMeterStartedAt || Date.now()).getTime();
    const elapsedMs = Math.max(0, now - start);
    return {
      fare: Number(activeJob.meterFare) || activeJob.fare,
      elapsedMs,
      distance: Number(activeJob.meterDistance) || 0,
      waitingSeconds: Number(activeJob.meterWaitingSeconds) || 0
    };
  }, [activeJob, now]);

  const driverZone = (d) => {
    if (d?.zone) return d.zone;
    const lat = Number(d?.lastLat);
    const lng = Number(d?.lastLng);
    if (lat && lng) {
      const f = findZone(lat, lng);
      return f ? f.properties.zoneId : null;
    }
    return null;
  };

  const queueInfo = useMemo(() => {
    const zoneId = currentZoneId || profile?.zone || null;
    const zoneName = zoneId ? getZoneName(zoneId) : 'Locating...';
    const allDrivers = [profile, ...otherDrivers].filter(Boolean);
    const seen = new Set();
    const unique = allDrivers.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
    const queue = zoneId ? unique
      .filter(d => d.status === 'AVAILABLE' && driverZone(d) === zoneId)
      .sort((a, b) => String(a.availableSince || '9999').localeCompare(String(b.availableSince || '9999'))) : [];
    const position = queue.findIndex(d => d.id === driverId);
    return { zoneId, zoneName, queue, position: position >= 0 ? position + 1 : null };
  }, [currentZoneId, profile, otherDrivers, driverId]);

  const zonePanelInfo = useMemo(() => {
    if (!selectedZoneId) return null;
    const zoneName = getZoneName(selectedZoneId);
    const allDrivers = [profile, ...otherDrivers].filter(Boolean);
    const seen = new Set();
    const unique = allDrivers.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
    const queue = unique
      .filter(d => d.status === 'AVAILABLE' && driverZone(d) === selectedZoneId)
      .sort((a, b) => String(a.availableSince || '9999').localeCompare(String(b.availableSince || '9999')));
    const inZone = (job) => {
      const z = findZone(job.pickupLat, job.pickupLng);
      return z && z.properties.zoneId === selectedZoneId;
    };
    return {
      zoneId: selectedZoneId,
      zoneName,
      queue,
      bids: bidBoard.filter(inZone),
      futures: futureBookings.filter(inZone)
    };
  }, [selectedZoneId, profile, otherDrivers, bidBoard, futureBookings]);

  async function login(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api('driver/login', { driverId: driverId.toUpperCase(), pin });
      localStorage.setItem('driverId', res.driverId);
      localStorage.setItem('driverName', res.name);
      localStorage.setItem('driverToken', res.token);
      setDriverName(res.name);
      setLoggedIn(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function logout() {
    try { await api('driver/logout', {}, driverAuth()); } catch {}
    localStorage.removeItem('driverId');
    localStorage.removeItem('driverName');
    localStorage.removeItem('driverToken');
    setLoggedIn(false);
    setDriverId(''); setPin('');
    setJobs([]); setOffers([]); setOtherDrivers([]); setProfile(null);
    setMyLocation(null);
  }

  function driverAuth(id = driverId) { return { 'x-driver-id': id, 'x-driver-token': localStorage.getItem('driverToken') || '' }; }

  async function setAvailability(status) {
    setLoading(true);
    setError('');
    try {
      await api('driver/availability', { status }, driverAuth());
      if (status === 'AVAILABLE') {
        startDriverService();
      } else {
        stopDriverService();
      }
      await loadProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(id = driverId) {
    try {
      const data = await apiGet('/driver/me', driverAuth(id));
      setProfile(data);
      if (data.lastLocationAt) {
        const ageMs = Date.now() - new Date(data.lastLocationAt).getTime();
        if (ageMs >= 0 && ageMs < 120000) setLocationOk(true);
      }
    }
    catch {}
  }

  async function loadJobs(id = driverId) {
    try { const data = await apiGet('/driver/jobs', driverAuth(id)); setJobs(data.jobs); }
    catch (err) { setError(err.message); }
  }

  async function loadOffers(id = driverId) {
    try { const data = await apiGet('/driver/offers', driverAuth(id)); setOffers(data.offers); }
    catch {}
  }

  async function loadOtherDrivers() {
    try { const data = await apiGet('/drivers'); setOtherDrivers(data.drivers || []); }
    catch {}
  }

  async function loadBidBoard(id = driverId) {
    try { const data = await apiGet('/driver/bid-board', driverAuth(id)); setBidBoard(data.jobs || []); }
    catch {}
  }

  async function loadMyBids(id = driverId) {
    try { const data = await apiGet('/driver/my-bids', driverAuth(id)); setMyBids(data.bids || []); }
    catch {}
  }

  async function loadFutureBookings(id = driverId) {
    try { const data = await apiGet('/driver/future-bookings', driverAuth(id)); setFutureBookings(data.jobs || []); }
    catch {}
  }

  async function loadFutureOffers(id = driverId) {
    try { const data = await apiGet('/driver/future-offers', driverAuth(id)); setFutureOffers(data.offers || []); }
    catch {}
  }

  async function placeBid(jobId, amount) {
    if (!amount || Number(amount) <= 0) return setError('This job does not have a valid fare.');
    setLoading(true); setError('');
    try {
      await api(`driver/bid-board/${jobId}/bid`, { amount: Number(amount) }, driverAuth());
      await Promise.all([loadBidBoard(), loadMyBids()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function acceptFutureBooking(jobId) {
    setLoading(true); setError('');
    try {
      await api(`driver/future-bookings/${jobId}/accept`, {}, driverAuth());
      await Promise.all([loadFutureBookings(), loadJobs()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function acceptFutureOffer(jobId) {
    setLoading(true); setError('');
    try {
      await api(`driver/future-offers/${jobId}/accept`, {}, driverAuth());
      await Promise.all([loadFutureOffers(), loadFutureBookings(), loadJobs()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function declineFutureOffer(jobId) {
    setLoading(true); setError('');
    try {
      await api(`driver/future-offers/${jobId}/decline`, {}, driverAuth());
      await loadFutureOffers();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function recenterMap() {
    setFollowMe(true);
    const map = mapObjRef.current;
    if (map && myLocation) map.panTo([myLocation.lat, myLocation.lng]);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser/device.');
      return;
    }
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading: h } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setMyLocation({ lat: latitude, lng: longitude });
        setLocationOk(true);
        setLocationError('');
        lastGpsReadingRef.current = Date.now();
        if (h != null && !Number.isNaN(h)) setHeading(h);
      },
      (err) => {
        setLocationOk(false);
        if (err.code === 1) setLocationError('Location access denied. Enable location services in your device settings and tap Loc off.');
        else if (err.code === 2) setLocationError('Location unavailable. Check that GPS/location services are turned on.');
        else if (err.code === 3) setLocationError('Location request timed out. Signal may be weak.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function acceptOffer(jobId) {
    setLoading(true);
    try {
      await api(`driver/offers/${jobId}/accept`, {}, driverAuth());
      await Promise.all([loadOffers(), loadJobs()]);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function declineOffer(jobId) {
    try { await api(`driver/offers/${jobId}/decline`, {}, driverAuth()); loadOffers(); }
    catch (err) { setError(err.message); }
  }

  async function setStatus(jobId, status) {
    setLoading(true);
    try { await api(`driver/jobs/${jobId}/status`, { status }, driverAuth()); await loadJobs(); await loadProfile(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function changeVehicle(jobId, vehicleType) {
    setLoading(true);
    try {
      await api(`driver/jobs/${jobId}/vehicle`, { vehicleType }, driverAuth());
      await loadJobs();
    } catch (err) { setError(err.message); }
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
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
        maxZoom: 19
      }).addTo(map);
      mapObjRef.current = map;

      geoJsonLayerRef.current = L.geoJSON(FLIGHTPATH_ZONES, {
        filter: f => f.properties.zoneId !== 'international' && !f.properties.external,
        style: feature => getZoneStyle(feature, currentZoneId, selectedZoneId),
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            setSelectedZoneId(feature.properties.zoneId);
          });
        }
      }).addTo(map);

      const labelIcon = (zoneName) => L.divIcon({
        className: 'zone-label',
        html: `<span style="color:#f2ead9;font-size:9px;font-weight:600;letter-spacing:0.2px;white-space:nowrap;background:rgba(10,10,10,0.75);padding:1px 4px;border-radius:4px">${zoneName}</span>`,
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
        .filter(feature => feature.properties.zoneId !== 'international' && !feature.properties.external)
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
      map.on('dragstart', () => setFollowMe(false));
      const wirralBoundsLayer = L.geoJSON(FLIGHTPATH_ZONES, { filter: f => !f.properties.external });
      map.fitBounds(wirralBoundsLayer.getBounds(), { padding: [40, 40] });
      setTimeout(showLabels, 0);
      setMapReady(true);
    }).catch(err => setError('Map failed: ' + err.message));
    return () => { mounted = false; };
  }, [loggedIn]);

  useEffect(() => {
    if (!mapReady || !geoJsonLayerRef.current) return;
    geoJsonLayerRef.current.setStyle(feature => getZoneStyle(feature, currentZoneId, selectedZoneId));
  }, [mapReady, currentZoneId, selectedZoneId]);

  useEffect(() => {
    if (!mapReady || !myLocation || !LRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    if (!selfMarkerRef.current) {
      selfMarkerRef.current = L.marker([myLocation.lat, myLocation.lng], {
        icon: headingIcon(L, '#f4bf1b', heading, 36, 'self-marker'),
        zIndexOffset: 1000
      }).addTo(map).bindPopup('You');
    } else {
      selfMarkerRef.current.setLatLng([myLocation.lat, myLocation.lng]);
      selfMarkerRef.current.setIcon(headingIcon(L, '#f4bf1b', heading, 36, 'self-marker'));
    }
    if (followMe) map.panTo([myLocation.lat, myLocation.lng]);
  }, [mapReady, myLocation, heading, followMe]);

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
    bidMarkersRef.current.forEach(m => map.removeLayer(m));
    bidMarkersRef.current = [];
    bidBoard.forEach(job => {
      if (job.myBid) return;
      const marker = L.marker([job.pickupLat, job.pickupLng], { icon: coinIcon(L) }).addTo(map)
        .bindPopup(`Bid: ${job.pickupAddress}<br/>${formatCurrency(job.fare)}`);
      marker.on('click', () => { setSelectedBid(job); });
      bidMarkersRef.current.push(marker);
    });
  }, [mapReady, bidBoard]);

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
    const id = setInterval(() => { loadJobs(); loadOffers(); loadProfile(); loadOtherDrivers(); loadBidBoard(); loadMyBids(); loadFutureBookings(); loadFutureOffers(); }, 5000);
    return () => clearInterval(id);
  }, [loggedIn, driverId]);

  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [loggedIn]);

  useEffect(() => {
    if (!selectedBid) return;
    if (!bidBoard.find(j => j.jobId === selectedBid.jobId)) setSelectedBid(null);
  }, [bidBoard, selectedBid]);

  const previousOfferCountRef = useRef(0);
  useEffect(() => {
    if (offers.length > 0 && previousOfferCountRef.current === 0) {
      playOfferSound();
    }
    previousOfferCountRef.current = offers.length;
  }, [offers]);

  useEffect(() => {
    if (!loggedIn || !navigator.geolocation) return;
    setLocationError('');

    function sendLocation(lat, lng, zone, accuracy) {
      api('driver/location', { lat, lng, zone, accuracy }, driverAuth())
        .then(() => { lastLocationUpdateRef.current = Date.now(); setLastLocationSentAt(Date.now()); })
        .catch(err => {
          if (err && err.message) setLocationError('Location send failed: ' + err.message);
        });
    }

    function handlePosition(position) {
      const { latitude, longitude, accuracy, heading: h } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const location = { lat: latitude, lng: longitude };
      setMyLocation(location);
      setLocationOk(true);
      setLocationError('');
      lastGpsReadingRef.current = Date.now();
      if (h != null && !Number.isNaN(h)) setHeading(h);

      const zoneFeature = findZone(latitude, longitude);
      const zoneId = zoneFeature ? zoneFeature.properties.zoneId : null;
      const previousZoneId = currentZoneIdRef.current;

      const pending = pendingZoneRef.current;
      if (zoneId !== previousZoneId) {
        if (!previousZoneId && zoneId) {
          setCurrentZoneId(zoneId);
          currentZoneIdRef.current = zoneId;
          sendLocation(latitude, longitude, zoneId, accuracy);
          pendingZoneRef.current = null;
          return;
        }
        if (!pending || pending.zoneId !== zoneId) {
          pendingZoneRef.current = { zoneId, since: Date.now(), readings: 1 };
        } else {
          pending.readings += 1;
          const elapsed = Date.now() - pending.since;
          if (pending.readings >= 2 || elapsed >= 20000) {
            setCurrentZoneId(zoneId);
            currentZoneIdRef.current = zoneId;
            sendLocation(latitude, longitude, zoneId, accuracy);
            pendingZoneRef.current = null;
            return;
          }
        }
      } else {
        pendingZoneRef.current = null;
      }

      sendLocation(latitude, longitude, previousZoneId || zoneId, accuracy);
    }

    function onGeoError(err) {
      setLocationOk(false);
      if (!err) return;
      if (err.code === 1) {
        setLocationError('Location access denied. Enable location services and refresh the page.');
      } else if (err.code === 2) {
        setLocationError('Location unavailable. Make sure GPS/location services are turned on.');
      } else if (err.code === 3) {
        setLocationError('Location request timed out. Signal may be weak.');
      }
    }

    function safeGetCurrentPosition(options) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject({ code: 2, message: 'Geolocation not supported' });
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    }

    async function refreshLocation() {
      try {
        await safeGetCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      } catch (err1) {
        try {
          await safeGetCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
        } catch (err2) {
          onGeoError(err2);
        }
      }
    }

    refreshLocation();
    const interval = setInterval(refreshLocation, 10000);
    return () => clearInterval(interval);
  }, [loggedIn, driverId]);

  if (!loggedIn) {
    return (
      <div className="wj-shell">
        <div className="wj-frame" style={{ maxWidth: 400 }}>
          <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
          <p className="wj-tagline" style={{ marginBottom: '1.25rem' }}>Driver portal — log in to start receiving jobs.</p>
          <form onSubmit={login}>
            <div className="form-group">
              <label>Driver ID</label>
              <input value={driverId} onChange={e => setDriverId(e.target.value.toUpperCase())} placeholder="DRV-001" autoFocus />
            </div>
            <div className="form-group">
              <label>PIN</label>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="1234" />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Logging in…' : 'Log in'}</button>
            {error && <p className="error">{error}</p>}
            <Link to="/driver/apply" className="wj-portal-back">New driver? Start your application</Link>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000 }} className="wj-driver-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="" className="logo-badge" />
          <div className="name-block">
            <div className="name">{driverName || driverId}</div>
            <div className="sub">{profile ? `${getZoneName(profile.zone)} · ${formatCurrency(profile.settleBalance)}` : driverId}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`wj-pill ${locationOk ? 'wj-pill-green' : 'wj-pill-red'}`}
            onClick={!locationOk ? requestLocation : undefined}
            style={{ cursor: locationOk ? 'default' : 'pointer' }}
            title={locationOk ? 'Location active' : 'Tap to enable location'}
          >
            <span className={`wj-dot ${locationOk ? 'wj-dot-green' : 'wj-dot-red'}`} />
            {locationOk ? 'Loc on' : 'Loc off'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setAvailability('AVAILABLE')} disabled={loading || profile?.status === 'AVAILABLE'}>Available</button>
          <button className="btn btn-outline btn-sm" onClick={() => setAvailability('BREAK')} disabled={loading || profile?.status === 'BREAK'}>Break</button>
          <button className="btn btn-outline btn-sm" onClick={logout} disabled={loading}>Log out</button>
        </div>
      </div>

      {locationError && (
        <div style={{ position: 'absolute', top: 76, left: 12, right: 12, zIndex: 1000 }}>
          <p className="error" style={{ margin: 0, padding: '0.6rem 0.9rem', borderRadius: 10, background: 'var(--surface)', border: '1.5px solid rgba(239,68,68,0.4)' }}>{locationError}</p>
        </div>
      )}

      {appError && (
        <div style={{ position: 'absolute', top: locationError ? 140 : 76, left: 12, right: 12, zIndex: 1000 }}>
          <pre style={{ margin: 0, padding: '0.6rem 0.9rem', borderRadius: 10, background: 'var(--surface)', border: '1.5px solid rgba(239,68,68,0.4)', color: '#ff9d9d', fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto' }}>{appError}</pre>
        </div>
      )}

      <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />

      <div style={{
        position: 'absolute', bottom: 74, left: 12, zIndex: 1000,
        background: 'var(--surface)', border: '1.5px solid var(--border-strong)', borderRadius: 14, padding: '0.7rem 0.9rem',
        maxWidth: 280, fontSize: '0.85rem'
      }}>
        <div style={{ fontWeight: 800, color: 'var(--gold)', marginBottom: '0.25rem', fontSize: '0.9rem', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>{queueInfo.zoneName}</div>
        {queueInfo.position != null && (
          <div style={{ marginBottom: '0.4rem', color: 'var(--cream-dim)' }}>Queue: <strong style={{ color: 'var(--cream)' }}>#{queueInfo.position}</strong> of {queueInfo.queue.length}</div>
        )}
        {lastLocationSentAt && (
          <div style={{ fontSize: '0.75rem', color: 'var(--cream-dim)', marginBottom: '0.4rem' }}>Server update: {Math.round((now - lastLocationSentAt) / 1000)}s ago</div>
        )}
        {queueInfo.queue.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {queueInfo.queue.map((d, i) => (
              <span key={d.id} style={{
                padding: '2px 7px', borderRadius: 999,
                background: d.id === driverId ? 'rgba(244,191,27,0.18)' : 'rgba(242,234,217,0.08)',
                color: d.id === driverId ? 'var(--gold)' : 'var(--cream-dim)',
                fontWeight: d.id === driverId ? 700 : 400,
                fontSize: '0.75rem'
              }}>
                {i + 1}. {String(d.id || '').replace(/^DRV-/, '')}
              </span>
            ))}
          </div>
        )}
      </div>

      {offers.length > 0 && (
        <div style={{ position: 'absolute', top: 84, left: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
          {offers.map(offer => {
            const secondsLeft = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
            const pickupZone = findZone(offer.pickupLat, offer.pickupLng);
            const dropoffZone = findZone(offer.dropoffLat, offer.dropoffLng);
            const runningMiles = myLocation ? distanceMiles(myLocation.lat, myLocation.lng, offer.pickupLat, offer.pickupLng) : null;
            const fareMiles = distanceMiles(offer.pickupLat, offer.pickupLng, offer.dropoffLat, offer.dropoffLng);
            return (
              <div key={offer.jobId} className="card" style={{ pointerEvents: 'auto', border: '2px solid var(--gold)', borderRadius: 18, padding: 0, overflow: 'hidden', background: 'linear-gradient(135deg, #15130b, #090909)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: 'rgba(244,191,27,0.12)', borderBottom: '1.5px solid var(--gold)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="wj-dot wj-dot-green" style={{ animation: 'pulse 1.2s infinite' }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--cream)' }}>New job offer</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: secondsLeft < 15 ? '#ff9d9d' : 'var(--gold)' }}>{secondsLeft}s left</span>
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--cream-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fare</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', lineHeight: 1, color: 'var(--gold)' }}>{formatCurrency(offer.fare)}</div>
                    </div>
                    <span style={{ padding: '0.35rem 0.55rem', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'rgba(242,234,217,0.06)', color: 'var(--cream)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{offer.vehicleType === 'mpv' ? 'MPV' : 'Saloon/estate'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                    <div style={{ padding: '0.65rem', border: '1.5px solid var(--border-strong)', borderRadius: 12, background: 'rgba(0,0,0,0.25)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Running distance</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--cream)', marginTop: 4 }}>{runningMiles != null ? `${runningMiles.toFixed(1)} mi` : '—'}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', marginTop: 2 }}>To pickup</div>
                    </div>
                    <div style={{ padding: '0.65rem', border: '1.5px solid var(--border-strong)', borderRadius: 12, background: 'rgba(0,0,0,0.25)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Fare distance</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--cream)', marginTop: 4 }}>{fareMiles != null ? `${fareMiles.toFixed(1)} mi` : '—'}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', marginTop: 2 }}>Pickup to drop-off</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
                    <span className="wj-dot wj-dot-green" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase' }}>Pickup</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offer.pickupAddress}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--cream-dim)' }}>{pickupZone ? getZoneName(pickupZone.properties.zoneId) : '—'}</div>
                    </div>
                  </div>
                  <div style={{ width: 2, height: 14, background: 'var(--border)', marginLeft: 3, marginBottom: '0.5rem' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                    <span className="wj-dot wj-dot-red" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase' }}>Drop-off</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offer.dropoffAddress}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--cream-dim)' }}>{dropoffZone ? getZoneName(dropoffZone.properties.zoneId) : '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => acceptOffer(offer.jobId)} disabled={loading} className="btn btn-primary" style={{ flex: 1, padding: '0.9rem', fontSize: '1rem', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>Accept</button>
                    <button onClick={() => declineOffer(offer.jobId)} disabled={loading} className="btn btn-outline" style={{ flex: 1, padding: '0.9rem', fontSize: '0.9rem' }}>Decline</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!activeJob && offers.length === 0 && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(10,10,10,0.9)', border: '1.5px solid var(--border-strong)', color: 'var(--cream)', padding: '0.5rem 1.1rem', borderRadius: 999, fontSize: '0.85rem', fontWeight: 700 }}>
            <span className="wj-dot wj-dot-green" style={{ animation: 'pulse 1.5s infinite' }} />
            Online — waiting for jobs
          </div>
        </div>
      )}

      {activeJob && (
        <div style={{ position: 'absolute', bottom: 72, left: 12, right: 12, zIndex: 1000, maxHeight: '55vh', overflowY: 'auto' }}>
          <div className="card" style={{ padding: '1rem', borderRadius: 18, border: '2px solid var(--gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className={`badge status-${activeJob.status}`}>{STATUS_LABELS[activeJob.status] || activeJob.status}</span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{formatCurrency(activeJob.fare)}</span>
            </div>
            {liveMeter && (
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', border: '1.5px solid var(--gold)', borderRadius: 12, background: 'rgba(244,191,27,0.08)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase' }}>Meter running</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--cream)', lineHeight: 1 }}>{formatCurrency(liveMeter.fare)}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--cream-dim)', marginTop: '0.25rem' }}>
                  <span>{Math.floor(liveMeter.elapsedMs / 60000)}m {String(Math.floor((liveMeter.elapsedMs % 60000) / 1000)).padStart(2, '0')}s</span>
                  <span>{liveMeter.distance.toFixed(1)} mi</span>
                  {liveMeter.waitingSeconds > 0 && <span>{Math.ceil(liveMeter.waitingSeconds / 60)}m wait</span>}
                </div>
              </div>
            )}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '0.35rem' }}>
                <span className="wj-dot wj-dot-green" style={{ marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Pickup</span><br />{activeJob.pickupAddress}</div>
              </div>
              <div style={{ width: 2, height: 14, background: 'var(--border)', marginLeft: 3 }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: '0.25rem' }}>
                <span className="wj-dot wj-dot-red" style={{ marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Drop-off</span><br />{activeJob.dropoffAddress}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
              <a href={directionsUrl(activeJob.pickupAddress, activeJob.pickupLat, activeJob.pickupLng)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}>To pickup</a>
              <a href={directionsUrl(activeJob.dropoffAddress, activeJob.dropoffLat, activeJob.dropoffLng)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}>To drop-off</a>
            </div>
            {activeJob.customerPhone && (
              <a href={`tel:${formatPhone(activeJob.customerPhone)}`} className="btn btn-outline btn-sm" style={{ display: 'block', textAlign: 'center', marginBottom: '0.75rem' }}>Call passenger</a>
            )}
            {STATUS_ACTIONS[activeJob.status] && (
              <button onClick={() => setStatus(activeJob.jobId, STATUS_ACTIONS[activeJob.status].next)} disabled={loading} className="btn btn-primary">
                {loading ? 'Updating…' : STATUS_ACTIONS[activeJob.status].label}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
              <button onClick={() => changeVehicle(activeJob.jobId, 'car')} disabled={loading || activeJob.vehicleType === 'car'} className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}>Car tariff</button>
              <button onClick={() => changeVehicle(activeJob.jobId, 'mpv')} disabled={loading || activeJob.vehicleType === 'mpv'} className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}>MPV tariff</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem' }}>
              <button onClick={() => setStatus(activeJob.jobId, 'NO_SHOW')} disabled={loading} className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center', color: 'crimson', borderColor: 'crimson' }}>No show</button>
              <button onClick={() => setStatus(activeJob.jobId, 'CUSTOMER_CANCELLED')} disabled={loading} className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center', color: 'crimson', borderColor: 'crimson' }}>Customer cancelled</button>
            </div>
          </div>
        </div>
      )}

      {!activeJob && selectedBid && (
        <div style={{ position: 'absolute', bottom: 72, left: 12, right: 12, zIndex: 1001, maxHeight: '45vh', overflowY: 'auto' }}>
          <div className="card" style={{ padding: '1rem', borderRadius: 18, border: '2px solid var(--gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: '0.9rem' }}>Open job bid</span>
              <button onClick={() => setSelectedBid(null)} className="btn btn-outline btn-sm">Close</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '0.35rem' }}>
                <span className="wj-dot wj-dot-green" style={{ marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Pickup</span><br />{selectedBid.pickupAddress}</div>
              </div>
              <div style={{ width: 2, height: 14, background: 'var(--border)', marginLeft: 3 }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: '0.25rem' }}>
                <span className="wj-dot wj-dot-red" style={{ marginTop: 4 }} />
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Drop-off</span><br />{selectedBid.dropoffAddress}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--cream-dim)' }}>Fare</span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{formatCurrency(selectedBid.fare)}</span>
            </div>
            <button onClick={() => placeBid(selectedBid.jobId, selectedBid.fare)} disabled={loading} className="btn btn-primary">
              {loading ? 'Asking…' : 'Ask for this job'}
            </button>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1050
      }} className="wj-bottom-nav">
        <button className="wj-nav-item active" onClick={recenterMap}>
          <NavIcon.map /> Map
        </button>
        <button className="wj-nav-item" onClick={() => setOpenPanel('bids')}>
          <span style={{ position: 'relative' }}>
            <NavIcon.bids />
            {bidBoard.length > 0 && <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: 'var(--gold)', color: '#000', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bidBoard.length}</span>}
          </span> Bids
        </button>
        <button className="wj-nav-item" onClick={() => setOpenPanel('future')}>
          <span style={{ position: 'relative' }}>
            <NavIcon.future />
            {futureOffers.length > 0 && <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: 'var(--gold)', color: '#000', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{futureOffers.length}</span>}
          </span> Future
        </button>
        <button className="wj-nav-item" onClick={() => setOpenPanel('menu')}>
          <NavIcon.menu /> Menu
        </button>
      </div>

      {openPanel && openPanel !== 'menu' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setOpenPanel(null)}>
          <div style={{
            background: 'var(--surface)', border: '1.5px solid var(--border-strong)', borderBottom: 'none',
            borderRadius: '20px 20px 0 0',
            maxHeight: '78%', display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.1rem 0.75rem', borderBottom: '1.5px solid var(--border)' }}>
              <h2 className="wj-panel-title" style={{ margin: 0 }}>{openPanel === 'bids' ? 'Bids' : 'Future bookings'}</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setOpenPanel(null)}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0.9rem 1.1rem 1.75rem' }}>
              {openPanel === 'bids' && (
                <div className="wj-bids-screen">
                  <div className="wj-future-tabs" style={{ marginBottom: '0.9rem' }}>
                    <button className={bidTab === 'open' ? 'active' : ''} onClick={() => setBidTab('open')}>Open jobs</button>
                    <button className={bidTab === 'mine' ? 'active' : ''} onClick={() => setBidTab('mine')}>My bids</button>
                  </div>
                  {bidTab === 'open' && (
                    <>
                      {bidBoard.length === 0 && <p className="wj-bids-empty">No open jobs to bid on right now.</p>}
                      {bidBoard.map(job => {
                        const pickupZone = findZone(job.pickupLat, job.pickupLng);
                        const dropoffZone = findZone(job.dropoffLat, job.dropoffLng);
                        const runningMiles = myLocation ? distanceMiles(myLocation.lat, myLocation.lng, job.pickupLat, job.pickupLng) : null;
                        const fareMiles = distanceMiles(job.pickupLat, job.pickupLng, job.dropoffLat, job.dropoffLng);
                        return (
                          <article key={job.jobId} className="wj-bid-job">
                            <div className="wj-bid-heading"><div><h3>New bid</h3><p>Review the job details below and ask for it if you're available.</p></div><span className="wj-bid-availability"><i />Online<small>{queueInfo.zoneName}</small></span></div>
                            <div className="wj-bid-details">
                              <div><span className="wj-bid-icon">●</span><p>Running distance<strong>{runningMiles != null ? `${runningMiles.toFixed(1)} mi` : '—'}</strong><small>Distance from you to pickup</small></p></div>
                              <div><span className="wj-bid-icon">£</span><p>Maximum fare amount<strong>{formatCurrency(job.fare)}</strong><small>This is the most we can charge</small></p></div>
                              <div><span className="wj-bid-icon">╱</span><p>Fare distance<strong>{fareMiles.toFixed(1)} mi</strong><small>Estimated journey distance</small></p></div>
                              <div><span className="wj-bid-icon">◷</span><p>Vehicle<strong>{job.vehicleType === 'mpv' ? 'MPV' : 'Saloon/estate'}</strong><small>Requested vehicle</small></p></div>
                              <div><span className="wj-bid-icon">↑</span><p>Pickup zone<strong>{pickupZone ? getZoneName(pickupZone.properties.zoneId) : job.pickupAddress}</strong><small>{job.pickupAddress}</small></p></div>
                              <div><span className="wj-bid-icon">↓</span><p>Destination zone<strong>{dropoffZone ? getZoneName(dropoffZone.properties.zoneId) : job.dropoffAddress}</strong><small>{job.dropoffAddress}</small></p></div>
                            </div>
                            {job.myBid ? (
                              <div className="wj-bid-status">You asked for this job at {formatCurrency(job.myBid.amount)}.</div>
                            ) : (
                              <div className="wj-bid-actions">
                                <button onClick={() => placeBid(job.jobId, job.fare)} disabled={loading} className="wj-bid-ask">✋ <span><strong>Ask for this job</strong><small>Ask to be considered for this job</small></span></button>
                                <button onClick={() => setBidBoard(current => current.filter(item => item.jobId !== job.jobId))} disabled={loading} className="wj-bid-decline">× <span><strong>Not for me</strong><small>Skip this job</small></span></button>
                              </div>
                            )}
                            <p className="wj-bid-disclaimer">ⓘ Asking for the job does not guarantee assignment. The system selects the most suitable driver based on location, ETA, queue position and availability.</p>
                          </article>
                        );
                      })}
                    </>
                  )}

                  {bidTab === 'mine' && (
                    <>
                      {myBids.length === 0 && <p className="wj-bids-empty">You haven't asked for any jobs yet.</p>}
                      {myBids.map(bid => {
                        const job = bid.job || {};
                        const pickupZone = findZone(job.pickupLat, job.pickupLng);
                        const dropoffZone = findZone(job.dropoffLat, job.dropoffLng);
                        const accepted = job.status && job.status !== 'BIDDING';
                        return (
                          <article key={bid.job_id || bid.created_at} className="wj-bid-job">
                            <div className="wj-bid-heading"><div><h3>Your bid</h3><p>{accepted ? 'Assigned to you' : 'Waiting to be assigned'}</p></div><span className="wj-bid-availability"><i />{formatCurrency(bid.amount)}</span></div>
                            <div className="wj-bid-details">
                              <div><span className="wj-bid-icon">●</span><p>Pickup<strong>{pickupZone ? getZoneName(pickupZone.properties.zoneId) : job.pickupAddress}</strong><small>{job.pickupAddress}</small></p></div>
                              <div><span className="wj-bid-icon">↓</span><p>Drop-off<strong>{dropoffZone ? getZoneName(dropoffZone.properties.zoneId) : job.dropoffAddress}</strong><small>{job.dropoffAddress}</small></p></div>
                              <div><span className="wj-bid-icon">£</span><p>Fare<strong>{formatCurrency(job.fare)}</strong><small>Maximum charge</small></p></div>
                            </div>
                            {accepted && <div className="wj-bid-status">Job assigned — check your active jobs.</div>}
                          </article>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {openPanel === 'future' && (
                <div className="wj-future-screen">
                  <div className="wj-future-hero"><img src={logo} alt="The Wirral Jobe" /><div><h3>Future bookings</h3><p>Jobs booked in advance. Allocation will start closer to the pickup time.</p></div></div>

                  {futureOffers.length > 0 && (
                    <div style={{ marginBottom: '0.9rem' }}>
                      {futureOffers.map(offer => {
                        const secondsLeft = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
                        const pickupDate = new Date(offer.pickupTime);
                        const pickupZone = findZone(offer.pickupLat, offer.pickupLng);
                        const dropoffZone = findZone(offer.dropoffLat, offer.dropoffLng);
                        const runningMiles = myLocation ? distanceMiles(myLocation.lat, myLocation.lng, offer.pickupLat, offer.pickupLng) : null;
                        return (
                          <div key={offer.jobId} className="card" style={{ border: '2px solid var(--gold)', borderRadius: 18, padding: '1rem', background: 'linear-gradient(135deg, #15130b, #090909)', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                              <span style={{ fontWeight: 800, textTransform: 'uppercase', color: 'var(--gold)' }}>Future offer · Grade {offer.letter || '—'}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: secondsLeft < 15 ? '#ff9d9d' : 'var(--gold)' }}>{secondsLeft}s left</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--cream)', marginBottom: '0.4rem' }}>{offer.pickupAddress} → {offer.dropoffAddress}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '0.75rem' }}>
                              <div style={{ padding: '0.5rem', border: '1.5px solid var(--border-strong)', borderRadius: 10, background: 'rgba(0,0,0,0.25)' }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Fare</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--gold)' }}>{formatCurrency(offer.fare)}</div>
                              </div>
                              <div style={{ padding: '0.5rem', border: '1.5px solid var(--border-strong)', borderRadius: 10, background: 'rgba(0,0,0,0.25)' }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Pickup</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--cream)' }}>{pickupDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                              </div>
                              <div style={{ padding: '0.5rem', border: '1.5px solid var(--border-strong)', borderRadius: 10, background: 'rgba(0,0,0,0.25)' }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Running</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--cream)' }}>{runningMiles != null ? `${runningMiles.toFixed(1)} mi` : '—'}</div>
                              </div>
                              <div style={{ padding: '0.5rem', border: '1.5px solid var(--border-strong)', borderRadius: 10, background: 'rgba(0,0,0,0.25)' }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--cream-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Vehicle</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--cream)' }}>{offer.vehicleType === 'mpv' ? 'MPV' : 'Saloon/estate'}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => acceptFutureOffer(offer.jobId)} disabled={loading}>Accept</button>
                              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => declineFutureOffer(offer.jobId)} disabled={loading}>Decline</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="wj-future-tabs">
                    <button className={futureTab === 'upcoming' ? 'active' : ''} onClick={() => setFutureTab('upcoming')}>Upcoming</button>
                    <button className={futureTab === 'offered' ? 'active' : ''} onClick={() => setFutureTab('offered')}>Offered to me</button>
                    <button className={futureTab === 'all' ? 'active' : ''} onClick={() => setFutureTab('all')}>All</button>
                  </div>
                  {(() => {
                    const shownBookings = futureBookings.filter(job => {
                      if (futureTab === 'upcoming') return job.driverId === driverId && job.status !== 'SCHEDULED';
                      if (futureTab === 'offered') return !job.driverId || (job.driverId === driverId && job.status === 'SCHEDULED');
                      return true;
                    });
                    if (shownBookings.length === 0) return <p className="wj-future-empty">{futureTab === 'offered' ? 'No future offers available right now.' : 'No future bookings available right now.'}</p>;
                    let lastDate = '';
                    return shownBookings.map(job => {
                      const pickupZone = findZone(job.pickupLat, job.pickupLng);
                      const dropoffZone = findZone(job.dropoffLat, job.dropoffLng);
                      const runningMiles = myLocation ? distanceMiles(myLocation.lat, myLocation.lng, job.pickupLat, job.pickupLng) : null;
                      const fareMiles = distanceMiles(job.pickupLat, job.pickupLng, job.dropoffLat, job.dropoffLng);
                      const date = new Date(job.pickupTime);
                      const accepted = job.driverId === driverId;
                      const dispatched = accepted && job.status !== 'SCHEDULED';
                      const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
                      const showDate = dateLabel !== lastDate;
                      lastDate = dateLabel;
                      return <div key={job.jobId}>{showDate && <div className="wj-future-date">{dateLabel}</div>}<article className="wj-future-card">
                        <div className={`wj-future-status ${accepted ? 'accepted' : ''}`}>{accepted ? (dispatched ? 'Assigned to you' : 'Accepted — awaiting dispatch') : 'Future offer'}</div>
                        <div className="wj-future-time"><span>{date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><div><strong>{job.dropoffAddress}</strong><small>from {job.pickupAddress}</small></div></div>
                        <div className="wj-future-details-grid">
                          <div><span>●</span><p>Running distance<strong>{runningMiles != null ? `${runningMiles.toFixed(1)} mi` : '—'}</strong><small>Distance from you to pickup</small></p></div>
                          <div><span>╱</span><p>Fare distance<strong>{fareMiles.toFixed(1)} mi</strong><small>Estimated journey distance</small></p></div>
                          <div><span>↑</span><p>Pickup zone<strong>{pickupZone ? getZoneName(pickupZone.properties.zoneId) : '—'}</strong><small>{job.pickupAddress}</small></p></div>
                          <div><span>↓</span><p>Destination zone<strong>{dropoffZone ? getZoneName(dropoffZone.properties.zoneId) : '—'}</strong><small>{job.dropoffAddress}</small></p></div>
                          <div><span>£</span><p>Maximum fare amount<strong>{formatCurrency(job.fare)}</strong><small>This is the most we can charge</small></p></div>
                        </div>
                        {accepted ? <div className="wj-future-accepted">{dispatched ? 'Assigned to you' : 'Accepted — awaiting dispatch'}</div> : <div className="wj-future-actions"><button onClick={() => acceptFutureBooking(job.jobId)} disabled={loading}>Accept offer</button><button onClick={() => setFutureBookings(current => current.filter(item => item.jobId !== job.jobId))} disabled={loading}>Pass</button></div>}
                      </article></div>;
                    });
                  })()}
                  <div className="wj-future-footer"><span>◉<b>Local drivers</b><small>Supporting local communities</small></span><span>£<b>Fair prices</b><small>Transparent fares, no hidden fees</small></span><span>▣<b>Future work</b><small>Plan ahead and keep moving forward</small></span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openPanel === 'menu' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setOpenPanel(null)}>
          <div style={{
            background: 'var(--surface)', border: '1.5px solid var(--border-strong)', borderBottom: 'none',
            borderRadius: '20px 20px 0 0', padding: '1.1rem'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
              <h2 className="wj-panel-title" style={{ margin: 0 }}>Menu</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setOpenPanel(null)}>Close</button>
            </div>
            <button className="btn btn-outline" style={{ marginBottom: '0.6rem' }} onClick={() => { setOpenPanel(null); recenterMap(); }}>Re-centre map</button>
            <button className="btn btn-danger" onClick={logout}>Log out</button>
          </div>
        </div>
      )}

      {selectedZoneId && zonePanelInfo && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, right: 12, zIndex: 1100,
          background: 'var(--surface)', border: '1.5px solid var(--border-strong)', borderRadius: 18, padding: '1.1rem',
          maxHeight: '60%', overflowY: 'auto'
        }}>
          <div className="wj-zone-header">
            <div>
              <h2 className="wj-zone-title">{zonePanelInfo.zoneName}</h2>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedZoneId(null)}>Close</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Queue ({zonePanelInfo.queue.length})</div>
            {zonePanelInfo.queue.length === 0 && <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem', margin: 0 }}>No drivers queued.</p>}
            {zonePanelInfo.queue.map((d, i) => (
              <div key={d.id} className={`wj-driver-row${d.id === driverId ? ' me' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="num">{i + 1}</span>
                  <span className="name">{d.id === driverId ? 'You' : String(d.id || '').replace(/^DRV-/, '')}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Open bids ({zonePanelInfo.bids.length})</div>
            {zonePanelInfo.bids.length === 0 && <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem', margin: 0 }}>No open bids in this zone.</p>}
            {zonePanelInfo.bids.map(job => (
              <div key={job.jobId} className="card" style={{ padding: '0.7rem', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700 }}>{formatCurrency(job.fare)} · {job.vehicleType?.toUpperCase()}</div>
                <div style={{ color: 'var(--cream-dim)', fontSize: '0.8rem' }}>{job.pickupAddress} → {job.dropoffAddress}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Future bookings ({zonePanelInfo.futures.length})</div>
            {zonePanelInfo.futures.length === 0 && <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem', margin: 0 }}>No future bookings in this zone.</p>}
            {zonePanelInfo.futures.map(job => (
              <div key={job.jobId} className="card" style={{ padding: '0.7rem', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700 }}>{new Date(job.pickupTime).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>
                <div style={{ color: 'var(--cream-dim)', fontSize: '0.8rem' }}>{job.pickupAddress} → {job.dropoffAddress}</div>
                <div style={{ fontWeight: 800 }}>{formatCurrency(job.fare)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myLocation && (
        <button
          onClick={recenterMap}
          style={{
            position: 'absolute', bottom: 90, right: 14, zIndex: 1000,
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--surface)', color: 'var(--gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, margin: 0,
            border: `2px solid ${followMe ? 'var(--gold)' : 'var(--border-strong)'}`
          }}
          title="Re-centre on my location"
        >
          <NavIcon.locate width="20" height="20" />
        </button>
      )}
    </div>
  );
}

class DriverErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', color: '#ff9d9d', padding: '2rem', overflow: 'auto', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#f4bf1b' }}>Driver app error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{String(this.state.error && (this.state.error.message || this.state.error))}</pre>
          {this.state.info && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: '#f2ead9', marginTop: '1rem' }}>{this.state.info.componentStack}</pre>
          )}
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.6rem 1rem', background: '#f4bf1b', color: '#0a0a0a', border: 'none', borderRadius: 8, fontWeight: 700 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DriverPage() {
  return (
    <DriverErrorBoundary>
      <DriverPageContent />
    </DriverErrorBoundary>
  );
}
