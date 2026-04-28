'use strict';

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const U = {
    data:     null,
    settings: {},
    selected: 'all',
    history:  [],
    loading:  false,
    ready:    false,   // puter ready flag
};

// ─────────────────────────────────────────
//  DOM
// ─────────────────────────────────────────
function g(id) { return document.getElementById(id); }

const UD = {
    topbarStatus:  g('topbarStatus'),
    statusDot:     g('statusDot'),
    botName:       g('botName'),
    categoryPills: g('categoryPills'),
    filterChips:   g('filterChips'),
    catSelRow:     g('categorySelectRow'),
    modelSelect:   g('modelSelect'),
    userChat:      g('userChat'),
    welcomeBlock:  g('welcomeBlock'),
    welcomeTitle:  g('welcomeTitle'),
    welcomeSub:    g('welcomeSubtitle'),
    suggChips:     g('suggestionChips'),
    msgList:       g('messagesList'),
    msgInput:      g('msgInput'),
    sendBtn:       g('sendBtn'),
    charCount:     g('charCount'),
    statusLabel:   g('statusLabel'),
    toastWrap:     g('toastWrap'),
};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
function toast(msg, type, dur) {
    type = type || 'info';
    dur  = dur  || 3000;
    var icons = {
        success: 'fa-check-circle',
        error:   'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info:    'fa-info-circle'
    };
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + msg;
    if (UD.toastWrap) UD.toastWrap.appendChild(t);
    setTimeout(function() {
        t.style.opacity = '0';
        t.style.transition = '.3s';
        setTimeout(function() { t.remove(); }, 300);
    }, dur);
}

function setStatus(msg, ready) {
    if (UD.topbarStatus) UD.topbarStatus.textContent = msg;
    if (UD.statusLabel) {
        if (ready) {
            UD.statusLabel.innerHTML = '<i class="fas fa-circle" style="color:var(--success);font-size:8px"></i> Ready';
        } else {
            UD.statusLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + msg;
        }
    }
    if (UD.statusDot) {
        UD.statusDot.style.background = ready ? 'var(--success)' : 'var(--warning)';
    }
}

function enableInput() {
    if (UD.sendBtn)  UD.sendBtn.disabled  = false;
    if (UD.msgInput) UD.msgInput.disabled = false;
    if (UD.msgInput) UD.msgInput.placeholder = 'Ask a question about the transcripts...';
}

function disableInput(msg) {
    if (UD.sendBtn)  UD.sendBtn.disabled  = true;
    if (UD.msgInput) UD.msgInput.disabled = true;
    if (UD.msgInput) UD.msgInput.placeholder = msg || 'Please wait...';
}

