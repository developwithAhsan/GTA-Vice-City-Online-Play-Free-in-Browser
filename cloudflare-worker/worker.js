export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
        }
      });
    }

    // Use the direct server URL (avoids the CDN layer that blocks cloud IPs)
    // Falls back to a secondary server if the primary is unavailable
    const PRIMARY_URL  = 'https://ia801606.us.archive.org/0/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';
    const FALLBACK_URL = 'https://ia601606.us.archive.org/25/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';

    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';

    let upstream = await fetch(PRIMARY_URL, {
      method,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });

    // If blocked (returns HTML or an error), try the fallback server
    const ct = upstream.headers.get('content-type') || '';
    if (!upstream.ok || ct.includes('text/html')) {
      upstream = await fetch(FALLBACK_URL, {
        method,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
    }

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const cl = upstream.headers.get('content-length');
    if (cl) headers.set('Content-Length', cl);

    // HEAD must return a null body
    return new Response(method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers,
    });
  }
}
