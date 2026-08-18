import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [mapOpen, setMapOpen] = useState(true);
  const [futureOffers, setFutureOffers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [bids, setBids] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [pendingSms, setPendingSms] = useState([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [bulkLetter, setBulkLetter] = useState('');
  const [bulkCommission, setBulkCommission] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [jobDetail, setJobDetail] = useState(null);
  const [settleAmounts, setSettleAmounts] = useState({});
  const [smsTemplates, setSmsTemplates] = useState([]);
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const LRef = useRef(null);
  const markersRef = useRef([]);
  const zoneLabelsRef = useRef([]);

  const openJobs = useMemo(() => jobs.filter(j => j.status !== 'COMPLETE' && j.status !== 'CANCELLED'), [jobs]);
  const availableDrivers = useMemo(() => drivers.filter(d => d.status === 'AVAILABLE'), [drivers]);
  const badgeApplications = useMemo(() => applications.filter(a => a.status === 'BADGE_REVIEW'), [applications]);
  const pendingApplications = useMemo(() => applications.filter(a => a.status === 'PENDING_REVIEW'), [applications]);

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

  const loadingRef = useRef(false);
  const abortRef = useRef(null);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const headers = { 'x-admin-token': token };
      const [j, d, a, fo, al, b, t, sms, tpl] = await Promise.all([
        apiGet('/admin/jobs', headers, controller.signal),
        apiGet('/admin/drivers', headers, controller.signal),
        apiGet('/admin/driver-applications', headers, controller.signal),
        apiGet('/admin/future-offers', headers, controller.signal),
        apiGet('/admin/audit-log', headers, controller.signal),
        apiGet('/admin/bids', headers, controller.signal),
        apiGet('/admin/tariff', headers, controller.signal),
        apiGet('/admin/pending-sms', headers, controller.signal),
        apiGet('/admin/sms-templates', headers, controller.signal)
      ]);
      if (controller.signal.aborted) return;
      setJobs(j.jobs);
      setDrivers(d.drivers);
      setApplications(a.applications || []);
      setFutureOffers(fo.futureOffers || []);
      setAuditLogs(al.logs || []);
      setBids(b.bids || []);
      setTariff(t.tariff || null);
      setPendingSms(sms.messages || []);
      setSmsTemplates(tpl.templates || []);
      setError('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      if (err.message.includes('Admin not authenticated')) {
        setToken('');
        localStorage.removeItem('adminToken');
      }
    } finally {
      loadingRef.current = false;
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
    const id = setInterval(load, 10000);
    return () => {
      clearInterval(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [token]);

  useEffect(() => {
    setMapError('');
    if (!mapRef.current) return;
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

  async function dispatchFutureOffer(jobId) {
    setError('');
    try {
      await api('admin/future-offers/dispatch', { jobId }, { 'x-admin-token': token });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveTariff(e) {
    e.preventDefault();
    setError('');
    const form = e.target;
    const body = {
      car: {
        day: { firstMile: Number(form['car-day-firstMile'].value), perMile: Number(form['car-day-perMile'].value), waitingPerMinute: Number(form['car-day-waiting'].value) },
        night: { firstMile: Number(form['car-night-firstMile'].value), perMile: Number(form['car-night-perMile'].value), waitingPerMinute: Number(form['car-night-waiting'].value) }
      },
      mpv: {
        day: { firstMile: Number(form['mpv-day-firstMile'].value), perMile: Number(form['mpv-day-perMile'].value), waitingPerMinute: Number(form['mpv-day-waiting'].value) },
        night: { firstMile: Number(form['mpv-night-firstMile'].value), perMile: Number(form['mpv-night-perMile'].value), waitingPerMinute: Number(form['mpv-night-waiting'].value) }
      }
    };
    try {
      await api('admin/tariff', body, { 'x-admin-token': token });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleSms(key, enabled) {
    setError('');
    try {
      await api('admin/sms-config', { key, enabled }, { 'x-admin-token': token });
      setSmsTemplates(prev => prev.map(t => t.key === key ? { ...t, enabled } : t));
    } catch (err) {
      setError(err.message);
    }
  }

  async function adjustSettle(driverId) {
    setError('');
    const amount = Number(settleAmounts[driverId]?.amount);
    const note = settleAmounts[driverId]?.note || '';
    if (!amount) return;
    try {
      await api(`admin/drivers/${driverId}/settle`, { amount: -Math.abs(amount), note }, { 'x-admin-token': token });
      setSettleAmounts(prev => ({ ...prev, [driverId]: { amount: '', note: '' } }));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyBulk() {
    setError('');
    const updates = {};
    if (bulkLetter) updates.letter = bulkLetter;
    if (bulkCommission !== '') updates.commission_rate = Number(bulkCommission);
    if (bulkStatus) updates.status = bulkStatus;
    try {
      await api('admin/drivers/bulk', { driverIds: selectedDriverIds, updates }, { 'x-admin-token': token });
      setSelectedDriverIds([]);
      setBulkLetter(''); setBulkCommission(''); setBulkStatus('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function formatCurrency(n) {
    return '£' + Number(n || 0).toFixed(2);
  }

  function safeLocaleString(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function safeLocaleTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString();
  }

  function exportCSV(rows, filename) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function toggleDriverSelection(id) {
    setSelectedDriverIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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

      <details className="wj-admin-section card" open={mapOpen} onToggle={e => { setMapOpen(e.target.open); setTimeout(() => { if (mapObjRef.current) mapObjRef.current.invalidateSize(); }, 60); }}>
        <summary className="wj-admin-section-title">Live map</summary>
        <div ref={mapRef} className="wj-admin-map" />
        <p className="wj-admin-map-legend">
          Gold car/MPV = open job pickup · Green car/MPV = available driver · Red car/MPV = busy/offline driver
        </p>
      </details>

      <details className="wj-admin-section card">
        <summary className="wj-admin-section-title">Add driver</summary>
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
      </details>

      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Open jobs</summary>
      {openJobs.length === 0 && <p>No open jobs.</p>}
      {openJobs.map(job => (
        <div key={job.jobId} className="card">
          <p><strong>{job.jobId}</strong> <span className={`badge status-${job.status}`}>{job.status}</span></p>
          <p>{job.pickupAddress} → {job.dropoffAddress}</p>
          <p>Fare: {formatCurrency(job.fare)} | {job.vehicleType} | {job.customerPhone}</p>
          <div className="row">
            <button className="secondary" onClick={() => setJobDetail(job)}>Details</button>
            {job.status === 'NEW' && availableDrivers.map(d => (
              <button key={d.id} onClick={() => assign(job.jobId, d.id)}>Assign {d.name}</button>
            ))}
          </div>
          {job.driverId && <p>Assigned driver: {job.driverId}</p>}
        </div>
      ))}

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Badge checks</summary>
      {badgeApplications.length === 0 && <p>No badge photos awaiting review.</p>}
      {badgeApplications.map(application => (
        <div key={application.id} className="card wj-driver-application">
          <div><p><strong>New driver badge</strong> <span className="badge status-NEW">Awaiting badge check</span></p><p>Review the badge before allowing the applicant into the sign-up process.</p></div>
          <a href={application.badgeUrl} target="_blank" rel="noreferrer" className="btn secondary">View badge</a>
          <div className="row">
            <button type="button" onClick={() => reviewApplication(application.id, 'approve-badge')}>Approve badge and create link</button>
            <button type="button" className="secondary" onClick={() => reviewApplication(application.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Driver applications</summary>
      {pendingApplications.length === 0 && <p>No completed driver applications awaiting approval.</p>}
      {pendingApplications.map(application => (
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

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Bulk driver tools</summary>
      <div className="card">
        <div className="row">
          <div className="form-group">
            <label>Future bracket</label>
            <select value={bulkLetter} onChange={e => setBulkLetter(e.target.value)}>
              <option value="">—</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="Pool">Pool</option>
            </select>
          </div>
          <div className="form-group">
            <label>Commission %</label>
            <input type="number" min={0} max={100} step="0.01" value={bulkCommission} onChange={e => setBulkCommission(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              <option value="">—</option>
              <option value="AVAILABLE">Available</option>
              <option value="BREAK">Break</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </div>
        </div>
        <p>{selectedDriverIds.length} driver{selectedDriverIds.length === 1 ? '' : 's'} selected</p>
        <button onClick={applyBulk} disabled={selectedDriverIds.length === 0}>Apply to selected</button>
        <button className="secondary" style={{ marginLeft: 8 }} onClick={() => exportCSV(drivers, `drivers-${new Date().toISOString().slice(0,10)}.csv`)}>Export drivers CSV</button>
      </div>

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Drivers</summary>
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
              <p>
                <input type="checkbox" checked={selectedDriverIds.includes(d.id)} onChange={() => toggleDriverSelection(d.id)} style={{ marginRight: 8 }} />
                <strong>{d.id}</strong> — {d.name} <span className={`badge ${d.status === 'AVAILABLE' ? 'status-COMPLETE' : 'status-CANCELLED'}`}>{d.status}</span> <button className="secondary" style={{ marginLeft: 8, marginTop: 0, padding: '0.2rem 0.5rem' }} onClick={() => startEdit(d)}>Edit</button>
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                {d.license_type} | {d.vehicle_type} | {d.zone || 'no zone'} | {d.vehicle_make_model_colour} | Reg …{d.reg_last_3} | Exp {d.expiry_date} | Badge {d.badge_number} | {d.phone} | Commission {d.commission_rate || 0}% | Future bracket: {d.letter || 'None'}
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                <strong>Owed settle: {formatCurrency(d.settle_balance)}</strong>
                <input type="number" step="0.01" placeholder="Payment" style={{ width: 90, marginLeft: 10 }}
                  value={settleAmounts[d.id]?.amount || ''}
                  onChange={e => setSettleAmounts(prev => ({ ...prev, [d.id]: { ...prev[d.id], amount: e.target.value } }))} />
                <input placeholder="Note" style={{ width: 120, marginLeft: 6 }}
                  value={settleAmounts[d.id]?.note || ''}
                  onChange={e => setSettleAmounts(prev => ({ ...prev, [d.id]: { ...prev[d.id], note: e.target.value } }))} />
                <button className="secondary" style={{ marginLeft: 6 }} onClick={() => adjustSettle(d.id)}>Record</button>
              </p>
              {d.last_lat != null && d.last_lng != null && (
                <p style={{ fontSize: '0.8rem' }}>
                  Last location: lat {d.last_lat.toFixed(4)}, lng {d.last_lng.toFixed(4)} at {safeLocaleTime(d.last_location_at)}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Future bookings</summary>
      {futureOffers.length === 0 && <p>No active future offers.</p>}
      {futureOffers.map(fo => (
        <div key={fo.jobId} className="card">
          <p><strong>{fo.jobId}</strong> <span className={`badge status-${fo.status}`}>{fo.status}</span></p>
          <p>{fo.pickupAddress} → {fo.dropoffAddress}</p>
          <p>Pickup {safeLocaleString(fo.pickupTime)} · Fare {formatCurrency(fo.fare)}</p>
          <p>Offer stage: <strong>{fo.currentLetter || '—'}</strong> · Offered to: {fo.currentDriverId || '—'} · Expires {safeLocaleTime(fo.expiresAt)}</p>
          {fo.status === 'SCHEDULED' && fo.currentDriverId && <button onClick={() => dispatchFutureOffer(fo.jobId)}>Dispatch now</button>}
        </div>
      ))}

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Bids board</summary>
      {bids.length === 0 && <p>No bids.</p>}
      {bids.map((b, i) => (
        <div key={i} className="card">
          <p><strong>{b.job_id}</strong> <span className="badge status-NEW">{b.status}</span></p>
          <p>Driver {b.driver_id} bid {formatCurrency(b.amount)} · {safeLocaleString(b.created_at)}</p>
        </div>
      ))}

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Tariff editor</summary>
      <div className="card">
        {tariff ? (
          <form onSubmit={saveTariff}>
            <div className="row">
              {['car', 'mpv'].map(type => (
                <div key={type} style={{ flex: 1, minWidth: 260 }}>
                  <h4 style={{ textTransform: 'uppercase' }}>{type}</h4>
                  {['day', 'night'].map(period => (
                    <div key={period} style={{ marginBottom: 12 }}>
                      <strong>{period}</strong>
                      <div className="row">
                        <div className="form-group"><label>First mile</label><input type="number" step="0.01" name={`${type}-${period}-firstMile`} defaultValue={tariff[type][period].firstMile} /></div>
                        <div className="form-group"><label>Per mile</label><input type="number" step="0.01" name={`${type}-${period}-perMile`} defaultValue={tariff[type][period].perMile} /></div>
                        <div className="form-group"><label>Wait/min</label><input type="number" step="0.01" name={`${type}-${period}-waiting`} defaultValue={tariff[type][period].waitingPerMinute} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button type="submit">Save tariff</button>
          </form>
        ) : <p>Loading…</p>}
      </div>

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">SMS messages</summary>
      <div className="card">
        {pendingSms.length === 0 ? <p>No upcoming SMS messages.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingSms.map((m, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--gold)' }}>
                  {safeLocaleString(m.scheduledAt)} · {m.jobId} · {m.recipientName} {m.phone ? '(' + m.phone + ')' : ''}
                  {!m.enabled && <span style={{ color: 'var(--cream-dim)', marginLeft: 8 }}>(template disabled)</span>}
                </p>
                <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Audit log</summary>
      <div className="card" style={{ maxHeight: 400, overflow: 'auto' }}>
        {auditLogs.length === 0 && <p>No recent events.</p>}
        {auditLogs.length > 0 && (
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}><td>{safeLocaleString(log.created_at)}</td><td>{log.actor_type} {log.actor_id}</td><td>{log.action}</td><td>{log.entity_type} {log.entity_id}</td><td><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(log.metadata)}</pre></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      </details>
      <details className="wj-admin-section">
      <summary className="wj-admin-section-title">Export</summary>
      <div className="card">
        <button className="secondary" onClick={() => exportCSV(jobs, `jobs-${new Date().toISOString().slice(0,10)}.csv`)}>Export jobs CSV</button>
        <button className="secondary" style={{ marginLeft: 8 }} onClick={() => exportCSV(drivers, `drivers-${new Date().toISOString().slice(0,10)}.csv`)}>Export drivers CSV</button>
      </div>

      </details>
      {jobDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setJobDetail(null)}>
          <div className="card" style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto', margin: 20 }} onClick={e => e.stopPropagation()}>
            <h3>{jobDetail.jobId}</h3>
            <p>Status: <span className={`badge status-${jobDetail.status}`}>{jobDetail.status}</span></p>
            <p>{jobDetail.pickupAddress} → {jobDetail.dropoffAddress}</p>
            <p>Customer: {jobDetail.customerName} · {jobDetail.customerPhone}</p>
            <p>Fare: {formatCurrency(jobDetail.fare)} · Vehicle: {jobDetail.vehicleType}</p>
            <p>Pickup time: {safeLocaleString(jobDetail.pickupTime)}</p>
            <h4>Timeline</h4>
            <ul>
              <li>Created: {safeLocaleString(jobDetail.createdAt)}</li>
              {jobDetail.onWayAt && <li>On way: {safeLocaleString(jobDetail.onWayAt)}</li>}
              {jobDetail.arrivedAt && <li>Arrived: {safeLocaleString(jobDetail.arrivedAt)}</li>}
              {jobDetail.pobAt && <li>Passenger on board: {safeLocaleString(jobDetail.pobAt)}</li>}
              {jobDetail.completedAt && <li>Completed: {safeLocaleString(jobDetail.completedAt)}</li>}
              {jobDetail.cancelledAt && <li>Cancelled: {safeLocaleString(jobDetail.cancelledAt)}</li>}
            </ul>
            <button onClick={() => setJobDetail(null)}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}
