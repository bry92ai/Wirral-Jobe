import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import logo from '../assets/logo.jpg';

const SESSION_KEY = 'wirralCustomerToken';

function dateLabel(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
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
  const [cancellingJob, setCancellingJob] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const token = () => localStorage.getItem(SESSION_KEY) || '';

  function registerPushToken(customerToken) {
    const fcmToken = localStorage.getItem('fcmToken');
    if (!fcmToken) return;
    api('customer/register-push', { customerToken, fcmToken }).catch(err => console.error('Customer push registration failed:', err));
  }

  useEffect(() => {
    if (token()) loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      registerPushToken(result.customerToken);
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
    const lat = Number(placeForm.lat);
    const lng = Number(placeForm.lng);
    if (!placeForm.label.trim() || !placeForm.address.trim()) {
      setError('Please enter a place name and address.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Please enter valid latitude and longitude coordinates.');
      return;
    }
    setRegisterPlaces(prev => [...prev, { ...placeForm, lat, lng }]);
    setPlaceForm({ label: '', address: '', lat: '', lng: '', type: 'pickup' });
    setError('');
  }

  async function finishRegistration(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    if (pin !== confirmPin) { setError('PINs do not match.'); setLoading(false); return; }
    try {
      const result = await api('customer/register', { name, phone, email, otp, pin });
      localStorage.setItem(SESSION_KEY, result.customerToken);
      registerPushToken(result.customerToken);
      let failedPlaces = 0;
      for (const p of registerPlaces) {
        try { await api('customer/places/add', { customerToken: result.customerToken, ...p }); }
        catch { failedPlaces += 1; }
      }
      setCustomer(result.customer); resetForm();
      setMessage(failedPlaces ? `Your account is ready. ${failedPlaces} saved place${failedPlaces === 1 ? '' : 's'} could not be added.` : 'Your account is ready.');
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
      registerPushToken(result.customerToken);
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
    try { await api('customer/logout', { customerToken: token() }); } catch (err) { console.error(err); }
    localStorage.removeItem(SESSION_KEY); setCustomer(null); setJobs([]); setPlaces([]);
    setAuthStep('login'); resetForm();
  }

  async function deleteAccount() {
    if (!window.confirm('Permanently delete your Wirral Jobe account and saved places? Completed journey records will be anonymised where they must be retained.')) return;
    setLoading(true); setError('');
    try {
      await api('customer/delete-account', { customerToken: token() });
      localStorage.removeItem(SESSION_KEY); setCustomer(null); setJobs([]); setPlaces([]);
      setAuthStep('login'); resetForm();
      setMessage('Your account has been deleted.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function switchMode(next) {
    setAuthStep(next);
    setError(''); setMessage('');
  }

  async function savePlace(event) {
    event.preventDefault(); setLoading(true); setError('');
    const lat = Number(placeForm.lat);
    const lng = Number(placeForm.lng);
    if (!placeForm.label.trim() || !placeForm.address.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Please provide a place name, address and valid coordinates.');
      setLoading(false);
      return;
    }
    try {
      await api('customer/places/add', { customerToken: token(), ...placeForm, lat, lng });
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

  async function cancelJob(jobId) {
    if (!cancelReason) { setError('Please choose a reason'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      await api('customer/cancel-job', { customerToken: token(), jobId, reason: cancelReason });
      setCancellingJob(null); setCancelReason('');
      setMessage('Booking cancelled.');
      await loadDashboard();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const CANCEL_REASONS = ['Plans changed', 'Booked accidentally', 'No longer travelling', 'Driver taking too long', 'Other'];

  if (!customer) {
    return <div className="wj-shell wj-obsidian-shell"><div className="wj-frame wj-gilt-frame wj-customer-auth wj-auth-chamber">
      <nav className="wj-customer-topnav"><Link className="active" to="/">Book</Link><Link to="/driver">Driver</Link></nav>
      <img src={logo} alt="The Wirral Jobe" className="wj-logo wj-logo-alive wj-gold-logo wj-logo-float" />
      <div className="wj-customer-kicker wj-portal-eyebrow">Customer portal</div>
      <h1 className="wj-title wj-gold-display">
        {authStep === 'login' && 'Log in'}
        {authStep === 'register-details' && 'Create account'}
        {authStep === 'register-otp' && 'Verify your number'}
        {authStep === 'register-pin' && 'Create your PIN'}
        {authStep === 'register-places' && 'Saved places (optional)'}
        {authStep === 'forgot' && 'Reset your PIN'}
        {authStep === 'forgot-otp' && 'Choose a new PIN'}
      </h1>
      <p className="wj-subtitle wj-champagne-subtitle">
        {authStep === 'login' && 'Use your mobile number and PIN to manage your bookings.'}
        {authStep === 'register-details' && 'Enter your details and we will text you a verification code.'}
        {authStep === 'register-otp' && 'Enter the 6-digit code we sent to your mobile.'}
        {authStep === 'register-pin' && 'Choose a secure 6-digit PIN for future logins.'}
        {authStep === 'register-places' && 'Add frequent destinations now, or skip and do it later.'}
        {authStep === 'forgot' && 'We will text a verification code to your mobile number.'}
        {authStep === 'forgot-otp' && 'Enter the code we sent you and set a new 6-digit PIN.'}
      </p>

      {authStep === 'login' && <form className="wj-auth-form wj-login-form" onSubmit={submitAuth}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Mobile number</label><input className="wj-obsidian-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">PIN</label><div className="wj-password-field"><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" type={showPin ? 'text' : 'password'} value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" required /><button type="button" onClick={() => setShowPin(value => !value)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}>{showPin ? 'Hide' : 'Show'}</button></div></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Log in'}</button>
        <div className="wj-auth-switch" style={{ marginTop: 24, textAlign: 'center' }}>
          <p className="wj-auth-switch-text" style={{ marginBottom: 8, color: 'var(--muted)' }}>First time here?</p>
          <button type="button" className="btn btn-outline wj-champagne-ghost" onClick={() => switchMode('register-details')} disabled={loading} style={{ width: '100%' }}>Create an account</button>
        </div>
        <div className="wj-customer-links wj-auth-footer" style={{ marginTop: 16 }}>
          <button type="button" className="wj-text-button wj-gold-link" onClick={() => switchMode('forgot')} disabled={loading}>Forgot PIN? Text me a new one</button>
          <Link to="/" className="wj-portal-back wj-portal-return">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-details' && <form className="wj-auth-form wj-register-form" onSubmit={requestRegisterOtp}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Your name</label><input className="wj-obsidian-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Mobile number</label><input className="wj-obsidian-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Email address (optional)</label><input className="wj-obsidian-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Send verification code'}</button>
        <div className="wj-customer-links wj-auth-footer" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button wj-gold-link" onClick={() => switchMode('login')} disabled={loading}>Already registered? Log in</button>
          <Link to="/" className="wj-portal-back wj-portal-return">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-otp' && <form className="wj-auth-form wj-otp-form" onSubmit={continueToPin}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Verification code</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading || otp.length !== 6}>{loading ? 'Please wait…' : 'Continue'}</button>
        <div className="wj-customer-links wj-auth-footer" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button wj-gold-link" onClick={() => switchMode('login')} disabled={loading}>Already registered? Log in</button>
          <Link to="/" className="wj-portal-back wj-portal-return">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'register-pin' && <form className="wj-auth-form wj-pin-form" onSubmit={continueToPlaces}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Create a 6-digit PIN</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-digit PIN" autoFocus required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Confirm PIN</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Continue'}</button>
      </form>}

      {authStep === 'register-places' && <form className="wj-auth-form wj-places-form" onSubmit={finishRegistration}>
        {registerPlaces.length > 0 && <div className="wj-saved-places wj-place-gallery" style={{ marginBottom: 16 }}>
          {registerPlaces.map((p, i) => <article className="wj-place-card wj-auth-place-card" key={i}><span className="wj-place-arrow">{p.type === 'pickup' ? '↑' : '↓'}</span><div className="wj-place-copy"><strong>{p.label}</strong><small>{p.address}</small></div><button className="wj-place-remove" type="button" onClick={() => setRegisterPlaces(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${p.label}`}>×</button></article>)}
        </div>}
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Place name</label><input className="wj-obsidian-input" value={placeForm.label} onChange={e => setPlaceForm({ ...placeForm, label: e.target.value })} placeholder="e.g. Home" /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Address</label><input className="wj-obsidian-input" value={placeForm.address} onChange={e => setPlaceForm({ ...placeForm, address: e.target.value })} placeholder="Full address" /></div>
        <div className="wj-place-coordinates wj-coordinates-row"><div className="form-group wj-gilt-field"><label className="wj-gold-label">Latitude</label><input className="wj-obsidian-input" type="number" step="any" value={placeForm.lat} onChange={e => setPlaceForm({ ...placeForm, lat: e.target.value })} placeholder="53.39" /></div><div className="form-group wj-gilt-field"><label className="wj-gold-label">Longitude</label><input className="wj-obsidian-input" type="number" step="any" value={placeForm.lng} onChange={e => setPlaceForm({ ...placeForm, lng: e.target.value })} placeholder="-3.02" /></div></div>
        <div className="wj-place-type wj-place-type-toggle"><button type="button" className={`${placeForm.type === 'pickup' ? 'active' : ''} wj-place-type-btn`} onClick={() => setPlaceForm({ ...placeForm, type: 'pickup' })}>Pickup</button><button type="button" className={`${placeForm.type === 'dropoff' ? 'active' : ''} wj-place-type-btn`} onClick={() => setPlaceForm({ ...placeForm, type: 'dropoff' })}>Drop-off</button></div>
        <button type="button" className="btn btn-outline wj-champagne-ghost wj-ghost-action" disabled={loading} onClick={addRegisterPlace} style={{ marginBottom: 12 }}>Add another place</button>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Finish & create account'}</button>
        <p className="wj-skip-row" style={{ textAlign: 'center', marginTop: 8 }}><button type="button" className="wj-text-button wj-gold-link" onClick={finishRegistration} disabled={loading}>Skip this step</button></p>
      </form>}

      {authStep === 'forgot' && <form className="wj-auth-form wj-forgot-form" onSubmit={requestForgotPin}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Mobile number</label><input className="wj-obsidian-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 123456" autoFocus required /></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Send verification code'}</button>
        <div className="wj-customer-links wj-auth-footer" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button wj-gold-link" onClick={() => switchMode('login')} disabled={loading}>Back to log in</button>
          <Link to="/" className="wj-portal-back wj-portal-return">← Back to booking</Link>
        </div>
      </form>}

      {authStep === 'forgot-otp' && <form className="wj-auth-form wj-reset-pin-form" onSubmit={resetForgotPin}>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Verification code</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} placeholder="6-digit code" autoFocus required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">New 6-digit PIN</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" type="password" value={forgotPin} onChange={e => setForgotPin(e.target.value)} placeholder="6-digit PIN" required /></div>
        <div className="form-group wj-gilt-field"><label className="wj-gold-label">Confirm new PIN</label><input className="wj-obsidian-input" inputMode="numeric" pattern="[0-9]{6}" type="password" value={forgotConfirmPin} onChange={e => setForgotConfirmPin(e.target.value)} placeholder="Re-enter PIN" required /></div>
        {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
        <button className="btn btn-primary wj-gold-cta" disabled={loading}>{loading ? 'Please wait…' : 'Save PIN'}</button>
        <div className="wj-customer-links wj-auth-footer" style={{ marginTop: 12 }}>
          <button type="button" className="wj-text-button wj-gold-link" onClick={() => switchMode('forgot')} disabled={loading}>Resend code</button>
          <Link to="/" className="wj-portal-back wj-portal-return">← Back to booking</Link>
        </div>
      </form>}
    </div></div>;
  }

  const now = Date.now();
  const futureJobs = jobs.filter(job => new Date(job.pickupTime).getTime() >= now && !['COMPLETE', 'CANCELLED'].includes(job.status));
  const pastJobs = jobs.filter(job => new Date(job.pickupTime).getTime() < now || ['COMPLETE', 'CANCELLED'].includes(job.status));
  const shownJobs = tab === 'future' ? futureJobs : pastJobs;

  const trustMessage = customer.restrictionLevel && customer.restrictionLevel !== 'none'
    ? `Account status: ${customer.restrictionLevel.replace('_', ' ')}. Contact support if you believe this is incorrect.`
    : customer.trustFlags?.includes('late_cancellation_pattern') || customer.trustFlags?.includes('no_show_pattern')
      ? 'Your recent booking history shows missed or late cancellations. Continued issues may restrict future bookings.'
      : null;

  return <div className="wj-shell wj-obsidian-shell"><div className="wj-frame wj-gilt-frame wj-customer-dashboard wj-dashboard-chamber">
    <nav className="wj-customer-topnav"><Link className="active" to="/">Book</Link><Link to="/driver">Driver</Link></nav>
    <header className="wj-customer-header wj-dashboard-header wj-obsidian-header"><img src={logo} alt="The Wirral Jobe" className="wj-header-logo" /><div className="wj-greeting"><span className="wj-eyebrow">Customer portal</span><strong className="wj-customer-name">{customer.name}</strong></div><button className="wj-header-logout wj-gold-logout" onClick={logout}>Log out</button></header>
    <Link to="/" className="wj-customer-book wj-gold-book-button">Book a ride <b className="wj-book-chevron">›</b></Link>
    {trustMessage && <p className="error wj-alert-error" style={{ margin: '0.5rem 0', fontSize: '0.85rem' }}>{trustMessage}</p>}
    {error && <p className="error wj-alert-error">{error}</p>}{message && <p className="success wj-alert-success">{message}</p>}
    <section className="wj-customer-section wj-dashboard-section wj-bookings-panel"><h2 className="wj-section-title">Your bookings</h2><div className="wj-customer-tabs wj-gold-tabs"><button className={`wj-gold-tab ${tab === 'future' ? 'active' : ''}`} onClick={() => setTab('future')}>Future ({futureJobs.length})</button><button className={`wj-gold-tab ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>Past ({pastJobs.length})</button></div>
      {shownJobs.length === 0 ? <p className="wj-customer-empty wj-empty-state">No {tab} bookings yet.</p> : shownJobs.map(job => {
        const canCancel = !['COMPLETE', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CANCELLED'].includes(job.status);
        return (<article className="wj-customer-job wj-job-card wj-obsidian-card" key={job.jobId}><div><span className={`badge status-${job.status || 'NEW'} wj-status-badge`}>{(job.status || 'NEW').replace('_', ' ')}</span><time className="wj-job-time">{dateLabel(job.pickupTime)}</time></div><strong className="wj-job-address">{job.pickupAddress}</strong><i className="wj-route-arrow">↓</i><strong className="wj-job-address">{job.dropoffAddress}</strong><footer className="wj-job-meta"><span className="wj-vehicle-type">{job.vehicleType === 'mpv' ? 'MPV' : 'Saloon / estate'}</span><b className="wj-gold-fare">Maximum £{Number(job.fare || 0).toFixed(2)}</b>{canCancel && <button className="wj-text-button wj-gold-link wj-cancel-trigger" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => setCancellingJob(job)}>Cancel</button>}</footer></article>);
      })}
    </section>
    {cancellingJob && (
      <div className="wj-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div className="wj-modal-panel wj-cancel-modal" style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: 12, maxWidth: 360, width: '90%' }}>
          <h3 className="wj-modal-title" style={{ marginBottom: '0.75rem' }}>Cancel booking</h3>
          <p className="wj-modal-copy" style={{ marginBottom: '0.75rem', color: 'var(--muted)' }}>Please let us know why.</p>
          {CANCEL_REASONS.map(r => (
            <label className="wj-cancel-reason" key={r} style={{ display: 'block', margin: '0.4rem 0', cursor: 'pointer' }}>
              <input type="radio" name="cancelReason" value={r} checked={cancelReason === r} onChange={e => setCancelReason(e.target.value)} /> {r}
            </label>
          ))}
          {error && <p className="error wj-alert-error">{error}</p>}
          <div className="wj-modal-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-outline wj-champagne-ghost wj-close-btn" style={{ flex: 1 }} onClick={() => setCancellingJob(null)}>Close</button>
            <button className="btn btn-primary wj-gold-cta wj-confirm-btn" style={{ flex: 1 }} disabled={loading} onClick={() => cancelJob(cancellingJob.jobId)}>{loading ? 'Cancelling…' : 'Confirm cancel'}</button>
          </div>
        </div>
      </div>
    )}
    <section className="wj-customer-section wj-dashboard-section wj-saved-places-panel"><h2 className="wj-section-title">Saved places</h2><p className="wj-customer-copy wj-section-copy">Save your regular pickup and drop-off locations for future bookings.</p>
      <div className="wj-saved-places wj-place-list">{places.length === 0 && <p className="wj-customer-empty wj-empty-state">No saved places yet.</p>}{places.map(place => <article className="wj-place-card wj-saved-place" key={place.id}><span className="wj-place-arrow">{place.type === 'pickup' ? '↑' : '↓'}</span><div className="wj-place-copy"><strong>{place.label}</strong><small>{place.address}</small></div><button className="wj-place-remove" onClick={() => removePlace(place.id)} disabled={loading} aria-label={`Remove ${place.label}`}>×</button></article>)}</div>
      <form className="wj-place-form wj-place-form-panel" onSubmit={savePlace}><div className="form-group wj-gilt-field"><label className="wj-gold-label">Place name</label><input className="wj-obsidian-input" value={placeForm.label} onChange={e => setPlaceForm({ ...placeForm, label: e.target.value })} placeholder="e.g. Home" /></div><div className="form-group wj-gilt-field"><label className="wj-gold-label">Address</label><input className="wj-obsidian-input" value={placeForm.address} onChange={e => setPlaceForm({ ...placeForm, address: e.target.value })} placeholder="Full address" /></div><div className="wj-place-coordinates wj-coordinates-row"><div className="form-group wj-gilt-field"><label className="wj-gold-label">Latitude</label><input className="wj-obsidian-input" type="number" step="any" value={placeForm.lat} onChange={e => setPlaceForm({ ...placeForm, lat: e.target.value })} placeholder="53.39" /></div><div className="form-group wj-gilt-field"><label className="wj-gold-label">Longitude</label><input className="wj-obsidian-input" type="number" step="any" value={placeForm.lng} onChange={e => setPlaceForm({ ...placeForm, lng: e.target.value })} placeholder="-3.02" /></div></div><div className="wj-place-type wj-place-type-toggle"><button type="button" className={`${placeForm.type === 'pickup' ? 'active' : ''} wj-place-type-btn`} onClick={() => setPlaceForm({ ...placeForm, type: 'pickup' })}>Pickup</button><button type="button" className={`${placeForm.type === 'dropoff' ? 'active' : ''} wj-place-type-btn`} onClick={() => setPlaceForm({ ...placeForm, type: 'dropoff' })}>Drop-off</button></div><button className="btn btn-outline wj-champagne-ghost wj-save-place-btn" disabled={loading}>Save place</button></form>
    </section>
    <section className="wj-customer-section wj-dashboard-section wj-account-panel"><h2 className="wj-section-title">Account</h2><p className="wj-customer-copy wj-section-copy">You can permanently delete your account and saved places. Journey records that must be retained will be anonymised.</p><button type="button" className="btn btn-danger wj-danger-cta" onClick={deleteAccount} disabled={loading}>{loading ? 'Please wait…' : 'Delete account'}</button></section>
  </div></div>;
}
