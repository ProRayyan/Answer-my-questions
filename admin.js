'use strict';

// ── DEFAULT PASSWORD (change in Settings tab) ──────────────
const DEFAULT_PASS = 'admin123';

// ── STATE ──────────────────────────────────────────────────
const A = {
    db: {
        categories: {},  // { catId: [{ name, content, chunks, size, date }] }
        settings:   {
            botName:       'TranscriptBot',
            welcome:       "Hi! I'm TranscriptBot 👋 Ask me anything about the video content.",
            suggestions:   ['What topics are covered?', 'Summarize the main points', "What are the key takeaways?"],
            defaultModel:  'gpt-4o',
            chunkSize:     400,
            topK:          6,
            systemPrompt:  '',
        },
    },
    selectedFiles: [],
    confirmCb: null,
};

// ── DOM ────────────────────────────────────────────────────
const g = id => document.getElementById(id);
const AD = {
    loginScreen:      g('loginScreen'),
    passwordInput:    g('passwordInput'),
    loginBtn:         g('loginBtn'),
    loginError:       g('loginError'),
    adminPanel:       g('adminPanel'),

    navItems:         document.querySelectorAll('.nav-item'),
    tabPanels:        document.querySelectorAll('.tab-panel'),

    // Sidebar stats
    sideFiles:        g('sideStatFiles'),
    sideCats:         g('sideStatCats'),
    sideChunks:       g('sideStatChunks'),
    logoutBtn:        g('logoutBtn'),

    // Upload tab
    categoryInput:    g('adminCategoryInput'),
    dropZone:         g('adminDropZone'),
    fileInput:        g('adminFileInput'),
    selectedFiles:    g('selectedFiles'),
    uploadBtn:        g('adminUploadBtn'),
    previewBox:       g('previewBox'),

    // Manage tab
    manageSearch:     g('manageSearch'),
    clearAllDataBtn:  g('clearAllDataBtn'),
    categoriesCont:   g('categoriesContainer'),

    // Export tab
    downloadJsonBtn:  g('downloadJsonBtn'),
    rawUrlInput:      g('rawUrlInput'),
    saveUrlBtn:       g('saveUrlBtn'),
    currentUrlDisp:   g('currentUrlDisplay'),
    jsonPreview:      g('jsonPreview'),
    copyJsonBtn:      g('copyJsonBtn'),

    // Settings tab
    settingBotName:   g('settingBotName'),
    settingWelcome:   g('settingWelcome'),
    settingSugg:      g('settingSuggestions'),
    settingModel:     g('settingModel'),
    settingChunkSize: g('settingChunkSize'),
    settingTopK:      g('settingTopK'),
    settingPrompt:    g('settingPrompt'),
    settingNewPass:   g('settingNewPass'),
    settingConfPass:  g('settingConfirmPass'),
    changePassBtn:    g('changePassBtn'),
    saveSettingsBtn:  g('saveSettingsBtn'),

    // Overlay
    overlay:          g('overlay'),
    confirmTitle:     g('confirmTitle'),
    confirmMsg:       g('confirmMsg'),
    confirmYes:       g('confirmYes'),
    confirmNo:        g('confirmNo'),

    toastWrap:        g('toastWrap'),
};

// ── AUTH ───────────────────────────────────────────────────
function getPassword() {
    return localStorage.getItem('tb_admin_pass') || DEFAULT_PASS;
}

AD.loginBtn.addEventListener('click', doLogin);
AD.passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
    const val = AD.passwordInput.value;
    if (val === getPassword()) {
        AD.loginScreen.style.display = 'none';
        AD.adminPanel.style.display  = 'flex';
        loadFromStorage();
        updateAll();
        toast('Welcome back, Admin!', 'success');
    } else {
        AD.loginError.style.display = 'flex';
        AD.passwordInput.value = '';
        setTimeout(() => { AD.loginError.style.display = 'none'; }, 3000);
    }
}

AD.logoutBtn.addEventListener('click', () => {
    AD.adminPanel.style.display  = 'none';
    AD.loginScreen.style.display = 'flex';
    AD.passwordInput.value = '';
});

