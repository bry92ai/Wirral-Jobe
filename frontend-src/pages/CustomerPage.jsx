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
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [places, setPlaces] = useState([]);
  const [tab, setTab] = useState('future');
  const [placeForm, setPlaceForm] = useState({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [authStep, setAuthStep] = useState('login');

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
      const result = await api('customer/login', { phone, pin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      setCustomer(result.customer); setPin(''); setOtp('');
      setMessage('Welcome back.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function requestRegisterOtp(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      const result = await api('customer/request-otp', { name, phone, email });
      setOtp(result.otp);
      setMessage(`Your verification code is ${result.otp}. (SMS not enabled yet.)`);
      setAuthStep('register-otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function submitRegister(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (pin !== confirmPin) { setError('PINs do not match.'); setLoading(false); return; }
    try {
      const result = await api('customer/register', { name, phone, email, otp, pin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      setCustomer(result.customer);
      setPin(''); setConfirmPin(''); setOtp('');
      setMessage('Your account is ready.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function requestForgotOtp(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      const result = await api('customer/request-otp', { name: 'Reset', phone, email: '' });
      setOtp(result.otp);
      setMessage(`Your reset code is ${result.otp}. (SMS not enabled yet.)`);
      setAuthStep('forgot-otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function submitForgotPin(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (pin !== confirmPin) { setError('PINs do not match.'); setLoading(false); return; }
    try {
      const result = await api('customer/forgot-pin', { phone, otp, pin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      const me = await api('customer/me', { customerToken: result.customerToken });
      setCustomer(me.customer);
      setPin(''); setConfirmPin(''); setOtp('');
      setMessage('Your PIN has been reset.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function logout() {
    try { await api('customer/logout', { customerToken: token() }); } catch {}
    localStorage.removeItem(SESSION_KEY); setCustomer(null); setJobs([]); setPlaces([]);
    setMode('login'); setAuthStep('login'); setPin(''); setConfirmPin(''); setOtp('');
  }

  function switchMode(next) {
    setMode(next); setAuthStep(next === 'login' ? 'login' : next === 'register' ? 'register-details' : 'forgot-details');
    setError(''); setMessage(''); setOtp(''); setPin(''); setConfirmPin('');
  }

  if (!customer) {
    return <div className="wj-shell"><div className="wj-frame wj-customer-auth">
      <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
      <div className="wj-customer-kicker">Customer portal</div>
      <h1 className="wj-title">{authStep === 'login' ? 'Welcome back' : authStep.startsWith('register') ? 'Create account' : 'Reset PIN'}</h1>
      <p className="wj-subtitle">{authStep === 'login' ? 'Use your mobile number and PIN to manage your bookings.' : authStep.startsWith('register') ? 'Verify your mobile number and create a secure PIN.' : 'Verify your mobile number and choose a new PIN.'}</p>

      {authStep === 'login' && <form onSubmit={submitAuth}>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus /></div>
        <div className="form-group"><label>Your PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Log in'}</button>
      </form>}

      {authStep === 'register-details' && <form onSubmit={requestRegisterOtp}>
        <div className="form-group"><label>Your name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus required /></div>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" required /></div>
        <div className="form-group"><label>Email address (optional)</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Send verification code'}</button>
      </form>}

      {authStep === 'register-otp' && <form onSubmit={submitRegister}>
        <div className="form-group"><label>Verification code</label><input inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        <div className="form-group"><label>Create a 6-digit PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" required /></div>
        <div className="form-group"><label>Confirm PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Create account'}</button>
      </form>}

      {authStep === 'forgot-details' && <form onSubmit={requestForgotOtp}>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus required /></div>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Send reset code'}</button>
      </form>}

      {authStep === 'forgot-otp' && <form onSubmit={submitForgotPin}>
        <div className="form-group"><label>Reset code</label><input inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        <div className="form-group"><label>New 6-digit PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" required /></div>
        <div className="form-group"><label>Confirm PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Reset PIN'}</button>
      </form>}

      <div className="wj-customer-links">
        {authStep.startsWith('register') || authStep.startsWith('forgot')
          ? <button className="wj-text-button" onClick={() => switchMode('login')} disabled={loading}>Already registered? Log in</button>
          : <>
              <button className="wj-text-button" onClick={() => switchMode('register')} disabled={loading}>New here? Create an account</button>
              <button className="wj-text-button" onClick={() => switchMode('forgot')} disabled={loading}>Forgot PIN?</button>
            </>}
        <Link to="/" className="wj-portal-back">← Back to booking</Link>
      </div>
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
