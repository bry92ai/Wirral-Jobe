import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import logo from '../assets/logo.jpg';

const SESSION_KEY = 'wirralCustomerToken';

function dateLabel(value) {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerPage() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [places, setPlaces] = useState([]);
  const [tab, setTab] = useState('future');
  const [placeForm, setPlaceForm] = useState({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const token = () => localStorage.getItem(SESSION_KEY) || '';

  useEffect(() => {
    if (token()) loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true); setError('');
    try {
      const [me, jobData, placeData] = await Promise.all([
        api('customer/me', { customerToken: token() }),
        api('customer/jobs', { customerToken: token() }),
        api('customer/places', { customerToken: token() })
      ]);
      setCustomer(me.customer); setJobs(jobData.jobs || []); setPlaces(placeData.places || []);
    } catch (err) {
      localStorage.removeItem(SESSION_KEY); setCustomer(null);
      if (err.message !== 'Customer session expired. Please log in again.') setError(err.message);
    } finally { setLoading(false); }
  }

  async function submitAuth(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      const endpoint = mode === 'register' ? 'customer/register' : 'customer/login';
      const body = mode === 'register' ? { name, phone, pin } : { phone, pin };
      const result = await api(endpoint, body);
      localStorage.setItem(SESSION_KEY, result.customerToken);
      setCustomer(result.customer); setPin(''); setMessage(mode === 'register' ? 'Your customer account is ready.' : '');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function resetPin() {
    if (!phone) { setError('Enter your mobile number first.'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const result = await api('customer/forgot-pin', { phone });
      setMessage(result.developmentPin ? `Your new PIN is ${result.developmentPin}.` : 'If an account exists, a new PIN has been sent by SMS.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function savePlace(event) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const result = await api('customer/places/add', { customerToken: token(), ...placeForm, lat: Number(placeForm.lat), lng: Number(placeForm.lng) });
      setPlaces(current => [...current, result.place]);
      setPlaceForm({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function removePlace(placeId) {
    setLoading(true); setError('');
    try {
      await api('customer/places/delete', { customerToken: token(), placeId });
      setPlaces(current => current.filter(place => place.id !== placeId));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function logout() { localStorage.removeItem(SESSION_KEY); setCustomer(null); setJobs([]); setPlaces([]); setMode('login'); }

  if (!customer) {
    return <div className="wj-shell"><div className="wj-frame wj-customer-auth">
      <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
      <div className="wj-customer-kicker">Customer portal</div>
      <h1 className="wj-title">{mode === 'register' ? 'Create account' : 'Welcome back'}</h1>
      <p className="wj-subtitle">{mode === 'register' ? 'Create a secure PIN to manage your bookings.' : 'Use your mobile number and PIN to manage your bookings.'}</p>
      <form onSubmit={submitAuth}>
        {mode === 'register' && <div className="form-group"><label>Your name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus /></div>}
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus={mode !== 'register'} /></div>
        <div className="form-group"><label>{mode === 'register' ? 'Choose a 6-digit PIN' : 'Your PIN'}</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}</button>
      </form>
      {mode === 'login' && <button className="wj-text-button" onClick={resetPin} disabled={loading}>Forgot my PIN?</button>}
      <button className="wj-text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }} disabled={loading}>{mode === 'login' ? 'New here? Create an account' : 'Already registered? Log in'}</button>
      <Link to="/" className="wj-portal-back">← Back to booking</Link>
    </div></div>;
  }

  const now = Date.now();
  const futureJobs = jobs.filter(job => new Date(job.pickupTime).getTime() >= now && !['COMPLETE', 'CANCELLED'].includes(job.status));
  const pastJobs = jobs.filter(job => new Date(job.pickupTime).getTime() < now || ['COMPLETE', 'CANCELLED'].includes(job.status));
  const shownJobs = tab === 'future' ? futureJobs : pastJobs;

  return <div className="wj-shell"><div className="wj-frame wj-customer-dashboard">
    <header className="wj-customer-header"><img src={logo} alt="The Wirral Jobe" /><div><span>Customer portal</span><strong>{customer.name}</strong></div><button className="wj-header-logout" onClick={logout}>Log out</button></header>
    <Link to="/" className="wj-customer-book">Book a ride <b>›</b></Link>
    {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
    <section className="wj-customer-section"><h2>Your bookings</h2><div className="wj-customer-tabs"><button className={tab === 'future' ? 'active' : ''} onClick={() => setTab('future')}>Future ({futureJobs.length})</button><button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>Past ({pastJobs.length})</button></div>
      {shownJobs.length === 0 ? <p className="wj-customer-empty">No {tab} bookings yet.</p> : shownJobs.map(job => <article className="wj-customer-job" key={job.jobId}><div><span className={`badge status-${job.status}`}>{job.status.replace('_', ' ')}</span><time>{dateLabel(job.pickupTime)}</time></div><strong>{job.pickupAddress}</strong><i>↓</i><strong>{job.dropoffAddress}</strong><footer><span>{job.vehicleType === 'mpv' ? 'MPV' : 'Saloon / estate'}</span><b>Maximum £{job.fare.toFixed(2)}</b></footer></article>)}
    </section>
    <section className="wj-customer-section"><h2>Saved places</h2><p className="wj-customer-copy">Save your regular pickup and drop-off locations for future bookings.</p>
      <div className="wj-saved-places">{places.length === 0 && <p className="wj-customer-empty">No saved places yet.</p>}{places.map(place => <article key={place.id}><span>{place.type === 'pickup' ? '↑' : '↓'}</span><div><strong>{place.label}</strong><small>{place.address}</small></div><button onClick={() => removePlace(place.id)} disabled={loading} aria-label={`Remove ${place.label}`}>×</button></article>)}</div>
      <form className="wj-place-form" onSubmit={savePlace}><div className="form-group"><label>Place name</label><input value={placeForm.label} onChange={e => setPlaceForm({ ...placeForm, label: e.target.value })} placeholder="e.g. Home" /></div><div className="form-group"><label>Address</label><input value={placeForm.address} onChange={e => setPlaceForm({ ...placeForm, address: e.target.value })} placeholder="Full address" /></div><div className="wj-place-coordinates"><div className="form-group"><label>Latitude</label><input type="number" step="any" value={placeForm.lat} onChange={e => setPlaceForm({ ...placeForm, lat: e.target.value })} placeholder="53.39" /></div><div className="form-group"><label>Longitude</label><input type="number" step="any" value={placeForm.lng} onChange={e => setPlaceForm({ ...placeForm, lng: e.target.value })} placeholder="-3.02" /></div></div><div className="wj-place-type"><button type="button" className={placeForm.type === 'pickup' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'pickup' })}>Pickup</button><button type="button" className={placeForm.type === 'dropoff' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'dropoff' })}>Drop-off</button></div><button className="btn btn-outline" disabled={loading}>Save place</button></form>
    </section>
  </div></div>;
}
