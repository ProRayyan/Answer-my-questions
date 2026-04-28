// ══════════════════════════════════════════════════
//  TranscriptBot — Powered by Puter.js (No Backend)
// ══════════════════════════════════════════════════

'use strict';

// ── STATE ──────────────────────────────────────────
const state = {
    categories: {},       // { categoryName: [{ name, content, chunks }] }
    selectedCategory: 'all',
    chatHistory: [],
    isLoading: false,
    totalChats: 0,
};

// Category icons pool
const ICONS = [
    'fa-video', 'fa-book-open', 'fa-code', 'fa-music',
    'fa-flask', 'fa-chart-line', 'fa-gamepad', 'fa-graduation-cap',
    'fa-lightbulb', 'fa-globe', 'fa-microphone', 'fa-film',
];

// ── DOM REFS ───────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
    sidebar:           $('sidebar'),
    toggleSidebar:     $('toggleSidebar'),
    mobileMenu:        $('mobileMenu'),
    categoryList:      $('categoryList'),
    categoryInput:     $('categoryInput'),
    fileInput:         $('fileInput'),
    fileLabel:         $('fileLabel'),
    dropZone:          $('dropZone'),
    uploadBtn:         $('uploadBtn'),
    clearAllBtn:       $('clearAllBtn'),
    chatMessages:      $('chatMessages'),
    emptyState:        $('emptyState'),
    msgInput:          $('msgInput'),
    sendBtn:           $('sendBtn'),
    modelSelect:       $('modelSelect'),
    clearChatBtn:      $('clearChatBtn'),
    headerTitle:       $('headerTitle'),
    headerSub:         $('headerSub'),
    categoryIndicator: $('categoryIndicator'),
    totalDocs:         $('totalDocs'),
    totalCategories:   $('totalCategories'),
    totalChunks:       $('totalChunks'),
    totalChats:        $('totalChats'),
    badgeAll:          $('badge-all'),
    toastContainer:    $('toastContainer'),
    confirmOverlay:    $('confirmOverlay'),
    confirmYes:        $('confirmYes'),
    confirmNo:         $('confirmNo'),
    inputMeta:         $('inputMeta'),
};

// ══════════════════════════════════════════════════
//  TEXT CHUNKING
// ══════════════════════════════════════════════════

function chunkText(text, chunkSize = 400, overlap = 60) {
    const words = text.trim().split(/\s+/);
    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + chunkSize, words.length);
        chunks.push(words.slice(start, end).join(' '));
        if (end === words.length) break;
        start += chunkSize - overlap;
    }
    return chunks;
}

// ══════════════════════════════════════════════════
//  SIMPLE KEYWORD SEARCH (no embeddings needed)
// ══════════════════════════════════════════════════

function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

function scoreChunk(chunk, query) {
    const chunkTokens  = tokenize(chunk);
    const queryTokens  = tokenize(query);
    const chunkSet     = new Set(chunkTokens);

    let score = 0;
    const queryText = query.toLowerCase();

    // Exact phrase bonus
    if (chunk.toLowerCase().includes(queryText)) score += 10;

    // Token overlap
    for (const qt of queryTokens) {
        if (chunkSet.has(qt)) score += 2;
        // Partial match
        for (const ct of chunkTokens) {
            if (ct.includes(qt) || qt.includes(ct)) score += 0.5;
        }
    }

    // Length normalisation (prefer medium chunks)
    const wordCount = chunkTokens.length;
    if (wordCount > 30 && wordCount < 300) score += 1;

    return score;
}

function retrieveRelevantChunks(query, categoryId = 'all', topK = 6) {
    const results = [];

    const categoriesToSearch = categoryId === 'all'
        ? Object.keys(state.categories)
        : [categoryId];

    for (const cat of categoriesToSearch) {
        const files = state.categories[cat] || [];
        for (const file of files) {
            for (const chunk of file.chunks) {
                const score = scoreChunk(chunk, query);
                if (score > 0) {
                    results.push({ chunk, score, category: cat, file: file.name });
                }
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
}

// ══════════════════════════════════════════════════
//  FILE UPLOAD & INDEXING
// ══════════════════════════════════════════════════

async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file, 'UTF-8');
    });
}

