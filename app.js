/**
 * ============================================================================
 * 🧠 BENTO PLANNER CORE ENGINE
 * @version 2.1.0
 * @description Advanced state management, DOM rendering, and HTML2Canvas export.
 * ============================================================================
 */

// --- 1. CONFIGURATION & STATE ---
const DAYS = [
    { key: 'shanbe',  name: 'شنبه',       emoji: '💜', cls: 'day-shanbe' },
    { key: 'yek',     name: 'یک‌شنبه',    emoji: '💚', cls: 'day-yek' },
    { key: 'do',      name: 'دوشنبه',     emoji: '💙', cls: 'day-do' },
    { key: 'se',      name: 'سه‌شنبه',    emoji: '💛', cls: 'day-se' },
    { key: 'chahar',  name: 'چهارشنبه',   emoji: '🧡', cls: 'day-chahar' },
    { key: 'panj',    name: 'پنج‌شنبه',   emoji: '🩷', cls: 'day-panj' },
    { key: 'jome',    name: 'جمعه',       emoji: '🩵', cls: 'day-jome' }
];

const STORAGE_DELAY = 350; // Debounce delay in ms
const storageQueue = Object.create(null);
const storageTimers = Object.create(null);

let scheduleData = {};
let headerData = {};
let activeColumnLabels = [];
let colCount = parseInt(localStorage.getItem('bento_colCount') || '8', 10);

// --- 2. STORAGE MANAGEMENT (DEBOUNCED) ---

/** Safely retrieves and parses schedule data */
function getStoredData() {
    try { return JSON.parse(localStorage.getItem('bento_schedule') || '{}'); } 
    catch { return {}; }
}

/** Safely retrieves header names */
function getStoredHeaders() {
    try { return JSON.parse(localStorage.getItem('bento_headers') || '{}'); } 
    catch { return {}; }
}

/** 
 * Queues a save operation to prevent performance bottlenecks during rapid typing.
 * @param {string} key - LocalStorage key
 * @param {any} value - Data to save
 * @param {object} options - Configuration (e.g., stringify)
 */
function queueStorageSave(key, value, options = {}) {
    const { stringify = true } = options;
    storageQueue[key] = { value, stringify };
    
    clearTimeout(storageTimers[key]);
    storageTimers[key] = setTimeout(() => {
        commitStorage(key);
        delete storageQueue[key];
        delete storageTimers[key];
    }, STORAGE_DELAY);
}

/** Executes the actual save to browser memory */
function commitStorage(key) {
    const payload = storageQueue[key];
    if (!payload) return;
    try {
        localStorage.setItem(
            key,
            payload.stringify ? JSON.stringify(payload.value) : payload.value
        );
    } catch (err) {
        console.error('💾 Storage Quota Exceeded or Error:', err);
    }
}

/** Forces all pending saves to execute immediately (Useful before page unload or printing) */
function flushStorageQueue() {
    Object.keys(storageTimers).forEach(key => {
        clearTimeout(storageTimers[key]);
        commitStorage(key);
        delete storageTimers[key];
        delete storageQueue[key];
    });
}

/** Wipes the queue without saving (Used during Clear All) */
function resetStorageQueue() {
    Object.keys(storageTimers).forEach(key => clearTimeout(storageTimers[key]));
    Object.keys(storageQueue).forEach(key => delete storageQueue[key]);
}

// --- 3. DOM & UI RENDERING ---

/** Updates data attributes for CSS responsive targeting */
function updateColumnLabel(colIndex, value) {
    const labelText = (value && value.trim()) ? value.trim() : `باکس ${colIndex}`;
    activeColumnLabels[colIndex - 1] = labelText;
    const grid = document.getElementById('scheduleGrid');
    if (!grid) return;
    
    grid.querySelectorAll(`.cell[data-col="${colIndex}"]`).forEach(cell => {
        cell.setAttribute('data-col-label', labelText);
    });
}

