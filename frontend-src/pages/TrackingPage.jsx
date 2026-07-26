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

  const stages = ['NEW', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB'];
  const activeStage = stages.indexOf(job?.status);

  return (
    <div className="wj-shell">
      <div className="wj-frame wj-track-screen">
        <div className="wj-track-kicker">The Wirral Jobe</div>
        <h1 className="wj-track-title">Track your ride</h1>
        {error && <p className="error">{error}</p>}
        {!job && !error && <p className="wj-track-loading">Loading your booking…</p>}
        {job && (
          <>
            <div className="wj-track-status"><span className={`wj-dot ${job.status === 'CANCELLED' ? 'wj-dot-red' : 'wj-dot-green'}`} /><strong>{label}</strong></div>
            <div className="wj-track-route">
              <div><span>Pickup</span><strong>{job.pickupAddress}</strong></div>
              <i />
              <div><span>Destination</span><strong>{job.dropoffAddress}</strong></div>
            </div>
            <div className="wj-track-meta"><div><small>Reference</small><strong>{job.jobId}</strong></div><div><small>Fare</small><strong>£{job.fare.toFixed(2)}</strong></div></div>
            {job.driverId && <div className="wj-track-driver"><span>Driver</span><strong>{job.driverId}</strong>{job.driverLat != null && <small>Location updated {new Date(job.driverLocationAt).toLocaleTimeString()}</small>}</div>}
            <div className="wj-track-progress">
              {stages.map((stage, index) => <div key={stage} className={activeStage >= index ? 'active' : ''}><i /> <span>{stage.replace('_', ' ')}</span></div>)}
            </div>
            <p className="wj-track-footer">Safe, reliable &amp; always on call.</p>
          </>
        )}
      </div>
    </div>
  );
}
