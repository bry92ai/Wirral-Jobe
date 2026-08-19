import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import PaymentForm from '../components/PaymentForm.jsx';
import { api } from '../lib/api.js';

export default function WalletPayPage() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pendingBookingId = params.get('pendingBookingId') || '';
  const outboundPendingBookingId = params.get('outboundPendingBookingId') || '';
  const returnPendingBookingId = params.get('returnPendingBookingId') || '';
  const bookingFee = Number(params.get('bookingFee')) || 0;
  const fare = Number(params.get('fare')) || 0;

  async function handleConfirm(sourceId) {
    setLoading(true);
    setError('');
    try {
      if (outboundPendingBookingId && returnPendingBookingId) {
        await api('booking/confirm-pair', { outboundPendingBookingId, returnPendingBookingId, sourceId });
      } else if (pendingBookingId) {
        await api('booking/confirm', { pendingBookingId, sourceId });
      } else {
        throw new Error('Missing booking information');
      }
      setDone(true);
      // Notify the parent tab on web so the booking app can proceed to the success screen.
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'wirral-payment-success' }, window.location.origin);
        } catch (e) {
          // Ignore cross-origin postMessage errors
        }
      }
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
              pendingBookingId={pendingBookingId}
              outboundPendingBookingId={outboundPendingBookingId}
              returnPendingBookingId={returnPendingBookingId}
            />
          </>
        )}
      </div>
    </div>
  );
}
