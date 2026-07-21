const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const IS_GAS = API_BASE.includes('script.google.com');

function gasUrl(query = {}) {
  const base = API_BASE.endsWith('/exec') ? API_BASE : API_BASE + '/exec';
  const qs = new URLSearchParams(query).toString();
  return base + (qs ? '?' + qs : '');
}

function extractAuth(extraHeaders) {
  const auth = {};
  if (extraHeaders['x-driver-id']) auth.driverId = extraHeaders['x-driver-id'];
  if (extraHeaders['x-admin-token']) auth.adminToken = extraHeaders['x-admin-token'];
  return auth;
}

export async function api(method, body = {}, extraHeaders = {}) {
  const auth = extractAuth(extraHeaders);
  const route = '/api/' + method;
  let url, headers, reqBody;
  if (IS_GAS) {
    url = gasUrl({ route, ...body, ...auth });
    headers = {};
    reqBody = undefined;
  } else {
    url = API_BASE + '/api/' + method;
    headers = { 'Content-Type': 'application/json', ...extraHeaders };
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(url, { method: IS_GAS ? 'GET' : 'POST', headers, body: reqBody });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiPatch(method, body = {}, extraHeaders = {}) {
  return api(method, body, extraHeaders);
}
