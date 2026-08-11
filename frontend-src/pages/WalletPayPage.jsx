import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import PaymentForm from '../components/PaymentForm.jsx';
import { api } from '../lib/api.js';

export default function WalletPayPage() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const jobId = params.get('jobId') || '';
  const outboundJobId = params.get('outboundJobId') || '';
  const returnJobId = params.get('returnJobId') || '';
  const bookingFee = Number(params.get('bookingFee')) || 0;
  const fare = Number(params.get('fare')) || 0;

  async function handleConfirm(sourceId) {
    setLoading(true);
    setError('');
    try {
      if (outboundJobId && returnJobId) {
        await api('booking/confirm-pair', { outboundJobId, returnJobId, sourceId });
      } else if (jobId) {
        await api('booking/confirm', { jobId, sourceId });
      } else {
        throw new Error('Missing job information');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Payment could not be confirmed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wj-shell">
      <div className="wj-frame" style={{ maxWidth: 420, paddingTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Complete your payment</h2>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Payment received</p>
            <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem' }}>
              You can close this tab and return to the app.
            </p>
            <button
              className="wj-details-submit"
              onClick={() => {
                try { window.close(); } catch {}
              }}
              style={{ marginTop: '1rem' }}
            >
              Close tab
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Use a saved card, Google Pay, or Apple Pay here in your browser, then return to the app.
            </p>
            <PaymentForm
              bookingFee={bookingFee}
              fare={fare}
              clientSecret="square"
              onConfirm={handleConfirm}
              error={error}
              loading={loading}
              jobId={jobId}
              outboundJobId={outboundJobId}
              returnJobId={returnJobId}
            />
          </>
        )}
      </div>
    </div>
  );
}
