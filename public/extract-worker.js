const dec = new TextDecoder();

// ── OPFS temp-download helpers ────────────────────────────────────────────────
// Only used when there is enough free storage AND resume is needed.

async function getTempDir(create = false) {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('_dl_tmp', { create });
}

async function getTempMeta() {
    try {
        const dir = await getTempDir();
        const fh = await dir.getFileHandle('meta.json');
        return JSON.parse(await (await fh.getFile()).text());
    } catch { return null; }
}

async function saveTempMeta(url, total) {
    try {
        const dir = await getTempDir(true);
        const fh = await dir.getFileHandle('meta.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify({ url, total }));
        await w.close();
    } catch (_) {}
}

async function getTempDataSize() {
    try {
        const dir = await getTempDir();
        const fh = await dir.getFileHandle('data.bin');
        return (await fh.getFile()).size;
    } catch { return 0; }
}

// Returns null if temp storage cannot be used (no quota or seek unsupported).
async function openTempWritable(resumeOffset) {
    const dir = await getTempDir(true);
    const fh = await dir.getFileHandle('data.bin', { create: true });
    if (resumeOffset > 0) {
        let w;
        try { w = await fh.createWritable({ keepExistingData: true }); } catch { return null; }
        try {
            await w.seek(resumeOffset);
        } catch {
            // seek() not supported on this browser — can't resume
            try { await w.close(); } catch {}
            return null;
        }
        return w;
    }
    try { return await fh.createWritable(); } catch { return null; }
}

async function getTempFileStream() {
    const dir = await getTempDir();
    const fh = await dir.getFileHandle('data.bin');
    return (await fh.getFile()).stream();
}

async function cleanupTemp() {
    try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('_dl_tmp', { recursive: true });
    } catch (_) {}
}

// Check whether the device has enough free OPFS space to store the compressed
// tar (~700 MB). If not, fall back to direct streaming (no resume capability
// but no storage crash either).
async function hasEnoughStorageForTemp() {
    try {
        const est = await navigator.storage.estimate();
        const free = (est.quota || 0) - (est.usage || 0);
        return free > 950 * 1024 * 1024; // need ~950 MB headroom
    } catch { return false; }
}

// ── Tar / OPFS helpers ────────────────────────────────────────────────────────

function readStr(header, start, len) {
    let end = start;
    while (end < start + len && header[end] !== 0) end++;
    return dec.decode(header.subarray(start, end));
}

function shouldIgnore(name) {
    const base = name.split('/').pop();
    return !name || base === '.DS_Store' || base.startsWith('._');
}

async function openOPFSWritable(name) {
    const root = await navigator.storage.getDirectory();
    const parts = name.split('/');
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    return fh.createWritable();
}

// ── Progress throttle ─────────────────────────────────────────────────────────

let lastProgressSent = 0;
function sendProgress(data, force = false) {
    const now = Date.now();
    if (force || now - lastProgressSent >= 48) {
        lastProgressSent = now;
        self.postMessage(data);
    }
}

// ── Buffer helpers ────────────────────────────────────────────────────────────

