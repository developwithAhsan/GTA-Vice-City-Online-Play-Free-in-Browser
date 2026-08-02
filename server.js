/**
 * Production server for Replit deployment.
 * - Sets required COOP/COEP headers (needed for SharedArrayBuffer / WASM threads)
 * - Proxies the game asset download at GET /api/proxy
 * - Serves the Vite build output from ./dist
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, 'dist');
const PORT = process.env.PORT || 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.txt':  'text/plain',
  '.data': 'application/octet-stream',
  '.gz':   'application/octet-stream',
  '.tar':  'application/octet-stream',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
};

// Required for SharedArrayBuffer (used by the WASM engine)
const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// Game asset proxy — mirrors api/proxy.js (Vercel edge version)
const PRIMARY_URL  = 'https://ia801606.us.archive.org/0/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';
const FALLBACK_URL = 'https://ia601606.us.archive.org/25/items/gta-vicecity-wasm-assets/vc-assets.tar.gz';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/octet-stream, */*',
};

async function fetchUpstream(url, method) {
  return fetch(url, { method, headers: FETCH_HEADERS, redirect: 'follow' });
}

async function handleProxy(req, res) {
  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...SECURITY_HEADERS, 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  try {
    let upstream = await fetchUpstream(PRIMARY_URL, method);
    const ct = upstream.headers.get('content-type') || '';
    if (!upstream.ok || ct.includes('text/html')) {
      upstream = await fetchUpstream(FALLBACK_URL, method);
    }

    if (!upstream.ok) {
      res.writeHead(502, { ...SECURITY_HEADERS });
      res.end(`Upstream error ${upstream.status}`);
      return;
    }

    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    };
    const cl = upstream.headers.get('content-length');
    if (cl) headers['Content-Length'] = cl;

    res.writeHead(200, headers);
    if (method === 'HEAD') { res.end(); return; }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, SECURITY_HEADERS);
    }
    res.end(`Proxy error: ${err.message}`);
  }
}

function handleStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let filePath = join(DIST, url.pathname);

  // Try exact path, then index.html inside directory, then SPA fallback
  for (const candidate of [filePath, join(filePath, 'index.html'), join(DIST, 'index.html')]) {
    try {
      const stat = statSync(candidate);
      if (!stat.isFile()) continue;

      const ext  = extname(candidate);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = { ...SECURITY_HEADERS, 'Content-Type': mime, 'Content-Length': stat.size };

      res.writeHead(200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(candidate).pipe(res);
      return;
    } catch {
      // try next candidate
    }
  }

  res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
  res.end('Not found');
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/proxy') {
    await handleProxy(req, res);
  } else {
    handleStatic(req, res);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on port ${PORT}`);
});