function fmt(text) {
    return String(text || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.*?)\*/g,'<em>$1</em>')
        .replace(/`([^`]+)`/g,'<code>$1</code>')
        .replace(/\n/g,'<br>');
}

function ts() {
    return new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function formatCat(cat) {
    return cat.replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

function scrollDown() {
    if (UD.userChat) UD.userChat.scrollTop = UD.userChat.scrollHeight;
}

function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// ─────────────────────────────────────────
//  DATA LOADING
// ─────────────────────────────────────────
function loadFromLocalStorage() {
    try {
        // Try both keys that admin.js writes to
        var raw = localStorage.getItem('tb_export') || localStorage.getItem('tb_admin_db');
        if (!raw) return null;
        var d = JSON.parse(raw);
        if (d && d.categories && Object.keys(d.categories).length > 0) {
            return d;
        }
        return null;
    } catch(e) {
        return null;
    }
}

async function loadFromURL(url) {
    try {
        var res = await fetch(url + '?nocache=' + Date.now());
        if (!res.ok) return null;
        var d = await res.json();
        if (d && d.categories && Object.keys(d.categories).length > 0) {
            return d;
        }
        return null;
    } catch(e) {
        return null;
    }
}

async function loadData() {
    // 1. localStorage (same browser as admin — works instantly)
    var d = loadFromLocalStorage();
    if (d) {
        console.log('[TranscriptBot] Loaded from localStorage');
        return d;
    }

    // 2. GitHub raw URL saved by admin
    var savedUrl = localStorage.getItem('tb_raw_url');
    if (savedUrl) {
        d = await loadFromURL(savedUrl);
        if (d) {
            console.log('[TranscriptBot] Loaded from saved URL');
            return d;
        }
    }

    // 3. Default path (works on GitHub Pages)
    d = await loadFromURL('./data/transcripts.json');
    if (d) {
        console.log('[TranscriptBot] Loaded from data/transcripts.json');
        return d;
    }

    return null;
}

// ─────────────────────────────────────────
//  WAIT FOR PUTER
// ─────────────────────────────────────────
async function waitForPuter(maxWait) {
    maxWait = maxWait || 15000;
    var waited = 0;
    while (waited < maxWait) {
        if (typeof puter !== 'undefined' && puter.ai && typeof puter.ai.chat === 'function') {
            return true;
        }
        await sleep(300);
        waited += 300;
    }
    return false;
}

// ─────────────────────────────────────────
//  BOOT — runs after DOM ready
// ─────────────────────────────────────────
async function boot() {
    disableInput('Loading...');
    setStatus('Loading data...', false);

    // Load transcript data (fast, no puter needed)
    var data = await loadData();

    if (!data) {
        setStatus('No content loaded', false);
        if (UD.statusLabel) {
            UD.statusLabel.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--warning)"></i> No transcripts found';
        }
        if (UD.welcomeTitle) UD.welcomeTitle.textContent = 'No Content Yet';
        if (UD.welcomeSub)   UD.welcomeSub.textContent   = 'The admin has not uploaded any transcripts yet.';
        disableInput('No transcripts available');
        return;
    }

    U.data     = data;
    U.settings = data.settings || {};

    // Apply settings to UI
    applySettings();
    renderCategoryPills();
    renderFilterChips();
    renderSuggestions();

    setStatus('Connecting to AI...', false);

    // Wait for puter in background — don't block UI
    waitForPuter(20000).then(function(ok) {
        if (ok) {
            U.ready = true;
            enableInput();
            setStatus(Object.keys(U.data.categories).length + ' categories loaded', true);
            console.log('[TranscriptBot] Puter ready');
        } else {
            // Still enable input — puter might work anyway
            U.ready = true;
            enableInput();
            setStatus('AI may be slow to connect', true);
            console.warn('[TranscriptBot] Puter timeout — trying anyway');
        }
    });

    // Enable input anyway after 3 seconds so user isn't blocked
    setTimeout(function() {
        if (!U.ready) {
            U.ready = true;
            enableInput();
            setStatus('Ready (AI loading)', true);
        }
    }, 3000);
}

// ─────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────
function applySettings() {
    var s = U.settings;
    if (s.botName) {
        if (UD.botName)      UD.botName.textContent = s.botName;
        document.title = s.botName;
    }
    if (s.welcome && UD.welcomeSub) {
        UD.welcomeSub.textContent = s.welcome;
    }
    if (s.defaultModel && UD.modelSelect) {
        var opt = UD.modelSelect.querySelector('option[value="' + s.defaultModel + '"]');
        if (opt) opt.selected = true;
    }
}

// ─────────────────────────────────────────
//  CATEGORIES
// ─────────────────────────────────────────
var ICONS = [
    'fa-video','fa-book-open','fa-code','fa-music',
    'fa-flask','fa-chart-line','fa-gamepad','fa-graduation-cap',
    'fa-lightbulb','fa-globe','fa-microphone','fa-film'
];

function renderCategoryPills() {
    if (!UD.categoryPills) return;
    UD.categoryPills.innerHTML = '';
    var cats = Object.keys(U.data.categories);
    if (cats.length === 0) return;

    var allPill = makePill('all', 'All');
    UD.categoryPills.appendChild(allPill);

    cats.forEach(function(cat) {
        UD.categoryPills.appendChild(makePill(cat, formatCat(cat)));
    });

    markActive('all', UD.categoryPills, '.cat-pill');
}

function renderFilterChips() {
    if (!UD.filterChips) return;
    UD.filterChips.innerHTML = '';
    var cats = Object.keys(U.data.categories);

    if (cats.length > 1) {
        if (UD.catSelRow) UD.catSelRow.style.display = 'flex';
        var allChip = makeChip('all', 'All');
        UD.filterChips.appendChild(allChip);
        cats.forEach(function(cat) {
            UD.filterChips.appendChild(makeChip(cat, formatCat(cat)));
        });
        markActive('all', UD.filterChips, '.filter-chip');
    }
}

function makePill(id, label) {
    var d = document.createElement('div');
    d.className = 'cat-pill';
    d.dataset.id = id;
    d.textContent = label;
    d.addEventListener('click', function() {
        U.selected = id;
        markActive(id, UD.categoryPills, '.cat-pill');
        markActive(id, UD.filterChips,   '.filter-chip');
    });
    return d;
}

function makeChip(id, label) {
    var d = document.createElement('div');
    d.className = 'filter-chip';
    d.dataset.id = id;
    d.textContent = label;
    d.addEventListener('click', function() {
        U.selected = id;
        markActive(id, UD.filterChips,   '.filter-chip');
        markActive(id, UD.categoryPills, '.cat-pill');
    });
    return d;
}

function markActive(id, container, sel) {
    if (!container) return;
    container.querySelectorAll(sel).forEach(function(el) {
        el.classList.toggle('active', el.dataset.id === id);
    });
}

// ─────────────────────────────────────────
//  SUGGESTIONS
// ─────────────────────────────────────────
function renderSuggestions() {
    if (!UD.suggChips) return;
    UD.suggChips.innerHTML = '';
    var suggs = (U.settings.suggestions && U.settings.suggestions.length)
        ? U.settings.suggestions
        : ['What topics are covered?', 'Summarize the main points', 'What are the key takeaways?'];

    suggs.slice(0,4).forEach(function(s) {
        var chip = document.createElement('div');
        chip.className   = 'chip';
        chip.textContent = s;
        chip.addEventListener('click', function() {
            if (UD.msgInput) {
                UD.msgInput.value = s;
                sendMessage();
            }
        });
        UD.suggChips.appendChild(chip);
    });
}

// ─────────────────────────────────────────
//  CHUNK RETRIEVAL (keyword search)
// ─────────────────────────────────────────
function tokenize(text) {
    return String(text).toLowerCase()
        .replace(/[^a-z0-9\s]/g,' ')
        .split(/\s+/)
        .filter(function(w){ return w.length > 2; });
}

function scoreChunk(chunk, query) {
    var cToks = tokenize(chunk);
    var qToks = tokenize(query);
    var cSet  = new Set(cToks);
    var score = 0;
    if (chunk.toLowerCase().indexOf(query.toLowerCase()) !== -1) score += 15;
    qToks.forEach(function(qt) {
        if (cSet.has(qt)) score += 3;
    });
    return score;
}

function retrieveChunks(query) {
    var topK = parseInt(U.settings.topK) || 5;
    var cats = U.selected === 'all'
        ? Object.keys(U.data.categories)
        : [U.selected];

    var results = [];
    cats.forEach(function(cat) {
        var files = U.data.categories[cat] || [];
        files.forEach(function(file) {
            var chunks = file.chunks || [];
            chunks.forEach(function(chunk) {
                var sc = scoreChunk(chunk, query);
                if (sc > 0) {
                    results.push({ chunk: chunk, score: sc, cat: cat, file: file.name });
                }
            });
        });
    });

    results.sort(function(a,b){ return b.score - a.score; });
    return results.slice(0, topK);
}

// ─────────────────────────────────────────
//  CHAT
// ─────────────────────────────────────────
function addMsg(role, content, streaming) {
    // hide welcome
    if (UD.welcomeBlock) UD.welcomeBlock.style.display = 'none';

    var wrap = document.createElement('div');
    wrap.className = 'msg-wrap ' + role;

    var icon = role === 'user' ? 'fa-user' : 'fa-robot';

    if (streaming) {
        wrap.innerHTML =
            '<div class="msg-av"><i class="fas ' + icon + '"></i></div>' +
            '<div class="msg-inner">' +
                '<div class="msg-bub streaming-cursor">' +
                    '<div class="typing-dots"><span></span><span></span><span></span></div>' +
                '</div>' +
                '<div class="msg-meta"><span>' + ts() + '</span></div>' +
            '</div>';
    } else {
        wrap.innerHTML =
            '<div class="msg-av"><i class="fas ' + icon + '"></i></div>' +
            '<div class="msg-inner">' +
                '<div class="msg-bub">' + fmt(content) + '</div>' +
                '<div class="msg-meta"><span>' + ts() + '</span></div>' +
            '</div>';
    }

    if (UD.msgList) UD.msgList.appendChild(wrap);
    scrollDown();
    return wrap;
}

async function sendMessage() {
    if (!UD.msgInput) return;
    var text = UD.msgInput.value.trim();
    if (!text || U.loading) return;

    // Check puter
    if (typeof puter === 'undefined' || !puter.ai) {
        toast('AI not loaded yet, please wait a moment and try again', 'warning');
        return;
    }

    // Check data
    if (!U.data) {
        toast('No transcript data loaded', 'error');
        return;
    }

    U.loading = true;
    UD.sendBtn.disabled = true;
    UD.msgInput.value   = '';
    UD.msgInput.style.height = 'auto';
    if (UD.charCount) UD.charCount.textContent = '';

    addMsg('user', text, false);
    U.history.push({ role: 'user', content: text });

    // Get context
    var chunks     = retrieveChunks(text);
    var hasContext = chunks.length > 0;

    var contextText = hasContext
        ? chunks.map(function(r) {
            return '[Category: ' + formatCat(r.cat) + ' | File: ' + r.file + ']\n' + r.chunk;
          }).join('\n\n---\n\n')
        : 'No relevant transcript content found.';

    var systemPrompt = 'You are a helpful assistant that answers questions based ONLY on the provided video transcript content.\n\n' +
        'RULES:\n' +
        '1. Only use the transcript content below to answer.\n' +
        '2. If not found, say: "I could not find that in the available transcripts."\n' +
        '3. Be concise and helpful.\n\n' +
        'TRANSCRIPT CONTENT:\n' + contextText;

    if (U.settings.systemPrompt && U.settings.systemPrompt.trim()) {
        systemPrompt = U.settings.systemPrompt + '\n\nTRANSCRIPT CONTENT:\n' + contextText;
    }

    var messages = [{ role: 'system', content: systemPrompt }];

    // Add recent history
    var hist = U.history.slice(-8);
    for (var i = 0; i < hist.length - 1; i++) {
        messages.push(hist[i]);
    }
    messages.push({ role: 'user', content: text });

    var model  = (UD.modelSelect ? UD.modelSelect.value : null) || 'gpt-4o-mini';
    var botEl  = addMsg('bot', '', true);
    var bubEl  = botEl.querySelector('.msg-bub');
    var metaEl = botEl.querySelector('.msg-meta');

    var full = '';

    try {
        var stream = await puter.ai.chat(messages, { model: model, stream: true });

        bubEl.innerHTML = '';
        bubEl.classList.add('streaming-cursor');

        for await (var part of stream) {
            var token = (part && part.text) ? part.text : '';
            full += token;
            bubEl.innerHTML = fmt(full);
            scrollDown();
        }

        bubEl.classList.remove('streaming-cursor');

        // Source tags
        if (hasContext) {
            var seen = {};
            chunks.slice(0,3).forEach(function(c) {
                var key = formatCat(c.cat) + ' › ' + c.file;
                if (!seen[key]) {
                    seen[key] = true;
                    var tag = document.createElement('span');
                    tag.className   = 'src-tag';
                    tag.textContent = '📄 ' + key;
                    metaEl.appendChild(tag);
                }
            });
        }

        U.history.push({ role: 'assistant', content: full });

    } catch(err) {
        bubEl.classList.remove('streaming-cursor');
        console.error('AI error:', err);
        bubEl.innerHTML =
            '<span style="color:var(--error)">⚠ Error: ' +
            (err.message || 'Something went wrong. Please try again.') +
            '</span>';
    }

    U.loading           = false;
    UD.sendBtn.disabled = false;
    if (UD.msgInput) UD.msgInput.focus();
}

// ─────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────
if (UD.sendBtn) {
    UD.sendBtn.addEventListener('click', sendMessage);
}

if (UD.msgInput) {
    UD.msgInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    UD.msgInput.addEventListener('input', function() {
        UD.msgInput.style.height = 'auto';
        UD.msgInput.style.height = Math.min(UD.msgInput.scrollHeight, 130) + 'px';
        if (UD.charCount) UD.charCount.textContent = UD.msgInput.value.length || '';
    });
}

// ─────────────────────────────────────────
//  START — no waiting for anything
// ─────────────────────────────────────────
boot();
