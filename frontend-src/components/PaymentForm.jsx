import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { loadSquarePayments } from '../lib/squarePayments.js';

const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APPLICATION_ID;
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID;

export default function PaymentForm({
  bookingFee,
  fare,
  clientSecret,
  onConfirm,
  error,
  loading,
  jobId,
  outboundJobId,
  returnJobId
}) {
  const [ready, setReady] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);

  const cardRef = useRef(null);
  const cardContainerRef = useRef(null);
  const googleContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const paymentRequestRef = useRef(null);
  const paymentRequestContainerRef = useRef(null);
  const onConfirmRef = useRef(onConfirm);
  const browserOpenedRef = useRef(false);

  useEffect(() => { onConfirmRef.current = onConfirm; }, [onConfirm]);

  // When the system-browser payment tab is closed, check whether the booking is already paid.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener;
    async function setup() {
      try {
        listener = await Browser.addListener('browserFinished', () => {
          if (!browserOpenedRef.current) return;
          browserOpenedRef.current = false;
          setBrowserOpen(false);
          onConfirmRef.current();
        });
      } catch (e) {
        // Browser plugin not available
      }
    }
    setup();
    return () => { if (listener?.remove) listener.remove(); };
  }, []);

  useEffect(() => {
    if (clientSecret !== 'square' || !SQUARE_APP_ID || !SQUARE_LOCATION_ID) return;

    let mounted = true;
    const cardContainer = cardContainerRef.current;
    const googleContainer = googleContainerRef.current;
    const appleContainer = appleContainerRef.current;
    let googlePayButton = null;
    let applePayButton = null;
    let paymentRequestButton = null;
    let googlePayHandler = null;
    let applePayHandler = null;
    let paymentRequestHandler = null;

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

        const paymentRequestContainer = paymentRequestContainerRef.current;
        if (paymentRequestContainer && payments.paymentRequest) {
          try {
            const paymentRequest = await payments.paymentRequest({
              request: {
                price: bookingFee.toFixed(2),
                priceStatus: 'FINAL',
                currencyCode: 'GBP',
                countryCode: 'GB'
              }
            });
            paymentRequestButton = await paymentRequest.attach(paymentRequestContainer);
            paymentRequestRef.current = paymentRequest;
            paymentRequestHandler = () => tokenize(paymentRequest);
            paymentRequestButton.addEventListener('click', paymentRequestHandler);
          } catch (e) {
            // Payment Request button not available on this device/browser
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
      if (paymentRequestButton && paymentRequestHandler) paymentRequestButton.removeEventListener('click', paymentRequestHandler);
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

  async function openBrowserPayment() {
    const params = new URLSearchParams();
    if (outboundJobId && returnJobId) {
      params.set('outboundJobId', outboundJobId);
      params.set('returnJobId', returnJobId);
    } else if (jobId) {
      params.set('jobId', jobId);
    } else {
      setPayError('Cannot open browser payment: job details are missing.');
      return;
    }
    params.set('bookingFee', Number(bookingFee).toFixed(2));
    params.set('fare', Number(fare).toFixed(2));
    const url = `${window.location.origin}/wallet-pay?${params.toString()}`;

    browserOpenedRef.current = true;
    setBrowserOpen(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      browserOpenedRef.current = false;
      setBrowserOpen(false);
      setPayError('Could not open the browser payment page. Please enter your card above.');
    }
  }

  const hasJobContext = !!(jobId || (outboundJobId && returnJobId));
  const onWalletPayPage = typeof window !== 'undefined' && window.location.pathname === '/wallet-pay';
  const showBrowserOption = hasJobContext && !onWalletPayPage;

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
          <div ref={paymentRequestContainerRef} style={{ minHeight: 44, marginBottom: 12 }} />
          <p style={{ color: 'var(--cream-dim)', fontSize: '0.8rem', textAlign: 'center', margin: '0.25rem 0 1rem' }}>
            Google Pay / Apple Pay buttons only appear when your device/browser supports them and Square has verified this domain.
          </p>

          {(payError || error) && <p className="error">{payError || error}</p>}

          <button className="wj-details-submit" onClick={payWithCard} disabled={!ready || payLoading || loading}>
            {payLoading || loading ? 'Processing…' : `Pay £${Number(bookingFee).toFixed(2)} booking fee`} <b>›</b>
          </button>

          {showBrowserOption && (
            <>
              <div style={{ textAlign: 'center', color: 'var(--cream-dim)', fontSize: '0.85rem', margin: '0.75rem 0' }}>or</div>
              <p style={{ color: 'var(--cream-dim)', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 0.5rem' }}>
                If Google Pay / Apple Pay buttons don’t appear above, use your browser’s saved cards or wallets here.
              </p>
              <button
                type="button"
                className="wj-details-submit wj-outline"
                onClick={openBrowserPayment}
                disabled={browserOpen || loading || payLoading}
              >
                {browserOpen ? 'Waiting for browser payment…' : 'Pay with card / Google Pay / Apple Pay in browser'} <b>›</b>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
