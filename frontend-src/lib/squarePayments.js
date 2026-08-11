const PRODUCTION_SDK_URL = 'https://web.squarecdn.com/v1/square.js';
const SANDBOX_SDK_URL = 'https://sandbox.web.squarecdn.com/v1/square.js';

export function loadSquareSdk(appId) {
  return new Promise((resolve, reject) => {
    if (window.Square) return resolve(window.Square);
    const script = document.createElement('script');
    script.src = String(appId || '').startsWith('sandbox') ? SANDBOX_SDK_URL : PRODUCTION_SDK_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.Square) return reject(new Error('Square SDK loaded but window.Square is missing'));
      resolve(window.Square);
    };
    script.onerror = () => reject(new Error('Failed to load Square Payments SDK. Check your connection.'));
    document.head.appendChild(script);
  });
}

export async function loadSquarePayments(appId, locationId) {
  const Square = await loadSquareSdk(appId);
  if (!Square.payments) throw new Error('Square Payments SDK is not available');
  return Square.payments(appId, locationId);
}
