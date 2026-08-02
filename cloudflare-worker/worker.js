/**
 * Cloudflare Worker — GTA Vice City asset proxy
 *
 * Forwards Range headers so the browser can download in small resumable
 * chunks instead of one 700 MB request that archive.org throttles.
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
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

async function tryFetch(url, method, rangeHeader) {
  const headers = { ...FETCH_HEADERS };
  if (rangeHeader) headers['Range'] = rangeHeader;
  return fetch(url, { method, headers, redirect: 'follow' });
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const method   = request.method === 'HEAD' ? 'HEAD' : 'GET';
    const rangeHeader = request.headers.get('Range') || null;

    let upstream;
    try {
      upstream = await tryFetch(PRIMARY_URL, method, rangeHeader);

      // Fall back if primary returns HTML (blocked) or non-2xx
      const ct = upstream.headers.get('content-type') || '';
      if ((!upstream.ok && upstream.status !== 206) || ct.includes('text/html')) {
        upstream = await tryFetch(FALLBACK_URL, method, rangeHeader);
      }
    } catch (err) {
      return new Response(`Proxy fetch error: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    if (!upstream.ok && upstream.status !== 206) {
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

    // Build response headers — forward range/length info so browser knows
    // how much to expect and can resume properly.
    const respHeaders = new Headers(CORS_HEADERS);
    respHeaders.set('Content-Type', 'application/octet-stream');
    respHeaders.set('Accept-Ranges', 'bytes');

    const cl = upstream.headers.get('content-length');
    if (cl) respHeaders.set('Content-Length', cl);

    const cr = upstream.headers.get('content-range');
    if (cr) respHeaders.set('Content-Range', cr);

    const statusCode = upstream.status === 206 ? 206 : 200;

    return new Response(method === 'HEAD' ? null : upstream.body, {
      status: statusCode,
      headers: respHeaders,
    });
  },
};