// ── TABS ───────────────────────────────────────────────────
AD.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        AD.navItems.forEach(b => b.classList.remove('active'));
        AD.tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        g(`tab-${tab}`).classList.add('active');
        if (tab === 'manage') renderManage();
        if (tab === 'export') renderExport();
    });
});

// ── CHUNKING ───────────────────────────────────────────────
function chunkText(text, size, overlap = 60) {
    const words  = text.trim().split(/\s+/);
    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + size, words.length);
        chunks.push(words.slice(start, end).join(' '));
        if (end === words.length) break;
        start += size - overlap;
    }
    return chunks;
}

// ── FILE HANDLING ──────────────────────────────────────────
function readFile(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result);
        r.onerror = () => rej(new Error('Read error'));
        r.readAsText(file, 'UTF-8');
    });
}

AD.fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect() {
    const files = Array.from(AD.fileInput.files).filter(f => f.name.endsWith('.txt'));
    A.selectedFiles = files;
    renderSelectedFiles();
    if (files.length > 0) previewFile(files[0]);
}

function renderSelectedFiles() {
    AD.selectedFiles.innerHTML = '';
    A.selectedFiles.forEach(f => {
        const span = document.createElement('span');
        span.className   = 'sel-file';
        span.textContent = `📄 ${f.name}`;
        AD.selectedFiles.appendChild(span);
    });
}

async function previewFile(file) {
    try {
        const content = await readFile(file);
        const preview = content.slice(0, 800);
        AD.previewBox.innerHTML = `
            <div class="preview-filename">📄 ${file.name} · ${formatBytes(file.size)}</div>
            <div class="preview-content">${escHtml(preview)}${content.length > 800 ? '\n\n... (truncated)' : ''}</div>
        `;
    } catch {
        AD.previewBox.innerHTML = '<div class="preview-empty"><i class="fas fa-times"></i><p>Could not preview</p></div>';
    }
}

// ── DROP ZONE ──────────────────────────────────────────────
AD.dropZone.addEventListener('dragover', e => { e.preventDefault(); AD.dropZone.classList.add('dragover'); });
AD.dropZone.addEventListener('dragleave', () => AD.dropZone.classList.remove('dragover'));
AD.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    AD.dropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt'));
    A.selectedFiles = files;
    renderSelectedFiles();
    if (files.length > 0) previewFile(files[0]);
});

// ── UPLOAD ─────────────────────────────────────────────────
AD.uploadBtn.addEventListener('click', async () => {
    const catRaw = AD.categoryInput.value.trim();
    if (!catRaw) { toast('Enter a category name', 'warning'); return; }
    if (!A.selectedFiles.length) { toast('Select .txt files', 'warning'); return; }

    const catId  = catRaw.toLowerCase().replace(/\s+/g, '_');
    const chunkSz = parseInt(A.db.settings.chunkSize) || 400;

    AD.uploadBtn.disabled = true;
    AD.uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    if (!A.db.categories[catId]) A.db.categories[catId] = [];

    let added = 0, skipped = 0, totalChunks = 0;

    for (const file of A.selectedFiles) {
        const exists = A.db.categories[catId].some(f => f.name === file.name);
        if (exists) { skipped++; continue; }
        try {
            const content = await readFile(file);
            const chunks  = chunkText(content, chunkSz);
            A.db.categories[catId].push({
                name:    file.name,
                content,
                chunks,
                size:    file.size,
                date:    new Date().toISOString(),
            });
            totalChunks += chunks.length;
            added++;
        } catch { toast(`Failed to read ${file.name}`, 'error'); }
    }

    AD.uploadBtn.disabled = false;
    AD.uploadBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add to Knowledge Base';

    if (added > 0) {
        saveToStorage();
        updateAll();
        AD.categoryInput.value = '';
        A.selectedFiles = [];
        AD.selectedFiles.innerHTML = '';
        AD.fileInput.value = '';
        AD.previewBox.innerHTML = '<div class="preview-empty"><i class="fas fa-file-alt"></i><p>Select a file to preview</p></div>';
        toast(`✓ ${added} file(s) added · ${totalChunks} chunks`, 'success');
    }
    if (skipped > 0) toast(`${skipped} file(s) already exist`, 'warning');
});