/** Automatically adjusts textarea height to fit content mathematically */
function autoResizeTextarea(ta) {
    ta.style.height = '0px';
    ta.style.height = Math.max(64, ta.scrollHeight) + 'px';
}

/** 
 * Core Engine: Builds the Bento Grid dynamically.
 * Destroys existing DOM and rebuilds it based on colCount.
 */
function buildGrid() {
    const grid = document.getElementById('scheduleGrid');
    scheduleData = getStoredData();
    headerData = getStoredHeaders();

    // Restore Settings UI
    const savedTitle = localStorage.getItem('bento_weekTitle');
    const savedTime = localStorage.getItem('bento_colTime');
    if (savedTitle !== null) document.getElementById('weekTitle').value = savedTitle;
    if (savedTime !== null) document.getElementById('colTime').value = savedTime;
    document.getElementById('colCount').value = colCount;

    // Setup Grid CSS Variables
    grid.style.setProperty('--col-count', colCount);
    grid.setAttribute('data-colcount', colCount);
    grid.innerHTML = '';

    const colLabels = [];

    // --- Row 1: Top Left Corner ---
    const corner = document.createElement('div');
    corner.className = 'corner-label';
    corner.innerHTML = '📌 <span>روز</span> / <span>باکس</span>';
    grid.appendChild(corner);

    // --- Row 1: Column Headers ---
    for (let c = 1; c <= colCount; c++) {
        const ch = document.createElement('div');
        ch.className = 'col-header';
        
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = `باکس ${c}`;
        
        const headerValue = headerData[`col_${c}`] || '';
        inp.value = headerValue;
        inp.dataset.col = c;
        colLabels.push(headerValue.trim() || `باکس ${c}`);

        inp.addEventListener('input', function () {
            const colIndex = parseInt(this.dataset.col, 10);
            if (this.value.trim()) {
                headerData[`col_${colIndex}`] = this.value;
            } else {
                delete headerData[`col_${colIndex}`];
            }
            queueStorageSave('bento_headers', headerData);
            updateColumnLabel(colIndex, this.value);
        });
        
        ch.appendChild(inp);
        grid.appendChild(ch);
    }

    activeColumnLabels = colLabels.slice();

    // --- Data Rows (Days x Columns) ---
    DAYS.forEach((day) => {
        const dh = document.createElement('div');
        dh.className = `day-header ${day.cls}`;
        dh.innerHTML = `<span class="day-emoji">${day.emoji}</span><span class="day-name">${day.name}</span>`;
        grid.appendChild(dh);

        for (let c = 1; c <= colCount; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.col = c;
            cell.setAttribute('data-col-label', colLabels[c - 1]);
            
            const key = `${day.key}_${c}`;
            const ta = document.createElement('textarea');
            ta.placeholder = '...';
            ta.dataset.key = key;
            ta.value = scheduleData[key] || '';
            ta.spellcheck = false;

            if (ta.value.trim()) cell.classList.add('has-content');

            ta.addEventListener('input', function () {
                const val = this.value.trim();
                const keyName = this.dataset.key;
                
                if (val) {
                    scheduleData[keyName] = this.value;
                    cell.classList.add('has-content');
                } else {
                    delete scheduleData[keyName];
                    cell.classList.remove('has-content');
                }
                
                queueStorageSave('bento_schedule', scheduleData);
                autoResizeTextarea(this);
            });

            cell.appendChild(ta);
            grid.appendChild(cell);
        }
    });

    requestAnimationFrame(() => {
        grid.querySelectorAll('textarea').forEach(ta => {
            if (ta.value) autoResizeTextarea(ta);
        });
    });
}

