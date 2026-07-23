import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { loadGoogleMapsScript } from '../lib/maps.js';
import { calculateFare, calculateAirportFare, getTimeOfDay } from '../lib/fare.js';
import { distanceMiles } from '../lib/geo.js';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const DEFAULT_CENTER = { lat: 53.393, lng: -3.019 };
const AIRPORTS = [
  { name: 'Liverpool John Lennon Airport (LPL)', lat: 53.3331, lng: -2.8496 },
  { name: 'Manchester Airport (MAN)', lat: 53.3537, lng: -2.2740 }
];

function formatCurrency(n) { return `£${Number(n).toFixed(2)}`; }
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

function trafficStatus(durationSec, trafficSec) {
  const base = Math.max(1, durationSec);
  const traffic = Math.max(base, trafficSec || base);
  const ratio = traffic / base;
  if (ratio <= 1.15) return { status: 'green', text: 'Clear roads' };
  if (ratio <= 1.4) return { status: 'amber', text: 'Some traffic' };
  return { status: 'red', text: 'Heavy traffic' };
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
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
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

  const [isAirport, setIsAirport] = useState(false);
  const [airportTripType, setAirportTripType] = useState('single');
  const [airportDirection, setAirportDirection] = useState('to');
  const [selectedAirport, setSelectedAirport] = useState(AIRPORTS[0]);
  const [otherLocation, setOtherLocation] = useState({ address: '', lat: null, lng: null });
  const [returnTime, setReturnTime] = useState(toIsoLocal(addMinutes(new Date(), 60)));
  const [returnTrip, setReturnTrip] = useState(null);
  const [returnResult, setReturnResult] = useState(null);

  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropoffMarkerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const predictionDebounceRef = useRef(null);

  const oneWayCarFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'car' }) || calculateFare({ miles: route.miles, vehicleType: 'car', timeOfDay: getTimeOfDay(new Date()) })) || 0;
  const oneWayMpvFare = (calculateAirportFare({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, vehicleType: 'mpv' }) || calculateFare({ miles: route.miles, vehicleType: 'mpv', timeOfDay: getTimeOfDay(new Date()) })) || 0;
  const tripCount = isAirport && airportTripType === 'return' ? 2 : 1;
  const carFare = oneWayCarFare * tripCount;
  const mpvFare = oneWayMpvFare * tripCount;

  useEffect(() => {
    let mounted = true;
    if (!GOOGLE_KEY) {
      setMapError('Google Maps API key is missing.');
      return;
    }
    loadGoogleMapsScript(GOOGLE_KEY)
      .then(() => {
        if (!mounted || !mapRef.current) return;
        const google = window.google;
        const map = new google.maps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: 'greedy'
        });
        mapObjRef.current = map;

        trafficLayerRef.current = new google.maps.TrafficLayer();
        trafficLayerRef.current.setMap(map);

        directionsServiceRef.current = new google.maps.DirectionsService();
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: { strokeColor: '#005eb8', strokeWeight: 5, strokeOpacity: 0.9 }
        });

        pickupMarkerRef.current = new google.maps.Marker({ map, visible: false });
        dropoffMarkerRef.current = new google.maps.Marker({ map, visible: false });

        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        placesServiceRef.current = new google.maps.places.PlacesService(map);
        geocoderRef.current = new google.maps.Geocoder();
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

        setMapReady(true);
      })
      .catch(err => setMapError(err.message || 'Failed to load Google Maps.'));

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!mapReady || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPickupFromLatLng(pos.coords.latitude, pos.coords.longitude),
      () => { if (!pickup.lat) setPickupFromLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const marker = pickupMarkerRef.current;
    if (!marker) return;
    if (pickup.lat != null && pickup.lng != null) {
      marker.setPosition({ lat: pickup.lat, lng: pickup.lng });
      marker.setVisible(true);
      marker.setIcon({
        url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 24 24"><path fill="#005eb8" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="#fff"/></svg>`
        ),
        scaledSize: new window.google.maps.Size(36, 44),
        anchor: new window.google.maps.Point(18, 44)
      });
      if (screen === 'home') mapObjRef.current?.panTo({ lat: pickup.lat, lng: pickup.lng });
    } else {
      marker.setVisible(false);
    }
  }, [mapReady, pickup, screen]);

  useEffect(() => {
    if (!mapReady) return;
    const marker = dropoffMarkerRef.current;
    if (!marker) return;
    if (dropoff.lat != null && dropoff.lng != null) {
      marker.setPosition({ lat: dropoff.lat, lng: dropoff.lng });
      marker.setVisible(true);
      marker.setIcon({
        url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 24 24"><path fill="#ef4444" d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="3" fill="#fff"/></svg>`
        ),
        scaledSize: new window.google.maps.Size(36, 44),
        anchor: new window.google.maps.Point(18, 44)
      });
    } else {
      marker.setVisible(false);
    }
  }, [mapReady, dropoff]);

  useEffect(() => {
    if (!mapReady) return;
    if (pickup.lat != null && dropoff.lat != null) {
      computeRoute();
    } else {
      directionsRendererRef.current?.setDirections({ routes: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  function setPickupFromLatLng(lat, lng) {
    setPickup({ address: '', lat, lng });
    let settled = false;
    const fallbackTimeout = setTimeout(async () => {
      if (settled) return;
      settled = true;
      const address = await nominatimReverse(lat, lng);
      setPickup({ address, lat, lng });
    }, 2000);
    if (geocoderRef.current) {
      try {
        geocoderRef.current.geocode({ location: { lat, lng } }, async (results, status) => {
          if (settled) return;
          settled = true;
          clearTimeout(fallbackTimeout);
          if (status === 'OK' && results?.[0]) {
            setPickup({ address: results[0].formatted_address, lat, lng });
          } else {
            const address = await nominatimReverse(lat, lng);
            setPickup({ address, lat, lng });
          }
        });
      } catch {
        clearTimeout(fallbackTimeout);
        if (!settled) {
          settled = true;
          nominatimReverse(lat, lng).then(address => setPickup({ address, lat, lng }));
        }
      }
    } else {
      clearTimeout(fallbackTimeout);
      nominatimReverse(lat, lng).then(address => setPickup({ address, lat, lng }));
    }
  }

  async function computeRoute() {
    if (!directionsServiceRef.current || !directionsRendererRef.current) {
      const fallback = await osrmRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
      setRoute(fallback);
      setRouteLoading(false);
      return;
    }
    setRouteLoading(true);
    let settled = false;
    const fallbackTimeout = setTimeout(async () => {
      if (settled) return;
      settled = true;
      directionsRendererRef.current.setDirections({ routes: [] });
      const fallback = await osrmRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
      setRoute(fallback);
      setRouteLoading(false);
    }, 2500);
    directionsServiceRef.current.route({
      origin: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: dropoff.lat, lng: dropoff.lng },
      travelMode: 'DRIVING',
      provideRouteAlternatives: false
    }, async (res, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimeout);
      setRouteLoading(false);
      if (status === 'OK' && res?.routes?.[0]) {
        directionsRendererRef.current.setDirections(res);
        const leg = res.routes[0].legs[0];
        const miles = Number((leg.distance.value / 1609.344).toFixed(2));
        const durationSec = leg.duration.value;
        const trafficSec = leg.duration_in_traffic ? leg.duration_in_traffic.value : durationSec;
        const traffic = trafficStatus(durationSec, trafficSec);
        setRoute({
          miles,
          durationSec,
          durationText: leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text,
          trafficText: traffic.text,
          trafficStatus: traffic.status
        });
        const bounds = res.routes[0].bounds;
        if (bounds) mapObjRef.current?.fitBounds(bounds, { top: 80, right: 40, bottom: 220, left: 40 });
      } else {
        directionsRendererRef.current.setDirections({ routes: [] });
        const fallback = await osrmRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
        setRoute(fallback);
      }
    });
  }

  async function fetchPredictions(input) {
    if (!input || input.length < 2) {
      setPredictions([]);
      return;
    }
    setFetchingPredictions(true);
    const center = pickup.lat != null ? { lat: pickup.lat, lng: pickup.lng } : DEFAULT_CENTER;
    let settled = false;
    const fallbackTimeout = setTimeout(() => loadNominatim(), 1500);
    function finish(list) {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimeout);
      setPredictions(list);
      setFetchingPredictions(false);
    }
    async function loadNominatim() {
      if (settled) return;
      const list = await nominatimSearch(input, center);
      finish(list);
    }
    if (autocompleteServiceRef.current) {
      try {
        autocompleteServiceRef.current.getPlacePredictions({
          input,
          componentRestrictions: { country: 'gb' },
          locationBias: new window.google.maps.LatLng(center.lat, center.lng),
          sessionToken: sessionTokenRef.current
        }, (preds, status) => {
          const ok = status === window.google.maps.places.PlacesServiceStatus.OK && preds?.length;
          if (ok) {
            finish(preds.map(p => ({
              id: p.place_id,
              source: 'google',
              main: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || ''
            })));
          } else {
            loadNominatim();
          }
        });
      } catch {
        loadNominatim();
      }
    } else {
      loadNominatim();
    }
  }

  function onSearchChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(predictionDebounceRef.current);
    predictionDebounceRef.current = setTimeout(() => fetchPredictions(value), 250);
  }

  function selectPlace(pred) {
    if (pred.source === 'google') {
      if (!placesServiceRef.current) return;
      placesServiceRef.current.getDetails({
        placeId: pred.id,
        fields: ['geometry', 'formatted_address', 'name'],
        sessionToken: sessionTokenRef.current
      }, (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || place.name || '';
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        applySelection(address, lat, lng);
      });
    } else {
      applySelection(pred.address, pred.lat, pred.lng);
    }
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
    mapObjRef.current?.panTo({ lat, lng });
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
    if (pred.source === 'google') {
      if (!placesServiceRef.current) return;
      placesServiceRef.current.getDetails({
        placeId: pred.id,
        fields: ['geometry', 'formatted_address', 'name'],
        sessionToken: sessionTokenRef.current
      }, (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || place.name || '';
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        setOtherLocation({ address, lat, lng });
        setQuery(address);
        setPredictions([]);
      });
    } else {
      setOtherLocation({ address: pred.address, lat: pred.lat, lng: pred.lng });
      setQuery(pred.address);
      setPredictions([]);
    }
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

      if (returnTrip) {
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
      }

      setScreen('success');
    } catch (err) {
      setError(err.message || 'Booking failed. Please try again.');
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
        flex: 1, border: selected ? '2px solid #005eb8' : '1.5px solid #e5e7eb', borderRadius: 14, padding: '1rem 0.75rem',
        cursor: 'pointer', background: selected ? '#f0f7ff' : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', transition: 'transform 0.1s, box-shadow 0.1s'
      }}>
        <svg width={44} height={44} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
          {type === 'mpv' ? (
            <><rect x="1" y="6" width="22" height="9" rx="2" fill="#005eb8" /><rect x="4" y="4" width="10" height="4" rx="1" fill="#005eb8" /><circle cx="6" cy="15" r="2" fill="#333" /><circle cx="18" cy="15" r="2" fill="#333" /></>
          ) : (
            <><rect x="2" y="8" width="20" height="7" rx="2" fill="#005eb8" /><rect x="5" y="5" width="8" height="4" rx="1" fill="#005eb8" /><circle cx="6" cy="16" r="2" fill="#333" /><circle cx="18" cy="16" r="2" fill="#333" /></>
          )}
        </svg>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{label}</h3>
        <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>{capacity}</p>
        <p style={{ margin: 'auto 0 0', fontSize: '1.2rem', fontWeight: 800 }}>{formatCurrency(fare)}</p>
        <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.7rem' }}>max chargeable</p>
      </div>
    );
  }

  function panelTitle(title) {
    return <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', fontWeight: 700 }}>{title}</h2>;
  }

  function renderScreen() {
    switch (screen) {
      case 'home':
        return (
          <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg, #0f172a 0%, #005eb8 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'white'
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.5-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.6A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                  <circle cx="7" cy="17" r="2"/>
                  <circle cx="17" cy="17" r="2"/>
                </svg>
              </div>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>Wirral Flightpath</h1>
              <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Local taxis, airport runs, any time.</p>
            </div>
            <button onClick={startAsap} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: 'none', background: '#005eb8', color: 'white',
              fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem', cursor: 'pointer'
            }}>
              <div>RIDE NOW</div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', opacity: 0.9 }}>from current location</div>
            </button>
            <button onClick={startFuture} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#111827',
              fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.75rem', cursor: 'pointer'
            }}>
              <div>Book for later</div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', color: '#6b7280' }}>or from a different pickup point</div>
            </button>
            <button onClick={startAirport} style={{
              width: '100%', padding: '1.1rem 1rem', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#111827',
              fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
                Airport transfers
              </div>
              <div style={{ fontWeight: 400, fontSize: '0.8rem', marginTop: '0.25rem', color: '#6b7280' }}>single or two-way booking</div>
            </button>
          </div>
        );

      case 'pickup-search':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button onClick={backToDestination} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            {panelTitle('Change pickup location')}
            <input
              type="text"
              value={query}
              onChange={onSearchChange}
              placeholder="Search for a pickup address"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                outline: 'none', marginBottom: '0.5rem'
              }}
              autoFocus
            />
            {fetchingPredictions && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Searching…</p>}
            <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: '0.5rem' }}>
              {predictions.map(p => (
                <div key={p.id} onClick={() => selectPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.secondary}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'destination':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('home')} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
              {isFuture && <span style={{ fontSize: '0.8rem', color: '#005eb8', fontWeight: 600, background: '#f0f7ff', padding: '0.25rem 0.5rem', borderRadius: 8 }}>Future booking</span>}
            </div>
            {panelTitle('Where are you going?')}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pickup</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickup.address || 'Current location'}</div>
                <button onClick={changePickup} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>Change</button>
              </div>
            </div>
            <input
              type="text"
              value={query}
              onChange={onSearchChange}
              placeholder="Enter destination"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                outline: 'none', marginBottom: '0.5rem'
              }}
              autoFocus
            />
            {fetchingPredictions && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Searching…</p>}
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: '0.5rem' }}>
              {predictions.map(p => (
                <div key={p.id} onClick={() => selectPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.secondary}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'airport':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('home')} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            {panelTitle('Airport transfer')}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', background: '#f8fafc', borderRadius: 12, padding: '0.35rem' }}>
              <button onClick={() => setAirportDirection('to')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportDirection === 'to' ? '#005eb8' : 'transparent', color: airportDirection === 'to' ? 'white' : '#111827', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>To airport</button>
              <button onClick={() => setAirportDirection('from')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportDirection === 'from' ? '#005eb8' : 'transparent', color: airportDirection === 'from' ? 'white' : '#111827', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>From airport</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>Airport</label>
              <select value={selectedAirport?.name} onChange={e => setSelectedAirport(AIRPORTS.find(a => a.name === e.target.value))} style={{ width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb', outline: 'none', background: 'white' }}>
                {AIRPORTS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', background: '#f8fafc', borderRadius: 12, padding: '0.35rem' }}>
              <button onClick={() => setAirportTripType('single')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportTripType === 'single' ? '#005eb8' : 'transparent', color: airportTripType === 'single' ? 'white' : '#111827', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Single</button>
              <button onClick={() => setAirportTripType('return')} style={{ flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', background: airportTripType === 'return' ? '#005eb8' : 'transparent', color: airportTripType === 'return' ? 'white' : '#111827', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Return</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>
                {airportDirection === 'to' ? 'Pickup address' : 'Drop-off address'}
              </label>
              <input
                type="text"
                value={query}
                onChange={onSearchChange}
                placeholder={`Search ${airportDirection === 'to' ? 'pickup' : 'drop-off'} address`}
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                  outline: 'none', marginBottom: '0.5rem'
                }}
                autoFocus
              />
              {fetchingPredictions && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Searching…</p>}
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: '0.5rem' }}>
                {predictions.map(p => (
                  <div key={p.id} onClick={() => selectAirportPlace(p)} style={{ padding: '0.85rem 0.5rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.main}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.secondary}</div>
                  </div>
                ))}
              </div>
            </div>
            {airportTripType === 'return' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.35rem' }}>Return date & time</label>
                <input
                  type="datetime-local"
                  value={returnTime}
                  min={toIsoLocal(new Date())}
                  onChange={e => setReturnTime(e.target.value)}
                  style={{
                    width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                    outline: 'none'
                  }}
                />
              </div>
            )}
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
            <button onClick={continueAirport} disabled={routeLoading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#005eb8', color: 'white',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: routeLoading ? 0.6 : 1
            }}>Continue</button>
          </div>
        );

      case 'route':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => { isAirport ? setScreen('airport') : setScreen('destination'); }} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>DISTANCE</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{route.miles.toFixed(2)} mi</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>TIME</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{route.durationText}</div>
              </div>
              <div style={{ flex: 1, borderRadius: 12, padding: '0.75rem', textAlign: 'center', background: route.trafficStatus === 'green' ? '#dcfce7' : route.trafficStatus === 'amber' ? '#fef9c3' : '#fee2e2' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>TRAFFIC</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: route.trafficStatus === 'green' ? '#166534' : route.trafficStatus === 'amber' ? '#854d0e' : '#991b1b' }}>{route.trafficText}</div>
              </div>
            </div>
            <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.9rem' }}>Pick your vehicle:</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              {vehicleCard('car', 'Black estate car', 'Up to 4 passengers', carFare)}
              {vehicleCard('mpv', 'Black MPV', 'Up to 8 passengers', mpvFare)}
            </div>
            <button onClick={() => setScreen('details')} disabled={!vehicleType || routeLoading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#005eb8', color: 'white',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: routeLoading ? 0.6 : 1
            }}>{routeLoading ? 'Calculating route…' : 'Continue'}</button>
          </div>
        );

      case 'details':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <button onClick={() => setScreen('route')} style={{ border: 'none', background: 'none', color: '#005eb8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back</button>
              {isFuture && <span style={{ fontSize: '0.8rem', color: '#005eb8', fontWeight: 600, background: '#f0f7ff', padding: '0.25rem 0.5rem', borderRadius: 8 }}>Future booking</span>}
            </div>
            {panelTitle('Your details')}
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Your name"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                outline: 'none', marginBottom: '0.75rem'
              }}
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Mobile number"
              style={{
                width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                outline: 'none', marginBottom: '0.75rem'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Passengers</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => setPassengers(Math.max(1, passengers - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>-</button>
                <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{passengers}</span>
                <button onClick={() => setPassengers(Math.min(vehicleType === 'mpv' ? 8 : 4, passengers + 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            {isFuture && (
              <input
                type="datetime-local"
                value={pickupTime}
                min={toIsoLocal(new Date())}
                onChange={e => setPickupTime(e.target.value)}
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem', borderRadius: 12, border: '1.5px solid #e5e7eb',
                  outline: 'none', marginBottom: '0.75rem'
                }}
              />
            )}
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
            <button onClick={submitBooking} disabled={loading} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#005eb8', color: 'white',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: loading ? 0.6 : 1
            }}>{loading ? 'Booking…' : 'Book now'}</button>
          </div>
        );

      case 'success':
        return (
          <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.75rem' }}>✓</div>
            {panelTitle('Booking confirmed')}
            <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 1rem' }}>
              {isAirport && airportTripType === 'return' ? 'Both legs of your airport transfer are booked.' : (isFuture ? `Your ${vehicleType === 'mpv' ? 'MPV' : 'estate car'} is booked for ${new Date(pickupTime).toLocaleString()}.` : 'We are allocating a driver now.')}
            </p>
            {result && (
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#6b7280' }}>{returnResult ? 'Outbound job ID' : 'Job ID'}</span>
                  <span style={{ fontWeight: 700 }}>{result.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#6b7280' }}>{returnResult ? 'Outbound fare' : 'Fare estimate'}</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(result.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>{returnResult ? 'Outbound booking fee' : 'Booking fee'}</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(result.bookingFee)}</span>
                </div>
              </div>
            )}
            {returnResult && (
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#6b7280' }}>Return job ID</span>
                  <span style={{ fontWeight: 700 }}>{returnResult.jobId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#6b7280' }}>Return fare</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(returnResult.fare)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Return booking fee</span>
                  <span style={{ fontWeight: 700 }}>{formatCurrency(returnResult.bookingFee)}</span>
                </div>
              </div>
            )}
            <button onClick={() => window.location.reload()} style={{
              width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: '#005eb8', color: 'white',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
            }}>Book another ride</button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        .gm-err-container, .gm-err-content, .gm-err-title, .gm-err-message, .gm-err-icon, .gm-err-close, .gm-err-map {
          display: none !important;
        }
      `}</style>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '1rem 1.25rem', background: 'linear-gradient(135deg, #0f172a 0%, #005eb8 100%)', color: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Wirral Flightpath</h1>
      </div>

      <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

      {!mapReady && !mapError && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 15, background: 'rgba(255,255,255,0.9)', padding: '1rem 1.5rem', borderRadius: 12, fontWeight: 600 }}>Loading map…</div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{
          width: '100%', maxWidth: 540, background: 'white', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
          padding: '1.25rem', pointerEvents: 'auto', maxHeight: '70vh', overflowY: 'auto', transition: 'transform 0.3s ease, opacity 0.3s ease'
        }}>
          {mapError && (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <span>{mapError}</span>
              <button onClick={() => window.location.reload()} style={{ border: 'none', background: '#991b1b', color: 'white', borderRadius: 6, padding: '0.35rem 0.75rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>Retry</button>
            </div>
          )}
          {renderScreen()}
        </div>
      </div>
    </div>
  );
}
