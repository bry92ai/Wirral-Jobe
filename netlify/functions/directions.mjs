const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return jsonResponse(500, { error: 'Google Maps API key is not configured' });
  }

  const { origin, destination } = event.queryStringParameters || {};
  if (!origin || !destination) {
    return jsonResponse(400, { error: 'origin and destination are required' });
  }

  const url = 'https://maps.googleapis.com/maps/api/directions/json'
    + `?origin=${encodeURIComponent(origin)}`
    + `&destination=${encodeURIComponent(destination)}`
    + `&mode=driving`
    + `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    const text = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: text
    };
  } catch (err) {
    return jsonResponse(502, { error: 'Directions proxy error: ' + (err.message || String(err)) });
  }
};
