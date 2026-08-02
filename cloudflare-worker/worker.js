/**
 * Cloudflare Worker — GTA Vice City asset proxy
 *
 * Streams vc-assets.tar.gz from archive.org to the browser.
 * Deploy this worker and set its URL as VITE_ASSET_URL in your Replit secrets.
 *
 * Deploy:
 *   cd cloudflare-worker
 *   npx wrangler deploy
 */

const PRIMARY_URL  = 'https://ia801606.us.archive.org/0/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';
const FALLBACK_URL = 'https://ia601606.us.archive.org/25/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/octet-stream, */*',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

async function tryFetch(url, method) {
  return fetch(url, { method, headers: FETCH_HEADERS, redirect: 'follow' });
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';

    let upstream;
    try {
      upstream = await tryFetch(PRIMARY_URL, method);

      // Fall back if primary returns HTML (blocked) or error
      const ct = upstream.headers.get('content-type') || '';
      if (!upstream.ok || ct.includes('text/html')) {
        upstream = await tryFetch(FALLBACK_URL, method);
      }
    } catch (err) {
      return new Response(`Proxy fetch error: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    if (!upstream.ok) {
      return new Response(`Upstream returned ${upstream.status}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const ct = upstream.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      return new Response('All CDN servers appear blocked from this edge location.', {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const respHeaders = new Headers(CORS_HEADERS);
    respHeaders.set('Content-Type', 'application/octet-stream');
    const cl = upstream.headers.get('content-length');
    if (cl) respHeaders.set('Content-Length', cl);

    // Stream directly — body is never buffered in memory
    return new Response(method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers: respHeaders,
    });
  },
};
