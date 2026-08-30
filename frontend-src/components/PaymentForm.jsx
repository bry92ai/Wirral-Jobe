export default function PaymentForm({ onConfirm, error, loading }) {
  return (
    <div>
      <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        No payment is taken when you book. Confirm your journey and we’ll start finding a driver.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="wj-details-submit" onClick={onConfirm} disabled={loading}>
        {loading ? 'Confirming…' : 'Confirm booking'} <b>›</b>
      </button>
    </div>
  );
}