function flattenChunks(chunks, totalLen) {
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// ── Core extraction from a ReadableStream ────────────────────────────────────
// estimatedDecompBytes is used for extraction progress (0 = unknown).

async function extractFromStream(sourceStream, estimatedDecompBytes) {
    const ESTIMATED = estimatedDecompBytes || (880 * 1024 * 1024);
    let bytesOut = 0;

    const trackDecomp = new TransformStream({
        transform(chunk, controller) { bytesOut += chunk.byteLength; controller.enqueue(chunk); }
    });

    const decompressed = sourceStream
        .pipeThrough(new DecompressionStream('gzip'))
        .pipeThrough(trackDecomp);

    const reader = decompressed.getReader();
    let buf = new Uint8Array(0);
    let state = 'HEADER';
    let paddedRemaining = 0, actualRemaining = 0;
    let pendingLongName = null, currentFileName = '';
    let longNameBuf = new Uint8Array(0);
    let filesDone = 0;
    let currentWritable = null;

    const FLUSH_SIZE = 1024 * 1024;
    let writeChunks = [], writeTotal = 0;

    async function flushWrite(force = false) {
        if (writeTotal === 0 || (!force && writeTotal < FLUSH_SIZE)) return;
        await currentWritable.write(flattenChunks(writeChunks, writeTotal));
        writeChunks = []; writeTotal = 0;
    }

    async function processBuffer() {
        while (true) {
            if (state === 'HEADER') {
                if (buf.length < 512) return;
                const header = buf.subarray(0, 512);
                buf = buf.subarray(512);

                let allZero = true;
                for (let i = 0; i < 512; i++) { if (header[i] !== 0) { allZero = false; break; } }
                if (allZero) continue;

                const typeflag = String.fromCharCode(header[156]);
                const rawName = readStr(header, 0, 100);
                const prefix = readStr(header, 345, 155);
                const size = parseInt(readStr(header, 124, 12).trim(), 8) || 0;
                paddedRemaining = Math.ceil(size / 512) * 512;
                actualRemaining = size;

                if (typeflag === 'L') {
                    state = 'LONGNAME'; longNameBuf = new Uint8Array(0);
                } else if (typeflag !== '0' && typeflag !== '' && typeflag !== '\0') {
                    pendingLongName = null;
                    state = paddedRemaining > 0 ? 'SKIP' : 'HEADER';
                } else {
                    let name = pendingLongName || (prefix ? `${prefix}/${rawName}` : rawName);
                    pendingLongName = null;
                    name = name.replace(/\0/g, '').replace(/\/$/, '');

                    if (shouldIgnore(name) || size === 0) {
                        state = paddedRemaining > 0 ? 'SKIP' : 'HEADER';
                    } else {
                        currentWritable = await openOPFSWritable(name);
                        currentFileName = name.split('/').pop();
                        writeChunks = []; writeTotal = 0;
                        state = 'DATA';
                    }
                }

            } else if (state === 'DATA') {
                if (buf.length === 0) return;
                const take = Math.min(paddedRemaining, buf.length);
                const writeLen = Math.min(actualRemaining, take);
                if (writeLen > 0) {
                    writeChunks.push(buf.slice(0, writeLen));
                    writeTotal += writeLen;
                    actualRemaining -= writeLen;
                    await flushWrite(false);
                }
                buf = buf.subarray(take);
                paddedRemaining -= take;
                if (paddedRemaining === 0) {
                    await flushWrite(true);
                    await currentWritable.close();
                    currentWritable = null;
                    filesDone++;
                    const pct = 65 + Math.min(Math.round((bytesOut / ESTIMATED) * 34), 34);
                    sendProgress({ type: 'progress', phase: 'extracting', pct, done: filesDone, total: 0, file: currentFileName });
                    state = 'HEADER';
                }

            } else if (state === 'SKIP') {
                if (buf.length === 0) return;
                const take = Math.min(paddedRemaining, buf.length);
                buf = buf.subarray(take);
                paddedRemaining -= take;
                if (paddedRemaining === 0) state = 'HEADER';

            } else if (state === 'LONGNAME') {
                if (buf.length === 0) return;
                const take = Math.min(paddedRemaining, buf.length);
                const writeLen = Math.min(actualRemaining, take);
                if (writeLen > 0) {
                    const next = new Uint8Array(longNameBuf.length + writeLen);
                    next.set(longNameBuf); next.set(buf.subarray(0, writeLen), longNameBuf.length);
                    longNameBuf = next; actualRemaining -= writeLen;
                }
                buf = buf.subarray(take); paddedRemaining -= take;
                if (paddedRemaining === 0) {
                    pendingLongName = dec.decode(longNameBuf).replace(/\0/g, '');
                    longNameBuf = new Uint8Array(0); state = 'HEADER';
                }
            } else { return; }
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (buf.length === 0) {
                buf = value;
            } else {
                const merged = new Uint8Array(buf.length + value.length);
                merged.set(buf); merged.set(value, buf.length); buf = merged;
            }
            await processBuffer();
        }
        await processBuffer();
        if (currentWritable) { await flushWrite(true); await currentWritable.close(); currentWritable = null; }
    } catch (err) {
        if (currentWritable) { try { await currentWritable.close(); } catch (_) {} }
        throw err;
    }

    // Write ready marker
    const root = await navigator.storage.getDirectory();
    const marker = await root.getFileHandle('_game_ready', { create: true });
    const mw = await marker.createWritable();
    await mw.write(new TextEncoder().encode('v4'));
    await mw.close();
}

// ── Download modes ────────────────────────────────────────────────────────────

// MODE A: stream directly from network → decompress → OPFS.
// Works on ALL devices. Lower peak memory. No resume capability.
async function runStreamingDownload(url) {
    sendProgress({ type: 'progress', phase: 'downloading', pct: 0, loaded: 0, total: 0 }, true);

    let response;
    try { response = await fetch(url); } catch (err) {
        throw new Error(`Download failed: ${err.message}`);
    }
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

    const total = parseInt(response.headers.get('content-length') || '0', 10);
    let loaded = 0;

    const trackDownload = new TransformStream({
        transform(chunk, controller) {
            loaded += chunk.byteLength;
            const pct = total > 0 ? Math.min(Math.round((loaded / total) * 65), 65) : 0;
            sendProgress({ type: 'progress', phase: 'downloading', pct, loaded, total });
            controller.enqueue(chunk);
        }
    });

    sendProgress({ type: 'progress', phase: 'extracting', pct: 65, done: 0, total: 0, file: '' }, true);
    await extractFromStream(response.body.pipeThrough(trackDownload), 0);
}

// MODE B: download to OPFS temp file, then extract from temp.
// Enables resume on interrupted downloads. Requires ~950 MB free storage.
async function runTempFileDownload(url, resumeOffset, totalBytes) {
    // Open temp writable (with seek for resume)
    const tempWritable = await openTempWritable(resumeOffset);
    if (!tempWritable) {
        // seek() not supported or quota error — fall back to streaming
        return runStreamingDownload(url);
    }

    // Announce resume if applicable
    if (resumeOffset > 0 && totalBytes > 0) {
        const pct = Math.min(Math.round((resumeOffset / totalBytes) * 65), 64);
        sendProgress({ type: 'progress', phase: 'downloading', pct, loaded: resumeOffset, total: totalBytes, resuming: true }, true);
    } else {
        sendProgress({ type: 'progress', phase: 'downloading', pct: 0, loaded: 0, total: 0 }, true);
    }

    // Fetch remaining bytes
    const headers = resumeOffset > 0 ? { Range: `bytes=${resumeOffset}-` } : {};
    let response;
    try { response = await fetch(url, { headers }); } catch (err) {
        try { await tempWritable.close(); } catch (_) {}
        throw new Error(`Download failed: ${err.message}`);
    }

    let contentTotal = totalBytes;
    if (response.status === 206) {
        const cr = response.headers.get('content-range') || '';
        const m = cr.match(/bytes \d+-\d+\/(\d+)/);
        contentTotal = m ? parseInt(m[1], 10) : resumeOffset + parseInt(response.headers.get('content-length') || '0', 10);
    } else if (response.status === 200) {
        // Server ignored Range — restart fresh
        contentTotal = parseInt(response.headers.get('content-length') || '0', 10);
    } else {
        try { await tempWritable.close(); } catch (_) {}
        throw new Error(`Download failed: HTTP ${response.status}`);
    }

    if (!response.ok && response.status !== 206) {
        try { await tempWritable.close(); } catch (_) {}
        throw new Error(`Download failed: HTTP ${response.status}`);
    }

    await saveTempMeta(url, contentTotal);

    let loaded = resumeOffset;
    const reader = response.body.getReader();
    let countdown = 200;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await tempWritable.write(value);
            loaded += value.byteLength;
            if (contentTotal > 0) {
                const pct = Math.min(Math.round((loaded / contentTotal) * 65), 65);
                sendProgress({ type: 'progress', phase: 'downloading', pct, loaded, total: contentTotal });
            }
            if (--countdown <= 0) { countdown = 200; await saveTempMeta(url, contentTotal); }
        }
    } finally {
        try { await tempWritable.close(); } catch (_) {}
    }

    // Extract from the completed temp file
    sendProgress({ type: 'progress', phase: 'extracting', pct: 65, done: 0, total: 0, file: '' }, true);
    const sourceStream = await getTempFileStream();
    await extractFromStream(sourceStream, 0);
    await cleanupTemp();
}

