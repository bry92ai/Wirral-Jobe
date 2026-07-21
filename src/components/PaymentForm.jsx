import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { api } from '../lib/api.js';

export default function PaymentForm({ clientSecret, jobId, bookingFee, fare, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [payLoading, setPayLoading] = useState(false);

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPayLoading(true);
    onError('');

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) }
    });

    if (error) {
      onError(error.message);
      setPayLoading(false);
      return;
    }

    try {
      const data = await api('booking/confirm', { jobId });
      onSuccess(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <form onSubmit={handlePay}>
      <div className="form-group">
        <label>Card details</label>
        <div style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '6px', background: '#fff' }}>
          <CardElement options={{ style: { base: { fontSize: '16px' } }, hidePostalCode: true }} />
        </div>
      </div>
      <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
        Pay a £{bookingFee.toFixed(2)} booking fee now. The full fare of £{fare.toFixed(2)} is paid to the driver.
      </p>
      <button type="submit" disabled={!stripe || payLoading}>
        {payLoading ? 'Processing…' : `Pay £${bookingFee.toFixed(2)} booking fee`}
      </button>
    </form>
  );
}
