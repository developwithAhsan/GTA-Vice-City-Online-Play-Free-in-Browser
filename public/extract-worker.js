const dec = new TextDecoder();

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

// ── Flatten chunk array into one Uint8Array ──────────────────────────────────
function flattenChunks(chunks, totalLen) {
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

self.onmessage = async (event) => {
    const { file, url } = event.data;
    try {
        // ── Build source stream with progress tracking ────────────────────────
        let contentLength = 0;
        let loadedBytes = 0;
        let sourceStream;

        if (url) {
            sendProgress({ type: 'progress', phase: 'downloading', pct: 0, loaded: 0, total: 0 }, true);
            let response;
            try {
                response = await fetch(url);
            } catch (err) {
                self.postMessage({ type: 'error', message: `Download failed: ${err.message}` });
                return;
            }
            if (!response.ok) {
                self.postMessage({ type: 'error', message: `Download failed: HTTP ${response.status}` });
                return;
            }
            contentLength = parseInt(response.headers.get('content-length') || '0');
            const trackDownload = new TransformStream({
                transform(chunk, controller) {
                    loadedBytes += chunk.byteLength;
                    if (contentLength > 0) {
                        const pct = Math.min(Math.round((loadedBytes / contentLength) * 65), 65);
                        sendProgress({ type: 'progress', phase: 'downloading', pct, loaded: loadedBytes, total: contentLength });
                    }
                    controller.enqueue(chunk);
                }
            });
            sourceStream = response.body.pipeThrough(trackDownload);
        } else {
            contentLength = file.size;
            sendProgress({ type: 'progress', phase: 'reading', pct: 0, loaded: 0, total: contentLength }, true);
            const trackRead = new TransformStream({
                transform(chunk, controller) {
                    loadedBytes += chunk.byteLength;
                    const pct = Math.min(Math.round((loadedBytes / contentLength) * 65), 65);
                    sendProgress({ type: 'progress', phase: 'reading', pct, loaded: loadedBytes, total: contentLength });
                    controller.enqueue(chunk);
                }
            });
            sourceStream = file.stream().pipeThrough(trackRead);
        }

        // ── Count decompressed bytes for smooth extraction progress ───────────
        // Game decompresses to ~880 MB; used for progress estimation (65–99%)
        const ESTIMATED_DECOMP_BYTES = 880 * 1024 * 1024;
        let bytesOut = 0;

        const trackDecomp = new TransformStream({
            transform(chunk, controller) {
                bytesOut += chunk.byteLength;
                controller.enqueue(chunk);
            }
        });

        // ── Pipe through DecompressionStream ─────────────────────────────────
        const decompressed = sourceStream
            .pipeThrough(new DecompressionStream('gzip'))
            .pipeThrough(trackDecomp);
        const reader = decompressed.getReader();

        // ── Streaming tar parser state ────────────────────────────────────────
        let buf = new Uint8Array(0);
        let state = 'HEADER';
        let paddedRemaining = 0;
        let actualRemaining = 0;
        let pendingLongName = null;
        let currentWritable = null;
        let currentFileName = '';
        let longNameBuf = new Uint8Array(0);
        let filesDone = 0;

        // Batch write buffer — accumulate up to 1 MB before flushing to OPFS
        const FLUSH_SIZE = 1024 * 1024;
        let writeChunks = [];
        let writeTotal = 0;

        async function flushWrite(force = false) {
            if (writeTotal === 0 || (!force && writeTotal < FLUSH_SIZE)) return;
            await currentWritable.write(flattenChunks(writeChunks, writeTotal));
            writeChunks = [];
            writeTotal = 0;
        }

        sendProgress({ type: 'progress', phase: 'extracting', pct: 65, done: 0, total: 0, file: '' }, true);

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
                        state = 'LONGNAME';
                        longNameBuf = new Uint8Array(0);
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
                            writeChunks = [];
                            writeTotal = 0;
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
                        const pct = 65 + Math.min(Math.round((bytesOut / ESTIMATED_DECOMP_BYTES) * 34), 34);
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
                        next.set(longNameBuf);
                        next.set(buf.subarray(0, writeLen), longNameBuf.length);
                        longNameBuf = next;
                        actualRemaining -= writeLen;
                    }
                    buf = buf.subarray(take);
                    paddedRemaining -= take;
                    if (paddedRemaining === 0) {
                        pendingLongName = dec.decode(longNameBuf).replace(/\0/g, '');
                        longNameBuf = new Uint8Array(0);
                        state = 'HEADER';
                    }
                } else {
                    return;
                }
            }
        }

        // ── Main read loop ────────────────────────────────────────────────────
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (buf.length === 0) {
                buf = value;
            } else {
                const merged = new Uint8Array(buf.length + value.length);
                merged.set(buf);
                merged.set(value, buf.length);
                buf = merged;
            }

            await processBuffer();
        }

        // Final flush
        await processBuffer();
        if (currentWritable) {
            await flushWrite(true);
            await currentWritable.close();
            currentWritable = null;
        }

        // ── Write ready marker ────────────────────────────────────────────────
        const root = await navigator.storage.getDirectory();
        const marker = await root.getFileHandle('_game_ready', { create: true });
        const w = await marker.createWritable();
        await w.write(new TextEncoder().encode('v4'));
        await w.close();

        sendProgress({ type: 'progress', phase: 'extracting', pct: 100, done: filesDone, total: filesDone, file: '' }, true);
        self.postMessage({ type: 'done' });

    } catch (err) {
        console.error('[extract-worker]', err.name, err.message, err);
        if (currentWritable) {
            try { await currentWritable.close(); } catch (_) {}
            currentWritable = null;
        }
        let msg = `${err.name}: ${err.message}`;
        if (err.name === 'QuotaExceededError') {
            msg = 'QuotaExceededError — not enough browser storage space';
        } else if (err.name === 'NetworkError' || (err.message && err.message.includes('fetch'))) {
            msg = `Download failed: ${err.message}`;
        }
        self.postMessage({ type: 'error', message: msg });
    }
};
