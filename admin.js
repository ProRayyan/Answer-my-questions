'use strict';

// ── DEFAULT PASSWORD ─────────────────────────
const DEFAULT_PASS = 'admin123';

// ── STATE ────────────────────────────────────
const A = {
db: {
categories: {},
settings: {
botName: 'TranscriptBot',
welcome: "Hi! I'm TranscriptBot 👋 Ask me anything.",
suggestions: [
'What topics are covered?',
'Summarize the main points',
'What are key takeaways?'
],
defaultModel: 'gpt-4o',
chunkSize: 400,
topK: 6,
systemPrompt: ''
}
},
selectedFiles: [],
confirmCb: null
};

// ── DOM ──────────────────────────────────────
const g = id => document.getElementById(id);

const AD = {
loginScreen: g('loginScreen'),
passwordInput: g('passwordInput'),
loginBtn: g('loginBtn'),
loginError: g('loginError'),
adminPanel: g('adminPanel'),

```
navItems: document.querySelectorAll('.nav-item'),
tabPanels: document.querySelectorAll('.tab-panel'),

sideFiles: g('sideStatFiles'),
sideCats: g('sideStatCats'),
sideChunks: g('sideStatChunks'),
logoutBtn: g('logoutBtn'),

categoryInput: g('adminCategoryInput'),
fileInput: g('adminFileInput'),
selectedFiles: g('selectedFiles'),
uploadBtn: g('adminUploadBtn'),
previewBox: g('previewBox'),

categoriesCont: g('categoriesContainer'),

settingChunkSize: g('settingChunkSize'),

overlay: g('overlay'),
confirmMsg: g('confirmMsg'),
confirmYes: g('confirmYes'),
confirmNo: g('confirmNo'),

toastWrap: g('toastWrap')
```

};

// ── AUTH ─────────────────────────────────────
function getPassword() {
return localStorage.getItem('tb_admin_pass') || DEFAULT_PASS;
}

AD.loginBtn.onclick = () => {
if (AD.passwordInput.value === getPassword()) {
AD.loginScreen.style.display = 'none';
AD.adminPanel.style.display = 'flex';
loadFromStorage();
updateAll();
toast('Welcome!', 'success');
} else {
AD.loginError.style.display = 'flex';
}
};

AD.logoutBtn.onclick = () => {
AD.adminPanel.style.display = 'none';
AD.loginScreen.style.display = 'flex';
};

// ── FILE READ ────────────────────────────────
function readFile(file) {
return new Promise((res, rej) => {
const r = new FileReader();
r.onload = e => res(e.target.result);
r.onerror = () => rej();
r.readAsText(file);
});
}

// ── CHUNK ────────────────────────────────────
function chunkText(text, size) {
const words = text.split(/\s+/);
const chunks = [];

```
for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(' '));
}

return chunks;
```

}

// ── FILE SELECT ─────────────────────────────
AD.fileInput.onchange = () => {
A.selectedFiles = Array.from(AD.fileInput.files);
};

// ── UPLOAD ──────────────────────────────────
AD.uploadBtn.onclick = async () => {
const cat = AD.categoryInput.value.trim();
if (!cat) return toast('Enter category', 'warning');

```
if (!A.selectedFiles.length) return toast('Select files', 'warning');

const id = cat.toLowerCase();

if (!A.db.categories[id]) A.db.categories[id] = [];

let added = 0;

for (const f of A.selectedFiles) {
    const content = await readFile(f);
    const chunks = chunkText(content, A.db.settings.chunkSize);

    A.db.categories[id].push({
        name: f.name,
        content,
        chunks,
        size: f.size,
        date: new Date().toISOString()
    });

    added++;
}

saveToStorage();
updateAll();

toast(`${added} files added`, 'success');
```

};

// ── MANAGE ──────────────────────────────────
function renderManage() {
AD.categoriesCont.innerHTML = '';

```
for (const [cat, files] of Object.entries(A.db.categories)) {
    const div = document.createElement('div');

    div.innerHTML = `<h3>${cat}</h3>`;

    files.forEach(f => {
        const row = document.createElement('div');
        row.textContent = f.name;
        div.appendChild(row);
    });

    AD.categoriesCont.appendChild(div);
}
```

}

// ── STORAGE (FIXED) ─────────────────────────
function saveToStorage() {
try {
var json = JSON.stringify(buildExportJson());

```
    // IMPORTANT: Save in both
    localStorage.setItem('tb_admin_db', json);
    localStorage.setItem('tb_export', json);

    console.log('[Admin] Saved');
} catch (e) {
    console.error(e);
    toast('Save failed', 'error');
}
```

}

function loadFromStorage() {
try {
const raw = localStorage.getItem('tb_admin_db');
if (!raw) return;

```
    const data = JSON.parse(raw);

    A.db.categories = data.categories || {};
    A.db.settings = data.settings || A.db.settings;
} catch {}
```

}

// ── EXPORT ──────────────────────────────────
function buildExportJson() {
return {
version: 2,
generated: new Date().toISOString(),
settings: A.db.settings,
categories: A.db.categories
};
}

// ── UPDATE ──────────────────────────────────
function updateAll() {
const cats = Object.keys(A.db.categories).length;
const files = Object.values(A.db.categories).flat().length;
const chunks = Object.values(A.db.categories)
.flat()
.reduce((s, f) => s + f.chunks.length, 0);

```
AD.sideCats.textContent = cats;
AD.sideFiles.textContent = files;
AD.sideChunks.textContent = chunks;

renderManage();
```

}

// ── CONFIRM ─────────────────────────────────
function confirm_(msg, cb) {
AD.confirmMsg.textContent = msg;
A.confirmCb = cb;
AD.overlay.style.display = 'block';
}

AD.confirmYes.onclick = () => {
AD.overlay.style.display = 'none';
if (A.confirmCb) A.confirmCb();
};

AD.confirmNo.onclick = () => {
AD.overlay.style.display = 'none';
};

// ── TOAST ───────────────────────────────────
function toast(msg, type = 'info') {
const t = document.createElement('div');
t.className = 'toast ' + type;
t.textContent = msg;

```
AD.toastWrap.appendChild(t);

setTimeout(() => t.remove(), 3000);
```

}

// ── INIT ────────────────────────────────────
loadFromStorage();
updateAll();
