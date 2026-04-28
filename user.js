'use strict';

// ── STATE ──────────────────────────────────────────────────
const U = {
    data:     null,
    settings: {},
    selected: 'all',
    history:  [],
    loading:  false,
};

// ── DOM ────────────────────────────────────────────────────
const g  = id => document.getElementById(id);
const UD = {
    loadScreen:    g('loadingScreen'),
    loadFill:      g('loadingFill'),
    userApp:       g('userApp'),
    noData:        g('noDataScreen'),
    topbarStatus:  g('topbarStatus'),
    categoryPills: g('categoryPills'),
    filterChips:   g('filterChips'),
    catSelRow:     g('categorySelectRow'),
    modelSelect:   g('modelSelect'),
    userChat:      g('userChat'),
    welcomeBlock:  g('welcomeBlock'),
    suggChips:     g('suggestionChips'),
    msgList:       g('messagesList'),
    msgInput:      g('msgInput'),
    sendBtn:       g('sendBtn'),
    charCount:     g('charCount'),
    toastWrap:     g('toastWrap'),
};

// ── HELPERS ────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setProgress(pct) {
    if (UD.loadFill) UD.loadFill.style.width = pct + '%';
}

function toast(msg, type = 'info', dur = 3500) {
    if (!UD.toastWrap) return;
    const icons = {
        success: 'fa-check-circle',
        error:   'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info:    'fa-info-circle',
    };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    UD.toastWrap.appendChild(t);
    setTimeout(() => {
        t.style.opacity    = '0';
        t.style.transition = '.3s';
        setTimeout(() => t.remove(), 300);
    }, dur);
}

