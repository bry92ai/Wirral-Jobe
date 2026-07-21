# Wirral Flightpath — Working MVP

A minimal, locally-runnable taxi dispatch app: customer booking → driver assignment → status tracking.

## What works

- Customer books a ride (address, distance, vehicle, pickup time, contact details).
- Fare is calculated server-side using the same rule as the main app.
- Dispatch board shows open jobs and available drivers.
- Admin assigns a job to a driver.
- Driver logs in, sees assigned jobs, and marks On the way / Arrived / POB / Complete.
- Customer tracking page auto-refreshes with the latest status.
- SMS and payment layers are **stubbed** — they log to the server console instead of calling real Square/Twilio.

## Run it locally

```bash
npm install
npm run dev
```

This starts:
- Backend API on http://localhost:3001
- Frontend dev server on http://localhost:5173

## Demo accounts

| Driver ID | PIN |
|-----------|-----|
| DRV-001   | 1234 |
| DRV-002   | 5678 |

## Project structure

```
server.js          # Express backend + SQLite
src/
  App.jsx
  main.jsx
  index.css
  lib/
    api.js         # fetch helpers
    fare.js        # shared fare calculation
  pages/
    BookingPage.jsx
    TrackingPage.jsx
    DriverPage.jsx
    AdminPage.jsx
```

## Production notes

To make this production-ready, replace the stubs in `server.js`:
- `createPaymentStub()` with Square/Stripe integration.
- `sendSmsStub()` with Twilio.
- SQLite with Postgres/MySQL.
- Add JWT/session auth for drivers and admin.

## Build

```bash
npm run build
```

Output goes to `dist/`.
