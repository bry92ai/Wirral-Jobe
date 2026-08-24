import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiGet } from '../lib/api.js';
import { calculateFare, calculateAirportFare, getTimeOfDay } from '../lib/fare.js';
import { distanceMiles } from '../lib/geo.js';
import { loadGoogleMapsScript } from '../lib/maps.js';
import { loadSquarePayments } from '../lib/squarePayments.js';
import { Geolocation } from '@capacitor/geolocation';
import logo from '../assets/logo.jpg';

const Icon = {
  home: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>),
  briefcase: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>),
  plane: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></svg>),
  pin: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s7-7.75 7-13a7 7 0 1 0-14 0c0 5.25 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>),
  chev: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>),
  search: () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>),
  shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3z" /><path d="M9 12l2 2 4-4" /></svg>),
  check: () => (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>)
};

const DEFAULT_CENTER = { lat: 53.393, lng: -3.019 };
const CH49_CENTER = { lat: 53.385, lng: -3.093 };
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const SQUARE_APPLICATION_ID = import.meta.env.VITE_SQUARE_APPLICATION_ID;
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID;
const AIRPORTS = [
  { name: 'Liverpool John Lennon Airport (LPL)', lat: 53.3331, lng: -2.8496 },
  { name: 'Manchester Airport (MAN)', lat: 53.3537, lng: -2.2740 }
];