function formatCatName(cat) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatBytes(b) {
    if (!b || b < 1024) return (b || 0) + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

function fmt(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function ts() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollDown() {
    if (UD.userChat) UD.userChat.scrollTop = UD.userChat.scrollHeight;
}

// ── BOOT ───────────────────────────────────────────────────
async function boot() {
    setProgress(15);

    let data = null;

    // 1. Try localStorage first (set by admin on same device)
    data = tryLocalStorage();
    if (data) {
        setProgress(60);
        console.log('Loaded from localStorage');
    }

    // 2. Try GitHub raw URL if set
    if (!data || !hasCategories(data)) {
        const rawUrl = localStorage.getItem('tb_raw_url');
        if (rawUrl) {
            setProgress(40);
            data = await tryFetch(rawUrl);
            if (data) console.log('Loaded from GitHub URL');
        }
    }

    // 3. Try same-origin data/transcripts.json
    if (!data || !hasCategories(data)) {
        setProgress(55);
        data = await tryFetch('./data/transcripts.json');
        if (data) console.log('Loaded from data/transcripts.json');
    }

    setProgress(90);
    await sleep(300);
    setProgress(100);
    await sleep(300);

    // Always hide loading screen
    if (UD.loadScreen) UD.loadScreen.style.display = 'none';

    if (!data || !hasCategories(data)) {
        // Show no-data screen
        if (UD.noData) UD.noData.style.display = 'flex';
        return;
    }

    U.data     = data;
    U.settings = data.settings || {};

    if (UD.userApp) UD.userApp.style.display = 'flex';

    applySettings();
    renderCategoryPills();
    renderFilterChips();
    renderSuggestions();
}

function hasCategories(data) {
    return data &&
        data.categories &&
        typeof data.categories === 'object' &&
        Object.keys(data.categories).length > 0;
}

function tryLocalStorage() {
    try {
        // Try both keys
        const raw = localStorage.getItem('tb_export') || localStorage.getItem('tb_admin_db');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return hasCategories(parsed) ? parsed : null;
    } catch (e) {
        console.warn('localStorage read error:', e);
        return null;
    }
}

async function tryFetch(url) {
    try {
        const res = await fetch(url + '?t=' + Date.now(), {
            cache: 'no-cache',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn('Fetch failed for', url, e);
        return null;
    }
}

// ── SETTINGS ───────────────────────────────────────────────
function applySettings() {
    const s = U.settings;

    if (s.botName) {
        const h1 = document.querySelector('.bot-info h1');
        if (h1) h1.textContent = s.botName;
        document.title = s.botName;
    }

    if (s.welcome) {
        const p = document.querySelector('.welcome-text p');
        if (p) p.textContent = s.welcome;
    }

    if (s.defaultModel && UD.modelSelect) {
        const opt = UD.modelSelect.querySelector(`option[value="${s.defaultModel}"]`);
        if (opt) opt.selected = true;
    }

    const total = Object.values(U.data.categories)
        .reduce((sum, arr) => sum + arr.length, 0);
    if (UD.topbarStatus) {
        UD.topbarStatus.textContent = `${total} file(s) · ${Object.keys(U.data.categories).length} categories`;
    }
}

// ── CATEGORY UI ────────────────────────────────────────────
function renderCategoryPills() {
    if (!UD.categoryPills) return;
    UD.categoryPills.innerHTML = '';

    const allPill = makePill('all', 'All', UD.categoryPills);
    UD.categoryPills.appendChild(allPill);

    Object.keys(U.data.categories).forEach(cat => {
        const p = makePill(cat, formatCatName(cat), UD.categoryPills);
        UD.categoryPills.appendChild(p);
    });

    setActive('all', UD.categoryPills, '.cat-pill');
}

function renderFilterChips() {
    if (!UD.filterChips) return;
    UD.filterChips.innerHTML = '';

    const allChip = makeChip('all', 'All');
    UD.filterChips.appendChild(allChip);

    Object.keys(U.data.categories).forEach(cat => {
        const c = makeChip(cat, formatCatName(cat));
        UD.filterChips.appendChild(c);
    });

    setActive('all', UD.filterChips, '.filter-chip');

    if (Object.keys(U.data.categories).length <= 1 && UD.catSelRow) {
        UD.catSelRow.style.display = 'none';
    }
}

function makePill(id, label, container) {
    const d = document.createElement('div');
    d.className  = 'cat-pill';
    d.dataset.id = id;
    d.textContent = label;
    d.addEventListener('click', () => {
        U.selected = id;
        setActive(id, container, '.cat-pill');
        if (UD.filterChips) setActive(id, UD.filterChips, '.filter-chip');
    });
    return d;
}

function makeChip(id, label) {
    const d = document.createElement('div');
    d.className  = 'filter-chip';
    d.dataset.id = id;
    d.textContent = label;
    d.addEventListener('click', () => {
        U.selected = id;
        setActive(id, UD.filterChips, '.filter-chip');
        if (UD.categoryPills) setActive(id, UD.categoryPills, '.cat-pill');
    });
    return d;
}

function setActive(id, container, selector) {
    if (!container) return;
    container.querySelectorAll(selector).forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
    });
}

// ── SUGGESTIONS ────────────────────────────────────────────
function renderSuggestions() {
    if (!UD.suggChips) return;
    UD.suggChips.innerHTML = '';

    const suggestions = U.settings.suggestions || [
        'What topics are covered?',
        'Summarize the main points',
        'What are the key takeaways?',
        'Give me a brief overview',
    ];

    suggestions.slice(0, 4).forEach(s => {
        const chip = document.createElement('div');
        chip.className   = 'chip';
        chip.textContent = s;
        chip.addEventListener('click', () => {
            if (UD.msgInput) UD.msgInput.value = s;
            sendMessage();
        });
        UD.suggChips.appendChild(chip);
    });
}

// ── CHUNK RETRIEVAL ────────────────────────────────────────
function tokenize(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

function scoreChunk(chunk, query) {
    const cTokens = tokenize(chunk);
    const qTokens = tokenize(query);
    const cSet    = new Set(cTokens);
    let score     = 0;

    const lQuery = query.toLowerCase();
    const lChunk = chunk.toLowerCase();

    if (lChunk.includes(lQuery)) score += 15;

    for (const qt of qTokens) {
        if (cSet.has(qt)) score += 3;
        for (const ct of cTokens) {
            if (ct !== qt && (ct.includes(qt) || qt.includes(ct))) score += 0.3;
        }
    }

    if (cTokens.length > 30 && cTokens.length < 400) score += 1;
    return score;
}

function retrieveChunks(query, topK) {
    const k    = topK || parseInt(U.settings.topK) || 6;
    const cats = U.selected === 'all'
        ? Object.keys(U.data.categories)
        : [U.selected];

    const results = [];

    for (const cat of cats) {
        const files = U.data.categories[cat] || [];
        for (const file of files) {
            const chunks = file.chunks || [];
            for (const chunk of chunks) {
                const sc = scoreChunk(chunk, query);
                if (sc > 0) {
                    results.push({ chunk, score: sc, cat, file: file.name });
                }
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
}

// ── CHAT ───────────────────────────────────────────────────
function addMsg(role, content = '', streaming = false) {
    // Hide welcome block
    if (UD.welcomeBlock) UD.welcomeBlock.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${role}`;

    const icon = role === 'user' ? 'fa-user' : 'fa-robot';

    wrap.innerHTML = `
        <div class="msg-av"><i class="fas ${icon}"></i></div>
        <div class="msg-inner">
            <div class="msg-bub ${streaming ? 'streaming-cursor' : ''}">
                ${streaming
                    ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
                    : fmt(content)
                }
            </div>
            <div class="msg-meta"><span>${ts()}</span></div>
        </div>
    `;

    if (UD.msgList) UD.msgList.appendChild(wrap);
    scrollDown();
    return wrap;
}

async function sendMessage() {
    if (!UD.msgInput) return;
    const text = UD.msgInput.value.trim();
    if (!text || U.loading) return;

    // Check puter loaded
    if (typeof puter === 'undefined') {
        toast('Puter.js not loaded yet — please wait a moment', 'warning');
        return;
    }

    U.loading            = true;
    UD.sendBtn.disabled  = true;
    UD.msgInput.value    = '';
    UD.msgInput.style.height = 'auto';
    if (UD.charCount) UD.charCount.textContent = '0';

    addMsg('user', text);
    U.history.push({ role: 'user', content: text });

    const chunks     = retrieveChunks(text);
    const hasContext = chunks.length > 0;

    const contextText = hasContext
        ? chunks.map(r =>
            `[Category: ${formatCatName(r.cat)} | File: ${r.file}]\n${r.chunk}`
          ).join('\n\n---\n\n')
        : 'No relevant transcript content found.';

    const systemPrompt = (U.settings.systemPrompt && U.settings.systemPrompt.trim())
        ? U.settings.systemPrompt
        : `You are a helpful assistant that answers questions based ONLY on the provided video transcript content.

RULES:
1. Only use the transcript content below to answer.
2. If the answer is not in the transcripts, say: "I couldn't find that in the available transcripts."
3. Be clear, concise, and helpful.
4. Mention the source file/category when relevant.

TRANSCRIPT CONTENT:
${contextText}`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...U.history.slice(-10),
    ];

    const botEl  = addMsg('bot', '', true);
    const bubEl  = botEl.querySelector('.msg-bub');
    const metaEl = botEl.querySelector('.msg-meta');
    const model  = UD.modelSelect ? UD.modelSelect.value : 'gpt-4o-mini';

    let full = '';

    try {
        const stream = await puter.ai.chat(messages, { model, stream: true });

        bubEl.innerHTML = '';
        bubEl.classList.add('streaming-cursor');

        for await (const part of stream) {
            const token = part?.text || '';
            full += token;
            bubEl.innerHTML = fmt(full);
            scrollDown();
        }

        bubEl.classList.remove('streaming-cursor');

        // Add source tags
        if (hasContext) {
            const sources = [...new Set(
                chunks.slice(0, 3).map(c => `${formatCatName(c.cat)} › ${c.file}`)
            )];
            sources.forEach(src => {
                const tag = document.createElement('span');
                tag.className   = 'src-tag';
                tag.textContent = `📄 ${src}`;
                metaEl.appendChild(tag);
            });
        }

        U.history.push({ role: 'assistant', content: full });

    } catch (err) {
        bubEl.classList.remove('streaming-cursor');
        console.error('AI error:', err);
        bubEl.innerHTML = `<span style="color:var(--error)">
            ⚠ Error: ${err.message || 'Something went wrong. Please try again.'}
        </span>`;
    }

    U.loading           = false;
    UD.sendBtn.disabled = false;
    if (UD.msgInput) UD.msgInput.focus();
}

// ── EVENTS ─────────────────────────────────────────────────
if (UD.sendBtn) {
    UD.sendBtn.addEventListener('click', sendMessage);
}

if (UD.msgInput) {
    UD.msgInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    UD.msgInput.addEventListener('input', () => {
        UD.msgInput.style.height = 'auto';
        UD.msgInput.style.height = Math.min(UD.msgInput.scrollHeight, 130) + 'px';
        if (UD.charCount) UD.charCount.textContent = UD.msgInput.value.length;
    });
}

// ── START ──────────────────────────────────────────────────
boot().catch(err => {
    console.error('Boot error:', err);
    // Always show something to the user
    if (UD.loadScreen) UD.loadScreen.style.display = 'none';
    if (UD.noData)     UD.noData.style.display     = 'flex';
});
