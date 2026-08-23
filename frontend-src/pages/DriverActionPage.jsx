import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function DriverActionPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const jobId = params.get('jobId');
    const driverId = params.get('driverId');
    const action = params.get('action');
    const token = params.get('token');

    if (!jobId || !driverId || !action || !token) {
      setStatus('error');
      setMessage('This link is missing required details.');
      return;
    }

    if (action !== 'accept' && action !== 'decline') {
      setStatus('error');
      setMessage('This link is not valid.');
      return;
    }

    api('driver/secure-action', { jobId, driverId, action, token })
      .then(result => {
        setStatus('success');
        setMessage(action === 'accept' ? 'You have accepted the job.' : 'You have declined the job.');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'Could not process this link. It may have expired or already been used.');
      });
  }, [params]);

  return (
    <div className="page">
      <h1>Job offer</h1>
      <div className="card">
        {status === 'loading' && <p>Processing…</p>}
        {status === 'success' && <p>{message}</p>}
        {status === 'error' && <p className="error">{message}</p>}
      </div>
    </div>
  );
}
