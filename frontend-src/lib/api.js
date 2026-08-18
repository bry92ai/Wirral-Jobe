const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function extractAuth(extraHeaders) {
  const lower = {};
  for (const k of Object.keys(extraHeaders || {})) lower[k.toLowerCase()] = extraHeaders[k];
  const auth = {};
  if (lower['x-driver-id']) auth.driverId = lower['x-driver-id'];
  if (lower['x-driver-token']) auth.driverToken = lower['x-driver-token'];
  if (lower['x-admin-token']) auth.adminToken = lower['x-admin-token'];
  return auth;
}

function apiUrl(method) {
  return API_BASE ? `${API_BASE}/api/${method}` : `/api/${method}`;
}

function apiGetUrl(path) {
  return API_BASE ? `${API_BASE}/api${path}` : `/api${path}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out (${url}). Please check your connection and try again.`);
    }
    throw new Error(`Failed to fetch ${url}: ${err.message || err}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function api(method, body = {}, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const url = apiUrl(method);
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ action: method, payload: body, auth }),
    cache: 'no-store'
  });
  const data = await res.json().catch(() => null);
  if (!data && !res.ok) throw new Error(`Unexpected response from server (${res.status}). Please try again.`);
  if (!data) throw new Error(`Unexpected response from server. Please try again.`);
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiGet(path, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const url = apiGetUrl(path);
  const parts = path.split('/').filter(Boolean);
  const action = parts.join('/');
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ action, payload: {}, auth }),
    cache: 'no-store'
  });
  const data = await res.json().catch(() => null);
  if (!data && !res.ok) throw new Error(`Unexpected response from server (${res.status}). Please try again.`);
  if (!data) throw new Error(`Unexpected response from server. Please try again.`);
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiPatch(method, body = {}, extraHeaders = {}) {
  return api(method, body, extraHeaders);
}
