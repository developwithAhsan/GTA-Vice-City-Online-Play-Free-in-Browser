// Save Manager — reads and writes GTA VC save files (.b) stored by Emscripten IDBFS.
// The game keeps saves in an IndexedDB database named after the mount point.
// Each record: { timestamp: Date, mode: number, contents: Uint8Array }

const SAVE_DB_NAME = '/vc-assets/local/userfiles';
const SLOT_COUNT = 8;

function slotFileName(n) { return `GTAVCsf${n}.b`; }
function slotKey(n) { return `${SAVE_DB_NAME}/${slotFileName(n)}`; }

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(SAVE_DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Cannot open save database'));
    });
}

function getStoreName(db) {
    return db.objectStoreNames[0] || 'FILE_DATA';
}

async function readEntry(db, slotNum) {
    const store = getStoreName(db);
    return new Promise((resolve) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(slotKey(slotNum));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function writeEntry(db, slotNum, contents) {
    const store = getStoreName(db);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(
            { timestamp: new Date(), mode: 33188, contents },
            slotKey(slotNum)
        );
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function deleteEntry(db, slotNum) {
    const store = getStoreName(db);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(slotKey(slotNum));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadAllSlots() {
    const slots = [];
    let db = null;
    try {
        db = await openDB();
    } catch (_) {
        for (let i = 1; i <= SLOT_COUNT; i++) {
            slots.push({ slot: i, exists: false, size: 0, timestamp: null });
        }
        return slots;
    }
    for (let i = 1; i <= SLOT_COUNT; i++) {
        try {
            const entry = await readEntry(db, i);
            slots.push({
                slot: i,
                exists: !!(entry && entry.contents && entry.contents.length > 0),
                size: entry && entry.contents ? entry.contents.length : 0,
                timestamp: entry ? entry.timestamp : null,
            });
        } catch (_) {
            slots.push({ slot: i, exists: false, size: 0, timestamp: null });
        }
    }
    db.close();
    return slots;
}

export async function downloadSlot(slotNum) {
    const db = await openDB();
    const entry = await readEntry(db, slotNum);
    db.close();
    if (!entry || !entry.contents || entry.contents.length === 0) {
        throw new Error(`Slot ${slotNum} is empty`);
    }
    const blob = new Blob([entry.contents], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slotFileName(slotNum);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function uploadToSlot(slotNum, file) {
    const buf = await file.arrayBuffer();
    const contents = new Uint8Array(buf);
    if (contents.length === 0) throw new Error('File is empty');
    const db = await openDB();
    await writeEntry(db, slotNum, contents);
    db.close();
}

export async function deleteSlot(slotNum) {
    const db = await openDB();
    await deleteEntry(db, slotNum);
    db.close();
}

// ── Modal UI ──────────────────────────────────────────────────────────────────

function formatDate(ts) {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
    if (!bytes) return '';
    return (bytes / 1024).toFixed(1) + ' KB';
}

function setSlotStatus(slotEl, msg, isError = false) {
    const s = slotEl.querySelector('.sm-slot-status');
    if (s) {
        s.textContent = msg;
        s.className = 'sm-slot-status' + (isError ? ' sm-status-err' : ' sm-status-ok');
    }
}

function buildSlotEl(slotData) {
    const { slot, exists, size, timestamp } = slotData;

    const el = document.createElement('div');
    el.className = 'sm-slot' + (exists ? ' sm-slot--filled' : '');
    el.dataset.slot = slot;

    const badge = document.createElement('div');
    badge.className = 'sm-slot-badge';
    badge.textContent = `SLOT ${slot}`;

    const info = document.createElement('div');
    info.className = 'sm-slot-info';

    if (exists) {
        const date = document.createElement('span');
        date.className = 'sm-slot-date';
        date.textContent = formatDate(timestamp);
        const sz = document.createElement('span');
        sz.className = 'sm-slot-size';
        sz.textContent = formatSize(size);
        info.appendChild(date);
        info.appendChild(sz);
    } else {
        const empty = document.createElement('span');
        empty.className = 'sm-slot-empty';
        empty.textContent = 'Empty';
        info.appendChild(empty);
    }

    const status = document.createElement('div');
    status.className = 'sm-slot-status';

    const actions = document.createElement('div');
    actions.className = 'sm-slot-actions';

    // Download button
    const dlBtn = document.createElement('button');
    dlBtn.className = 'sm-btn sm-btn-dl';
    dlBtn.textContent = '↓ Download';
    dlBtn.disabled = !exists;
    dlBtn.title = exists ? `Download ${slotFileName(slot)}` : 'Slot is empty';
    dlBtn.addEventListener('click', async () => {
        dlBtn.disabled = true;
        dlBtn.textContent = 'Saving…';
        try {
            await downloadSlot(slot);
            setSlotStatus(el, 'Downloaded!');
        } catch (err) {
            setSlotStatus(el, err.message, true);
        } finally {
            dlBtn.disabled = !exists;
            dlBtn.textContent = '↓ Download';
        }
    });

    // Upload (hidden file input + button)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.b,application/octet-stream';
    fileInput.className = 'sm-file-input';
    fileInput.setAttribute('aria-label', `Upload save file to slot ${slot}`);

    const ulBtn = document.createElement('button');
    ulBtn.className = 'sm-btn sm-btn-ul';
    ulBtn.textContent = '↑ Upload';
    ulBtn.title = `Upload a .b save file to slot ${slot}`;
    ulBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        ulBtn.disabled = true;
        ulBtn.textContent = 'Writing…';
        try {
            await uploadToSlot(slot, file);
            setSlotStatus(el, 'Uploaded — restart game to use this save.');
            // Refresh slot appearance
            el.classList.add('sm-slot--filled');
            info.innerHTML = '';
            const date = document.createElement('span');
            date.className = 'sm-slot-date';
            date.textContent = formatDate(new Date());
            const sz = document.createElement('span');
            sz.className = 'sm-slot-size';
            sz.textContent = formatSize(file.size);
            info.appendChild(date);
            info.appendChild(sz);
            dlBtn.disabled = false;
        } catch (err) {
            setSlotStatus(el, err.message, true);
        } finally {
            ulBtn.disabled = false;
            ulBtn.textContent = '↑ Upload';
            fileInput.value = '';
        }
    });

    actions.appendChild(dlBtn);
    actions.appendChild(ulBtn);
    actions.appendChild(fileInput);

    el.appendChild(badge);
    el.appendChild(info);
    el.appendChild(status);
    el.appendChild(actions);
    return el;
}

export function initSaveManagerModal() {
    const modal = document.getElementById('save-manager-modal');
    const openBtn = document.getElementById('save-manager-btn');
    const closeBtn = document.getElementById('save-manager-close');
    const slotsContainer = document.getElementById('sm-slots');
    const refreshBtn = document.getElementById('sm-refresh-btn');
    const loadingEl = document.getElementById('sm-loading');
    const noteEl = document.getElementById('sm-note');

    if (!modal || !openBtn || !slotsContainer) return;

    async function refreshSlots() {
        slotsContainer.innerHTML = '';
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (noteEl) noteEl.classList.add('hidden');
        try {
            const slots = await loadAllSlots();
            if (loadingEl) loadingEl.classList.add('hidden');
            const hasSave = slots.some(s => s.exists);
            if (noteEl) {
                noteEl.textContent = hasSave
                    ? 'Saves are stored in your browser. Download a backup to keep them safe.'
                    : 'No saves yet. Play the game and save at a safe house to see them here.';
                noteEl.classList.remove('hidden');
            }
            for (const slotData of slots) {
                slotsContainer.appendChild(buildSlotEl(slotData));
            }
        } catch (err) {
            if (loadingEl) loadingEl.classList.add('hidden');
            slotsContainer.innerHTML = `<p class="sm-error">Could not read saves: ${err.message}</p>`;
        }
    }

    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        refreshSlots();
    });

    const close = () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshSlots);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
}
