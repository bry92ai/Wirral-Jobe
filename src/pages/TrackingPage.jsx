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

  return (
    <div className="card">
      <h1>Track your booking</h1>
      {error && <p className="error">{error}</p>}
      {job && (
        <>
          <p><strong>{label}</strong></p>
          <p>Reference: {job.jobId}</p>
          <p>From: {job.pickupAddress}</p>
          <p>To: {job.dropoffAddress}</p>
          <p>Fare: £{job.fare.toFixed(2)}</p>
          {job.driverId && <p>Driver: {job.driverId}</p>}
          {job.driverLat != null && job.driverLng != null && (
            <p>Driver location: lat {job.driverLat.toFixed(4)}, lng {job.driverLng.toFixed(4)} (last seen {new Date(job.driverLocationAt).toLocaleTimeString()})</p>
          )}
          <div style={{ marginTop: '1rem' }}>
            {['NEW', 'ASSIGNED', 'ON_WAY', 'ARRIVED', 'POB'].map((s, i) => (
              <span key={s} className="badge" style={{ marginRight: 4, opacity: ['NEW','ASSIGNED','ON_WAY','ARRIVED','POB'].indexOf(job.status) >= i ? 1 : 0.4 }}>
                {s.replace('_', ' ')}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
