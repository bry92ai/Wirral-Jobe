import { useEffect, useRef, useState } from 'react';
import { api, apiGet, apiPatch } from '../lib/api.js';
import { loadGoogleMapsScript } from '../lib/maps.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export default function AdminPage() {
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [password, setPassword] = useState('');
  const [newDriver, setNewDriver] = useState({ id: '', name: '', phone: '', pin: '', vehicle_type: 'car', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const [map, setMap] = useState(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  function carIconSvg(color) {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="7" rx="2" fill="${color}"/><rect x="5" y="5" width="8" height="4" rx="1" fill="${color}"/><circle cx="6" cy="16" r="2" fill="#333"/><circle cx="18" cy="16" r="2" fill="#333"/></svg>`)}`;
  }

  function mpvIconSvg(color) {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="10" rx="2" fill="${color}"/><rect x="4" y="7" width="6" height="4" rx="1" fill="#fff" opacity="0.4"/><circle cx="6" cy="16" r="2" fill="#333"/><circle cx="18" cy="16" r="2" fill="#333"/></svg>`)}`;
  }

  async function load() {
    try {
      const headers = { 'x-admin-token': token };
      const [j, d] = await Promise.all([apiGet('/admin/jobs', headers), apiGet('/admin/drivers', headers)]);
      setJobs(j.jobs);
      setDrivers(d.drivers);
    } catch (err) {
      setError(err.message);
      if (err.message.includes('Admin not authenticated')) {
        setToken('');
        localStorage.removeItem('adminToken');
      }
    }
  }

  async function login(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api('admin/login', { password });
      localStorage.setItem('adminToken', res.token);
      setToken(res.token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addDriver(e) {
    e.preventDefault();
    setError('');
    try {
      await api('admin/drivers', newDriver, { 'x-admin-token': token });
      setNewDriver({ id: '', name: '', phone: '', pin: '', vehicle_type: 'car', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    setMapError('');
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => setMapReady(true))
      .catch(err => setMapError(err.message));
  }, [mapKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    try {
      const m = new window.google.maps.Map(mapRef.current, {
        center: { lat: 53.38, lng: -3.03 },
        zoom: 11
      });
      infoWindowRef.current = new window.google.maps.InfoWindow();
      setMap(m);
    } catch (err) {
      setMapError('Failed to initialise map: ' + err.message);
    }
  }, [mapReady]);

  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
    const infoWindow = infoWindowRef.current;

    jobs.filter(j => j.status !== 'COMPLETE' && j.status !== 'CANCELLED' && j.pickupLat != null && j.pickupLng != null).forEach(job => {
      const color = job.vehicleType === 'mpv' ? '#3b82f6' : '#2563eb';
      const marker = new window.google.maps.Marker({
        position: { lat: job.pickupLat, lng: job.pickupLng },
        map,
        title: job.jobId,
        icon: job.vehicleType === 'mpv' ? mpvIconSvg(color) : carIconSvg(color)
      });
      marker.addListener('click', () => {
        infoWindow.setContent(`<strong>${job.jobId}</strong><br/>${job.status}<br/>${job.pickupAddress} → ${job.dropoffAddress}`);
        infoWindow.open(map, marker);
      });
      markersRef.current.push(marker);
    });

    drivers.filter(d => d.last_lat != null && d.last_lng != null).forEach(d => {
      const color = d.status === 'AVAILABLE' ? '#22c55e' : '#ef4444';
      const marker = new window.google.maps.Marker({
        position: { lat: d.last_lat, lng: d.last_lng },
        map,
        title: d.id,
        icon: d.vehicle_type === 'mpv' ? mpvIconSvg(color) : carIconSvg(color)
      });
      marker.addListener('click', () => {
        infoWindow.setContent(`<strong>${d.name} (${d.id})</strong><br/>Status: ${d.status}<br/>Zone: ${d.zone || '-'}<br/>Owed: £${Number(d.settle_balance || 0).toFixed(2)}`);
        infoWindow.open(map, marker);
      });
      markersRef.current.push(marker);
    });
  }, [map, jobs, drivers]);

  function startEdit(driver) {
    setEditingId(driver.id);
    setEditForm({
      name: driver.name || '',
      phone: driver.phone || '',
      vehicle_type: driver.vehicle_type || 'car',
      license_type: driver.license_type || 'private_hire',
      vehicle_make_model_colour: driver.vehicle_make_model_colour || '',
      reg_last_3: driver.reg_last_3 || '',
      expiry_date: driver.expiry_date || '',
      badge_number: driver.badge_number || '',
      commission_rate: driver.commission_rate ?? ''
    });
  }

  async function saveEdit(id) {
    setError('');
    try {
      await apiPatch(`admin/drivers/${id}`, editForm, { 'x-admin-token': token });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function assign(jobId, driverId) {
    setError('');
    try {
      await api('admin/assign', { jobId, driverId }, { 'x-admin-token': token });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <h1>Admin login</h1>
        <form onSubmit={login}>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="admin" />
          </div>
          <button type="submit">Log in</button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h1>Dispatch board</h1>
        {error && <p className="error">{error}</p>}
        {mapError && (
          <div>
            <p className="error">Map: {mapError}</p>
            <button type="button" onClick={() => setMapKey(k => k + 1)}>Retry map</button>
          </div>
        )}
        {!GOOGLE_MAPS_API_KEY && <p className="error">VITE_GOOGLE_MAPS_API_KEY not set</p>}
        <button onClick={() => { localStorage.removeItem('adminToken'); setToken(''); }}>Log out</button>
      </div>

      <div className="card">
        <h2>Live map</h2>
        <div ref={mapRef} style={{ width: '100%', height: 400, background: '#f0f0f0' }} />
        <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
          Blue car/MPV = open job pickup · Green car/MPV = available driver · Red car/MPV = busy driver
        </p>
      </div>

      <div className="card">
        <h2>Add driver</h2>
        <form onSubmit={addDriver}>
          <div className="row">
            <div className="form-group">
              <label>Driver ID</label>
              <input required value={newDriver.id} onChange={e => setNewDriver({ ...newDriver, id: e.target.value.toUpperCase() })} placeholder="DRV-003" />
            </div>
            <div className="form-group">
              <label>Name</label>
              <input required value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })} placeholder="John" />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input required type="tel" value={newDriver.phone} onChange={e => setNewDriver({ ...newDriver, phone: e.target.value })} placeholder="07700111222" />
            </div>
            <div className="form-group">
              <label>PIN</label>
              <input required type="password" value={newDriver.pin} onChange={e => setNewDriver({ ...newDriver, pin: e.target.value })} placeholder="1234" />
            </div>
            <div className="form-group">
              <label>Vehicle</label>
              <select value={newDriver.vehicle_type} onChange={e => setNewDriver({ ...newDriver, vehicle_type: e.target.value })}>
                <option value="car">Car</option>
                <option value="mpv">MPV</option>
              </select>
            </div>
            <div className="form-group">
              <label>License type</label>
              <select value={newDriver.license_type} onChange={e => setNewDriver({ ...newDriver, license_type: e.target.value })}>
                <option value="private_hire">Private hire</option>
                <option value="hackney">Hackney</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="form-group">
              <label>Vehicle make/model/colour</label>
              <input value={newDriver.vehicle_make_model_colour} onChange={e => setNewDriver({ ...newDriver, vehicle_make_model_colour: e.target.value })} placeholder="e.g. Ford Galaxy silver" />
            </div>
            <div className="form-group">
              <label>Last 3 on reg</label>
              <input value={newDriver.reg_last_3} onChange={e => setNewDriver({ ...newDriver, reg_last_3: e.target.value })} placeholder="ABC" maxLength={3} />
            </div>
            <div className="form-group">
              <label>Exp date</label>
              <input type="date" value={newDriver.expiry_date} onChange={e => setNewDriver({ ...newDriver, expiry_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Badge number</label>
              <input value={newDriver.badge_number} onChange={e => setNewDriver({ ...newDriver, badge_number: e.target.value })} placeholder="Driver badge number" />
            </div>
            <div className="form-group">
              <label>Commission %</label>
              <input type="number" min={0} max={100} step="0.01" value={newDriver.commission_rate} onChange={e => setNewDriver({ ...newDriver, commission_rate: e.target.value })} placeholder="e.g. 10" />
            </div>
          </div>
          <button type="submit">Add driver</button>
        </form>
      </div>

      <h2>Open jobs</h2>
      {jobs.filter(j => j.status !== 'COMPLETE' && j.status !== 'CANCELLED').length === 0 && <p>No open jobs.</p>}
      {jobs.filter(j => j.status !== 'COMPLETE' && j.status !== 'CANCELLED').map(job => (
        <div key={job.jobId} className="card">
          <p><strong>{job.jobId}</strong> <span className={`badge status-${job.status}`}>{job.status}</span></p>
          <p>{job.pickupAddress} → {job.dropoffAddress}</p>
          <p>Fare: £{job.fare.toFixed(2)} | {job.vehicleType} | {job.customerPhone}</p>
          {job.status === 'NEW' && (
            <div className="row">
              {drivers.filter(d => d.status === 'AVAILABLE').map(d => (
                <button key={d.id} onClick={() => assign(job.jobId, d.id)}>Assign {d.name}</button>
              ))}
            </div>
          )}
          {job.driverId && <p>Assigned driver: {job.driverId}</p>}
        </div>
      ))}

      <h2>Drivers</h2>
      {drivers.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: 8 }}>
          {editingId === d.id ? (
            <div>
              <p><strong>{d.id}</strong></p>
              <div className="row">
                <div className="form-group"><label>Name</label><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div className="form-group"><label>Phone</label><input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                <div className="form-group"><label>Vehicle</label>
                  <select value={editForm.vehicle_type} onChange={e => setEditForm({ ...editForm, vehicle_type: e.target.value })}>
                    <option value="car">Car</option><option value="mpv">MPV</option>
                  </select>
                </div>
                <div className="form-group"><label>License</label>
                  <select value={editForm.license_type} onChange={e => setEditForm({ ...editForm, license_type: e.target.value })}>
                    <option value="private_hire">Private hire</option><option value="hackney">Hackney</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="form-group"><label>Vehicle details</label><input value={editForm.vehicle_make_model_colour} onChange={e => setEditForm({ ...editForm, vehicle_make_model_colour: e.target.value })} /></div>
                <div className="form-group"><label>Reg last 3</label><input value={editForm.reg_last_3} onChange={e => setEditForm({ ...editForm, reg_last_3: e.target.value })} maxLength={3} /></div>
                <div className="form-group"><label>Exp date</label><input type="date" value={editForm.expiry_date} onChange={e => setEditForm({ ...editForm, expiry_date: e.target.value })} /></div>
                <div className="form-group"><label>Badge</label><input value={editForm.badge_number} onChange={e => setEditForm({ ...editForm, badge_number: e.target.value })} /></div>
                <div className="form-group"><label>Commission %</label><input type="number" value={editForm.commission_rate} onChange={e => setEditForm({ ...editForm, commission_rate: e.target.value })} /></div>
              </div>
              <button onClick={() => saveEdit(d.id)}>Save</button>
              <button className="secondary" onClick={() => setEditingId(null)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          ) : (
            <div>
              <p><strong>{d.id}</strong> — {d.name} <span className={`badge ${d.status === 'AVAILABLE' ? 'status-COMPLETE' : 'status-CANCELLED'}`}>{d.status}</span> <button className="secondary" style={{ marginLeft: 8, marginTop: 0, padding: '0.2rem 0.5rem' }} onClick={() => startEdit(d)}>Edit</button></p>
              <p style={{ fontSize: '0.85rem' }}>
                {d.license_type} | {d.vehicle_type} | {d.zone || 'no zone'} | {d.vehicle_make_model_colour} | Reg …{d.reg_last_3} | Exp {d.expiry_date} | Badge {d.badge_number} | {d.phone} | Commission {d.commission_rate || 0}%
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                <strong>Owed settle: £{Number(d.settle_balance || 0).toFixed(2)}</strong>
              </p>
              {d.last_lat != null && d.last_lng != null && (
                <p style={{ fontSize: '0.8rem' }}>
                  Last location: lat {d.last_lat.toFixed(4)}, lng {d.last_lng.toFixed(4)} at {new Date(d.last_location_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
