export const config = { runtime: 'edge' };

// Redirect the browser directly to the Cloudflare Worker.
// This avoids routing 700 MB through Vercel's edge and bypasses archive.org's
// IP blocks on cloud-provider ranges (Vercel, AWS, etc.).
//
// The Cloudflare Worker has CORS headers and forwards Range requests, so the
// browser's chunked downloader works end-to-end without any server-side proxy.
//
// Override by setting CF_PROXY_URL in your Vercel project environment variables.
const CF_PROXY_URL = process.env.CF_PROXY_URL || 'https://gta-proxy.editingking-2977.workers.dev/';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 302 redirect — browser follows it directly to Cloudflare.
  // Range headers are preserved by the Fetch spec on redirect, so chunked
  // downloading still works after the redirect.
  return new Response(null, {
    status: 302,
    headers: {
      ...CORS_HEADERS,
      'Location': CF_PROXY_URL,
    },
  });
}
