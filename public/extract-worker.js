const dec = new TextDecoder();

// ── OPFS temp-download helpers ────────────────────────────────────────────────
// Saves the compressed tar.gz to _dl_tmp/ so downloads can be resumed.

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

async function openTempWritable(resumeOffset) {
    const dir = await getTempDir(true);
    const fh = await dir.getFileHandle('data.bin', { create: true });
    if (resumeOffset > 0) {
        const w = await fh.createWritable({ keepExistingData: true });
        await w.seek(resumeOffset);
        return w;
    }
    return fh.createWritable();   // truncates existing file
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

// ── Tar helpers ───────────────────────────────────────────────────────────────

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

// ── Flatten chunk array ───────────────────────────────────────────────────────
function flattenChunks(chunks, totalLen) {
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
self.onmessage = async (event) => {
    const { file, url } = event.data;
    let currentWritable = null;

    try {
        let sourceStream;

        // ════════════════════════════════════════════════════════════════
        // URL MODE — download with resume support
        // ════════════════════════════════════════════════════════════════
        if (url) {
            // Check for an existing partial download
            const meta = await getTempMeta();
            const partialSize = (meta && meta.url === url) ? await getTempDataSize() : 0;

            // If URL changed or no partial: wipe any stale temp data
            if (partialSize === 0 && meta) await cleanupTemp();

            let loadedBytes = partialSize;
            let totalBytes = (meta && meta.url === url) ? (meta.total || 0) : 0;
            let isResuming = partialSize > 0;

            if (isResuming) {
                const resumePct = totalBytes > 0 ? Math.min(Math.round((partialSize / totalBytes) * 65), 64) : 1;
                sendProgress({
                    type: 'progress', phase: 'downloading',
                    pct: resumePct, loaded: partialSize, total: totalBytes,
                    resuming: true
                }, true);
            } else {
                sendProgress({ type: 'progress', phase: 'downloading', pct: 0, loaded: 0, total: 0 }, true);
            }

            // Fetch — with Range header if resuming
            const headers = isResuming ? { Range: `bytes=${partialSize}-` } : {};
            let response;
            try {
                response = await fetch(url, { headers });
            } catch (err) {
                self.postMessage({ type: 'error', message: `Download failed: ${err.message}` });
                return;
            }

            if (response.status === 206) {
                // Server accepted range request — parse Content-Range for total
                const cr = response.headers.get('content-range') || '';
                const m = cr.match(/bytes \d+-\d+\/(\d+)/);
                totalBytes = m ? parseInt(m[1]) : partialSize + parseInt(response.headers.get('content-length') || '0');
            } else if (response.status === 200) {
                // Server ignored Range (or no partial existed) — start fresh
                isResuming = false;
                loadedBytes = 0;
                totalBytes = parseInt(response.headers.get('content-length') || '0');
                await cleanupTemp();   // discard any stale partial
            } else {
                self.postMessage({ type: 'error', message: `Download failed: HTTP ${response.status}` });
                return;
            }

            // Save metadata so next session knows the URL + total
            await saveTempMeta(url, totalBytes);

            // Open temp writable (append if resuming, truncate if fresh)
            const tempWritable = await openTempWritable(isResuming ? partialSize : 0);

            // Stream bytes → temp file, reporting progress
            const reader = response.body.getReader();
            let stateSaveCountdown = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await tempWritable.write(value);
                loadedBytes += value.byteLength;
                if (totalBytes > 0) {
                    const pct = Math.min(Math.round((loadedBytes / totalBytes) * 65), 65);
                    sendProgress({ type: 'progress', phase: 'downloading', pct, loaded: loadedBytes, total: totalBytes });
                }
                // Flush state occasionally so meta is up-to-date
                if (--stateSaveCountdown <= 0) {
                    stateSaveCountdown = 200;
                    await saveTempMeta(url, totalBytes);
                }
            }
            await tempWritable.close();

            // Update meta to reflect completed download
            await saveTempMeta(url, totalBytes);

            // Hand off to extraction
            sendProgress({ type: 'progress', phase: 'extracting', pct: 65, done: 0, total: 0, file: '' }, true);
            sourceStream = await getTempFileStream();

        // ════════════════════════════════════════════════════════════════
        // FILE MODE — local file, no resume needed
        // ════════════════════════════════════════════════════════════════
        } else {
            const contentLength = file.size;
            let loadedBytes = 0;
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

        // ════════════════════════════════════════════════════════════════
        // EXTRACTION — decompress + parse tar + write to OPFS
        // ════════════════════════════════════════════════════════════════

        const ESTIMATED_DECOMP_BYTES = 880 * 1024 * 1024;
        let bytesOut = 0;
        const trackDecomp = new TransformStream({
            transform(chunk, controller) {
                bytesOut += chunk.byteLength;
                controller.enqueue(chunk);
            }
        });

        const decompressed = sourceStream
            .pipeThrough(new DecompressionStream('gzip'))
            .pipeThrough(trackDecomp);
        const reader = decompressed.getReader();

        let buf = new Uint8Array(0);
        let state = 'HEADER';
        let paddedRemaining = 0;
        let actualRemaining = 0;
        let pendingLongName = null;
        let currentFileName = '';
        let longNameBuf = new Uint8Array(0);
        let filesDone = 0;

        const FLUSH_SIZE = 1024 * 1024;
        let writeChunks = [];
        let writeTotal = 0;

        async function flushWrite(force = false) {
            if (writeTotal === 0 || (!force && writeTotal < FLUSH_SIZE)) return;
            await currentWritable.write(flattenChunks(writeChunks, writeTotal));
            writeChunks = [];
            writeTotal = 0;
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

        await processBuffer();
        if (currentWritable) {
            await flushWrite(true);
            await currentWritable.close();
            currentWritable = null;
        }

        // Write ready marker
        const root = await navigator.storage.getDirectory();
        const marker = await root.getFileHandle('_game_ready', { create: true });
        const w = await marker.createWritable();
        await w.write(new TextEncoder().encode('v4'));
        await w.close();

        // Remove the download cache — game is fully installed
        await cleanupTemp();

        sendProgress({ type: 'progress', phase: 'extracting', pct: 100, done: filesDone, total: filesDone, file: '' }, true);
        self.postMessage({ type: 'done' });

    } catch (err) {
        console.error('[extract-worker]', err.name, err.message, err);
        if (currentWritable) {
            try { await currentWritable.close(); } catch (_) {}
        }
        let msg = `${err.name}: ${err.message}`;
        if (err.name === 'QuotaExceededError') {
            msg = 'QuotaExceededError — not enough browser storage space';
        } else if (err.name === 'NetworkError' || (err.message && err.message.includes('fetch'))) {
            msg = `Download failed: ${err.message}`;
        }
        // Note: temp file is kept on error so the next attempt can resume
        self.postMessage({ type: 'error', message: msg });
    }
};
