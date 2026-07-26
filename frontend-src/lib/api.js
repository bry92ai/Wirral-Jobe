const FALLBACK_API_URL = 'https://script.google.com/macros/s/AKfycbxlBtOwnSlOTEiQvhvi_0b3lcKNCpCDD1nUxUYZwhahF16tBKUBNCkeX9yzh7Is5_WK/exec';
const API_BASE = (import.meta.env.VITE_API_URL || FALLBACK_API_URL).replace(/\/$/, '');
const IS_GAS = API_BASE.includes('script.google.com');

function gasUrl(query = {}) {
  const base = API_BASE.endsWith('/exec') ? API_BASE : API_BASE + '/exec';
  const qs = new URLSearchParams(query).toString();
  return base + (qs ? '?' + qs : '');
}

function extractAuth(extraHeaders) {
  const auth = {};
  if (extraHeaders['x-driver-id']) auth.driverId = extraHeaders['x-driver-id'];
  if (extraHeaders['x-driver-token']) auth.driverToken = extraHeaders['x-driver-token'];
  if (extraHeaders['x-admin-token']) auth.adminToken = extraHeaders['x-admin-token'];
  return auth;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function api(method, body = {}, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const route = '/api/' + method;
  let url, headers, reqBody, httpMethod;
  if (IS_GAS) {
    url = gasUrl({ route, ...body, ...auth });
    headers = {};
    reqBody = undefined;
    httpMethod = 'GET';
  } else {
    url = API_BASE + '/api/' + method;
    headers = { 'Content-Type': 'application/json', ...extraHeaders };
    reqBody = JSON.stringify(body);
    httpMethod = 'POST';
  }
  const res = await fetchWithTimeout(url, { method: httpMethod, headers, body: reqBody });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`Unexpected response from server (${res.status}). Please try again.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiGet(path, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const route = '/api' + path;
  let url, headers;
  if (IS_GAS) {
    url = gasUrl({ route, ...auth });
    headers = {};
  } else {
    url = API_BASE + '/api' + path;
    headers = extraHeaders;
  }
  const res = await fetchWithTimeout(url, { headers });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    await res.text().catch(() => '');
    throw new Error(`Unexpected response from server (${res.status}). Please try again.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiPatch(method, body = {}, extraHeaders = {}) {
  return api(method, body, extraHeaders);
}