function rebuildGrid() {
    const val = parseInt(document.getElementById('colCount').value, 10);
    if (val >= 1 && val <= 10) {
        colCount = val;
        queueStorageSave('bento_colCount', colCount, { stringify: false });
        flushStorageQueue();
        buildGrid();
        showToast('🔄 جدول بازسازی شد!');
    } else {
        showToast('⚠️ تعداد ستون باید بین ۱ تا ۱۰ باشد');
    }
}

// --- 4. EXPORT & ACTIONS ---

/** Global save trigger */
window.saveData = function() {
    queueStorageSave('bento_weekTitle', document.getElementById('weekTitle').value, { stringify: false });
    queueStorageSave('bento_colTime', document.getElementById('colTime').value, { stringify: false });
    queueStorageSave('bento_colCount', colCount, { stringify: false });
    flushStorageQueue();
    showToast('✅ ذخیره شد! داده‌هات امنه 💾');
}

/** Nukes all local storage for this app */
window.clearAll = function() {
    if (!confirm('🧹 مطمئنی همه‌چیز پاک بشه؟ این قابل بازگشت نیست!')) return;
    resetStorageQueue();
    ['bento_schedule', 'bento_headers', 'bento_weekTitle', 'bento_colTime', 'bento_colCount']
        .forEach(k => localStorage.removeItem(k));
    
    scheduleData = {};
    headerData = {};
    document.getElementById('weekTitle').value = '';
    document.getElementById('colTime').value = '';
    document.getElementById('colCount').value = 8;
    colCount = 8;
    
    buildGrid();
    showToast('🧹 همه‌چیز پاک شد! صفحه تمیز تمیزه ✨');
}

/** Prepares DOM for Native Browser Printing — Landscape A4 Fix */
window.exportPDF = function() {
    preparePrintHeader();
    flushStorageQueue();
    showToast('🖨️ آماده‌سازی PDF افقی (Landscape)... 🌈');

    /* --- Force landscape via dynamic style injection --- */
    let printStyle = document.getElementById('print-landscape-fix');
    if (!printStyle) {
        printStyle = document.createElement('style');
        printStyle.id = 'print-landscape-fix';
        printStyle.textContent = `
            @page { size: A4 landscape; margin: 8mm; }
        `;
        document.head.appendChild(printStyle);
    }

    const doPrint = () => {
        window.print();
    };

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setTimeout(doPrint, 120));
    } else {
        setTimeout(doPrint, 250);
    }
}


/** 
 * ✨ NEW FEATURE: Takes a high-res screenshot using html2canvas 
 */
window.exportPNG = function() {
    if (typeof html2canvas === 'undefined') {
        showToast('❌ افزونه عکس‌برداری لود نشده است!');
        return;
    }

    showToast('📸 در حال گرفتن عکس... لبخند بزن! ✨');
    flushStorageQueue();

    const captureArea = document.getElementById('captureArea');
    
    html2canvas(captureArea, {
        scale: 2,
        backgroundColor: '#FAF8F5',
        useCORS: true,
        logging: false,
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Bento_Planner_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('🎉 عکس با کیفیت ذخیره شد!');
    }).catch(err => {
        console.error("Screenshot failed:", err);
        showToast('⚠️ خطا در گرفتن عکس!');
    });
}

// --- 5. UTILS & EVENT LISTENERS ---

function preparePrintHeader() {
    document.getElementById('printWeekTitle').textContent = document.getElementById('weekTitle').value || '—';
    document.getElementById('printColTime').textContent = document.getElementById('colTime').value || '—';
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// Lifecycle Hooks
document.addEventListener('DOMContentLoaded', () => {
    buildGrid();

    ['weekTitle', 'colTime'].forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
            queueStorageSave(`bento_${id}`, this.value, { stringify: false });
        });
    });
});

// Safety Nets
window.addEventListener('beforeunload', flushStorageQueue);
window.addEventListener('beforeprint', () => {
    preparePrintHeader();
    flushStorageQueue();
});
window.addEventListener('afterprint', () => {
    // Future: can restore any temporary print styling if needed
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorageQueue();
});