function formatCurrency(n) { return `£${Number(n).toFixed(2)}`; }
function PaymentForm({ fare, bookingFee, clientSecret, onConfirm, loading, error }) {
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const [ready, setReady] = useState(!clientSecret);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    if (!clientSecret) return;
    if (!SQUARE_APPLICATION_ID || !SQUARE_LOCATION_ID) {
      setPaymentError('Square payment settings are missing.');
      return;
    }
    let active = true;
    loadSquarePayments(SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID).then(async (payments) => {
      const card = await payments.card();
      await card.attach(containerRef.current);
      if (active) { cardRef.current = card; setReady(true); }
    }).catch(err => active && setPaymentError(err.message));
    return () => { active = false; };
  }, [clientSecret]);

  async function submitPayment() {
    setPaymentError('');
    try {
      let sourceId = null;
      if (clientSecret) {
        if (!cardRef.current) throw new Error('Square payment form is still loading.');
        const token = await cardRef.current.tokenize();
        if (token.status !== 'OK') throw new Error(token.errors?.[0]?.message || 'Card details could not be verified.');
        sourceId = token.token;
      }
      await onConfirm(sourceId);
    } catch (err) {
      setPaymentError(err.message || 'Payment failed.');
    }
  }

  const bookingFeeAmount = Number(bookingFee) || 0;
  const journeyFare = Number(fare) || 0;

  return <>
    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
      <div className="wj-info-tile"><div className="k">Pay today</div><div className="v">{formatCurrency(bookingFeeAmount)}</div><small>Booking fee</small></div>
      <div className="wj-info-tile"><div className="k">Pay your driver</div><div className="v">{formatCurrency(journeyFare)}</div><small>Journey fare</small></div>
    </div>
    <div style={{ border: '1.5px solid var(--gold)', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1rem', background: 'rgba(244, 191, 26, 0.1)' }}>
      <strong style={{ display: 'block', color: 'var(--gold)', marginBottom: '0.3rem' }}>You are paying {formatCurrency(bookingFeeAmount)} now</strong>
      <span style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', lineHeight: 1.45 }}>The journey fare of {formatCurrency(journeyFare)} is still payable directly to your driver at the end of the trip.</span>
    </div>
    {clientSecret ? <div ref={containerRef} style={{ border: '1.5px solid var(--border-strong)', padding: '0.85rem 1rem', borderRadius: 12, marginBottom: '1rem', background: 'var(--surface)' }} /> : <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>Card payments are not configured. Tap confirm to place the booking.</p>}
    {(error || paymentError) && <p className="error">{error || paymentError}</p>}
    <button onClick={submitPayment} disabled={loading || (clientSecret && !ready)} className="btn btn-primary">{loading ? 'Processing…' : (clientSecret ? `Pay ${formatCurrency(bookingFeeAmount)} booking fee & confirm` : 'Confirm booking')}</button>
  </>;
}

function formatPhone(tel) {
  const cleaned = String(tel || '').replace(/\s/g, '');
  return cleaned.startsWith('0') ? `+44${cleaned.slice(1)}` : cleaned;
}

async function googlePlaceSearch(query) {
  if (!GOOGLE_MAPS_API_KEY) return [];
  await loadGoogleMapsScript(GOOGLE_MAPS_API_KEY);
  return new Promise((resolve, reject) => {
    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions({
      input: query,
      componentRestrictions: { country: 'gb' },
      location: new window.google.maps.LatLng(CH49_CENTER.lat, CH49_CENTER.lng),
      radius: 50000
    }, (predictions, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
      if (status !== window.google.maps.places.PlacesServiceStatus.OK) return reject(new Error('Google Places search failed.'));
      resolve(predictions.map(prediction => ({
        id: `google-${prediction.place_id}`,
        source: 'google',
        placeId: prediction.place_id,
        main: prediction.structured_formatting?.main_text || prediction.description,
        secondary: prediction.structured_formatting?.secondary_text || prediction.description,
        address: prediction.description
      })));
    });
  });
}

async function googlePlaceDetails(placeId) {
  const service = new window.google.maps.places.PlacesService(document.createElement('div'));
  return new Promise((resolve, reject) => {
    service.getDetails({ placeId, fields: ['formatted_address', 'geometry', 'name'] }, (place, status) => {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return reject(new Error('Google could not load this address.'));
      resolve({ address: place.formatted_address || place.name, lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
    });
  });
}

async function nominatimSearch(query, center) {
  if (!query || query.length < 2) return [];
  const bbox = center ? `${center.lat - 0.5},${center.lng - 0.5},${center.lat + 0.5},${center.lng + 0.5}` : '';
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=gb&limit=25&addressdetails=1&viewbox=${bbox}&bounded=0&accept-language=en`;
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
    })).sort((a, b) => distanceMiles(CH49_CENTER.lat, CH49_CENTER.lng, a.lat, a.lng) - distanceMiles(CH49_CENTER.lat, CH49_CENTER.lng, b.lat, b.lng));
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
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('wirralCustomerToken');
    setCustomerToken('');
    setCustomerName('');
    setSavedPlaces([]);
    navigate('/customer', { replace: true });
  }

  const [screen, setScreenState] = useState('home');
  const [isFuture, setIsFuture] = useState(false);

  const [pickup, setPickup] = useState({ address: '', lat: null, lng: null });
  const [dropoff, setDropoff] = useState({ address: '', lat: null, lng: null });
  const [route, setRoute] = useState({ miles: 0, durationSec: 0, durationText: '', trafficText: '', trafficStatus: 'green' });
  const [routeLoading, setRouteLoading] = useState(false);

  const [vehicleType, setVehicleType] = useState('car');
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(0);
  const [flightNumber, setFlightNumber] = useState('');
  const [childSeats, setChildSeats] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerToken, setCustomerToken] = useState(() => localStorage.getItem('wirralCustomerToken') || '');
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [pickupTime, setPickupTime] = useState(toIsoLocal(addMinutes(new Date(), 30)));

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [predictionsFor, setPredictionsFor] = useState('dropoff');
  const [fetchingPredictions, setFetchingPredictions] = useState(false);

  const [result, setResult] = useState(null);
  const [trackingJob, setTrackingJob] = useState(null);
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

  function navigateToScreen(nextScreen) {
    window.history.pushState(
      { ...window.history.state, wirralBookingScreen: nextScreen },
      '',
      window.location.href
    );
    setScreenState(nextScreen);
  }

  function goBack() {
    window.history.back();
  }

  useEffect(() => {
    if (screen !== 'success' || !result?.trackingToken) {
      setTrackingJob(null);
      return;
    }
    let alive = true;
    async function loadTracking() {
      try {
        const data = await apiGet(`/tracking/${result.trackingToken}`);
        if (alive) setTrackingJob(data);
      } catch (err) { console.error(err); }
    }
    loadTracking();
    const id = setInterval(loadTracking, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [screen, result?.trackingToken]);

  useEffect(() => {
    const currentState = window.history.state;
    const initialScreen = currentState?.wirralBookingScreen || 'home';

    if (!currentState?.wirralBookingScreen) {
      window.history.replaceState(
        { ...currentState, wirralBookingScreen: initialScreen },
        '',
        window.location.href
      );
    }

    setScreenState(initialScreen);

    function handlePopState(event) {
      if (event.state?.wirralBookingScreen) {
        setScreenState(event.state.wirralBookingScreen);
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const quoteTimeOfDay = getTimeOfDay(isFuture || isAirport ? new Date(pickupTime) : new Date());
  const oneWayCarFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'car' }) || calculateFare({ miles: route.miles, vehicleType: 'car', timeOfDay: quoteTimeOfDay })) || 0;
  const oneWayMpvFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'mpv' }) || calculateFare({ miles: route.miles, vehicleType: 'mpv', timeOfDay: quoteTimeOfDay })) || 0;
  const tripCount = isAirport && airportTripType === 'return' ? 2 : 1;
  const carFare = oneWayCarFare * tripCount;
  const mpvFare = oneWayMpvFare * tripCount;

  useEffect(() => {
    if (!customerToken) { navigate('/customer', { replace: true }); return; }
    Promise.all([api('customer/me', { customerToken }), api('customer/places', { customerToken })])
      .then(([me, places]) => { setCustomerName(me.customer?.name || ''); setCustomerPhone(me.customer?.phone || ''); setSavedPlaces(places.places || []); })
      .catch(() => {
        localStorage.removeItem('wirralCustomerToken');
        setCustomerToken('');
      });
  }, [customerToken, navigate]);

  useEffect(() => {
    async function getPickupLocation() {
      try {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          if (!pickup.lat) setPickupFromLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
          return;
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        setPickupFromLatLng(pos.coords.latitude, pos.coords.longitude);
      } catch (err) {
        if (!pickup.lat) setPickupFromLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
      }
    }
    getPickupLocation();
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
    try {
      const googlePredictions = await googlePlaceSearch(input);
      setPredictions(googlePredictions.length ? googlePredictions : await nominatimSearch(input, center));
    } catch {
      setPredictions(await nominatimSearch(input, center));
    } finally {
      setFetchingPredictions(false);
    }
  }

  function onSearchChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(predictionDebounceRef.current);
    predictionDebounceRef.current = setTimeout(() => fetchPredictions(value), 250);
  }

  async function selectPlace(pred) {
    setFetchingPredictions(true);
    setError('');
    try {
      const place = pred.source === 'google' ? await googlePlaceDetails(pred.placeId) : pred;
      applySelection(place.address, place.lat, place.lng);
    } catch (err) {
      setError(err.message || 'Unable to load the selected address.');
    } finally {
      setFetchingPredictions(false);
    }
  }

  function applySelection(address, lat, lng) {
    if (predictionsFor === 'pickup') {
      setPickup({ address, lat, lng });
      setPredictionsFor('dropoff');
      setQuery('');
      setPredictions([]);
      navigateToScreen('destination');
    } else {
      setDropoff({ address, lat, lng });
      setQuery('');
      setPredictions([]);
      navigateToScreen('route');
    }
  }

  function startAsap() {
    setIsAirport(false);
    setIsFuture(false);
    setAirportTripType('single');
    setReturnTrip(null);
    setReturnResult(null);
    setPredictionsFor('dropoff');
    navigateToScreen('destination');
  }

  function startFuture() {
    setIsAirport(false);
    setIsFuture(true);
    setAirportTripType('single');
    setReturnTrip(null);
    setReturnResult(null);
    setPickupTime(toIsoLocal(addMinutes(new Date(), 60)));
    setPredictionsFor('dropoff');
    navigateToScreen('destination');
  }

  function startAirport() {
    setIsAirport(true);
    setIsFuture(false);
    setAirportTripType('single');
    setAirportDirection('to');
    setSelectedAirport(AIRPORTS[0]);
    setOtherLocation({ address: '', lat: null, lng: null });
    setPickupTime(toIsoLocal(addMinutes(new Date(), 60)));
    setReturnTime(toIsoLocal(addMinutes(new Date(), 120)));
    setReturnTrip(null);
    setReturnResult(null);
    setQuery('');
    setPredictions([]);
    setError('');
    navigateToScreen('airport');
  }

  async function selectAirportPlace(pred) {
    setFetchingPredictions(true);
    setError('');
    try {
      const place = pred.source === 'google' ? await googlePlaceDetails(pred.placeId) : pred;
      setOtherLocation({ address: place.address, lat: place.lat, lng: place.lng });
      setQuery(place.address);
      setPredictions([]);
    } catch (err) {
      setError(err.message || 'Unable to load the selected address.');
    } finally {
      setFetchingPredictions(false);
    }
  }

  function continueAirport() {
    if (!selectedAirport || !otherLocation.lat) {
      setError('Please select an airport and enter the other address.');
      return;
    }
    if (!pickupTime) {
      setError('Please choose an outbound date and time.');
      return;
    }
    if (airportTripType === 'return' && !returnTime) {
      setError('Please choose a return date and time.');
      return;
    }
    if (airportTripType === 'return' && new Date(returnTime) <= new Date(pickupTime)) {
      setError('Your return time must be after the outbound journey.');
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
    navigateToScreen('route');
  }

  async function submitBooking() {
    if (!String(customerName).trim() || !String(customerPhone).trim()) {
      setError('Please enter your name and mobile number.');
      return;
    }
    if (!pickup.address || !dropoff.address || pickup.lat == null || dropoff.lat == null) {
      setError('Please select a pickup and destination.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const booking = {
        pickupAddress: pickup.address,
        dropoffAddress: dropoff.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        miles: route.miles,
        vehicleType,
        timeOfDay: quoteTimeOfDay,
        pickupTime: (isFuture || isAirport) && pickupTime ? new Date(pickupTime).toISOString() : new Date().toISOString(),
        customerToken,
        passengers,
        luggage,
        ...(isAirport && flightNumber ? { flightNumber } : {}),
        ...(childSeats ? { childSeats } : {}),
        ...(accessibility ? { accessibility } : {}),
        customerNotes
      };
      if (!returnTrip) {
        const outbound = await api('booking', booking);
        if (outbound.error) throw new Error(outbound.error);
        setResult({ ...outbound, jobId: outbound.pendingBookingId });
        setClientSecret(outbound.clientSecret || null);
        setPaymentTarget('outbound');
        navigateToScreen('payment');
      } else {
        const returnDate = new Date(returnTrip.time);
        let returnPickup = { address: returnTrip.airport.address, lat: returnTrip.airport.lat, lng: returnTrip.airport.lng };
        let returnDropoff = { address: returnTrip.otherLocation.address, lat: returnTrip.otherLocation.lat, lng: returnTrip.otherLocation.lng };
        if (returnTrip.direction === 'from') {
          returnPickup = { address: returnTrip.otherLocation.address, lat: returnTrip.otherLocation.lat, lng: returnTrip.otherLocation.lng };
          returnDropoff = { address: returnTrip.airport.address, lat: returnTrip.airport.lat, lng: returnTrip.airport.lng };
        }
        if (returnPickup.lat == null || returnPickup.lng == null || returnDropoff.lat == null || returnDropoff.lng == null) {
          setError('Return trip locations are incomplete.');
          setLoading(false);
          return;
        }
        const returnMiles = distanceMiles(returnPickup.lat, returnPickup.lng, returnDropoff.lat, returnDropoff.lng);
        const returnBooking = {
          pickupAddress: returnPickup.address,
          dropoffAddress: returnDropoff.address,
          pickupLat: returnPickup.lat,
          pickupLng: returnPickup.lng,
          dropoffLat: returnDropoff.lat,
          dropoffLng: returnDropoff.lng,
          miles: returnMiles,
          vehicleType,
          timeOfDay: getTimeOfDay(returnDate),
          pickupTime: returnDate.toISOString(),
          customerToken,
          passengers,
          luggage,
          ...(isAirport && flightNumber ? { flightNumber } : {}),
          ...(childSeats ? { childSeats } : {}),
          ...(accessibility ? { accessibility } : {}),
          customerNotes
        };
        const pair = await api('booking/return-pair', { outbound: booking, return: returnBooking });
        if (pair.error) throw new Error(pair.error);
        setResult({
          jobId: pair.outbound.pendingBookingId,
          outboundJobId: pair.outbound.pendingBookingId,
          returnJobId: pair.return.pendingBookingId,
          fare: (pair.outbound.fare || 0) + (pair.return.fare || 0),
          bookingFee: (pair.outbound.bookingFee || 0) + (pair.return.bookingFee || 0),
          clientSecret: pair.outbound.clientSecret || null,
          trackingToken: pair.outbound.trackingToken
        });
        setReturnResult({ ...pair.return, jobId: pair.return.pendingBookingId });
        setClientSecret(pair.outbound.clientSecret || null);
        setPaymentTarget('pair');
        navigateToScreen('payment');
      }
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
    if (returnPickup.lat == null || returnPickup.lng == null || returnDropoff.lat == null || returnDropoff.lng == null) {
      setError('Return trip locations are incomplete.');
      return;
    }
    const returnMiles = distanceMiles(returnPickup.lat, returnPickup.lng, returnDropoff.lat, returnDropoff.lng);
    const returnData = await api('booking', {
      pickupAddress: returnPickup.address,
      dropoffAddress: returnDropoff.address,
      pickupLat: returnPickup.lat,
      pickupLng: returnPickup.lng,
      dropoffLat: returnDropoff.lat,
      dropoffLng: returnDropoff.lng,
      miles: returnMiles,
      vehicleType,
      timeOfDay: getTimeOfDay(returnDate),
      pickupTime: returnDate.toISOString(),
      customerToken,
      passengers,
      luggage,
      ...(isAirport && flightNumber ? { flightNumber } : {}),
      ...(childSeats ? { childSeats } : {}),
      ...(accessibility ? { accessibility } : {}),
      customerNotes
    });
    if (returnData.error) throw new Error(returnData.error);
    setReturnResult({ ...returnData, jobId: returnData.pendingBookingId });
    setResult({ ...returnData, jobId: returnData.pendingBookingId });
    setClientSecret(returnData.clientSecret || null);
    setPaymentTarget('return');
  }

  async function confirmPayment(sourceId) {
    if (!result) return;
    setError(''); setLoading(true);
    try {
      if (paymentTarget === 'pair' && returnResult) {
        const confirm = await api('booking/confirm-pair', { outboundPendingBookingId: result.outboundJobId, returnPendingBookingId: returnResult.jobId, sourceId });
        if (confirm.error) throw new Error(confirm.error);
        navigateToScreen('success');
        return;
      }

      const confirm = await api('booking/confirm', { pendingBookingId: result.jobId, sourceId });
      if (confirm.error) throw new Error(confirm.error);
      navigateToScreen('success');
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
    navigateToScreen('pickup-search');
  }

  function backToDestination() {
    setPredictionsFor('dropoff');
    setQuery('');
    setPredictions([]);
    goBack();
  }

  function chooseSuggestedDestination(value) {
    setQuery(value);
    fetchPredictions(value);
  }

  function selectSavedDestination(place) {
    setDropoff({ address: place.address, lat: place.lat, lng: place.lng });
    setPredictions([]);
    setQuery('');
    navigateToScreen('route');
  }

  function selectSavedPickup(place) {
    setPickup({ address: place.address, lat: place.lat, lng: place.lng });
    setPredictions([]);
    setQuery('');
    navigateToScreen('destination');
  }

  function vehicleCard(type, label, capacity, fare) {
    const selected = vehicleType === type;
    return (
      <button key={type} type="button" onClick={() => setVehicleType(type)} className={`wj-ride-card${selected ? ' selected' : ''}`}>
        <span className="wj-ride-check">{selected ? '✓' : ''}</span>
        <svg className="wj-ride-car" viewBox="0 0 64 48" fill="none" aria-hidden="true">
          {type === 'mpv' ? (
            <>
              <path d="M5 31.5v-11c0-2.7 2.2-4.9 4.9-4.9h4.3l5.4-8.3c1-1.6 2.8-2.5 4.7-2.5h16.2c2.4 0 4.6 1.1 6 3.1l5.2 7.7h4.4c2.7 0 4.9 2.2 4.9 4.9v11c0 2.3-1.9 4.2-4.2 4.2h-3.1a7.7 7.7 0 0 1-15.4 0H25.7a7.7 7.7 0 0 1-15.4 0H9.2A4.2 4.2 0 0 1 5 31.5Z" fill="currentColor" />
              <path d="m21.4 15.6 3.6-5.6c.5-.7 1.3-1.2 2.2-1.2h12.5c1.1 0 2.2.5 2.8 1.4l3.7 5.4H21.4Z" fill="#080704" opacity=".8" />
              <path d="M8.9 21.3h5.3M50.2 21.3h5" stroke="#080704" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="18" cy="35.7" r="5" fill="#080704" /><circle cx="18" cy="35.7" r="2.1" fill="currentColor" />
              <circle cx="46" cy="35.7" r="5" fill="#080704" /><circle cx="46" cy="35.7" r="2.1" fill="currentColor" />
            </>
          ) : (
            <>
              <path d="M4.5 31.8v-8.1c0-3.5 2.8-6.3 6.3-6.3h5.8l7.1-9.1c1.2-1.6 3.1-2.5 5.1-2.5h10.6c2.3 0 4.4 1 5.8 2.8l6.6 8.8h2.4c3.5 0 6.3 2.8 6.3 6.3v8.1c0 2.2-1.8 4-4 4h-3.1a7.5 7.5 0 0 1-14.9 0H25.5a7.5 7.5 0 0 1-14.9 0h-2a4 4 0 0 1-4.1-3.9Z" fill="currentColor" />
              <path d="m23 17.4 4.2-5.5c.5-.7 1.3-1.1 2.2-1.1h8.8c1 0 1.9.4 2.5 1.2l4.1 5.4H23Z" fill="#080704" opacity=".8" />
              <path d="M8.8 22.6h5.4M51.1 22.6h4" stroke="#080704" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="18" cy="35.7" r="4.9" fill="#080704" /><circle cx="18" cy="35.7" r="2" fill="currentColor" />
              <circle cx="46" cy="35.7" r="4.9" fill="#080704" /><circle cx="46" cy="35.7" r="2" fill="currentColor" />
            </>
          )}
        </svg>
        <span className="wj-ride-copy"><strong>{label}</strong><small>{capacity}</small></span>
        <span className="wj-ride-price"><small>Max chargeable</small><strong>{formatCurrency(fare)}</strong></span>
      </button>
    );
  }

  function panelTitle(title) {
    return <h2 className="wj-panel-title">{title}</h2>;
  }

  function backBtn(onClick, label = 'Back') {
    return (
      <button onClick={onClick} className="wj-back" style={{ marginBottom: '0.9rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 6l-6 6 6 6" /></svg> {label}
      </button>
    );
  }

  function futureTag() {
    return isFuture ? <span className="badge badge-gold">Future booking</span> : null;
  }

  function renderScreen() {
    switch (screen) {
      case 'home':
        return (
          <div style={{ textAlign: 'center' }}>
            <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
            <p className="wj-tagline">Local knowledge. Always on call.</p>
            <button onClick={startAsap} className="btn btn-primary" style={{ marginBottom: '0.75rem' }}>
              Ride now
              <span className="btn-sub">from current location</span>
            </button>
            <button onClick={startFuture} className="btn btn-outline" style={{ marginBottom: '0.75rem' }}>
              Book for later
              <span className="btn-sub">or from a different pickup point</span>
            </button>
            <button onClick={startAirport} className="btn btn-outline">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}><Icon.plane /> Airport transfers</span>
              <span className="btn-sub">single or two-way booking</span>
            </button>
          </div>
        );

      case 'pickup-search':
        return (
          <div>
            {backBtn(backToDestination)}
            {panelTitle('Change pickup location')}
            {savedPlaces.filter(place => place.type === 'pickup').length > 0 && <div className="wj-destination-suggestions" style={{ marginBottom: '0.8rem' }}>{savedPlaces.filter(place => place.type === 'pickup').map(place => <button key={place.id} onClick={() => selectSavedPickup(place)}><span className="wj-destination-suggestion-icon">↑</span><span><strong>{place.label}</strong><small>{place.address}</small></span><b>›</b></button>)}</div>}
            <input
              type="text"
              value={query}
              onChange={onSearchChange}
              placeholder="Search for a pickup address"
              className="wj-search-input"
              style={{ marginBottom: '0.5rem' }}
              autoFocus
            />
            {fetchingPredictions && <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem' }}>Searching…</p>}
            <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: '0.5rem' }}>
              {predictions.map(p => (
                <div key={p.id} onClick={() => selectPlace(p)} style={{ padding: '0.85rem 0.25rem', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.main}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)' }}>{p.secondary}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'destination':
        return (
          <div className="wj-destination-screen">
            <div className="wj-destination-topbar">
              {backBtn(goBack)}
              {futureTag()}
            </div>
            <img src={logo} alt="The Wirral Jobe" className="wj-destination-logo" />
            <div className="wj-destination-rule" />
            <h1 className="wj-destination-title">Where are<br />you going?</h1>
            <p className="wj-destination-subtitle">Enter your destination and we'll<br />get you there.</p>

            <div className="wj-destination-pickup">
              <span className="wj-destination-pin"><Icon.pin /></span>
              <div className="wj-destination-pickup-copy">
                <span>Pickup</span>
                <strong>{pickup.address || 'Current location'}</strong>
              </div>
              <button onClick={changePickup} className="wj-destination-change">Change <b>›</b></button>
            </div>

            <div className="wj-destination-search-wrap">
              <span className="wj-destination-search-icon"><Icon.search /></span>
              <input
                type="text"
                value={query}
                onChange={onSearchChange}
                placeholder="Enter destination"
                className="wj-destination-search"
                autoFocus
              />
              <span className="wj-destination-locate"><Icon.pin /></span>
            </div>
            {fetchingPredictions && <p className="wj-destination-searching">Searching…</p>}
            {predictions.length > 0 ? (
              <div className="wj-destination-results">
                {predictions.map(p => (
                  <button key={p.id} onClick={() => selectPlace(p)} className="wj-destination-result">
                    <span>{p.main}</span>
                    <small>{p.secondary}</small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {savedPlaces.filter(place => place.type === 'dropoff').length > 0 && <><div className="wj-destination-section-title">Saved destinations</div><div className="wj-destination-suggestions">{savedPlaces.filter(place => place.type === 'dropoff').map(place => <button key={place.id} onClick={() => selectSavedDestination(place)}><span className="wj-destination-suggestion-icon">↓</span><span><strong>{place.label}</strong><small>{place.address}</small></span><b>›</b></button>)}</div></>}
                <div className="wj-destination-section-title">Recent destinations</div>
                <div className="wj-destination-suggestions">
                  <button onClick={() => chooseSuggestedDestination('Home')}><span className="wj-destination-suggestion-icon">⌂</span><span><strong>Home</strong><small>Add address</small></span><b>›</b></button>
                  <button onClick={() => chooseSuggestedDestination('Work')}><span className="wj-destination-suggestion-icon">▣</span><span><strong>Work</strong><small>Add address</small></span><b>›</b></button>
                  <button onClick={() => chooseSuggestedDestination('Liverpool John Lennon Airport')}><span className="wj-destination-suggestion-icon">✈</span><span><strong>Liverpool Airport</strong><small>LPL</small></span><b>›</b></button>
                  <button onClick={() => chooseSuggestedDestination('Manchester Airport')}><span className="wj-destination-suggestion-icon">✈</span><span><strong>Manchester Airport</strong><small>MAN</small></span><b>›</b></button>
                  <button className="wide" onClick={() => chooseSuggestedDestination('Birkenhead Town Centre')}><span className="wj-destination-suggestion-icon">●</span><span><strong>Town Centre</strong><small>Birkenhead, Wirral</small></span><b>›</b></button>
                </div>
              </>
            )}
            <div className="wj-destination-safety">▰ &nbsp; Safe, reliable &amp; always on call. &nbsp; ▰</div>
          </div>
        );

      case 'airport':
        return (
          <div>
            {backBtn(goBack)}
            {panelTitle('Airport transfer')}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem', border: '1.5px solid var(--border)', borderRadius: 12, padding: '0.3rem' }}>
              <button onClick={() => setAirportDirection('to')} className={airportDirection === 'to' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} style={{ flex: 1, border: airportDirection === 'to' ? undefined : 'none' }}>To airport</button>
              <button onClick={() => setAirportDirection('from')} className={airportDirection === 'from' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} style={{ flex: 1, border: airportDirection === 'from' ? undefined : 'none' }}>From airport</button>
            </div>
            <div className="form-group">
              <label>Airport</label>
              <select value={selectedAirport?.name} onChange={e => setSelectedAirport(AIRPORTS.find(a => a.name === e.target.value))}>
                {AIRPORTS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem', border: '1.5px solid var(--border)', borderRadius: 12, padding: '0.3rem' }}>
              <button onClick={() => setAirportTripType('single')} className={airportTripType === 'single' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} style={{ flex: 1, border: airportTripType === 'single' ? undefined : 'none' }}>Single</button>
              <button onClick={() => setAirportTripType('return')} className={airportTripType === 'return' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} style={{ flex: 1, border: airportTripType === 'return' ? undefined : 'none' }}>Return</button>
            </div>
            <div className="form-group">
              <label>{airportDirection === 'to' ? 'Pickup address' : 'Drop-off address'}</label>
              <input
                type="text"
                value={query}
                onChange={onSearchChange}
                placeholder={`Search ${airportDirection === 'to' ? 'pickup' : 'drop-off'} address`}
                autoFocus
              />
              {fetchingPredictions && <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem' }}>Searching…</p>}
              <div style={{ maxHeight: 170, overflowY: 'auto', marginTop: '0.5rem' }}>
                {predictions.map(p => (
                  <div key={p.id} onClick={() => selectAirportPlace(p)} style={{ padding: '0.85rem 0.25rem', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.main}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--cream-dim)' }}>{p.secondary}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Outbound date &amp; time</label>
              <input
                type="datetime-local"
                value={pickupTime}
                min={toIsoLocal(new Date())}
                onChange={e => setPickupTime(e.target.value)}
              />
            </div>
            {airportTripType === 'return' && (
              <div className="form-group">
                <label>Return date &amp; time</label>
                <input
                  type="datetime-local"
                  value={returnTime}
                  min={toIsoLocal(new Date())}
                  onChange={e => setReturnTime(e.target.value)}
                />
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <button onClick={continueAirport} disabled={routeLoading} className="btn btn-primary">Continue</button>
          </div>
        );

      case 'route':
        return (
          <div className="wj-ride-screen">
            <div className="wj-ride-topbar">{backBtn(goBack)}</div>
            <img src={logo} alt="The Wirral Jobe" className="wj-ride-logo" />
            <h1 className="wj-ride-title">Choose your ride</h1>
            <div className="wj-ride-stats">
              <div><small>Distance</small><strong>{route.miles.toFixed(2)} mi</strong></div>
              <div><small>Time</small><strong>{route.durationText || '—'}</strong></div>
              <div className={route.trafficStatus}><small>Traffic</small><strong>{route.trafficText}</strong></div>
            </div>
            <div className="wj-ride-label">Pick your vehicle</div>
            {vehicleCard('car', 'Saloon/estate car', 'Up to 4 passengers', carFare)}
            {vehicleCard('mpv', 'MPV', 'Up to 8 passengers', mpvFare)}
            <div className="wj-ride-notice">
              <span><Icon.shield /></span>
              <div><strong>Maximum chargeable amount</strong><small>This is the most we can charge for your journey. Final fare may be less.</small></div>
            </div>
            <button onClick={() => navigateToScreen('details')} disabled={!vehicleType || routeLoading} className="wj-ride-continue">
              {routeLoading ? 'Calculating route…' : 'Continue'}
            </button>
            <div className="wj-ride-footer">▱ &nbsp; Safe &amp; secure &nbsp; | &nbsp; ♙ &nbsp; Local drivers &nbsp; | &nbsp; ♢ &nbsp; Fair prices</div>
          </div>
        );

      case 'details':
        return (
          <div className="wj-details-screen">
            <div className="wj-details-topbar">
              {backBtn(goBack)}
              {futureTag()}
            </div>
            <img src={logo} alt="The Wirral Jobe" className="wj-details-logo" />
            <h1 className="wj-details-title">Your details</h1>
            <p className="wj-details-subtitle">Just a few details to confirm your booking.</p>
            <div className="wj-details-input">
              <span aria-hidden="true">♟</span>
              <input type="text" value={customerName} disabled placeholder="Your name" />
            </div>
            <div className="wj-details-input">
              <span aria-hidden="true">●</span>
              <input type="tel" value={customerPhone} disabled placeholder="Mobile number" />
            </div>
            <div className="wj-passenger-label">Passengers</div>
            <div className="wj-passenger-picker">
              <button type="button" aria-label="Remove passenger" onClick={() => setPassengers(Math.max(1, passengers - 1))}>−</button>
              <div><strong>{passengers}</strong><small>Up to {vehicleType === 'mpv' ? 8 : 4} passengers</small></div>
              <button type="button" aria-label="Add passenger" onClick={() => setPassengers(Math.min(vehicleType === 'mpv' ? 8 : 4, passengers + 1))}>+</button>
            </div>
            {isAirport && (<>
            <div className="wj-passenger-label">Luggage</div>
            <div className="wj-passenger-picker">
              <button type="button" aria-label="Remove luggage" onClick={() => setLuggage(Math.max(0, luggage - 1))}>−</button>
              <div><strong>{luggage}</strong><small>Number of bags</small></div>
              <button type="button" aria-label="Add luggage" onClick={() => setLuggage(luggage + 1)}>+</button>
            </div>
            <div className="wj-details-input">
              <span aria-hidden="true">✈</span>
              <input type="text" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="Flight number (if any)" />
            </div>
            </>)}
            {!showExtras ? (
              <button type="button" onClick={() => setShowExtras(true)} className="wj-text-button">+ Add child seat or accessibility needs</button>
            ) : (
              <>
                <div className="wj-details-input">
                  <span aria-hidden="true">♥</span>
                  <input type="text" value={childSeats} onChange={e => setChildSeats(e.target.value)} placeholder="Child seats required?" />
                </div>
                <div className="wj-details-input">
                  <span aria-hidden="true">♿</span>
                  <input type="text" value={accessibility} onChange={e => setAccessibility(e.target.value)} placeholder="Accessibility needs" />
                </div>
                <button type="button" onClick={() => { setShowExtras(false); setChildSeats(''); setAccessibility(''); }} className="wj-text-button">− Remove special requirements</button>
              </>
            )}
            <textarea className="wj-details-input" style={{ minHeight: 80, paddingTop: 12 }} value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} placeholder="Any other notes for the driver" />
            {isFuture && (
              <input className="wj-details-datetime" type="datetime-local" value={pickupTime} min={toIsoLocal(new Date())} onChange={e => setPickupTime(e.target.value)} />
            )}
            <div className="wj-details-safety">
              <span><Icon.shield /></span>
              <div><strong>You're in safe hands</strong><small>Local drivers. Local knowledge.<br />Always on call.</small></div>
            </div>
            {error && <p className="error">{error}</p>}
            <button onClick={submitBooking} disabled={loading} className="wj-details-submit">{loading ? 'Booking…' : 'Book now'} <b>›</b></button>
            <div className="wj-details-footer">▱ &nbsp; Safe &amp; secure &nbsp; | &nbsp; ♙ &nbsp; Local drivers &nbsp; | &nbsp; ♢ &nbsp; Fair prices</div>
          </div>
        );

      case 'payment':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {backBtn(goBack)}
              {futureTag()}
            </div>
            {panelTitle('Payment')}
            {result ? (
              <PaymentForm
                fare={result.fare}
                bookingFee={result.bookingFee}
                clientSecret={clientSecret}
                onConfirm={confirmPayment}
                loading={loading}
                error={error}
                pendingBookingId={paymentTarget !== 'pair' ? result.jobId : undefined}
                outboundPendingBookingId={paymentTarget === 'pair' ? result.outboundJobId : undefined}
                returnPendingBookingId={paymentTarget === 'pair' ? returnResult?.jobId : undefined}
              />
            ) : (
              <p className="error">No booking data. Please go back and try again.</p>
            )}
          </div>
        );

      case 'success':
        const allocated = trackingJob && trackingJob.status !== 'NEW' && trackingJob.status !== 'CANCELLED';
        const trackingLabel = {
          NEW: 'Finding a driver',
          ASSIGNED: 'Driver assigned',
          ON_WAY: 'Driver on the way',
          ARRIVED: 'Driver has arrived',
          POB: 'Journey in progress',
          COMPLETE: 'Journey complete',
          CANCELLED: 'Booking cancelled'
        }[trackingJob?.status] || (isFuture ? 'Booking confirmed' : 'Finding a driver…');
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid var(--green)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.1rem' }}><Icon.check /></div>
            {panelTitle('Booking confirmed')}
            <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
              {isAirport && airportTripType === 'return'
                ? 'Both legs of your airport transfer are booked.'
                : (isFuture
                    ? `Your ${vehicleType === 'mpv' ? 'MPV' : 'estate car'} is booked for ${new Date(pickupTime).toLocaleString()}.`
                    : (allocated
                        ? <><span style={{ color: 'var(--green)', fontWeight: 800 }}>{trackingLabel}</span><br />{trackingJob.driverId && `Driver ${trackingJob.driverId}`}{trackingJob.driverLocationAt && <small style={{ display: 'block', marginTop: 4, color: 'var(--cream-dim)' }}>Location updated {new Date(trackingJob.driverLocationAt).toLocaleTimeString()}</small>}</>
                        : 'We are allocating a driver now.'))}
            </p>
            {result && !isFuture && (
              <button
                onClick={() => navigate(`/track/${result.trackingToken}`)}
                className="btn btn-primary"
                style={{ marginBottom: '1rem' }}
              >
                Track your driver live
              </button>
            )}
            {result && (
              <div className="wj-info-grid" style={{ textAlign: 'left', gridTemplateColumns: '1fr' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>{returnResult ? 'Outbound job ID' : 'Job ID'}</span>
                  <span style={{ fontWeight: 800 }}>{result.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>{returnResult ? 'Outbound fare' : 'Fare estimate'}</span>
                  <span style={{ fontWeight: 800 }}>{formatCurrency(result.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>{returnResult ? 'Outbound booking fee' : 'Booking fee'}</span>
                  <span style={{ fontWeight: 800 }}>{formatCurrency(result.bookingFee)}</span>
                </div>
              </div>
            )}
            {returnResult && (
              <div className="wj-info-grid" style={{ textAlign: 'left', gridTemplateColumns: '1fr' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>Return job ID</span>
                  <span style={{ fontWeight: 800 }}>{returnResult.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>Return fare</span>
                  <span style={{ fontWeight: 800 }}>{formatCurrency(returnResult.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--cream-dim)' }}>Return booking fee</span>
                  <span style={{ fontWeight: 800 }}>{formatCurrency(returnResult.bookingFee)}</span>
                </div>
              </div>
            )}
            <button onClick={() => window.location.reload()} className="btn btn-primary">Book another ride</button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="wj-shell">
      <div className={`wj-frame wj-booking-frame wj-screen-${screen}`}>
        {customerToken && (
          <div className="wj-booking-userbar">
            <span>Hi, <strong>{customerName || 'guest'}</strong></span>
            <button type="button" className="wj-text-button" onClick={logout}>Log out</button>
          </div>
        )}
        {renderScreen()}
      </div>
    </div>
  );
}
