const GAS_URL = (process.env.GAS_URL || '').replace(/\/$/, '');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Driver-Id, X-Driver-Token, X-Admin-Token'
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { action = '', payload = {}, auth = {} } = body;
  if (!action) {
    return jsonResponse(400, { error: 'Missing action' });
  }

  if (!GAS_URL) {
    return jsonResponse(500, { error: 'GAS_URL is not configured' });
  }

  const route = '/api/' + action;
  const cacheBuster = Date.now() + '-' + Math.random().toString(36).slice(2);
  const query = new URLSearchParams({ route, _cb: cacheBuster, ...payload, ...auth });
  const url = GAS_URL + '/exec?' + query.toString();

  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    const text = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Driver-Id, X-Driver-Token, X-Admin-Token'
      },
      body: text
    };
  } catch (err) {
    return jsonResponse(502, { error: 'Proxy error: ' + (err.message || String(err)) });
  }
};
