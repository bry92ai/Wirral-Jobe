import { spawn } from 'child_process';

const server = spawn('node', ['server.js'], { stdio: 'pipe' });
await new Promise(r => setTimeout(r, 1500));

try {
  const ping = await fetch('http://localhost:3001/api/ping');
  console.log('ping:', await ping.json());

  const book = await fetch('http://localhost:3001/api/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pickupAddress: 'Wirral', dropoffAddress: 'Liverpool', miles: 10,
      vehicleType: 'car', timeOfDay: 'day',
      pickupTime: new Date().toISOString(),
      customerName: 'Test', customerPhone: '07700000000'
    })
  });
  const booking = await book.json();
  console.log('booking:', booking);

  const track = await fetch(`http://localhost:3001/api/tracking/${booking.trackingToken}`);
  console.log('track:', await track.json());

  const drivers = await fetch('http://localhost:3001/api/admin/drivers');
  console.log('drivers:', await drivers.json());

  console.log('Smoke test passed');
} catch (e) {
  console.error('Smoke test failed:', e.message);
} finally {
  server.kill();
}
