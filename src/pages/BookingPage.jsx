import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { calculateFare, calculateAirportFare, getTimeOfDay } from '../lib/fare.js';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import PaymentForm from '../components/PaymentForm.jsx';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
const BOOKING_FEE = 1.00;

const STEPS = [
  { key: 'pickup', label: 'Pickup' },
  { key: 'dropoff', label: 'Drop-off' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'time', label: 'Time' },
  { key: 'confirm', label: 'Confirm' }
];

function formatDateTimeLocal(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) return resolve();
    const existing = document.querySelector('script[data-google-maps]');
    const onLoad = () => {
      if (window.google?.maps?.places) return resolve();
      reject(new Error('Google Maps Places library failed to load.'));
    };
    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.onload = onLoad;
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
}

function carIconSvg(color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="7" rx="2" fill="${color}"/><rect x="5" y="5" width="8" height="4" rx="1" fill="${color}"/><circle cx="6" cy="16" r="2" fill="#333"/><circle cx="18" cy="16" r="2" fill="#333"/></svg>`)}`;
}

function mpvIconSvg(color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><rect x="1" y="6" width="22" height="9" rx="2" fill="${color}"/><rect x="4" y="4" width="10" height="4" rx="1" fill="${color}"/><circle cx="6" cy="15" r="2" fill="#333"/><circle cx="18" cy="15" r="2" fill="#333"/></svg>`)}`;
}

function VehicleIcon({ type, size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
      {type === 'mpv' ? (
        <>
          <rect x="1" y="6" width="22" height="9" rx="2" fill="#005eb8" />
          <rect x="4" y="4" width="10" height="4" rx="1" fill="#005eb8" />
          <circle cx="6" cy="15" r="2" fill="#333" />
          <circle cx="18" cy="15" r="2" fill="#333" />
        </>
      ) : (
        <>
          <rect x="2" y="8" width="20" height="7" rx="2" fill="#005eb8" />
          <rect x="5" y="5" width="8" height="4" rx="1" fill="#005eb8" />
          <circle cx="6" cy="16" r="2" fill="#333" />
          <circle cx="18" cy="16" r="2" fill="#333" />
        </>
      )}
    </svg>
  );
}

function milesText(m) { return (m / 1609.344).toFixed(2); }
function durationText(s) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}
function formatCurrency(n) { return `£${n.toFixed(2)}`; }