// ── Main message handler ──────────────────────────────────────────────────────

self.onmessage = async (event) => {
    const { file, url } = event.data;

    try {
        // ── FILE MODE (local upload, no resume needed) ──────────────────────
        if (file) {
            sendProgress({ type: 'progress', phase: 'reading', pct: 0, loaded: 0, total: file.size }, true);
            let loaded = 0;
            const trackRead = new TransformStream({
                transform(chunk, controller) {
                    loaded += chunk.byteLength;
                    const pct = Math.min(Math.round((loaded / file.size) * 65), 65);
                    sendProgress({ type: 'progress', phase: 'reading', pct, loaded, total: file.size });
                    controller.enqueue(chunk);
                }
            });
            await extractFromStream(file.stream().pipeThrough(trackRead), 0);
            self.postMessage({ type: 'done' });
            return;
        }

        // ── URL MODE ────────────────────────────────────────────────────────

        // Check for a valid partial download from a previous attempt
        const meta = await getTempMeta();
        const urlMatches = meta && meta.url === url;
        const partialSize = urlMatches ? await getTempDataSize() : 0;

        if (!urlMatches && meta) {
            // Stale meta from a different URL — discard
            await cleanupTemp();
        }

        if (partialSize > 0) {
            // We have a partial download — always use temp file path to resume it
            await runTempFileDownload(url, partialSize, meta.total || 0);
        } else {
            // Fresh download — decide based on available storage
            const canCache = await hasEnoughStorageForTemp();
            if (canCache) {
                await runTempFileDownload(url, 0, 0);
            } else {
                // Not enough free space for a 700 MB temp file — stream directly
                // This avoids QuotaExceededError crashes on low-storage devices.
                await runStreamingDownload(url);
            }
        }

        sendProgress({ type: 'progress', phase: 'extracting', pct: 100, done: 0, total: 0, file: '' }, true);
        self.postMessage({ type: 'done' });

    } catch (err) {
        console.error('[extract-worker]', err.name, err.message, err);
        let msg = `${err.name}: ${err.message}`;
        if (err.name === 'QuotaExceededError' || msg.includes('quota')) {
            msg = 'Not enough storage space. Free up space on your device and try again.';
        } else if (msg.includes('Download failed') || err.name === 'NetworkError') {
            msg = err.message; // already friendly
        }
        // Keep temp file on failure so next attempt can resume
        self.postMessage({ type: 'error', message: msg });
    }
};
