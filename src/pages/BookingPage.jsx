import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { calculateFare, calculateAirportFare, getTimeOfDay } from '../lib/fare.js';
import { distanceMiles } from '../lib/geo.js';

const DEFAULT_CENTER = { lat: 53.393, lng: -3.019 };
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
const AIRPORTS = [
  { name: 'Liverpool John Lennon Airport (LPL)', lat: 53.3331, lng: -2.8496 },
  { name: 'Manchester Airport (MAN)', lat: 53.3537, lng: -2.2740 }
];

function formatCurrency(n) { return `£${Number(n).toFixed(2)}`; }
function PaymentForm({ fare, bookingFee, clientSecret, onConfirm, loading, error }) {
  const stripe = useStripe();
  const elements = useElements();
  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, background: '#111111', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600 }}>BOOKING FEE</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatCurrency(bookingFee)}</div>
        </div>
        <div style={{ flex: 1, background: '#111111', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600 }}>FULL FARE</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatCurrency(fare)}</div>
        </div>
      </div>
      {clientSecret ? (
        <div style={{ border: '1.5px solid #f6edd3', padding: '0.75rem', borderRadius: 12, marginBottom: '1rem', background: '#111111' }}>
          <CardElement options={{ style: { base: { fontSize: '16px', color: '#f6edd3', '::placeholder': { color: '#9ca3af' } } } }} />
        </div>
      ) : (
        <p style={{ color: '#c6b88f', fontSize: '0.9rem', marginBottom: '1rem' }}>Card payments are not configured. Tap confirm to place the booking.</p>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <button onClick={() => onConfirm(stripe, elements)} disabled={loading || (clientSecret && (!stripe || !elements))} style={{ width: '100%' }}>
        {loading ? 'Processing…' : (clientSecret ? 'Pay booking fee & confirm' : 'Confirm booking')}
      </button>
    </>
  );
}

function formatPhone(tel) {
  const cleaned = String(tel || '').replace(/\s/g, '');
  return cleaned.startsWith('0') ? `+44${cleaned.slice(1)}` : cleaned;
}