async function handleUpload() {
    const categoryRaw = DOM.categoryInput.value.trim();
    const files       = DOM.fileInput.files;

    if (!categoryRaw) { showToast('Enter a category name first', 'warning'); return; }
    if (!files.length) { showToast('Select at least one .txt file', 'warning'); return; }

    const category = categoryRaw.toLowerCase().replace(/\s+/g, '_');

    DOM.uploadBtn.disabled = true;
    DOM.uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    let uploaded = 0;
    let totalNewChunks = 0;

    for (const file of files) {
        if (!file.name.endsWith('.txt')) {
            showToast(`${file.name} is not a .txt file — skipped`, 'warning');
            continue;
        }

        try {
            const content = await readFileAsText(file);
            const chunks  = chunkText(content);

            if (!state.categories[category]) state.categories[category] = [];

            // Avoid duplicates
            const exists = state.categories[category].some(f => f.name === file.name);
            if (exists) {
                showToast(`${file.name} already loaded`, 'warning');
                continue;
            }

            state.categories[category].push({ name: file.name, content, chunks });
            totalNewChunks += chunks.length;
            uploaded++;

        } catch (err) {
            showToast(`Failed to read ${file.name}`, 'error');
        }
    }

    DOM.uploadBtn.disabled = false;
    DOM.uploadBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add to Bot';

    if (uploaded > 0) {
        showToast(`✓ ${uploaded} file(s) added · ${totalNewChunks} chunks indexed`, 'success');
        DOM.categoryInput.value = '';
        DOM.fileInput.value     = '';
        DOM.fileLabel.textContent = 'Drop .txt files or click';
        renderCategoryList();
        updateStats();
        saveToStorage();
    }
}

// ══════════════════════════════════════════════════
//  CATEGORY UI
// ══════════════════════════════════════════════════

function renderCategoryList() {
    DOM.categoryList.innerHTML = '';

    // Count total files
    const allFiles = Object.values(state.categories).reduce((s, f) => s + f.length, 0);

    // "All" item
    const allItem = createCategoryItem('all', 'All Categories', 'fa-layer-group', allFiles);
    DOM.categoryList.appendChild(allItem);
    DOM.badgeAll.textContent = allFiles;

    // Per-category items
    Object.entries(state.categories).forEach(([id, files], idx) => {
        const label = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const icon  = ICONS[idx % ICONS.length];
        const item  = createCategoryItem(id, label, icon, files.length);
        DOM.categoryList.appendChild(item);
    });

    // Update active state
    setActiveCategoryItem(state.selectedCategory);
}

