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

function isJson(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
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
  // Forward as a JSON POST so nested objects (e.g. booking/return-pair) and long
  // payloads are not mangled into query strings. The GAS doPost handler parses
  // the request body and merges payload/auth into the request parameters.
  const gasBody = { route, ...payload, ...auth };

  try {
    const response = await fetch(GAS_URL + '/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gasBody),
      cache: 'no-store'
    });
    const text = await response.text();
    if (isJson(text)) {
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
    }
    return jsonResponse(502, { error: 'Unexpected response from backend. Please try again.' });
  } catch (err) {
    return jsonResponse(502, { error: 'Proxy error: ' + (err.message || String(err)) });
  }
};
