import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import logo from '../assets/logo.jpg';

const SESSION_KEY = 'wirralCustomerToken';

function dateLabel(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotPin, setForgotPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [places, setPlaces] = useState([]);
  const [tab, setTab] = useState('future');
  const [placeForm, setPlaceForm] = useState({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
  const [registerPlaces, setRegisterPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [authStep, setAuthStep] = useState('login');

  const token = () => localStorage.getItem(SESSION_KEY) || '';

  useEffect(() => {
    if (token()) loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (customer) navigate('/', { replace: true });
  }, [customer, navigate]);

  function resetForm() {
    setName(''); setPhone(''); setEmail(''); setOtp(''); setPin(''); setConfirmPin('');
    setForgotOtp(''); setForgotPin(''); setForgotConfirmPin(''); setRegisterPlaces([]);
    setPlaceForm({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
  }

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
      setCustomer(result.customer); setPin('');
      setMessage('Welcome back.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function requestRegisterOtp(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
    if (!phone.trim()) { setError('Please enter your mobile number.'); setLoading(false); return; }
    try {
      await api('customer/request-otp', { name, phone, email });
      setMessage('Please check your phone for the verification code.');
      setAuthStep('register-otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function addRegisterPlace(event) {
    event.preventDefault();
    if (!placeForm.label.trim() || !placeForm.address.trim()) {
      setError('Please enter a place name and address.');
      return;
    }
    setRegisterPlaces(prev => [...prev, { ...placeForm, lat: Number(placeForm.lat) || 0, lng: Number(placeForm.lng) || 0 }]);
    setPlaceForm({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
    setError('');
  }

  async function finishRegistration(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (pin !== confirmPin) { setError('PINs do not match.'); setLoading(false); return; }
    try {
      const result = await api('customer/register', { name, phone, email, otp, pin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      for (const p of registerPlaces) {
        await api('customer/places/add', { customerToken: result.customerToken, ...p });
      }
      setCustomer(result.customer); resetForm();
      setMessage('Your account is ready.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function requestForgotPin(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (!phone.trim()) { setError('Please enter your mobile number.'); setLoading(false); return; }
    try {
      await api('customer/forgot-pin-otp', { phone });
      setMessage('Check your phone for the verification code.');
      setAuthStep('forgot-otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function resetForgotPin(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (!/^\d{6}$/.test(forgotOtp)) { setError('Please enter the 6-digit verification code.'); setLoading(false); return; }
    if (forgotPin !== forgotConfirmPin) { setError('PINs do not match.'); setLoading(false); return; }
    if (!/^\d{6}$/.test(forgotPin)) { setError('Choose a 6-digit PIN.'); setLoading(false); return; }
    try {
      const result = await api('customer/reset-pin', { phone, otp: forgotOtp, pin: forgotPin, confirmPin: forgotConfirmPin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      setCustomer(result.customer); resetForm();
      setMessage('Your PIN has been reset.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function continueToPin(event) {
    event.preventDefault(); setMessage(''); setAuthStep('register-pin');
  }

  function continueToPlaces(event) {
    event.preventDefault();
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    setError(''); setMessage(''); setAuthStep('register-places');
  }

  async function logout() {
    try { await api('customer/logout', { customerToken: token() }); } catch {}
    localStorage.removeItem(SESSION_KEY); setCustomer(null); setJobs([]); setPlaces([]);
    setAuthStep('login'); resetForm();
  }

  function switchMode(next) {
    setAuthStep(next);
    setError(''); setMessage('');
  }

  async function savePlace(event) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      await api('customer/places/add', { customerToken: token(), ...placeForm });
      setPlaceForm({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
      setMessage('Place saved.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function removePlace(id) {
    if (!window.confirm('Remove this saved place?')) return;
    setLoading(true); setError('');
    try {
      await api('customer/places/delete', { customerToken: token(), placeId: id });
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (!customer) {
    return <div className="wj-shell"><div className="wj-frame wj-customer-auth">
      <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
      <div className="wj-customer-kicker">Customer portal</div>
      <h1 className="wj-title">
        {authStep === 'login' && 'Log in'}
        {authStep === 'register-details' && 'Create account'}
        {authStep === 'register-otp' && 'Verify your number'}
        {authStep === 'register-pin' && 'Create your PIN'}
        {authStep === 'register-places' && 'Saved places (optional)'}
        {authStep === 'forgot' && 'Reset your PIN'}
        {authStep === 'forgot-otp' && 'Choose a new PIN'}
      </h1>
      <p className="wj-subtitle">
        {authStep === 'login' && 'Use your mobile number and PIN to manage your bookings.'}
        {authStep === 'register-details' && 'Enter your details and we will text you a verification code.'}
        {authStep === 'register-otp' && 'Enter the 6-digit code we sent to your mobile.'}
        {authStep === 'register-pin' && 'Choose a secure 6-digit PIN for future logins.'}
        {authStep === 'register-places' && 'Add frequent destinations now, or skip and do it later.'}
        {authStep === 'forgot' && 'We will text a verification code to your mobile number.'}
        {authStep === 'forgot-otp' && 'Enter the code we sent you and set a new 6-digit PIN.'}
      </p>

      {authStep === 'login' && <form onSubmit={submitAuth}>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus required /></div>
        <div className="form-group"><label>PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Log in'}</button>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <p style={{ marginBottom: 8, color: 'var(--muted)' }}>First time here?</p>
          <button type="button" className="btn btn-outline" onClick={() => switchMode('register-details')} disabled={loading} style={{ width: '100%' }}>Create an account</button>
        </div>
        <div className="wj-customer-links" style={{ marginTop: 16 }}>
          <button type="button" className="wj-text-button" onClick={() => switchMode('forgot')} disabled={loading}>Forgot PIN? Text me a new one</button>
          <Link to="/" className="wj-portal-back">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-details' && <form onSubmit={requestRegisterOtp}>
        <div className="form-group"><label>Your name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus required /></div>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" required /></div>
        <div className="form-group"><label>Email address (optional)</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Send verification code'}</button>
        <div className="wj-customer-links" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button" onClick={() => switchMode('login')} disabled={loading}>Already registered? Log in</button>
          <Link to="/" className="wj-portal-back">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-otp' && <form onSubmit={continueToPin}>
        <div className="form-group"><label>Verification code</label><input inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading || otp.length !== 6}>{loading ? 'Please wait…' : 'Continue'}</button>
        <div className="wj-customer-links" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button" onClick={() => switchMode('login')} disabled={loading}>Already registered? Log in</button>
          <Link to="/" className="wj-portal-back">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-pin' && <form onSubmit={continueToPlaces}>
        <div className="form-group"><label>Create a 6-digit PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" autoFocus required /></div>
        <div className="form-group"><label>Confirm PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Continue'}</button>
      </form>}

      {authStep === 'register-places' && <form onSubmit={finishRegistration}>
        {registerPlaces.length > 0 && <div className="wj-saved-places" style={{ marginBottom: 16 }}>
          {registerPlaces.map((p, i) => <article key={i}><span>{p.type === 'pickup' ? '↑' : '↓'}</span><div><strong>{p.label}</strong><small>{p.address}</small></div><button type="button" onClick={() => setRegisterPlaces(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${p.label}`}>×</button></article>)}
        </div>}
        <div className="form-group"><label>Place name</label><input value={placeForm.label} onChange={e => setPlaceForm({ ...placeForm, label: e.target.value })} placeholder="e.g. Home" /></div>
        <div className="form-group"><label>Address</label><input value={placeForm.address} onChange={e => setPlaceForm({ ...placeForm, address: e.target.value })} placeholder="Full address" /></div>
        <div className="wj-place-coordinates"><div className="form-group"><label>Latitude</label><input type="number" step="any" value={placeForm.lat} onChange={e => setPlaceForm({ ...placeForm, lat: e.target.value })} placeholder="53.39" /></div><div className="form-group"><label>Longitude</label><input type="number" step="any" value={placeForm.lng} onChange={e => setPlaceForm({ ...placeForm, lng: e.target.value })} placeholder="-3.02" /></div></div>
        <div className="wj-place-type"><button type="button" className={placeForm.type === 'pickup' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'pickup' })}>Pickup</button><button type="button" className={placeForm.type === 'dropoff' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'dropoff' })}>Drop-off</button></div>
        <button type="button" className="btn btn-outline" disabled={loading} onClick={addRegisterPlace} style={{ marginBottom: 12 }}>Add another place</button>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Finish & create account'}</button>
        <p style={{ textAlign: 'center', marginTop: 8 }}><button type="button" className="wj-text-button" onClick={finishRegistration} disabled={loading}>Skip this step</button></p>
      </form>}

      {authStep === 'forgot' && <form onSubmit={requestForgotPin}>
        <div className="form-group"><label>Mobile number</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Send verification code'}</button>
        <div className="wj-customer-links" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button" onClick={() => switchMode('login')} disabled={loading}>Back to log in</button>
          <Link to="/" className="wj-portal-back">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'forgot-otp' && <form onSubmit={resetForgotPin}>
        <div className="form-group"><label>Verification code</label><input inputMode="numeric" pattern="[0-9]{6}" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        <div className="form-group"><label>New 6-digit PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={forgotPin} onChange={e => setForgotPin(e.target.value)} placeholder="6-digit PIN" required /></div>
        <div className="form-group"><label>Confirm new PIN</label><input inputMode="numeric" pattern="[0-9]{6}" type="password" value={forgotConfirmPin} onChange={e => setForgotConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait…' : 'Save PIN'}</button>
        <div className="wj-customer-links" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button" onClick={() => switchMode('forgot')} disabled={loading}>Resend code</button>
          <Link to="/" className="wj-portal-back">← Back to booking</Link>
        </div>
      </form>}
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
      {shownJobs.length === 0 ? <p className="wj-customer-empty">No {tab} bookings yet.</p> : shownJobs.map(job => <article className="wj-customer-job" key={job.jobId}><div><span className={`badge status-${job.status || 'NEW'}`}>{(job.status || 'NEW').replace('_', ' ')}</span><time>{dateLabel(job.pickupTime)}</time></div><strong>{job.pickupAddress}</strong><i>↓</i><strong>{job.dropoffAddress}</strong><footer><span>{job.vehicleType === 'mpv' ? 'MPV' : 'Saloon / estate'}</span><b>Maximum £{Number(job.fare || 0).toFixed(2)}</b></footer></article>)}
    </section>
    <section className="wj-customer-section"><h2>Saved places</h2><p className="wj-customer-copy">Save your regular pickup and drop-off locations for future bookings.</p>
      <div className="wj-saved-places">{places.length === 0 && <p className="wj-customer-empty">No saved places yet.</p>}{places.map(place => <article key={place.id}><span>{place.type === 'pickup' ? '↑' : '↓'}</span><div><strong>{place.label}</strong><small>{place.address}</small></div><button onClick={() => removePlace(place.id)} disabled={loading} aria-label={`Remove ${place.label}`}>×</button></article>)}</div>
      <form className="wj-place-form" onSubmit={savePlace}><div className="form-group"><label>Place name</label><input value={placeForm.label} onChange={e => setPlaceForm({ ...placeForm, label: e.target.value })} placeholder="e.g. Home" /></div><div className="form-group"><label>Address</label><input value={placeForm.address} onChange={e => setPlaceForm({ ...placeForm, address: e.target.value })} placeholder="Full address" /></div><div className="wj-place-coordinates"><div className="form-group"><label>Latitude</label><input type="number" step="any" value={placeForm.lat} onChange={e => setPlaceForm({ ...placeForm, lat: e.target.value })} placeholder="53.39" /></div><div className="form-group"><label>Longitude</label><input type="number" step="any" value={placeForm.lng} onChange={e => setPlaceForm({ ...placeForm, lng: e.target.value })} placeholder="-3.02" /></div></div><div className="wj-place-type"><button type="button" className={placeForm.type === 'pickup' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'pickup' })}>Pickup</button><button type="button" className={placeForm.type === 'dropoff' ? 'active' : ''} onClick={() => setPlaceForm({ ...placeForm, type: 'dropoff' })}>Drop-off</button></div><button className="btn btn-outline" disabled={loading}>Save place</button></form>
    </section>
  </div></div>;
}
