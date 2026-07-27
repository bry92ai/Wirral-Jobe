import { useEffect, useRef, useState } from 'react';
import { api, apiGet, apiPatch } from '../lib/api.js';
import { loadLeaflet, vehicleIcon, divIcon, pickupIconSvg, dropoffIconSvg } from '../lib/leaflet.js';
import { FLIGHTPATH_ZONES, getZoneName } from '../lib/zones.js';
import logo from '../assets/logo.jpg';

export default function AdminPage() {
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [password, setPassword] = useState('');
  const [newDriver, setNewDriver] = useState({ id: '', name: '', phone: '', pin: '', vehicle_type: 'car', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: '', letter: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const LRef = useRef(null);
  const markersRef = useRef([]);
  const zoneLabelsRef = useRef([]);

  function getZoneStyle(feature) {
    const external = feature.properties.external;
    return {
      color: external ? '#5b5647' : '#f4bf1b',
      weight: 1,
      opacity: external ? 0.5 : 0.8,
      fillColor: external ? '#5b5647' : '#f4bf1b',
      fillOpacity: external ? 0.04 : 0.06,
      dashArray: external ? '4 4' : undefined
    };
  }

  async function load() {
    try {
      const headers = { 'x-admin-token': token };
      const [j, d, a] = await Promise.all([apiGet('/admin/jobs', headers), apiGet('/admin/drivers', headers), apiGet('/admin/driver-applications', headers)]);
      setJobs(j.jobs);
      setDrivers(d.drivers);
      setApplications(a.applications || []);
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
      setNewDriver({ id: '', name: '', phone: '', pin: '', vehicle_type: 'car', license_type: 'private_hire', vehicle_make_model_colour: '', reg_last_3: '', expiry_date: '', badge_number: '', commission_rate: '', letter: '' });
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
    setMapError('');
    loadLeaflet().then(L => {
      LRef.current = L;
      const map = L.map(mapRef.current, { zoomControl: false }).setView([53.38, -3.03], 11);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
        maxZoom: 19
      }).addTo(map);
      mapObjRef.current = map;

      L.geoJSON(FLIGHTPATH_ZONES, {
        filter: f => f.properties.zoneId !== 'international' && !f.properties.external,
        style: feature => getZoneStyle(feature)
      }).addTo(map);

      const labelIcon = (zoneName) => L.divIcon({
        className: 'zone-label',
        html: `<span style="color:#f2ead9;font-size:9px;font-weight:600;letter-spacing:0.2px;white-space:nowrap;background:rgba(10,10,10,0.75);padding:1px 4px;border-radius:4px">${zoneName}</span>`,
        iconSize: [160, 16],
        iconAnchor: [80, 8]
      });

      zoneLabelsRef.current = FLIGHTPATH_ZONES.features
        .filter(feature => feature.properties.zoneId !== 'international' && !feature.properties.external)
        .map(feature => {
          const { labelLat, labelLng, zoneName } = feature.properties;
          return L.marker([labelLat, labelLng], {
            icon: labelIcon(zoneName),
            interactive: false,
            opacity: 0.9
          }).addTo(map);
        });

      setMapReady(true);
    }).catch(err => setMapError('Failed to load map: ' + err.message));

    return () => {
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
      LRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !LRef.current || !mapObjRef.current) return;
    const L = LRef.current;
    const map = mapObjRef.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    jobs.filter(j => j.status !== 'COMPLETE' && j.status !== 'CANCELLED' && j.pickupLat != null && j.pickupLng != null).forEach(job => {
      const color = job.vehicleType === 'mpv' ? '#f4bf1b' : '#d9a70f';
      const marker = L.marker([job.pickupLat, job.pickupLng], {
        icon: vehicleIcon(L, job.vehicleType || 'car', color, null, 28, 'job-marker')
      }).addTo(map).bindPopup(`<strong>${job.jobId}</strong><br/>${job.status}<br/>${job.pickupAddress} → ${job.dropoffAddress}`);
      markersRef.current.push(marker);
    });

    drivers.filter(d => d.last_lat != null && d.last_lng != null).forEach(d => {
      const color = d.status === 'AVAILABLE' ? '#22c55e' : '#ef4444';
      const marker = L.marker([d.last_lat, d.last_lng], {
        icon: vehicleIcon(L, d.vehicle_type || 'car', color, null, 28, 'driver-marker')
      }).addTo(map).bindPopup(`<strong>${d.name} (${d.id})</strong><br/>Status: ${d.status}<br/>Zone: ${d.zone || '-'}<br/>Owed: £${Number(d.settle_balance || 0).toFixed(2)}`);
      markersRef.current.push(marker);
    });
  }, [mapReady, jobs, drivers]);

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
      commission_rate: driver.commission_rate ?? '',
      letter: driver.letter || ''
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

  async function reviewApplication(applicationId, action) {
    setError('');
    try {
      let reason = '';
      if (action === 'reject') {
        reason = window.prompt('Reason for rejecting this application:') || '';
        if (!reason) return;
      }
      const result = await api(`admin/driver-applications/${applicationId}/${action}`, { reason }, { 'x-admin-token': token });
      if (action === 'approve-badge') {
        const signUpLink = `${window.location.origin}/driver/apply/${result.continuationToken}`;
        window.prompt('Badge approved. Copy this private sign-up link and send it to the driver:', signUpLink);
      }
      if (action === 'approve') window.alert(`Driver approved. Their driver ID is ${result.driverId}.`);
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
      <div className="wj-shell">
        <div className="wj-frame" style={{ maxWidth: 380 }}>
          <img src={logo} alt="The Wirral Jobe" className="wj-logo" />
          <h1 className="wj-title" style={{ textAlign: 'center', fontSize: '1.3rem' }}>Admin login</h1>
          <form onSubmit={login}>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="admin" />
            </div>
            <button type="submit" className="btn btn-primary">Log in</button>
            {error && <p className="error">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wj-admin-shell">
      <div className="wj-admin-header card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src={logo} alt="" style={{ height: 46 }} />
        <h1 style={{ margin: 0 }}>Dispatch board</h1>
        {error && <p className="error">{error}</p>}
        {mapError && <p className="error">Map: {mapError}</p>}
        <button onClick={() => { localStorage.removeItem('adminToken'); setToken(''); }}>Log out</button>
      </div>

      <div className="card">
        <h2>Live map</h2>
        <div ref={mapRef} className="wj-admin-map" />
        <p className="wj-admin-map-legend">
          Gold car/MPV = open job pickup · Green car/MPV = available driver · Red car/MPV = busy/offline driver
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
            <div className="form-group">
              <label>Future bracket</label>
              <select value={newDriver.letter} onChange={e => setNewDriver({ ...newDriver, letter: e.target.value })}>
                <option value="">None</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="Pool">Pool</option>
              </select>
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

      <h2>Badge checks</h2>
      {applications.filter(application => application.status === 'BADGE_REVIEW').length === 0 && <p>No badge photos awaiting review.</p>}
      {applications.filter(application => application.status === 'BADGE_REVIEW').map(application => (
        <div key={application.id} className="card wj-driver-application">
          <div><p><strong>New driver badge</strong> <span className="badge status-NEW">Awaiting badge check</span></p><p>Review the badge before allowing the applicant into the sign-up process.</p></div>
          <a href={application.badgeUrl} target="_blank" rel="noreferrer" className="btn secondary">View badge</a>
          <div className="row">
            <button type="button" onClick={() => reviewApplication(application.id, 'approve-badge')}>Approve badge and create link</button>
            <button type="button" className="secondary" onClick={() => reviewApplication(application.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}

      <h2>Driver applications</h2>
      {applications.filter(application => application.status === 'PENDING_REVIEW').length === 0 && <p>No completed driver applications awaiting approval.</p>}
      {applications.filter(application => application.status === 'PENDING_REVIEW').map(application => (
        <div key={application.id} className="card wj-driver-application">
          <div>
            <p><strong>{application.name}</strong> <span className="badge status-NEW">Awaiting approval</span></p>
            <p>{application.phone} · {application.licenseType} · {application.vehicleType}</p>
            <p>{application.vehicleMakeModelColour || 'Vehicle details not supplied'} · Reg …{application.regLast3 || '—'} · Badge {application.badgeNumber || '—'}</p>
          </div>
          <a href={application.badgeUrl} target="_blank" rel="noreferrer" className="btn secondary">View badge</a>
          <div className="row">
            <button type="button" onClick={() => reviewApplication(application.id, 'approve')}>Approve driver</button>
            <button type="button" className="secondary" onClick={() => reviewApplication(application.id, 'reject')}>Reject</button>
          </div>
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
                <div className="form-group"><label>Future bracket</label>
                  <select value={editForm.letter} onChange={e => setEditForm({ ...editForm, letter: e.target.value })}>
                    <option value="">None</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="Pool">Pool</option>
                  </select>
                </div>
              </div>
              <button onClick={() => saveEdit(d.id)}>Save</button>
              <button className="secondary" onClick={() => setEditingId(null)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          ) : (
            <div>
              <p><strong>{d.id}</strong> — {d.name} <span className={`badge ${d.status === 'AVAILABLE' ? 'status-COMPLETE' : 'status-CANCELLED'}`}>{d.status}</span> <button className="secondary" style={{ marginLeft: 8, marginTop: 0, padding: '0.2rem 0.5rem' }} onClick={() => startEdit(d)}>Edit</button></p>
              <p style={{ fontSize: '0.85rem' }}>
                {d.license_type} | {d.vehicle_type} | {d.zone || 'no zone'} | {d.vehicle_make_model_colour} | Reg …{d.reg_last_3} | Exp {d.expiry_date} | Badge {d.badge_number} | {d.phone} | Commission {d.commission_rate || 0}% | Future bracket: {d.letter || 'None'}
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
