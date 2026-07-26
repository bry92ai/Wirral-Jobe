import { useEffect, useState } from 'react';
import { api, apiGet } from '../lib/api.js';
import { loadGoogleMapsScript } from '../lib/maps.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const CH49 = { lat: 53.385, lng: -3.093 };
const LIVERPOOL_AIRPORT = { lat: 53.3331, lng: -2.8496 };

function TestCard({ title, detail, status, result, onRun, children }) {
  const tone = status === 'pass' ? '#4ade80' : status === 'fail' ? '#f87171' : status === 'running' ? '#facc15' : '#a8a29e';
  return <section style={{ border: '1px solid #39352d', borderRadius: 12, padding: '1rem', background: '#171512', marginBottom: '0.85rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
      <div><h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2><p style={{ margin: '0.35rem 0 0', color: '#b7b0a3', fontSize: '0.88rem' }}>{detail}</p></div>
      <strong style={{ color: tone, textTransform: 'uppercase', fontSize: '0.75rem' }}>{status || 'idle'}</strong>
    </div>
    {children}
    <button onClick={onRun} disabled={status === 'running'} className="btn btn-primary" style={{ marginTop: '0.8rem' }}>{status === 'running' ? 'Running…' : 'Run test'}</button>
    {result && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0.8rem 0 0', padding: '0.7rem', borderRadius: 8, background: '#0d0c0a', color: tone, fontSize: '0.78rem' }}>{result}</pre>}
  </section>;
}

export default function StatusPage() {
  const [tests, setTests] = useState({});
  const [query, setQuery] = useState('Tesco CH49');
  const [predictions, setPredictions] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [password, setPassword] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!token) return;
    apiGet('/admin/jobs', { 'x-admin-token': token }).then(() => setAuthorised(true)).catch(() => {
      localStorage.removeItem('adminToken');
      setToken('');
    });
  }, [token]);

  async function login(event) {
    event.preventDefault();
    setAuthError('');
    try {
      const result = await api('admin/login', { password });
      localStorage.setItem('adminToken', result.token);
      setToken(result.token);
      setPassword('');
    } catch (err) {
      setAuthError(err.message);
    }
  }

  function setTest(name, state) { setTests(current => ({ ...current, [name]: state })); }
  async function run(name, fn) {
    setTest(name, { status: 'running', result: '' });
    try { setTest(name, { status: 'pass', result: await fn() }); }
    catch (err) { setTest(name, { status: 'fail', result: err.message || String(err) }); }
  }

  function googleAutocomplete() {
    return new Promise((resolve, reject) => {
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions({ input: query, componentRestrictions: { country: 'gb' }, location: new window.google.maps.LatLng(CH49.lat, CH49.lng), radius: 50000 }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
        if (status !== window.google.maps.places.PlacesServiceStatus.OK) return reject(new Error(`Places status: ${status}`));
        resolve(results || []);
      });
    });
  }

  async function runPlaces() {
    await loadGoogleMapsScript(GOOGLE_MAPS_API_KEY);
    const results = await googleAutocomplete();
    setPredictions(results);
    return `${results.length} Google Places suggestion(s) returned for “${query}”.`;
  }

  async function runPlaceDetails(placeId) {
    await run('details', () => new Promise((resolve, reject) => {
      const service = new window.google.maps.places.PlacesService(document.createElement('div'));
      service.getDetails({ placeId, fields: ['formatted_address', 'geometry', 'name'] }, (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return reject(new Error(`Place Details status: ${status}`));
        resolve(`${place.formatted_address}\n${place.geometry.location.lat()}, ${place.geometry.location.lng()}`);
      });
    }));
  }

  if (!authorised) return <div className="wj-shell"><div className="wj-frame" style={{ maxWidth: 380 }}><h1 className="wj-title" style={{ textAlign: 'center', fontSize: '1.3rem' }}>Diagnostics access</h1><form onSubmit={login}><div className="form-group"><label>Admin password</label><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></div><button type="submit" className="btn btn-primary">Log in</button>{authError && <p className="error">{authError}</p>}</form></div></div>;

  return <div style={{ maxWidth: 760, margin: '0 auto', padding: '1rem 0 2rem' }}>
    <h1 style={{ marginBottom: '0.35rem' }}>System status checks</h1>
    <p style={{ marginTop: 0, color: '#b7b0a3' }}>Manual tests only. No bookings, drivers, or customer records are created.</p>

    <TestCard title="Google Maps API key" detail="Confirms that the deployed frontend received VITE_GOOGLE_MAPS_API_KEY." status={tests.key?.status} result={tests.key?.result} onRun={() => run('key', async () => GOOGLE_MAPS_API_KEY ? `Key is present (${GOOGLE_MAPS_API_KEY.slice(0, 8)}…).` : Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not configured in this deployment.')))} />
    <TestCard title="Maps JavaScript API" detail="Loads the Google Maps JavaScript library used by the booking page." status={tests.maps?.status} result={tests.maps?.result} onRun={() => run('maps', async () => { await loadGoogleMapsScript(GOOGLE_MAPS_API_KEY); return 'Google Maps JavaScript API loaded successfully.'; })} />
    <TestCard title="Google Places Autocomplete" detail="Searches Places near CH49. Select a result below to test Place Details." status={tests.places?.status} result={tests.places?.result} onRun={runPlaces}>
      <input value={query} onChange={event => setQuery(event.target.value)} aria-label="Places search query" style={{ width: '100%', boxSizing: 'border-box', marginTop: '0.85rem', padding: '0.7rem', borderRadius: 8 }} />
      {predictions.length > 0 && <div style={{ marginTop: '0.75rem' }}>{predictions.map(place => <button key={place.place_id} onClick={() => runPlaceDetails(place.place_id)} className="btn btn-outline" style={{ width: '100%', textAlign: 'left', marginBottom: '0.4rem' }}>{place.description}</button>)}</div>}
    </TestCard>
    <TestCard title="Google Place Details" detail="Run a Places Autocomplete search and select a result to test exact address and coordinates." status={tests.details?.status} result={tests.details?.result} onRun={() => run('details', () => Promise.reject(new Error('Select a prediction from the Google Places test first.')))} />
    <TestCard title="Google Routes API" detail="Calculates a route from CH49 to Liverpool John Lennon Airport." status={tests.routes?.status} result={tests.routes?.result} onRun={() => run('routes', async () => {
      if (!GOOGLE_MAPS_API_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not configured.');
      const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' }, body: JSON.stringify({ origin: { location: { latLng: { latitude: CH49.lat, longitude: CH49.lng } } }, destination: { location: { latLng: { latitude: LIVERPOOL_AIRPORT.lat, longitude: LIVERPOOL_AIRPORT.lng } } }, travelMode: 'DRIVE' }) });
      const data = await response.json();
      if (!response.ok || !data.routes?.[0]) throw new Error(data.error?.message || `Routes request failed (${response.status}).`);
      return `${(data.routes[0].distanceMeters / 1609.344).toFixed(1)} miles, ${data.routes[0].duration}.`;
    })} />
    <TestCard title="Booking backend" detail="Checks that the deployed frontend can reach the public driver list endpoint. No data is changed." status={tests.backend?.status} result={tests.backend?.result} onRun={() => run('backend', async () => { const data = await apiGet('/drivers'); return `Backend responded with ${(data.drivers || []).length} driver record(s).`; })} />
  </div>;
}