function createCategoryItem(id, label, icon, count) {
    const div = document.createElement('div');
    div.className = 'category-item';
    div.dataset.id = id;
    div.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${label}</span>
        <span class="badge">${count}</span>
    `;
    div.addEventListener('click', () => selectCategory(id, label));
    return div;
}

function setActiveCategoryItem(id) {
    document.querySelectorAll('.category-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
    });
}

function selectCategory(id, label) {
    state.selectedCategory = id;
    state.chatHistory      = [];

    setActiveCategoryItem(id);

    const displayLabel = id === 'all' ? 'All Categories' : label;
    DOM.headerTitle.textContent       = displayLabel;
    DOM.categoryIndicator.textContent = `📂 ${displayLabel}`;

    const fileCount = id === 'all'
        ? Object.values(state.categories).reduce((s, f) => s + f.length, 0)
        : (state.categories[id]?.length || 0);

    DOM.headerSub.textContent = fileCount === 0
        ? 'No transcripts loaded'
        : `${fileCount} file(s) loaded`;

    clearChatUI();

    // Close mobile sidebar
    DOM.sidebar.classList.remove('mobile-open');
}

// ══════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════

function updateStats() {
    const cats   = Object.keys(state.categories).length;
    const files  = Object.values(state.categories).reduce((s, f) => s + f.length, 0);
    const chunks = Object.values(state.categories)
        .flat()
        .reduce((s, f) => s + f.chunks.length, 0);

    DOM.totalDocs.textContent       = files;
    DOM.totalCategories.textContent = cats;
    DOM.totalChunks.textContent     = chunks;
    DOM.totalChats.textContent      = state.totalChats;

    const label = files === 0
        ? 'No transcripts loaded yet'
        : `${files} file(s) · ${chunks} chunks ready`;
    DOM.headerSub.textContent = label;
}

// ══════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════

function getTimestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function clearChatUI() {
    DOM.chatMessages.innerHTML = '';
    DOM.chatMessages.appendChild(DOM.emptyState);
}

function removeEmptyState() {
    if (DOM.emptyState.parentNode) DOM.emptyState.remove();
}

function addMessage(role, content = '', streaming = false) {
    removeEmptyState();

    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;

    const avatar = role === 'user' ? 'fa-user' : 'fa-robot';
    const bubbleId = streaming ? 'streamingBubble' : '';

    wrap.innerHTML = `
        <div class="msg-avatar"><i class="fas ${avatar}"></i></div>
        <div class="msg-body">
            <div class="msg-bubble ${streaming ? 'streaming-cursor' : ''}" ${bubbleId ? `id="${bubbleId}"` : ''}>
                ${streaming
                    ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
                    : formatText(content)
                }
            </div>
            <div class="msg-meta">
                <span>${getTimestamp()}</span>
            </div>
        </div>
    `;

    DOM.chatMessages.appendChild(wrap);
    scrollToBottom();
    return wrap;
}

function formatText(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function scrollToBottom() {
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

async function sendMessage() {
    const text = DOM.msgInput.value.trim();
    if (!text || state.isLoading) return;

    // Check transcripts loaded
    const totalFiles = Object.values(state.categories).reduce((s, f) => s + f.length, 0);
    if (totalFiles === 0) {
        showToast('Upload transcript files first!', 'warning');
        return;
    }

    state.isLoading = true;
    DOM.sendBtn.disabled = true;
    DOM.msgInput.value   = '';
    DOM.msgInput.style.height = 'auto';

    // Render user message
    addMessage('user', text);
    state.chatHistory.push({ role: 'user', content: text });

    // Retrieve relevant context
    const chunks   = retrieveRelevantChunks(text, state.selectedCategory, 6);
    const hasContext = chunks.length > 0;

    // Build context string
    const contextText = hasContext
        ? chunks.map(r =>
            `[Source: ${r.category} / ${r.file}]\n${r.chunk}`
          ).join('\n\n---\n\n')
        : 'No relevant transcript content found for this query.';

    // System prompt
    const systemPrompt = `You are a helpful assistant that answers questions strictly based on video transcript content.

RULES:
1. Answer ONLY using the transcript excerpts provided below.
2. If the answer is not in the transcripts, say: "I couldn't find that information in the available transcripts."
3. Be concise, clear, and helpful.
4. When referencing content, mention which category or file it came from.
5. Do NOT make up information not present in the transcripts.

TRANSCRIPT EXCERPTS:
${contextText}`;

    // Build messages for Puter
    const messages = [
        { role: 'system', content: systemPrompt },
        ...state.chatHistory.slice(-8),
    ];

    // Add streaming bot message
    const botMsgEl    = addMessage('bot', '', true);
    const bubbleEl    = botMsgEl.querySelector('.msg-bubble');
    const metaEl      = botMsgEl.querySelector('.msg-meta');
    const selectedModel = DOM.modelSelect.value;

    let fullResponse = '';

    try {
        const response = await puter.ai.chat(messages, {
            model: selectedModel,
            stream: true,
        });

        // Clear typing dots
        bubbleEl.innerHTML = '';
        bubbleEl.classList.add('streaming-cursor');

        for await (const part of response) {
            const token = part?.text || '';
            fullResponse += token;
            bubbleEl.innerHTML = formatText(fullResponse);
            scrollToBottom();
        }

        bubbleEl.classList.remove('streaming-cursor');

        // Add source tags
        if (hasContext) {
            const sources = [...new Set(chunks.map(c => `${c.category}/${c.file}`))];
            sources.slice(0, 3).forEach(src => {
                const tag = document.createElement('span');
                tag.className = 'msg-source';
                tag.textContent = `📄 ${src}`;
                metaEl.appendChild(tag);
            });
        }

        state.chatHistory.push({ role: 'assistant', content: fullResponse });
        state.totalChats++;
        DOM.totalChats.textContent = state.totalChats;

    } catch (err) {
        bubbleEl.classList.remove('streaming-cursor');
        bubbleEl.innerHTML = `<span style="color:var(--error)">⚠ Error: ${err.message || 'Something went wrong. Please try again.'}</span>`;
        console.error('Puter AI error:', err);
    }

    state.isLoading      = false;
    DOM.sendBtn.disabled = false;
    DOM.msgInput.focus();
}

// ══════════════════════════════════════════════════
//  LOCAL STORAGE
// ══════════════════════════════════════════════════

function saveToStorage() {
    try {
        // Save category metadata only (not full content for performance)
        const meta = {};
        for (const [cat, files] of Object.entries(state.categories)) {
            meta[cat] = files.map(f => ({
                name:    f.name,
                content: f.content,
                chunks:  f.chunks,
            }));
        }
        localStorage.setItem('transcriptBot_data', JSON.stringify(meta));
    } catch (e) {
        console.warn('Storage save failed:', e);
    }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem('transcriptBot_data');
        if (!raw) return;
        const data = JSON.parse(raw);
        for (const [cat, files] of Object.entries(data)) {
            state.categories[cat] = files;
        }
        renderCategoryList();
        updateStats();
        showToast('Previous transcripts restored ✓', 'info');
    } catch (e) {
        console.warn('Storage load failed:', e);
    }
}

function clearAllData() {
    state.categories     = {};
    state.chatHistory    = [];
    state.selectedCategory = 'all';
    localStorage.removeItem('transcriptBot_data');
    renderCategoryList();
    updateStats();
    clearChatUI();
    DOM.headerTitle.textContent = 'All Categories';
    DOM.categoryIndicator.textContent = '📂 All Categories';
    showToast('All data cleared', 'info');
}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════

function showToast(msg, type = 'info', duration = 3500) {
    const icons = {
        success: 'fa-check-circle',
        error:   'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info:    'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ══════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════

// Send message
DOM.sendBtn.addEventListener('click', sendMessage);

DOM.msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-grow textarea
DOM.msgInput.addEventListener('input', () => {
    DOM.msgInput.style.height = 'auto';
    DOM.msgInput.style.height = Math.min(DOM.msgInput.scrollHeight, 140) + 'px';
});

// Upload
DOM.uploadBtn.addEventListener('click', handleUpload);

// File label update
DOM.fileInput.addEventListener('change', () => {
    const files = DOM.fileInput.files;
    DOM.fileLabel.textContent = files.length === 0
        ? 'Drop .txt files or click'
        : files.length === 1
            ? files[0].name
            : `${files.length} files selected`;
});

// Drag & drop
DOM.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    DOM.dropZone.classList.add('dragover');
});

DOM.dropZone.addEventListener('dragleave', () => {
    DOM.dropZone.classList.remove('dragover');
});

DOM.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    DOM.dropZone.classList.remove('dragover');
    DOM.fileInput.files = e.dataTransfer.files;
    const files = e.dataTransfer.files;
    DOM.fileLabel.textContent = files.length === 1
        ? files[0].name
        : `${files.length} files selected`;
});

// Sidebar toggle
DOM.toggleSidebar.addEventListener('click', () => {
    DOM.sidebar.classList.toggle('collapsed');
});

DOM.mobileMenu.addEventListener('click', () => {
    DOM.sidebar.classList.toggle('mobile-open');
});

// Clear chat
DOM.clearChatBtn.addEventListener('click', () => {
    state.chatHistory = [];
    clearChatUI();
});

// Clear all data
DOM.clearAllBtn.addEventListener('click', () => {
    DOM.confirmOverlay.classList.add('show');
});

DOM.confirmYes.addEventListener('click', () => {
    DOM.confirmOverlay.classList.remove('show');
    clearAllData();
});

DOM.confirmNo.addEventListener('click', () => {
    DOM.confirmOverlay.classList.remove('show');
});

// Close overlay on background click
DOM.confirmOverlay.addEventListener('click', e => {
    if (e.target === DOM.confirmOverlay) DOM.confirmOverlay.classList.remove('show');
});

// ══════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════

function boot() {
    loadFromStorage();
    DOM.msgInput.focus();

    // Check puter availability
    if (typeof puter === 'undefined') {
        showToast('Puter.js not loaded — check your connection', 'error', 6000);
        return;
    }

    showToast('TranscriptBot ready · Powered by Puter.js', 'success');
}

boot();