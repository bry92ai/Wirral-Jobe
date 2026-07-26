# Wirral Jobe — Handover Package

## What this package contains

```
backend/              Node.js backend (server.js) + Google Apps Script legacy backend
frontend-build/       Production build of the React app (dist/)
frontend-src/         React source code
scripts/              Utility scripts for zone generation and verification
package.json          Project dependencies and scripts
vite.config.js      Frontend build configuration
netlify.toml        Netlify routing/deployment settings
index.html          HTML entry point
test-smoke.mjs      Basic API smoke test
.env.example        Environment variable template
```

## Quick start (local development)

1. Install dependencies
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example` and fill in your secrets.

3. Start the backend and frontend together
   ```bash
   npm run dev
   ```
   - React app: http://localhost:5173
   - API server: http://localhost:3001

4. Open the smoke test to verify the API
   ```bash
   node test-smoke.mjs
   ```

## Roles / routes

| Route | Purpose |
|-------|---------|
| `/` | Customer booking form |
| `/driver` | Driver login, map, offers, queue, bids |
| `/admin` | Admin dispatch board |
| `/track/:token` | Customer live tracking page |

## Default logins

- **Driver:** seed drivers in `server.js` (e.g. `DRV-001` / `1234`)
- **Admin:** password set by `ADMIN_PASSWORD` env var, defaults to `admin`

## Environment variables

See `.env.example` for the full list. The key variables are:

- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API (used by admin map)
- `VITE_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` — card payments
- `ADMIN_PASSWORD` — admin login password
- `GOOGLE_SHEET_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — optional Google Sheets sync
- `VITE_API_URL` — backend URL for the frontend (e.g. `https://api.yourapp.com`)

If Stripe keys are omitted, the app falls back to a no-card “Confirm booking” flow.
If the Google Maps key is omitted, the admin page still works but the map will not load.

## Production deployment

1. Build the frontend
   ```bash
   npm run build
   ```

2. Deploy the contents of `frontend-build/` (the `dist/` folder) to your static host.

3. Deploy `backend/server.js` to a Node host and set the backend environment variables.

4. Point `VITE_API_URL` at the deployed backend.

## Notes

- The SQLite database is created automatically at `./data/wirral-jobe.db` when the server starts.
- The server now sends every immediate booking through the driver offer process instead of silently auto-assigning the nearest queued driver.
- Future bookings (pickup time > 1 hour away) are held as `NEW` and appear in the driver **Future bookings** panel rather than being offered immediately.
- The customer booking flow now has a payment/confirmation step after entering details.
