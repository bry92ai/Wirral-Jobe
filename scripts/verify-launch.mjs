import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
const env = Object.fromEntries(read('.env').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const separator = line.indexOf('=');
  return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
}));
const backend = read('backend/Code.gs');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const gradle = read('android/app/build.gradle');
const listing = read('PLAY_STORE_LISTING.txt');
const frontend = fs.readdirSync('frontend-src', { recursive: true }).filter(name => name.endsWith('.jsx')).map(name => read(`frontend-src/${name}`)).join('\n');

check('Production API URL configured', /^https:\/\//.test(env.VITE_API_URL || ''));
check('Google Maps key configured', Boolean(env.VITE_GOOGLE_MAPS_API_KEY));
check('Mapbox public token configured', /^pk\./.test(env.VITE_MAPBOX_ACCESS_TOKEN || ''));
check('Android release version is 3.3', /versionCode\s+18/.test(gradle) && /versionName\s+"3\.3"/.test(gradle));
check('Background location declared', manifest.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
check('Overlay permission removed', !manifest.includes('android.permission.SYSTEM_ALERT_WINDOW'));
check('Customer account deletion available', backend.includes("customer/delete-account") && frontend.includes('Delete account'));
check('One-minute scheduled dispatch configured', backend.includes('function setupScheduledTriggers()') && backend.includes('everyMinutes(1)'));
check('Future and escalation dispatch rules configured', backend.includes('EARLY_FUTURE_WINDOW_MS = 36') && backend.includes('FUTURE_OFFER_WINDOW_MS = 12') && backend.includes('processLiveDispatchEscalations'));
check('Store listing has no customer booking fee', !/£1 booking fee|Square/i.test(listing));
check('Frontend has no obsolete customer booking fee', !/booking fee|remaining fare/i.test(frontend));
check('Booking SMS has no obsolete customer booking fee', !/template: ["'`][^\n]*(?:£1|booking fee|remaining (?:fare|balance))/i.test(backend));
check('Backend calculates authoritative road mileage', backend.includes('function getRoadRoute(p)') && backend.includes('const route = getRoadRoute(p);'));
check('Booking requests are idempotent', backend.includes('findBookingByClientRequest') && frontend.includes('clientRequestId'));
check('Frontend has no straight-line pricing fallback', !frontend.includes('router.project-osrm.org') && !/returnMiles\s*=\s*distanceMiles/.test(frontend));
check('Offer alerts track job IDs', frontend.includes('seenOfferIdsRef') && !frontend.includes('previousOfferCountRef'));

checks.forEach(result => console.log(`${result.passed ? 'PASS' : 'FAIL'}: ${result.name}`));
if (checks.some(result => !result.passed)) process.exit(1);