function StepBar({ step }) {
  const activeIndex = STEPS.findIndex(s => s.key === step);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i < STEPS.length - 1 && (
              <div style={{ position: 'absolute', top: 14, left: '50%', width: '100%', height: 3, background: done ? '#005eb8' : '#e5e7eb', zIndex: 0 }} />
            )}
            <div style={{
              width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? '#005eb8' : done ? '#005eb8' : '#fff',
              color: active || done ? '#fff' : '#9ca3af',
              border: `2px solid ${active || done ? '#005eb8' : '#e5e7eb'}`,
              fontWeight: 700, fontSize: '0.8rem', zIndex: 1
            }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, marginTop: 6, color: active ? '#005eb8' : done ? '#111827' : '#9ca3af' }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BookingPage() {
  const now = formatDateTimeLocal(new Date());

  const [step, setStep] = useState('pickup');
  const [pickup, setPickup] = useState({ address: '', lat: null, lng: null });
  const [dropoff, setDropoff] = useState({ address: '', lat: null, lng: null });
  const [route, setRoute] = useState({ miles: '', duration: '' });
  const [pickupTime, setPickupTime] = useState(now);
  const [vehicleType, setVehicleType] = useState('car');
  const [customer, setCustomer] = useState({ name: '', phone: '' });

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [bookingDraft, setBookingDraft] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);

  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 53.393, lng: -3.019 });
  const [centerAddress, setCenterAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [servicesReady, setServicesReady] = useState(false);

  const mapContainerRef = useRef(null);
  const driverMarkersRef = useRef([]);
  const routeMarkersRef = useRef([]);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setSearchText('');
    setPredictions([]);
    setSearchMode(false);
  }, [step]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapsError('Google Maps API key is missing. Map and address lookup are unavailable.');
      return;
    }
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => setMapsReady(true))
      .catch(err => setMapsError(err.message || 'Failed to load Google Maps.'));
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapContainerRef.current) return;
    let mounted = true;
    const mapInstance = new window.google.maps.Map(mapContainerRef.current, {
      center: mapCenter,
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true
    });
    mapInstance.addListener('idle', () => {
      const c = mapInstance.getCenter();
      setMapCenter({ lat: c.lat(), lng: c.lng() });
    });
    if (mounted) setMap(mapInstance);
    return () => {
      mounted = false;
      mapInstance && window.google.maps.event.clearInstanceListeners(mapInstance);
      if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';
    };
  }, [mapsReady]);

  useEffect(() => {
    if (!map) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = new window.google.maps.places.PlacesService(map);
    geocoderRef.current = new window.google.maps.Geocoder();
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    setServicesReady(true);
  }, [map]);

  useEffect(() => {
    if (!servicesReady || !map || !navigator.geolocation || pickup.lat != null) return;
    let cancelled = false;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (cancelled) return;
      const { latitude, longitude } = position.coords;
      const center = { lat: latitude, lng: longitude };
      setMapCenter(center);
      map.panTo(center);
      geocode(center, (address) => {
        setPickup({ address, lat: latitude, lng: longitude });
        setCenterAddress(address);
      });
      setLocating(false);
    }, () => {
      if (cancelled) return;
      setLocating(false);
      setError('Could not detect your location. Move the pin or search below.');
    }, { enableHighAccuracy: true });
    return () => { cancelled = true; };
  }, [servicesReady, map, pickup.lat]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    async function loadDrivers() {
      try {
        const res = await fetch('/api/drivers');
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setNearbyDrivers(data.drivers || []);
      } catch {}
    }
    loadDrivers();
    const id = setInterval(loadDrivers, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    driverMarkersRef.current.forEach(m => m.setMap(null));
    driverMarkersRef.current = [];
    nearbyDrivers.forEach(d => {
      if (d.last_lat == null || d.last_lng == null) return;
      const color = '#005eb8';
      const marker = new window.google.maps.Marker({
        position: { lat: d.last_lat, lng: d.last_lng },
        map,
        icon: {
          url: d.vehicle_type === 'mpv' ? mpvIconSvg(color) : carIconSvg(color),
          scaledSize: new window.google.maps.Size(32, 32),
          anchor: new window.google.maps.Point(16, 16)
        },
        title: `${d.id} · ${d.vehicle_type || 'car'}`
      });
      driverMarkersRef.current.push(marker);
    });
  }, [map, nearbyDrivers]);

  useEffect(() => {
    if (!map) return;
    routeMarkersRef.current.forEach(m => m.setMap(null));
    routeMarkersRef.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    if (pickup.lat != null) {
      const m = new window.google.maps.Marker({
        position: { lat: pickup.lat, lng: pickup.lng },
        map,
        label: { text: 'P', color: 'white' },
        title: 'Pickup'
      });
      routeMarkersRef.current.push(m);
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
    }
    if (dropoff.lat != null) {
      const m = new window.google.maps.Marker({
        position: { lat: dropoff.lat, lng: dropoff.lng },
        map,
        label: { text: 'D', color: 'white' },
        title: 'Drop-off'
      });
      routeMarkersRef.current.push(m);
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
    }
    if (pickup.lat != null && dropoff.lat != null) {
      map.fitBounds(bounds, 40);
    }
  }, [map, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  useEffect(() => {
    if (!pickup.lat || !dropoff.lat || !directionsServiceRef.current) {
      setRoute({ miles: '', duration: '' });
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    directionsServiceRef.current.route(
      { origin: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: dropoff.lat, lng: dropoff.lng }, travelMode: window.google.maps.TravelMode.DRIVING },
      (res, status) => {
        if (cancelled) return;
        setRouteLoading(false);
        if (status === 'OK' && res.routes?.[0]?.legs?.[0]) {
          const leg = res.routes[0].legs[0];
          setRoute({ miles: milesText(leg.distance.value), duration: durationText(leg.duration.value) });
        } else {
          setRoute({ miles: '', duration: '' });
          setError('Could not calculate route.');
        }
      }
    );
    return () => { cancelled = true; };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  useEffect(() => {
    if (!map || !geocoderRef.current) return;
    const t = setTimeout(() => geocode(mapCenter, (address) => setCenterAddress(address)), 300);
    return () => clearTimeout(t);
  }, [map, mapCenter.lat, mapCenter.lng]);

  function geocode({ lat, lng }, callback) {
    if (!geocoderRef.current) return callback('');
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.[0]?.formatted_address) return callback(results[0].formatted_address);
      callback('Current location');
    });
  }

  function fetchPredictions(input, anchor) {
    if (!autocompleteServiceRef.current || input.length < 2) {
      setPredictions([]);
      return;
    }
    const req = { input, componentRestrictions: { country: 'uk' } };
    if (anchor && anchor.lat != null) {
      req.location = { lat: anchor.lat, lng: anchor.lng };
      req.radius = 50000;
      req.origin = { lat: anchor.lat, lng: anchor.lng };
    }
    autocompleteServiceRef.current.getPlacePredictions(req, (predictions, status) => {
      if (status !== 'OK' || !predictions) return setPredictions([]);
      const sorted = predictions.slice().sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));
      setPredictions(sorted);
    });
  }

  function selectPrediction(prediction, setter) {
    if (!placesServiceRef.current) return;
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['formatted_address', 'geometry'] },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) return;
        const loc = place.geometry.location;
        const point = { address: place.formatted_address, lat: loc.lat(), lng: loc.lng() };
        setter(point);
        setMapCenter({ lat: point.lat, lng: point.lng });
        map.panTo({ lat: point.lat, lng: point.lng });
        setSearchText(point.address);
        setPredictions([]);
      }
    );
  }

  function confirmPickupFromPin() {
    geocode(mapCenter, (address) => {
      setPickup({ address, lat: mapCenter.lat, lng: mapCenter.lng });
      setSearchMode(false);
      setStep('dropoff');
    });
  }

  function confirmDropoffFromPin() {
    geocode(mapCenter, (address) => {
      setDropoff({ address, lat: mapCenter.lat, lng: mapCenter.lng });
      setStep('vehicle');
    });
  }

  const miles = Number(route.miles) || 0;
  const timeOfDay = getTimeOfDay(new Date(pickupTime || Date.now()));
  const airportFare = calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType });
  const fare = airportFare != null ? airportFare : calculateFare({ miles, vehicleType, timeOfDay });
  const fareCar = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'car' }) || calculateFare({ miles, vehicleType: 'car', timeOfDay })) || 0;
  const fareMpv = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'mpv' }) || calculateFare({ miles, vehicleType: 'mpv', timeOfDay })) || 0;

  async function submitBooking() {
    setError('');
    setLoading(true);
    try {
      const data = await api('booking', {
        pickupAddress: pickup.address,
        dropoffAddress: dropoff.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        miles,
        vehicleType,
        timeOfDay,
        pickupTime: pickupTime ? new Date(pickupTime).toISOString() : new Date().toISOString(),
        customerName: customer.name,
        customerPhone: customer.phone
      });
      if (data.clientSecret) {
        setBookingDraft({ jobId: data.jobId, fare: data.fare, bookingFee: data.bookingFee, trackingToken: data.trackingToken });
        setClientSecret(data.clientSecret);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function vehicleCard(type, label, capacity, price) {
    const selected = vehicleType === type;
    return (
      <div
        key={type}
        onClick={() => setVehicleType(type)}
        style={{
          flex: 1,
          border: selected ? '2px solid #005eb8' : '1.5px solid #e5e7eb',
          borderRadius: 14,
          padding: '1.25rem 1rem',
          cursor: 'pointer',
          background: selected ? '#f0f7ff' : 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: 'transform 0.1s, box-shadow 0.1s'
        }}
      >
        <VehicleIcon type={type} />
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{label}</h3>
        <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.85rem' }}>{capacity}</p>
        <p style={{ margin: 'auto 0 0', fontSize: '1.35rem', fontWeight: 800 }}>{formatCurrency(price)}</p>
      </div>
    );
  }

  const predictionList = predictions.map(p => (
    <div
      key={p.place_id}
      onClick={() => {
        if (step === 'pickup') {
          selectPrediction(p, (point) => { setPickup(point); setStep('dropoff'); });
        } else {
          selectPrediction(p, (point) => { setDropoff(point); setStep('vehicle'); });
        }
      }}
      style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: 'white' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
      onMouseLeave={e => e.currentTarget.style.background = 'white'}
    >
      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.structured_formatting?.main_text || p.description}</div>
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.structured_formatting?.secondary_text || ''}</div>
    </div>
  ));

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #005eb8 100%)', color: 'white', padding: '1.75rem 1.5rem 1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Wirral Flightpath</h1>
        <p style={{ margin: '0.25rem 0 0', opacity: 0.9, fontSize: '0.95rem' }}>Your ride, ready when you are</p>
      </div>

      <div style={{ padding: '1.25rem 1.25rem 0.5rem' }}>
        {mapsError && <p className="error">{mapsError}</p>}
        {error && <p className="error">{error}</p>}
        <StepBar step={step} />
      </div>

      {mapsReady && !mapsError && (
        <div style={{ position: 'relative', height: 360, overflow: 'hidden' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 1 }}>
            <svg width="36" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ff6b35" />
              <circle cx="12" cy="9" r="2.5" fill="white" />
            </svg>
          </div>
          {nearbyDrivers.length > 0 && (
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.95)', padding: '0.45rem 0.75rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {nearbyDrivers.length} nearby {nearbyDrivers.length === 1 ? 'driver' : 'drivers'}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '1.25rem 1.5rem 1.75rem' }}>
        {step === 'pickup' && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>Where should we pick you up?</h2>
            {locating && <p style={{ color: '#6b7280' }}>Detecting your location…</p>}

            {!searchMode ? (
              <>
                <div style={{ background: '#f0f7ff', border: '1.5px solid #dbeafe', borderRadius: 14, padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                    <p style={{ margin: 0, fontWeight: 700, color: '#111827' }}>
                      {pickup.address || centerAddress || 'Finding your location…'}
                    </p>
                  </div>
                  <button style={{ marginTop: 0 }} onClick={() => {
                    if (pickup.address && pickup.lat && pickup.lng) {
                      setStep('dropoff');
                    } else if (centerAddress) {
                      setPickup({ address: centerAddress, lat: mapCenter.lat, lng: mapCenter.lng });
                      setStep('dropoff');
                    }
                  }}>
                    Pick up from here
                  </button>
                  <button className="secondary" onClick={() => setSearchMode(true)}>
                    Search for a different pickup
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Drag the map so the pin points to your pickup spot, then tap “Pick up from here”.
                </p>
              </>
            ) : (
              <>
                <div className="form-group">
                  <input
                    ref={searchRef}
                    value={searchText}
                    onChange={e => { setSearchText(e.target.value); fetchPredictions(e.target.value, mapCenter); }}
                    placeholder="Search for a pickup address"
                    autoFocus
                  />
                </div>
                {predictions.length > 0 && (
                  <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    {predictionList}
                  </div>
                )}
                <button onClick={confirmPickupFromPin}>Use pin location</button>
                <button className="secondary" onClick={() => { setSearchMode(false); setPredictions([]); }}>Back</button>
              </>
            )}
          </div>
        )}

        {step === 'dropoff' && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>Where do you want to go?</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', fontSize: '0.9rem', color: '#374151' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
              <span>From: <strong>{pickup.address}</strong></span>
            </div>
            <div className="form-group">
              <input
                ref={searchRef}
                value={searchText}
                onChange={e => { setSearchText(e.target.value); fetchPredictions(e.target.value, pickup); }}
                placeholder="Search for drop-off address"
                autoFocus
              />
            </div>
            {predictions.length > 0 && (
              <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                {predictionList}
              </div>
            )}
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
              Drag the map to position the pin, then tap “Use pin location”.
            </div>
            <button onClick={confirmDropoffFromPin}>Use pin location</button>
            <button className="secondary" onClick={() => setStep('pickup')}>Back</button>
            {routeLoading && <p style={{ color: '#6b7280' }}>Calculating route…</p>}
            {route.miles && (
              <div style={{ background: '#f0f7ff', borderRadius: 12, padding: '0.9rem 1rem', marginTop: '1rem', fontWeight: 700 }}>
                {route.miles} miles · {route.duration}
              </div>
            )}
          </div>
        )}

        {step === 'vehicle' && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>Choose your ride</h2>
            <div className="row" style={{ gap: '1rem', marginBottom: '1.25rem' }}>
              {vehicleCard('car', 'Car', 'Up to 4 passengers', fareCar)}
              {vehicleCard('mpv', 'MPV', 'Up to 6 passengers', fareMpv)}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="secondary" onClick={() => setStep('dropoff')}>Back</button>
              <button onClick={() => setStep('time')}>Next: Pickup time</button>
            </div>
          </div>
        )}

        {step === 'time' && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>When do you need it?</h2>
            <div className="row" style={{ gap: '1rem', marginBottom: '1.25rem' }}>
              <div onClick={() => setPickupTime(formatDateTimeLocal(new Date()))} style={{ flex: 1, textAlign: 'center', padding: '1rem', borderRadius: 12, border: pickupTime === now ? '2px solid #005eb8' : '1.5px solid #e5e7eb', cursor: 'pointer', background: pickupTime === now ? '#f0f7ff' : 'white' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Now</h3>
              </div>
              <div style={{ flex: 2 }}>
                <label>Schedule</label>
                <input type="datetime-local" min={now} value={pickupTime} onChange={e => setPickupTime(e.target.value)} />
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="secondary" onClick={() => setStep('vehicle')}>Back</button>
              <button onClick={() => setStep('confirm')}>Next: Confirm</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>Confirm your ride</h2>
            <div style={{ background: '#f9fafb', borderRadius: 14, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '0.5rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Pickup</div>
                  <div style={{ fontWeight: 600 }}>{pickup.address}</div>
                </div>
              </div>
              <div style={{ width: 2, height: 20, background: '#e5e7eb', marginLeft: 4, marginBottom: 4 }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Drop-off</div>
                  <div style={{ fontWeight: 600 }}>{dropoff.address}</div>
                </div>
              </div>
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
                {vehicleType === 'mpv' ? 'MPV' : 'Car'} · {route.miles} miles · {route.duration}
              </p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
                Pickup: {new Date(pickupTime).toLocaleString()}
              </p>
            </div>

            <div style={{ background: '#f0f7ff', borderRadius: 14, padding: '1rem', marginBottom: '1rem' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#374151' }}>Estimated fare</span>
                <strong>{formatCurrency(fare)}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4, fontSize: '0.9rem', color: '#6b7280' }}>
                <span>Booking fee (pay now)</span>
                <span>{formatCurrency(BOOKING_FEE)}</span>
              </div>
              <div style={{ height: 1, background: '#dbeafe', margin: '0.75rem 0' }} />
              <div className="row" style={{ justifyContent: 'space-between', fontSize: '1.1rem' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <strong>{formatCurrency(fare + BOOKING_FEE)}</strong>
              </div>
            </div>

            <div className="row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Full name</label>
                <input required value={customer.name} onChange={e => setCustomer(prev => ({ ...prev, name: e.target.value }))} placeholder="John Smith" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input required type="tel" value={customer.phone} onChange={e => setCustomer(prev => ({ ...prev, phone: e.target.value }))} placeholder="07700111222" />
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="secondary" onClick={() => setStep('time')}>Back</button>
              <button onClick={submitBooking} disabled={!customer.name.trim() || !customer.phone.trim() || loading}>{loading ? 'Booking…' : 'Book now'}</button>
            </div>
          </div>
        )}

        {clientSecret && bookingDraft && stripePromise && (
          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Pay booking fee</h2>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm clientSecret={clientSecret} jobId={bookingDraft.jobId} fare={bookingDraft.fare} bookingFee={bookingDraft.bookingFee} onSuccess={setResult} onError={setError} />
            </Elements>
          </div>
        )}
        {clientSecret && !stripePromise && (
          <p className="error">Stripe publishable key is missing. Payment cannot be collected.</p>
        )}

        {result && (
          <div className="success" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: 12 }}>
            <p style={{ margin: '0 0 0.25rem' }}>Booked! Reference: <strong>{result.jobId}</strong></p>
            <p style={{ margin: '0 0 0.25rem' }}>Fare: {formatCurrency(result.fare)}</p>
            <p style={{ margin: 0 }}>Track: <a href={`/track/${result.trackingToken}`}>/track/{result.trackingToken}</a></p>
          </div>
        )}
      </div>
    </div>
  );
}
