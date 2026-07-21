const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const IS_GAS = API_BASE.includes('script.google.com');

function apiUrl(methodPath, query = {}) {
  const base = API_BASE;
  const path = '/api/' + methodPath;
  const qs = new URLSearchParams(query).toString();
  return base + path + (qs ? '?' + qs : '');
}

function extractAuth(extraHeaders) {
  const auth = {};
  if (extraHeaders['x-driver-id']) auth.driverId = extraHeaders['x-driver-id'];
  if (extraHeaders['x-admin-token']) auth.adminToken = extraHeaders['x-admin-token'];
  return auth;
}

export async function api(method, body = {}, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  let url, headers, reqBody;
  if (IS_GAS) {
    url = apiUrl(method, { route: '/api/' + method });
    headers = { 'Content-Type': 'text/plain' };
    reqBody = JSON.stringify({ ...body, ...auth });
  } else {
    url = apiUrl(method);
    headers = { 'Content-Type': 'application/json', ...extraHeaders };
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(url, { method: 'POST', headers, body: reqBody });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiGet(path, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const route = '/api' + path;
  const query = IS_GAS ? { route, ...auth } : {};
  const url = apiUrl(path.replace(/^\/api\//, ''), query);
  const headers = IS_GAS ? {} : extraHeaders;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiPatch(method, body = {}, extraHeaders = {}) {
  return api(method, body, extraHeaders);
}
