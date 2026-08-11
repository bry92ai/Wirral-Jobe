import { useEffect, useRef, useState } from 'react';
import { loadSquarePayments } from '../lib/squarePayments.js';

const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APPLICATION_ID;
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID;

export default function PaymentForm({ bookingFee, fare, clientSecret, onConfirm, error, loading }) {
  const [ready, setReady] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  const cardRef = useRef(null);
  const cardContainerRef = useRef(null);
  const googleContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => { onConfirmRef.current = onConfirm; }, [onConfirm]);

  useEffect(() => {
    if (clientSecret !== 'square' || !SQUARE_APP_ID || !SQUARE_LOCATION_ID) return;

    let mounted = true;
    const cardContainer = cardContainerRef.current;
    const googleContainer = googleContainerRef.current;
    const appleContainer = appleContainerRef.current;
    let googlePayButton = null;
    let applePayButton = null;
    let googlePayHandler = null;
    let applePayHandler = null;

    async function tokenize(method) {
      setPayLoading(true);
      setPayError('');
      try {
        const result = await method.tokenize();
        if (result.status !== 'OK') {
          throw new Error(result.errors?.[0]?.message || 'Payment method could not be used');
        }
        onConfirmRef.current(result.token);
      } catch (err) {
        setPayError(err.message || 'Payment failed. Please try again.');
      } finally {
        setPayLoading(false);
      }
    }

    async function init() {
      try {
        const payments = await loadSquarePayments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        if (!mounted) return;

        if (cardContainer) {
          const card = await payments.card();
          await card.attach(cardContainer);
          cardRef.current = card;
        }

        if (googleContainer && payments.googlePay) {
          try {
            const googlePay = await payments.googlePay({
              request: {
                price: bookingFee.toFixed(2),
                priceStatus: 'FINAL',
                currencyCode: 'GBP',
                countryCode: 'GB'
              }
            });
            googlePayButton = await googlePay.attach(googleContainer);
            googlePayHandler = () => tokenize(googlePay);
            googlePayButton.addEventListener('click', googlePayHandler);
          } catch (e) {
            // Google Pay not available on this device/browser
          }
        }

        if (appleContainer && payments.applePay) {
          try {
            const applePay = await payments.applePay({
              request: {
                price: bookingFee.toFixed(2),
                priceStatus: 'FINAL',
                currencyCode: 'GBP',
                countryCode: 'GB'
              }
            });
            applePayButton = await applePay.attach(appleContainer);
            applePayHandler = () => tokenize(applePay);
            applePayButton.addEventListener('click', applePayHandler);
          } catch (e) {
            // Apple Pay not available on this device/browser
          }
        }

        setReady(true);
      } catch (err) {
        if (mounted) setPayError(err.message || 'Could not load payment form');
      }
    }

    init();

    return () => {
      mounted = false;
      if (googlePayButton && googlePayHandler) googlePayButton.removeEventListener('click', googlePayHandler);
      if (applePayButton && applePayHandler) applePayButton.removeEventListener('click', applePayHandler);
    };
  }, [clientSecret, bookingFee]);

  async function payWithCard() {
    if (!cardRef.current) return;
    setPayLoading(true);
    setPayError('');
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Card details could not be used');
      }
      onConfirmRef.current(result.token);
    } catch (err) {
      setPayError(err.message || 'Card payment failed. Please try again.');
    } finally {
      setPayLoading(false);
    }
  }

  if (clientSecret !== 'square') {
    return (
      <div>
        <p style={{ color: 'var(--cream-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          No booking fee is required. Confirm your booking and we’ll start finding a driver.
        </p>
        <button className="wj-details-submit" onClick={() => onConfirmRef.current()} disabled={loading}>
          {loading ? 'Confirming…' : 'Confirm booking'} <b>›</b>
        </button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginBottom: '1rem' }}>
        <strong>You are paying a £{Number(bookingFee).toFixed(2)} booking fee now.</strong><br />
        <span style={{ color: 'var(--cream-dim)', fontSize: '0.9rem' }}>
          The remaining fare of £{Number(fare).toFixed(2)} is paid directly to the driver at the end of your journey.
        </span>
      </p>

      {!SQUARE_APP_ID || !SQUARE_LOCATION_ID ? (
        <p className="error">Payments are not configured. Please contact support.</p>
      ) : (
        <>
          <div ref={cardContainerRef} style={{ minHeight: 44, marginBottom: 12 }} />
          <div ref={googleContainerRef} style={{ minHeight: 44, marginBottom: 12 }} />
          <div ref={appleContainerRef} style={{ minHeight: 44, marginBottom: 12 }} />

          {(payError || error) && <p className="error">{payError || error}</p>}

          <button className="wj-details-submit" onClick={payWithCard} disabled={!ready || payLoading || loading}>
            {payLoading || loading ? 'Processing…' : `Pay £${Number(bookingFee).toFixed(2)} booking fee`} <b>›</b>
          </button>
        </>
      )}
    </div>
  );
}
