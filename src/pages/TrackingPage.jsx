import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../lib/api.js';

export default function TrackingPage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await apiGet(`/tracking/${token}`);
        if (alive) setJob(data);
      } catch (err) {
        if (alive) setError(err.message);
      }
    }
    load();
    const id = setInterval(load, 7000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  const label = {
    NEW: 'Finding a driver',
    ASSIGNED: 'Driver assigned',
    ON_WAY: 'Driver on the way',
    ARRIVED: 'Driver has arrived',
    POB: 'Journey in progress',
    COMPLETE: 'Journey complete',
    CANCELLED: 'Booking cancelled'
  }[job?.status] || 'Loading…';

  const timeline = ['NEW', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB'];

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <img src="/design-refs/logo.jpg" alt="The Wirral Jobe" style={{ width: 92, maxWidth: '30%' }} />
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Track your booking</h1>
          <p className="muted" style={{ margin: 0 }}>Live progress for your Wirral Jobe journey.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {job && (
        <>
          <div style={{ border: '1.5px solid rgba(246,237,211,0.25)', background: '#111', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
            <div className={`badge status-${job.status}`} style={{ marginBottom: '0.8rem' }}>{label}</div>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <div><strong>Reference:</strong> {job.jobId}</div>
              <div><strong>From:</strong> {job.pickupAddress}</div>
              <div><strong>To:</strong> {job.dropoffAddress}</div>
              <div><strong>Maximum chargeable amount:</strong> £{job.fare.toFixed(2)}</div>
              {job.driverId && <div><strong>Driver:</strong> {job.driverId}</div>}
              {job.driverLat != null && job.driverLng != null && (
                <div>
                  <strong>Driver location:</strong> lat {job.driverLat.toFixed(4)}, lng {job.driverLng.toFixed(4)}
                  {' '}<span className="muted">(last seen {new Date(job.driverLocationAt).toLocaleTimeString()})</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 style={{ marginBottom: '0.6rem' }}>Journey progress</h2>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {timeline.map((s, i) => (
                <span
                  key={s}
                  className="badge"
                  style={{ opacity: timeline.indexOf(job.status) >= i ? 1 : 0.4 }}
                >
                  {s.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
