const API_BASE = import.meta.env.VITE_API_URL || '';

function apiUrl(path) {
  // Avoid double slash when base ends with / and path starts with /
  if (API_BASE && path.startsWith('/')) {
    return API_BASE + path;
  }
  return API_BASE + path;
}

export async function api(method, body, extraHeaders = {}) {
  const res = await fetch(apiUrl('/api/' + method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiGet(path, extraHeaders = {}) {
  const res = await fetch(apiUrl('/api' + path), { headers: extraHeaders });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function apiPatch(method, body, extraHeaders = {}) {
  const res = await fetch(apiUrl('/api/' + method), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