// ── MANAGE ─────────────────────────────────────────────────
const ICONS_LIST = [
    'fa-video','fa-book-open','fa-code','fa-music',
    'fa-flask','fa-chart-line','fa-gamepad','fa-graduation-cap',
    'fa-lightbulb','fa-globe','fa-microphone','fa-film',
];

function renderManage(filter = '') {
    AD.categoriesCont.innerHTML = '';
    const cats = Object.entries(A.db.categories);

    if (cats.length === 0) {
        AD.categoriesCont.innerHTML = `
            <div class="empty-manage">
                <i class="fas fa-inbox"></i>
                <p>No transcripts uploaded yet</p>
            </div>`;
        return;
    }

    cats.forEach(([catId, files], idx) => {
        const label     = catId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const icon      = ICONS_LIST[idx % ICONS_LIST.length];
        const filtered  = filter
            ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
            : files;

        if (filtered.length === 0) return;

        const group = document.createElement('div');
        group.className = 'cat-group';
        group.innerHTML = `
            <div class="cat-group-header">
                <div class="cat-group-title">
                    <i class="fas ${icon}"></i>
                    ${label}
                    <span class="file-count">${filtered.length} file(s)</span>
                </div>
                <div class="cat-group-actions">
                    <button class="admin-btn-danger-sm del-cat" data-cat="${catId}">
                        <i class="fas fa-trash"></i> Delete Category
                    </button>
                </div>
            </div>
            <div class="file-list" id="list-${catId}"></div>
        `;

        const list = group.querySelector(`#list-${catId}`);
        filtered.forEach(file => {
            const row = document.createElement('div');
            row.className = 'file-row';
            row.innerHTML = `
                <div class="file-icon"><i class="fas fa-file-alt"></i></div>
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${formatBytes(file.size)} · ${file.chunks.length} chunks</div>
                <div class="file-meta">${formatDate(file.date)}</div>
                <button class="file-del del-file" data-cat="${catId}" data-file="${file.name}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            list.appendChild(row);
        });

        AD.categoriesCont.appendChild(group);
    });

    // Delete category
    AD.categoriesCont.querySelectorAll('.del-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            const catId = btn.dataset.cat;
            confirm_(`Delete "${catId}" and all its files?`, () => {
                delete A.db.categories[catId];
                saveToStorage();
                updateAll();
                renderManage();
                toast('Category deleted', 'success');
            });
        });
    });

    // Delete file
    AD.categoriesCont.querySelectorAll('.del-file').forEach(btn => {
        btn.addEventListener('click', () => {
            const { cat, file } = btn.dataset;
            confirm_(`Delete "${file}"?`, () => {
                A.db.categories[cat] = A.db.categories[cat].filter(f => f.name !== file);
                if (A.db.categories[cat].length === 0) delete A.db.categories[cat];
                saveToStorage();
                updateAll();
                renderManage();
                toast('File deleted', 'success');
            });
        });
    });
}

AD.manageSearch.addEventListener('input', () => renderManage(AD.manageSearch.value));

AD.clearAllDataBtn.addEventListener('click', () => {
    confirm_('Clear ALL transcripts and categories? This cannot be undone.', () => {
        A.db.categories = {};
        saveToStorage();
        updateAll();
        renderManage();
        toast('All data cleared', 'info');
    });
});

// ── EXPORT ─────────────────────────────────────────────────
function renderExport() {
    const json = buildExportJson();
    AD.jsonPreview.textContent = JSON.stringify(json, null, 2).slice(0, 3000) + '\n\n... (truncated for display)';

    // Show current URL
    const url = localStorage.getItem('tb_raw_url') || '';
    AD.rawUrlInput.value = url;
    AD.currentUrlDisp.textContent = url ? `Current: ${url}` : 'No URL set yet';
}

function buildExportJson() {
    return {
        version:    2,
        generated:  new Date().toISOString(),
        settings:   A.db.settings,
        categories: A.db.categories,
    };
}

AD.downloadJsonBtn.addEventListener('click', () => {
    const json = JSON.stringify(buildExportJson(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'transcripts.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded transcripts.json — place it in your repo\'s data/ folder', 'success', 5000);
});

AD.saveUrlBtn.addEventListener('click', () => {
    const url = AD.rawUrlInput.value.trim();
    if (!url) { toast('Enter a URL', 'warning'); return; }
    localStorage.setItem('tb_raw_url', url);
    AD.currentUrlDisp.textContent = `Current: ${url}`;
    toast('URL saved! Users will now load from GitHub', 'success');
});

AD.copyJsonBtn.addEventListener('click', () => {
    const json = JSON.stringify(buildExportJson(), null, 2);
    navigator.clipboard.writeText(json).then(() => toast('JSON copied!', 'success'));
});

document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('Copied!', 'success'));
    });
});

// ── SETTINGS ───────────────────────────────────────────────
function loadSettingsUI() {
    const s = A.db.settings;
    AD.settingBotName.value   = s.botName   || 'TranscriptBot';
    AD.settingWelcome.value   = s.welcome   || '';
    AD.settingSugg.value      = (s.suggestions || []).join('\n');
    AD.settingModel.value     = s.defaultModel  || 'gpt-4o';
    AD.settingChunkSize.value = s.chunkSize     || 400;
    AD.settingTopK.value      = s.topK          || 6;
    AD.settingPrompt.value    = s.systemPrompt  || '';
}

AD.saveSettingsBtn.addEventListener('click', () => {
    A.db.settings.botName      = AD.settingBotName.value.trim() || 'TranscriptBot';
    A.db.settings.welcome      = AD.settingWelcome.value.trim();
    A.db.settings.suggestions  = AD.settingSugg.value.split('\n').map(s => s.trim()).filter(Boolean);
    A.db.settings.defaultModel = AD.settingModel.value;
    A.db.settings.chunkSize    = parseInt(AD.settingChunkSize.value) || 400;
    A.db.settings.topK         = parseInt(AD.settingTopK.value) || 6;
    A.db.settings.systemPrompt = AD.settingPrompt.value.trim();
    saveToStorage();
    toast('Settings saved! Re-export JSON to update users.', 'success');
});

AD.changePassBtn.addEventListener('click', () => {
    const np = AD.settingNewPass.value;
    const cp = AD.settingConfPass.value;
    if (!np) { toast('Enter new password', 'warning'); return; }
    if (np !== cp) { toast('Passwords do not match', 'error'); return; }
    if (np.length < 6) { toast('Password must be at least 6 characters', 'warning'); return; }
    localStorage.setItem('tb_admin_pass', np);
    AD.settingNewPass.value  = '';
    AD.settingConfPass.value = '';
    toast('Password updated!', 'success');
});

// ── STORAGE ────────────────────────────────────────────────
function saveToStorage() {
    const json = JSON.stringify(buildExportJson());
    localStorage.setItem('tb_admin_db', json);
    // Also save as tb_export so user.js can read it on same device
    localStorage.setItem('tb_export', json);
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem('tb_admin_db');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.categories) A.db.categories = data.categories;
        if (data.settings)   A.db.settings   = { ...A.db.settings, ...data.settings };
        loadSettingsUI();
    } catch (e) { console.warn('Load failed', e); }
}

// ── UPDATE ALL ─────────────────────────────────────────────
function updateAll() {
    const cats   = Object.keys(A.db.categories).length;
    const files  = Object.values(A.db.categories).reduce((s, f) => s + f.length, 0);
    const chunks = Object.values(A.db.categories).flat().reduce((s, f) => s + f.chunks.length, 0);

    AD.sideFiles.textContent  = files;
    AD.sideCats.textContent   = cats;
    AD.sideChunks.textContent = chunks;
}

// ── CONFIRM ────────────────────────────────────────────────
function confirm_(msg, cb) {
    AD.confirmMsg.textContent = msg;
    A.confirmCb = cb;
    AD.overlay.classList.add('show');
}

AD.confirmYes.addEventListener('click', () => {
    AD.overlay.classList.remove('show');
    if (A.confirmCb) A.confirmCb();
    A.confirmCb = null;
});

AD.confirmNo.addEventListener('click', () => {
    AD.overlay.classList.remove('show');
    A.confirmCb = null;
});

// ── HELPERS ────────────────────────────────────────────────
function formatBytes(b) {
    if (!b) return '?';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString();
}

function escHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toast(msg, type = 'info', dur = 3500) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    AD.toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, dur);
}

// ── INIT ───────────────────────────────────────────────────
loadSettingsUI();