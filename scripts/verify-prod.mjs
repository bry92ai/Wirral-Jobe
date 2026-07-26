import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const URL = 'https://genuine-horse-5c76e9.netlify.app/';
const outDir = '/tmp/verify-prod-' + Date.now();
fs.mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    geolocation: { latitude: 53.4084, longitude: -2.9916 }, // New Brighton-ish
    permissions: ['geolocation']
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, '01-initial.png') });

  // Click the first CTA on the redesigned landing panel
  const startBtn = page.locator('button:has-text("RIDE NOW")').first();
  await startBtn.click();
  await sleep(1000);

  // Wait for geolocation pickup to settle
  await sleep(3000);
  await page.screenshot({ path: path.join(outDir, '02-after-geo.png') });

  // Check for map load error
  const mapError = page.locator('[data-testid="map-error"], .map-error-banner, text=/Google Maps API key/i');
  const errorCount = await mapError.count().catch(() => 0);
  console.log('Map error count:', errorCount);

  // Enter destination
  const destInput = page.locator('input[placeholder*="Where to"], input[placeholder*="destination"]').first();
  await destInput.fill('Liverpool John Lennon Airport');
  await sleep(1500);

  // Select the first suggestion by its text
  const suggestion = page.locator('text=Liverpool John Lennon Airport (LPL)').first();
  if (await suggestion.count() > 0) {
    await suggestion.click();
  } else {
    await destInput.press('Enter');
  }
  await sleep(3000);
  await page.screenshot({ path: path.join(outDir, '03-route.png') });

  // Select vehicle (Estate)
  const estateCard = page.locator('div:has-text("Estate")').first();
  if (await estateCard.count() > 0) await estateCard.click();
  await sleep(500);

  // Continue / Book
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Book now")').first();
  await continueBtn.click();
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '04-details.png') });

  // Fill details
  await page.locator('input[placeholder="Your name"]').fill('Test User');
  await page.locator('input[placeholder="Mobile number"]').fill('07700 900123');
  const bookBtn = page.locator('button:has-text("Book now")').first();
  await bookBtn.click();

  // Capture the Apps Script response for the booking request
  const bookingResponse = await new Promise(resolve => {
    const handler = async response => {
      const url = response.url();
      if (url.includes('script.google.com') && url.includes('/api/booking')) {
        page.off('response', handler);
        const text = await response.text().catch(() => '');
        resolve(text);
      }
    };
    page.on('response', handler);
    setTimeout(() => { page.off('response', handler); resolve(''); }, 20000);
  });
  console.log('Booking response:', bookingResponse);

  // Wait for result (success or error)
  await sleep(15000);
  await page.screenshot({ path: path.join(outDir, '05-result.png') });

  const success = await page.locator('text=Booking confirmed').count() > 0;
  const fail = await page.locator('text=Booking failed').count() > 0;
  const backendError = await page.locator('text=Cannot read properties').count() > 0;
  if (success) {
    console.log('SUCCESS: booking flow reached success state');
  } else if (fail || backendError) {
    console.log('FAIL: booking failed');
  } else {
    console.log('UNKNOWN final state');
  }

  console.log('Screenshots saved to', outDir);
  await browser.close();
})();
