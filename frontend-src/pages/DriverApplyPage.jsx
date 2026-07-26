import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import logo from '../assets/logo.jpg';

const emptyForm = {
  name: '', phone: '', pin: '', vehicleType: 'car', licenseType: 'private_hire',
  vehicleMakeModelColour: '', regLast3: '', expiryDate: '', badgeNumber: ''
};

export default function DriverApplyPage() {
  const { token } = useParams();
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function uploadBadge(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!file || !file.type.startsWith('image/')) {
      setError('Choose a clear image of your driver badge.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Badge image must be 10 MB or smaller.');
      return;
    }
    setLoading(true);
    try {
      const config = await api('driver/applications/upload-signature');
      const payload = new FormData();
      payload.append('file', file);
      payload.append('api_key', config.apiKey);
      payload.append('timestamp', String(config.timestamp));
      payload.append('folder', config.folder);
      payload.append('signature', config.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, { method: 'POST', body: payload });
      const upload = await response.json();
      if (!response.ok || !upload.secure_url || !upload.public_id) throw new Error(upload.error?.message || 'Badge upload failed. Please try again.');
      await api('driver/applications/start', { badgeUrl: upload.secure_url, badgePublicId: upload.public_id });
      setMessage('Badge received. An administrator will review it before sending you the sign-up link.');
    } catch (err) {
      setError(err.message || 'Badge upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submitApplication(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await api(`driver/applications/${token}/submit`, form);
      setMessage('Application submitted. Your badge and details are now awaiting approval.');
    } catch (err) {
      setError(err.message || 'Could not submit the application.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="wj-shell">
        <div className="wj-frame wj-customer-auth wj-driver-apply">
          <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
          <p className="wj-customer-kicker">Driver onboarding</p>
          <h1 className="wj-title">Start your application</h1>
          <p className="wj-subtitle">First, upload a clear photo of your private-hire or Hackney badge.</p>
          {message ? <p className="success">{message}</p> : <form onSubmit={uploadBadge} className="wj-place-form">
            <div className="form-group">
              <label>Badge photo</label>
              <input type="file" accept="image/*" capture="environment" onChange={event => setFile(event.target.files?.[0] || null)} required />
              {file && <small className="wj-file-name">{file.name}</small>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Uploading badge…' : 'Upload badge for review'}</button>
          </form>}
          {error && <p className="error">{error}</p>}
          <Link to="/driver" className="wj-portal-back">Already approved? Driver login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wj-shell">
      <div className="wj-frame wj-customer-auth wj-driver-apply">
        <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
        <p className="wj-customer-kicker">Driver onboarding</p>
        <h1 className="wj-title">Complete your details</h1>
        <p className="wj-subtitle">Your badge photo is attached. Complete the form and we will review your application.</p>
        <button type="button" className="wj-text-button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy your application link</button>
        {message ? <p className="success">{message}</p> : (
          <form onSubmit={submitApplication} className="wj-place-form">
            <div className="form-group"><label>Full name</label><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
            <div className="form-group"><label>Mobile number</label><input required type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="07700 111222" /></div>
            <div className="form-group"><label>Choose a 4–8 digit PIN</label><input required type="password" inputMode="numeric" pattern="[0-9]{4,8}" value={form.pin} onChange={event => setForm({ ...form, pin: event.target.value })} /></div>
            <div className="row">
              <div className="form-group"><label>Vehicle</label><select value={form.vehicleType} onChange={event => setForm({ ...form, vehicleType: event.target.value })}><option value="car">Car</option><option value="mpv">MPV</option></select></div>
              <div className="form-group"><label>Licence type</label><select value={form.licenseType} onChange={event => setForm({ ...form, licenseType: event.target.value })}><option value="private_hire">Private hire</option><option value="hackney">Hackney</option></select></div>
            </div>
            <div className="form-group"><label>Vehicle make, model and colour</label><input value={form.vehicleMakeModelColour} onChange={event => setForm({ ...form, vehicleMakeModelColour: event.target.value })} placeholder="Ford Galaxy, silver" /></div>
            <div className="row">
              <div className="form-group"><label>Last 3 registration characters</label><input maxLength="3" value={form.regLast3} onChange={event => setForm({ ...form, regLast3: event.target.value.toUpperCase() })} /></div>
              <div className="form-group"><label>Badge expiry</label><input type="date" value={form.expiryDate} onChange={event => setForm({ ...form, expiryDate: event.target.value })} /></div>
            </div>
            <div className="form-group"><label>Badge number</label><input value={form.badgeNumber} onChange={event => setForm({ ...form, badgeNumber: event.target.value })} /></div>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Submitting…' : 'Submit for approval'}</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        <Link to="/driver" className="wj-portal-back">Driver login</Link>
      </div>
    </div>
  );
}