async function nominatimSearch(query, center) {
  if (!query || query.length < 2) return [];
  const bbox = center ? `${center.lat - 0.5},${center.lng - 0.5},${center.lat + 0.5},${center.lng + 0.5}` : '';
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=gb&limit=8&viewbox=${bbox}&bounded=0&accept-language=en`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return data.map(r => ({
      id: `osm-${r.osm_id || r.place_id}`,
      source: 'nominatim',
      main: r.name || r.display_name.split(',')[0],
      secondary: r.display_name,
      address: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon)
    }));
  } catch {
    return [];
  }
}

async function nominatimReverse(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Reverse geocode failed');
    const data = await res.json();
    return data.display_name || 'Selected location';
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

async function osrmRoute(lat1, lng1, lat2, lng2) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Route failed');
    const data = await res.json();
    if (!data.routes?.[0]) throw new Error('No route');
    const r = data.routes[0];
    const miles = Number((r.distance / 1609.344).toFixed(2));
    const min = Math.round(r.duration / 60);
    const durationText = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
    return { miles, durationSec: r.duration, durationText, trafficText: 'Roads clear', trafficStatus: 'green' };
  } catch {
    const straight = distanceMiles(lat1, lng1, lat2, lng2);
    return { miles: straight, durationSec: 0, durationText: '', trafficText: 'Route unavailable', trafficStatus: 'amber' };
  }
}

function addMinutes(date, minutes) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

function toIsoLocal(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function BookingPage() {
  const [screen, setScreen] = useState('home');
  const [isFuture, setIsFuture] = useState(false);

  const [pickup, setPickup] = useState({ address: '', lat: null, lng: null });
  const [dropoff, setDropoff] = useState({ address: '', lat: null, lng: null });
  const [route, setRoute] = useState({ miles: 0, durationSec: 0, durationText: '', trafficText: '', trafficStatus: 'green' });
  const [routeLoading, setRouteLoading] = useState(false);

  const [vehicleType, setVehicleType] = useState('car');
  const [passengers, setPassengers] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupTime, setPickupTime] = useState(toIsoLocal(addMinutes(new Date(), 30)));

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [predictionsFor, setPredictionsFor] = useState('dropoff');
  const [fetchingPredictions, setFetchingPredictions] = useState(false);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState('outbound');

  const [isAirport, setIsAirport] = useState(false);
  const [airportTripType, setAirportTripType] = useState('single');
  const [airportDirection, setAirportDirection] = useState('to');
  const [selectedAirport, setSelectedAirport] = useState(AIRPORTS[0]);
  const [otherLocation, setOtherLocation] = useState({ address: '', lat: null, lng: null });
  const [returnTime, setReturnTime] = useState(toIsoLocal(addMinutes(new Date(), 60)));
  const [returnTrip, setReturnTrip] = useState(null);
  const [returnResult, setReturnResult] = useState(null);

  const predictionDebounceRef = useRef(null);

  const oneWayCarFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'car' }) || calculateFare({ miles: route.miles, vehicleType: 'car', timeOfDay: getTimeOfDay(new Date()) })) || 0;
  const oneWayMpvFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'mpv' }) || calculateFare({ miles: route.miles, vehicleType: 'mpv', timeOfDay: getTimeOfDay(new Date()) })) || 0;
  const tripCount = isAirport && airportTripType === 'return' ? 2 : 1;
  const carFare = oneWayCarFare * tripCount;
  const mpvFare = oneWayMpvFare * tripCount;

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPickupFromLatLng(pos.coords.latitude, pos.coords.longitude),
      () => { if (!pickup.lat) setPickupFromLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pickup.lat != null && dropoff.lat != null) {
      computeRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  function setPickupFromLatLng(lat, lng) {
    setPickup({ address: '', lat, lng });
    nominatimReverse(lat, lng).then(address => setPickup({ address, lat, lng }));
  }

  async function computeRoute() {
    setRouteLoading(true);
    const routeData = await osrmRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    setRoute(routeData);
    setRouteLoading(false);
  }

  async function fetchPredictions(input) {
    if (!input || input.length < 2) {
      setPredictions([]);
      return;
    }
    setFetchingPredictions(true);
    const center = pickup.lat != null ? { lat: pickup.lat, lng: pickup.lng } : DEFAULT_CENTER;
    const list = await nominatimSearch(input, center);
    setPredictions(list);
    setFetchingPredictions(false);
  }

  function onSearchChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(predictionDebounceRef.current);
    predictionDebounceRef.current = setTimeout(() => fetchPredictions(value), 250);
  }

  function selectPlace(pred) {
    applySelection(pred.address, pred.lat, pred.lng);
  }

  function applySelection(address, lat, lng) {
    if (predictionsFor === 'pickup') {
      setPickup({ address, lat, lng });
      setPredictionsFor('dropoff');
      setQuery('');
      setPredictions([]);
      setScreen('destination');
    } else {
      setDropoff({ address, lat, lng });
      setQuery('');
      setPredictions([]);
      setScreen('route');
    }
  }

  function startAsap() {
    setIsAirport(false);
    setIsFuture(false);
    setAirportTripType('single');
    setReturnTrip(null);
    setReturnResult(null);
    setPredictionsFor('dropoff');
    setScreen('destination');
  }

  function startFuture() {
    setIsAirport(false);
    setIsFuture(true);
    setAirportTripType('single');
    setReturnTrip(null);
    setReturnResult(null);
    setPickupTime(toIsoLocal(addMinutes(new Date(), 60)));
    setPredictionsFor('dropoff');
    setScreen('destination');
  }

  function startAirport() {
    setIsAirport(true);
    setIsFuture(false);
    setAirportTripType('single');
    setAirportDirection('to');
    setSelectedAirport(AIRPORTS[0]);
    setOtherLocation({ address: '', lat: null, lng: null });
    setReturnTime(toIsoLocal(addMinutes(new Date(), 60)));
    setReturnTrip(null);
    setReturnResult(null);
    setQuery('');
    setPredictions([]);
    setError('');
    setScreen('airport');
  }

  function selectAirportPlace(pred) {
    setOtherLocation({ address: pred.address, lat: pred.lat, lng: pred.lng });
    setQuery(pred.address);
    setPredictions([]);
  }

  function continueAirport() {
    if (!selectedAirport || !otherLocation.lat) {
      setError('Please select an airport and enter the other address.');
      return;
    }
    if (airportTripType === 'return' && !returnTime) {
      setError('Please choose a return date and time.');
      return;
    }
    setError('');
    const airport = { address: selectedAirport.name, lat: selectedAirport.lat, lng: selectedAirport.lng };
    if (airportDirection === 'to') {
      setPickup(otherLocation);
      setDropoff(airport);
    } else {
      setPickup(airport);
      setDropoff(otherLocation);
    }
    if (airportTripType === 'return') {
      setReturnTrip({ time: returnTime, airport, otherLocation, direction: airportDirection });
    } else {
      setReturnTrip(null);
    }
    setScreen('route');
  }

  async function submitBooking() {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Please enter your name and mobile number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const outbound = await api('booking', {
        pickupAddress: pickup.address,
        dropoffAddress: dropoff.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        miles: route.miles,
        vehicleType,
        timeOfDay: getTimeOfDay(new Date()),
        pickupTime: isFuture && pickupTime ? new Date(pickupTime).toISOString() : new Date().toISOString(),
        customerName: customerName.trim(),
        customerPhone: formatPhone(customerPhone)
      });
      if (outbound.error) throw new Error(outbound.error);
      setResult(outbound);
      setClientSecret(outbound.clientSecret || null);
      setPaymentTarget('outbound');
      setScreen('payment');
    } catch (err) {
      setError(err.message || 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function createReturnBooking() {
    if (!returnTrip) return;
    const returnDate = new Date(returnTrip.time);
    let returnPickup = { address: returnTrip.airport.address, lat: returnTrip.airport.lat, lng: returnTrip.airport.lng };
    let returnDropoff = { address: returnTrip.otherLocation.address, lat: returnTrip.otherLocation.lat, lng: returnTrip.otherLocation.lng };
    if (returnTrip.direction === 'from') {
      returnPickup = { address: returnTrip.otherLocation.address, lat: returnTrip.otherLocation.lat, lng: returnTrip.otherLocation.lng };
      returnDropoff = { address: returnTrip.airport.address, lat: returnTrip.airport.lat, lng: returnTrip.airport.lng };
    }
    const returnData = await api('booking', {
      pickupAddress: returnPickup.address,
      dropoffAddress: returnDropoff.address,
      pickupLat: returnPickup.lat,
      pickupLng: returnPickup.lng,
      dropoffLat: returnDropoff.lat,
      dropoffLng: returnDropoff.lng,
      miles: route.miles,
      vehicleType,
      timeOfDay: getTimeOfDay(returnDate),
      pickupTime: returnDate.toISOString(),
      customerName: customerName.trim(),
      customerPhone: formatPhone(customerPhone)
    });
    if (returnData.error) throw new Error(returnData.error);
    setReturnResult(returnData);
    setResult(returnData);
    setClientSecret(returnData.clientSecret || null);
    setPaymentTarget('return');
  }

  async function confirmPayment(stripe, elements) {
    if (!result) return;
    setError(''); setLoading(true);
    try {
      if (clientSecret && stripe && elements) {
        const card = elements.getElement(CardElement);
        if (!card) throw new Error('Card details not entered');
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
        if (confirmError) throw new Error(confirmError.message);
        if (paymentIntent.status !== 'succeeded') throw new Error(`Payment ${paymentIntent.status}`);
      }
      const confirm = await api('booking/confirm', { jobId: result.jobId });
      if (confirm.error) throw new Error(confirm.error);

      if (paymentTarget === 'outbound' && returnTrip) {
        await createReturnBooking();
        setLoading(false);
        return;
      }
      setScreen('success');
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function changePickup() {
    setPredictionsFor('pickup');
    setQuery(pickup.address);
    setPredictions([]);
    setScreen('pickup-search');
  }

  function backToDestination() {
    setPredictionsFor('dropoff');
    setQuery('');
    setPredictions([]);
    setScreen('destination');
  }

  function vehicleCard(type, label, capacity, fare) {
    const selected = vehicleType === type;
    return (
      <div key={type} onClick={() => setVehicleType(type)} style={{
        flex: 1, border: selected ? '2px solid #f4bf1a' : '1.5px solid #f6edd3', borderRadius: 14, padding: '1rem 0.75rem',
        cursor: 'pointer', background: selected ? '#141414' : '#111111', color: '#f6edd3', display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', transition: 'transform 0.1s, box-shadow 0.1s'
      }}>
        <svg width={44} height={44} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
          {type === 'mpv' ? (
            <><rect x="1" y="6" width="22" height="9" rx="2" fill="#f4bf1a" /><rect x="4" y="4" width="10" height="4" rx="1" fill="#f4bf1a" /><circle cx="6" cy="15" r="2" fill="#333" /><circle cx="18" cy="15" r="2" fill="#333" /></>
          ) : (
            <><rect x="2" y="8" width="20" height="7" rx="2" fill="#f4bf1a" /><rect x="5" y="5" width="8" height="4" rx="1" fill="#f4bf1a" /><circle cx="6" cy="16" r="2" fill="#333" /><circle cx="18" cy="16" r="2" fill="#333" /></>
          )}
        </svg>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{label}</h3>
        <p style={{ margin: '0 0 0.5rem', color: '#c6b88f', fontSize: '0.8rem' }}>{capacity}</p>
        <p style={{ margin: 'auto 0 0', fontSize: '1.2rem', fontWeight: 800 }}>{formatCurrency(fare)}</p>
        <p style={{ margin: '0.25rem 0 0', color: '#c6b88f', fontSize: '0.7rem' }}>max chargeable</p>
      </div>
    );
  }

  function panelTitle(title) {
    return <h2 style={{ margin: '0 0 0.9rem', fontSize: '1.15rem', fontWeight: 900, color: '#f6edd3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h2>;
  }

  function renderScreen() {
    switch (screen) {
      case 'home':
        return (
          <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <img
                src="/design-refs/logo.jpg"
                alt="The Wirral Jobe"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                style={{ maxWidth: 260, maxHeight: 180, margin: '0 auto 1rem', display: 'block' }}
              />
              <div style={{ display: 'none', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1rem', width: 260, minHeight: 140, background: '#facc15', color: '#000000', borderRadius: 16, padding: '1rem', fontWeight: 800, fontSize: '1.75rem', textAlign: 'center', boxSizing: 'border-box' }}>
                THE WIRRAL<br />JOBE
              </div>
              <p style={{ margin: '0.5rem 0 0', color: '#c6b88f', fontSize: '0.95rem' }}>Local knowledge. Always on call.</p>
            </div>
            <button onClick={startAsap} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: 'none', background: '#f4bf1a', color: '#000000',
              fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem', cursor: 'pointer'
            }}>
              <div>RIDE NOW</div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', opacity: 0.9 }}>from current location</div>
            </button>
            <button onClick={startFuture} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: '1.5px solid #f6edd3', background: '#111111', color: '#f6edd3',
              fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.75rem', cursor: 'pointer'
            }}>
              <div>Book for later</div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', color: '#c6b88f' }}>or from a different pickup point</div>
            </button>
            <button onClick={startAirport} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: '1.5px solid #f6edd3', background: '#111111', color: '#f6edd3',
              fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
                Airport transfers
              </div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', color: '#c6b88f' }}>single or two-way booking</div>
            </button>
          </div>
        );

      case 'pickup-search':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button onClick={backToDestination} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            {panelTitle('Change pickup location')}
            <input
              type="text"
              value={query}
              onChange={onSearchChange}
              placeholder="Search for a pickup address"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                outline: 'none', marginBottom: '0.5rem'
              }}
              autoFocus
            />
            {fetchingPredictions && <p style={{ color: '#c6b88f', fontSize: '0.85rem' }}>Searching…</p>}
            <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: '0.5rem' }}>
              {predictions.map(p => (
                <div key={p.id} onClick={() => selectPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid rgba(246,237,211,0.18)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                  <div style={{ fontSize: '0.8rem', color: '#c6b88f' }}>{p.secondary}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'destination':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('home')} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
              {isFuture && <span style={{ fontSize: '0.8rem', color: '#f4bf1a', fontWeight: 600, background: '#141414', padding: '0.25rem 0.5rem', borderRadius: 8 }}>Future booking</span>}
            </div>
            {panelTitle('Where are you going?')}
            <div style={{ background: '#111111', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pickup</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f6edd3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup.address || 'Current location'}</div>
                <button onClick={changePickup} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>Change</button>
              </div>
            </div>
            <input
              type="text"
              value={query}
              onChange={onSearchChange}
              placeholder="Enter destination"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                outline: 'none', marginBottom: '0.5rem'
              }}
              autoFocus
            />
            {fetchingPredictions && <p style={{ color: '#c6b88f', fontSize: '0.85rem' }}>Searching…</p>}
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: '0.5rem' }}>
              {predictions.map(p => (
                <div key={p.id} onClick={() => selectPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid rgba(246,237,211,0.18)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                  <div style={{ fontSize: '0.8rem', color: '#c6b88f' }}>{p.secondary}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'airport':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('home')} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            {panelTitle('Airport transfer')}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', background: '#111111', borderRadius: 12, padding: '0.35rem' }}>
              <button onClick={() => setAirportDirection('to')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportDirection === 'to' ? '#f4bf1a' : 'transparent', color: airportDirection === 'to' ? '#000000' : '#f6edd3', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>To airport</button>
              <button onClick={() => setAirportDirection('from')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportDirection === 'from' ? '#f4bf1a' : 'transparent', color: airportDirection === 'from' ? '#000000' : '#f6edd3', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>From airport</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>Airport</label>
              <select value={selectedAirport?.name} onChange={e => setSelectedAirport(AIRPORTS.find(a => a.name === e.target.value))} style={{ width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3', outline: 'none', background: '#111111' }}>
                {AIRPORTS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', background: '#111111', borderRadius: 12, padding: '0.35rem' }}>
              <button onClick={() => setAirportTripType('single')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportTripType === 'single' ? '#f4bf1a' : 'transparent', color: airportTripType === 'single' ? '#000000' : '#f6edd3', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Single</button>
              <button onClick={() => setAirportTripType('return')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportTripType === 'return' ? '#f4bf1a' : 'transparent', color: airportTripType === 'return' ? '#000000' : '#f6edd3', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Return</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>
                {airportDirection === 'to' ? 'Pickup address' : 'Drop-off address'}
              </label>
              <input
                type="text"
                value={query}
                onChange={onSearchChange}
                placeholder={`Search ${airportDirection === 'to' ? 'pickup' : 'drop-off'} address`}
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                  outline: 'none', marginBottom: '0.5rem'
                }}
                autoFocus
              />
              {fetchingPredictions && <p style={{ color: '#c6b88f', fontSize: '0.85rem' }}>Searching…</p>}
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: '0.5rem' }}>
                {predictions.map(p => (
                  <div key={p.id} onClick={() => selectAirportPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid rgba(246,237,211,0.18)', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                    <div style={{ fontSize: '0.8rem', color: '#c6b88f' }}>{p.secondary}</div>
                  </div>
                ))}
              </div>
            </div>
            {airportTripType === 'return' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>Return date & time</label>
                <input
                  type="datetime-local"
                  value={returnTime}
                  min={toIsoLocal(new Date())}
                  onChange={e => setReturnTime(e.target.value)}
                  style={{
                    width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                    outline: 'none'
                  }}
                />
              </div>
            )}
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
            <button onClick={continueAirport} disabled={routeLoading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#f4bf1a', color: '#000000',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: routeLoading ? 0.6 : 1
            }}>Continue</button>
          </div>
        );

      case 'route':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => { isAirport ? setScreen('airport') : setScreen('destination'); }} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1, background: '#111111', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600 }}>DISTANCE</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{route.miles.toFixed(2)} mi</div>
              </div>
              <div style={{ flex: 1, background: '#111111', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600 }}>TIME</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{route.durationText}</div>
              </div>
              <div style={{ flex: 1, borderRadius: 12, padding: '0.75rem', textAlign: 'center', background: route.trafficStatus === 'green' ? '#dcfce7' : route.trafficStatus === 'amber' ? '#fef9c3' : '#fee2e2' }}>
                <div style={{ fontSize: '0.75rem', color: '#c6b88f', fontWeight: 600 }}>TRAFFIC</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: route.trafficStatus === 'green' ? '#166534' : route.trafficStatus === 'amber' ? '#854d0e' : '#991b1b' }}>{route.trafficText}</div>
              </div>
            </div>
            <p style={{ margin: '0 0 0.75rem', color: '#c6b88f', fontSize: '0.9rem' }}>Pick your vehicle:</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              {vehicleCard('car', 'Black estate car', 'Up to 4 passengers', carFare)}
              {vehicleCard('mpv', 'Black MPV', 'Up to 8 passengers', mpvFare)}
            </div>
            <button onClick={() => setScreen('details')} disabled={!vehicleType || routeLoading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#f4bf1a', color: '#000000',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: routeLoading ? 0.6 : 1
            }}>{routeLoading ? 'Calculating route…' : 'Continue'}</button>
          </div>
        );

      case 'details':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('route')} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
              {isFuture && <span style={{ fontSize: '0.8rem', color: '#f4bf1a', fontWeight: 600, background: '#141414', padding: '0.25rem 0.5rem', borderRadius: 8 }}>Future booking</span>}
            </div>
            {panelTitle('Your details')}
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Your name"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                outline: 'none', marginBottom: '0.75rem'
              }}
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Mobile number"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                outline: 'none', marginBottom: '0.75rem'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111111', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Passengers</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => setPassengers(Math.max(1, passengers - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #f6edd3', background: '#111111', cursor: 'pointer' }}>-</button>
                <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{passengers}</span>
                <button onClick={() => setPassengers(Math.min(vehicleType === 'mpv' ? 8 : 4, passengers + 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #f6edd3', background: '#111111', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            {isFuture && (
              <input
                type="datetime-local"
                value={pickupTime}
                min={toIsoLocal(new Date())}
                onChange={e => setPickupTime(e.target.value)}
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #f6edd3',
                  outline: 'none', marginBottom: '0.75rem'
                }}
              />
            )}
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
            <button onClick={submitBooking} disabled={loading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#f4bf1a', color: '#000000',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: loading ? 0.6 : 1
            }}>{loading ? 'Booking…' : 'Book now'}</button>
          </div>
        );

      case 'payment':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('details')} style={{ border: 'none', background: 'none', color: '#f4bf1a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
              {isFuture && <span style={{ fontSize: '0.8rem', color: '#f4bf1a', fontWeight: 600, background: '#141414', padding: '0.25rem 0.5rem', borderRadius: 8 }}>Future booking</span>}
            </div>
            {panelTitle('Payment')}
            {result && (
              stripePromise && clientSecret ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PaymentForm
                    fare={result.fare}
                    bookingFee={result.bookingFee}
                    clientSecret={clientSecret}
                    onConfirm={confirmPayment}
                    loading={loading}
                    error={error}
                  />
                </Elements>
              ) : (
                <PaymentForm
                  fare={result.fare}
                  bookingFee={result.bookingFee}
                  clientSecret={null}
                  onConfirm={confirmPayment}
                  loading={loading}
                  error={error}
                />
              )
            )}
          </div>
        );

      case 'success':
        return (
          <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.75rem' }}>✓</div>
            {panelTitle('Booking confirmed')}
            <p style={{ color: '#c6b88f', fontSize: '0.9rem', margin: '0 0 1rem' }}>
              {isAirport && airportTripType === 'return' ? 'Both legs of your airport transfer are booked.' : (isFuture ? `Your ${vehicleType === 'mpv' ? 'MPV' : 'estate car'} is booked for ${new Date(pickupTime).toLocaleString()}.` : 'We are allocating a driver now.')}
            </p>
            {result && (
              <div style={{ background: '#111111', borderRadius: 12, padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#c6b88f' }}>{returnResult ? 'Outbound job ID' : 'Job ID'}</span>
                  <span style={{ fontWeight: 700 }}>{result.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#c6b88f' }}>{returnResult ? 'Outbound fare' : 'Fare estimate'}</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(result.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#c6b88f' }}>{returnResult ? 'Outbound booking fee' : 'Booking fee'}</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(result.bookingFee)}</span>
                </div>
              </div>
            )}
            {returnResult && (
              <div style={{ background: '#111111', borderRadius: 12, padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#c6b88f' }}>Return job ID</span>
                  <span style={{ fontWeight: 700 }}>{returnResult.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#c6b88f' }}>Return fare</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(returnResult.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#c6b88f' }}>Return booking fee</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(returnResult.bookingFee)}</span>
                </div>
              </div>
            )}
            <button onClick={() => window.location.reload()} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#f4bf1a', color: '#000000',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
            }}>Book another ride</button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#ffffff', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{
        width: '100%', maxWidth: 540, background: '#0b0b0b', color: '#f6edd3', borderRadius: 10, border: '2px solid #f6edd3', boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        padding: '1.15rem', maxHeight: '90vh', overflowY: 'auto', transition: 'transform 0.3s ease, opacity 0.3s ease'
      }}>
        {renderScreen()}
      </div>
    </div>
  );
}
