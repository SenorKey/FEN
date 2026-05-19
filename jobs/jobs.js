/* ═══════════════════════════════════════════════
   jobs.js — Page logic for /jobs
   frontendneeded.com

   Vanilla JS. Talks to three endpoints (all kept the same as before,
   even though the backend now lives on the Fedora / Windows PC):
     /api/chat-big    — Ollama on the Windows PC (big model, may be off)
     /api/chat        — Ollama on the Fedora PC (small fallback, always on)
     /api/jobs-data   — JSON store on the Fedora box
   ═══════════════════════════════════════════════ */

(function () {

    // ── Endpoint config ──
    var ENDPOINTS = {
        big:   { url: '/api/chat-big', model: 'mistral-small:22b-instruct-2409-q4_K_M', label: 'Mistral Small 22B Q4_K_M (Windows)' },
        local: { url: '/api/chat',     model: 'llama3',                                  label: 'Llama 3 (local fallback)' }
    };

    // Metadata extraction is one-shot and trivial — always use local.
    var CLASSIFIER_ENDPOINT = 'local';

    // The backend still stores resumes under a category key; we map our
    // single "master" resume into that slot so the data API stays as-is.
    var MASTER_RESUME_SLOT = 'software';

    // ── State ──
    var state = {
        masterResume: '',
        masterResumeFilename: '',
        masterResumeUploadedAt: '',
        applications: [],
        activeAppId: null,
        generatingId: null,        // id of the application currently generating
        savingNewListing: false,
        retryingMetaId: null,      // app id currently re-running metadata extraction
        aiStatus: { big: 'unknown', local: 'unknown' }
    };

    var FILENAME_LS_KEY = 'jobs.masterResumeFilename';
    var UPLOADED_AT_LS_KEY = 'jobs.masterResumeUploadedAt';

    // ── DOM ──
    var $ = function (id) { return document.getElementById(id); };

    var urlInput        = $('urlInput');
    var jdInput         = $('jdInput');
    var saveJobBtn      = $('saveJobBtn');
    var clearBtn        = $('clearBtn');
    var statusLine      = $('statusLine');

    var customResumeText  = $('customResumeText');
    var customResumeEmpty = $('customResumeEmpty');
    var resumeActions     = $('resumeActions');

    var fallbackBanner    = $('fallbackBanner');
    var fallbackPrompt    = $('fallbackPrompt');
    var useFallbackBtn    = $('useFallbackBtn');
    var dismissFallbackBtn = $('dismissFallbackBtn');

    var historyList   = $('historyList');
    var historyCount  = $('historyCount');

    var resumeDrop       = $('resumeDrop');
    var resumeFileInput  = $('resumeFileInput');

    var currentResumeCard = $('currentResumeCard');
    var currentResumeName = $('currentResumeName');
    var currentResumeMeta = $('currentResumeMeta');

    var aiStatusPills = document.querySelectorAll('.ai-status-pill');
    var aiSleepBtn = $('aiSleepBtn');

    // Per-pill mapping from internal status keys to user-visible state text.
    var AI_LABELS = {
        big:   { unknown: 'asleep', checking: 'waking…',  online: 'awake', offline: 'asleep' },
        local: { unknown: 'unknown', checking: 'checking…', online: 'reachable', offline: 'unreachable' }
    };

    // pdf.js worker setup
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // ── Utilities ──

    function setStatus(el, text, timeoutMs) {
        el.textContent = text;
        if (timeoutMs) {
            setTimeout(function () {
                if (el.textContent === text) el.textContent = '';
            }, timeoutMs);
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function inferTitleFromJd(jd) {
        if (!jd) return '';
        var lines = String(jd).split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.length === 0) continue;
            if (line.length > 70) line = line.substring(0, 67).replace(/\s+\S*$/, '') + '…';
            return line;
        }
        return '';
    }

    function shortDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ── Data layer (talks to /api/jobs-data) ──

    function api(path, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        if (opts.body && typeof opts.body !== 'string') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        return fetch('/api/jobs-data' + path, opts).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (res.status === 204) return null;
            return res.json();
        });
    }

    function loadData() {
        return api('/').then(function (data) {
            if (data && data.resumes) {
                state.masterResume = data.resumes[MASTER_RESUME_SLOT] ||
                                      data.resumes.software ||
                                      data.resumes.seo ||
                                      data.resumes.it ||
                                      '';
            }
            if (data && Array.isArray(data.applications)) {
                state.applications = data.applications;
            }
        }).catch(function (err) {
            console.warn('Could not load data:', err);
            setStatus(statusLine, 'Data store unreachable — running in memory only.', 6000);
        });
    }

    function saveMasterResume(text) {
        return api('/resumes/' + MASTER_RESUME_SLOT, { method: 'PUT', body: { text: text } });
    }

    function createApplication(record) {
        return api('/applications', { method: 'POST', body: record });
    }

    function updateApplication(id, patch) {
        return api('/applications/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    }

    function deleteApplication(id) {
        return api('/applications/' + encodeURIComponent(id), { method: 'DELETE' });
    }

    // ── Master resume upload ──

    function showResumeStatus() {
        var text = state.masterResume || '';
        var loaded = !!text.trim();

        if (!currentResumeCard) return;
        currentResumeCard.classList.toggle('is-loaded', loaded);
        currentResumeCard.classList.toggle('is-empty', !loaded);

        var iconEl = currentResumeCard.querySelector('.current-resume-icon');
        if (iconEl) iconEl.textContent = loaded ? '✓' : '○';

        if (loaded) {
            currentResumeName.textContent = state.masterResumeFilename || 'Master resume on file';
            var metaBits = [text.length.toLocaleString() + ' characters'];
            var uploadedLabel = formatUploadedAt(state.masterResumeUploadedAt);
            if (uploadedLabel) metaBits.push('uploaded ' + uploadedLabel);
            metaBits.push('ready to tailor');
            currentResumeMeta.textContent = metaBits.join(' · ');
        } else {
            currentResumeName.textContent = 'No master resume on file';
            currentResumeMeta.textContent = 'Upload a PDF on the left.';
        }
    }

    function rememberFilename(name, uploadedAt) {
        state.masterResumeFilename = name || '';
        state.masterResumeUploadedAt = name ? (uploadedAt || new Date().toISOString()) : '';
        try {
            if (name) {
                localStorage.setItem(FILENAME_LS_KEY, name);
                localStorage.setItem(UPLOADED_AT_LS_KEY, state.masterResumeUploadedAt);
            } else {
                localStorage.removeItem(FILENAME_LS_KEY);
                localStorage.removeItem(UPLOADED_AT_LS_KEY);
            }
        } catch (e) { /* ignore */ }
    }

    function restoreFilename() {
        try {
            state.masterResumeFilename = localStorage.getItem(FILENAME_LS_KEY) || '';
            state.masterResumeUploadedAt = localStorage.getItem(UPLOADED_AT_LS_KEY) || '';
        } catch (e) {
            state.masterResumeFilename = '';
            state.masterResumeUploadedAt = '';
        }
    }

    function formatUploadedAt(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        try {
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return d.toDateString();
        }
    }

    function extractPdfText(file) {
        if (!window.pdfjsLib) {
            return Promise.reject(new Error('PDF library not loaded'));
        }
        var pageCount = 0;
        var totalItems = 0;
        return file.arrayBuffer().then(function (buf) {
            return window.pdfjsLib.getDocument({ data: buf }).promise;
        }).then(function (pdf) {
            pageCount = pdf.numPages;
            var pagePromises = [];
            for (var i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(function (page) {
                    return page.getTextContent().then(function (content) {
                        totalItems += content.items.length;
                        var lines = [];
                        var lastY = null;
                        var line = '';
                        content.items.forEach(function (item) {
                            var y = item.transform[5];
                            if (lastY !== null && Math.abs(y - lastY) > 2) {
                                lines.push(line.replace(/\s+$/, ''));
                                line = '';
                            }
                            line += item.str;
                            if (item.hasEOL) {
                                lines.push(line.replace(/\s+$/, ''));
                                line = '';
                                lastY = null;
                            } else {
                                lastY = y;
                            }
                        });
                        if (line) lines.push(line.replace(/\s+$/, ''));
                        return lines.join('\n');
                    });
                }));
            }
            return Promise.all(pagePromises);
        }).then(function (pages) {
            return {
                text: pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
                pageCount: pageCount,
                totalItems: totalItems
            };
        });
    }

    function handleResumeFile(file) {
        if (!file) return;
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
            setStatus(statusLine, 'Only PDF files are supported.', 4000);
            return;
        }
        resumeDrop.classList.add('busy');
        setStatus(statusLine, 'Extracting text from ' + file.name + '…');
        extractPdfText(file).then(function (result) {
            var text = result.text;
            if (!text) {
                if (result.pageCount > 0 && result.totalItems === 0) {
                    setStatus(statusLine, 'No text layer in this PDF — re-export from Word using File → Save As → PDF.', 10000);
                } else {
                    setStatus(statusLine, 'No text found in that PDF.', 5000);
                }
                return;
            }
            state.masterResume = text;
            rememberFilename(file.name);
            showResumeStatus();
            setStatus(statusLine, 'Saving…');
            return saveMasterResume(text).then(function () {
                setStatus(statusLine, 'Saved — ' + text.length + ' characters from ' + file.name + '.', 4000);
            }).catch(function () {
                setStatus(statusLine, 'Saved locally — data store unreachable.', 5000);
            });
        }).catch(function (err) {
            console.error(err);
            setStatus(statusLine, 'Could not read that PDF: ' + (err.message || 'unknown error'), 6000);
        }).then(function () {
            resumeDrop.classList.remove('busy');
            resumeFileInput.value = '';
        });
    }

    resumeDrop.addEventListener('click', function () { resumeFileInput.click(); });
    resumeDrop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            resumeFileInput.click();
        }
    });
    resumeFileInput.addEventListener('change', function () {
        if (resumeFileInput.files && resumeFileInput.files[0]) {
            handleResumeFile(resumeFileInput.files[0]);
        }
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
        resumeDrop.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            resumeDrop.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
        resumeDrop.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            resumeDrop.classList.remove('dragover');
        });
    });
    resumeDrop.addEventListener('drop', function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) handleResumeFile(files[0]);
    });
    ['dragover', 'drop'].forEach(function (evt) {
        document.addEventListener(evt, function (e) {
            if (e.target && resumeDrop.contains(e.target)) return;
            if (evt === 'dragover') e.preventDefault();
            if (evt === 'drop') e.preventDefault();
        });
    });

    // ── Saved listings ──

    function renderHistory() {
        var items = state.applications.slice();
        items.sort(function (a, b) {
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        historyCount.textContent = items.length === 0
            ? ''
            : items.length + (items.length === 1 ? ' listing' : ' listings');

        if (items.length === 0) {
            historyList.innerHTML = '<p class="body-text" style="color: var(--muted); margin-top: 14px;">' +
                'No listings saved yet.</p>';
            return;
        }

        historyList.innerHTML = items.map(function (app) {
            var company = app.companyName || app.company || '';
            var role = app.roleName || '';
            var title;
            var needsRedetect = false;
            if (company && role) title = company + ' — ' + role;
            else if (company) title = company;
            else if (role) title = role;
            else {
                var inferred = inferTitleFromJd(app.jd);
                title = inferred || '(awaiting AI extraction)';
                needsRedetect = true;
            }

            var meta = [shortDate(app.createdAt)].filter(Boolean).join(' • ');
            var isApplied = app.status === 'applied';
            var isActive = app.id === state.activeAppId;
            var isGenerating = state.generatingId === app.id;
            var isRedetecting = state.retryingMetaId === app.id;
            var pillClass = 'status-' + (isApplied ? 'applied' : 'saved');
            var pillLabel = isApplied ? 'Applied' : 'Saved';
            var titleHtml = app.url
                ? '<a class="history-item-title-link" href="' + escapeHtml(app.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a>'
                : escapeHtml(title);

            return [
                '<div class="history-item' +
                    (isApplied ? ' applied' : '') +
                    (isActive ? ' active' : '') +
                    '" data-id="' + escapeHtml(app.id) + '">',
                '  <div class="history-item-top">',
                '    <div class="history-item-main">',
                '      <div class="history-item-title">' + titleHtml + '</div>',
                '      <div class="history-item-meta">' + escapeHtml(meta) + '</div>',
                '    </div>',
                '    <div class="history-item-side">',
                '      <span class="status-pill ' + pillClass + '">' + pillLabel + '</span>',
                '      <button class="history-item-delete" data-delete="' + escapeHtml(app.id) + '"',
                '              aria-label="Delete">×</button>',
                '    </div>',
                '  </div>',
                '  <div class="history-item-actions">',
                '    <button class="ghost-btn small-btn' + (isGenerating ? ' is-busy' : '') + '"',
                '            data-generate="' + escapeHtml(app.id) + '"' +
                            (isGenerating || state.generatingId ? ' disabled' : '') + '>',
                       isGenerating ? 'Generating…' : 'Generate custom resume',
                '    </button>',
                '    <button class="ghost-btn small-btn"',
                '            data-toggle-applied="' + escapeHtml(app.id) + '">',
                       isApplied ? 'Unmark applied' : 'Mark applied',
                '    </button>',
                needsRedetect
                    ? ('    <button class="ghost-btn small-btn' + (isRedetecting ? ' is-busy' : '') + '"' +
                           ' data-redetect="' + escapeHtml(app.id) + '"' +
                           (isRedetecting ? ' disabled' : '') + '>' +
                           (isRedetecting ? 'Detecting…' : 'Re-detect title') +
                       '</button>')
                    : '',
                '  </div>',
                '</div>'
            ].join('\n');
        }).join('');

        // Click on the row body → show this app's resume in gr-left
        Array.prototype.forEach.call(historyList.querySelectorAll('.history-item'), function (el) {
            el.addEventListener('click', function (e) {
                if (e.target && e.target.closest && (
                    e.target.closest('[data-delete]') ||
                    e.target.closest('[data-generate]') ||
                    e.target.closest('[data-toggle-applied]') ||
                    e.target.closest('[data-redetect]') ||
                    e.target.closest('.history-item-title-link')
                )) return;
                viewApplication(el.getAttribute('data-id'));
            });
        });
        Array.prototype.forEach.call(historyList.querySelectorAll('[data-delete]'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-delete');
                if (!confirm('Delete this listing?')) return;
                deleteApplication(id).then(function () {
                    state.applications = state.applications.filter(function (a) { return a.id !== id; });
                    if (state.activeAppId === id) {
                        state.activeAppId = null;
                        hideGeneratedResume();
                    }
                    renderHistory();
                }).catch(function () {
                    alert('Could not delete. Try again.');
                });
            });
        });
        Array.prototype.forEach.call(historyList.querySelectorAll('[data-generate]'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-generate');
                generateForApplication(id);
            });
        });
        Array.prototype.forEach.call(historyList.querySelectorAll('[data-toggle-applied]'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-toggle-applied');
                toggleApplied(id);
            });
        });
        Array.prototype.forEach.call(historyList.querySelectorAll('[data-redetect]'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                redetectMetadata(btn.getAttribute('data-redetect'));
            });
        });
    }

    function redetectMetadata(id) {
        if (state.retryingMetaId) return;
        var app = state.applications.filter(function (a) { return a.id === id; })[0];
        if (!app || !app.jd) return;
        state.retryingMetaId = id;
        renderHistory();
        extractMetadata(app.jd).then(function (meta) {
            if (!meta.company && !meta.role) {
                setStatus(statusLine, 'AI could not extract a company or role from this posting.', 5000);
                return;
            }
            var patch = { companyName: meta.company, roleName: meta.role };
            return updateApplication(app.id, patch).catch(function () {
                setStatus(statusLine, 'Updated locally — data store unreachable.', 4000);
            }).then(function () {
                Object.assign(app, patch);
            });
        }).catch(function () {
            setStatus(statusLine, 'AI unreachable — try again when it comes back online.', 5000);
        }).then(function () {
            state.retryingMetaId = null;
            renderHistory();
        });
    }

    function viewApplication(id) {
        var app = state.applications.filter(function (a) { return a.id === id; })[0];
        if (!app) return;
        state.activeAppId = id;
        hideFallbackUI();
        if (app.resume && app.resume.trim()) {
            showGeneratedResume(app.resume);
            if (app.modelUsed === 'local') showFallbackBanner();
        } else {
            hideGeneratedResume();
        }
        renderHistory();
    }

    function toggleApplied(id) {
        var app = state.applications.filter(function (a) { return a.id === id; })[0];
        if (!app) return;
        var next = app.status === 'applied' ? 'saved' : 'applied';
        var patch = { status: next };
        if (next === 'applied' && !app.appliedAt) {
            patch.appliedAt = new Date().toISOString();
        }
        updateApplication(app.id, patch).then(function () {
            Object.assign(app, patch);
            renderHistory();
        }).catch(function () {
            // Update locally anyway so the UI stays responsive
            Object.assign(app, patch);
            renderHistory();
            setStatus(statusLine, 'Saved locally — data store unreachable.', 4000);
        });
    }

    // ── Generated resume display (gr-left) ──

    function hideGeneratedResume() {
        customResumeEmpty.hidden = false;
        customResumeText.hidden = true;
        resumeActions.hidden = true;
        customResumeText.textContent = '';
    }

    function showGeneratedResume(text) {
        customResumeEmpty.hidden = true;
        customResumeText.hidden = false;
        resumeActions.hidden = false;
        customResumeText.textContent = text || '';
    }

    // ── Fallback UI ──

    function hideFallbackUI() {
        fallbackBanner.hidden = true;
        fallbackPrompt.hidden = true;
    }

    function showFallbackPrompt(message) {
        var textEl = fallbackPrompt.querySelector('.fallback-prompt-text');
        if (textEl) textEl.textContent = message;
        fallbackPrompt.hidden = false;
        fallbackBanner.hidden = true;
    }

    function showFallbackBanner() {
        fallbackPrompt.hidden = true;
        fallbackBanner.hidden = false;
    }

    dismissFallbackBtn.addEventListener('click', function () {
        fallbackPrompt.hidden = true;
    });

    useFallbackBtn.addEventListener('click', function () {
        if (!state.activeAppId) return;
        generateForApplication(state.activeAppId, { useFallback: true });
    });

    // ── Copy / download buttons ──

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.copy-btn[data-copy-target]');
        if (!btn) return;
        var target = $(btn.getAttribute('data-copy-target'));
        if (!target) return;
        var text = target.textContent;
        var orig = btn.textContent;
        var done = function () {
            btn.textContent = 'Copied';
            btn.classList.add('copied');
            setTimeout(function () {
                btn.textContent = orig;
                btn.classList.remove('copied');
            }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () {
                fallbackCopy(text); done();
            });
        } else {
            fallbackCopy(text); done();
        }
    });

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(ta);
    }

    function safeFileBase() {
        var app = state.applications.filter(function (a) { return a.id === state.activeAppId; })[0];
        var raw = (app && (app.companyName || app.company)) || '';
        var company = raw.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
        return company ? 'Resume_' + company : 'Resume';
    }

    function downloadPdf(text, filename) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library failed to load.');
            return;
        }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ unit: 'pt', format: 'letter' });
        var margin = 54;
        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var maxW = pageW - margin * 2;
        var lineH = 14;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);

        var paragraphs = String(text || '').split('\n');
        var y = margin;
        for (var i = 0; i < paragraphs.length; i++) {
            var wrapped = paragraphs[i] === '' ? [''] : doc.splitTextToSize(paragraphs[i], maxW);
            for (var j = 0; j < wrapped.length; j++) {
                if (y > pageH - margin) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(wrapped[j], margin, y);
                y += lineH;
            }
        }
        doc.save(filename);
    }

    function downloadDocx(text, filename) {
        if (!window.docx) {
            alert('DOCX library failed to load.');
            return;
        }
        var d = window.docx;
        var paragraphs = String(text || '').split('\n').map(function (line) {
            return new d.Paragraph({
                children: [new d.TextRun({ text: line, font: 'Times New Roman', size: 22 })]
            });
        });
        var doc = new d.Document({ sections: [{ properties: {}, children: paragraphs }] });
        d.Packer.toBlob(doc).then(function (blob) {
            var a = document.createElement('a');
            var url = URL.createObjectURL(blob);
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-download]');
        if (!btn) return;
        var format = btn.getAttribute('data-download');
        var source = $(btn.getAttribute('data-source'));
        if (!source) return;
        var text = source.textContent;
        if (!text.trim()) return;
        var base = safeFileBase();
        if (format === 'pdf') downloadPdf(text, base + '.pdf');
        else if (format === 'docx') downloadDocx(text, base + '.docx');
    });

    // ── AI status indicator ──

    function setAiStatus(key, status) {
        // status: 'unknown' | 'checking' | 'online' | 'offline'
        state.aiStatus[key] = status;
        Array.prototype.forEach.call(aiStatusPills, function (pill) {
            if (pill.getAttribute('data-ai-test') !== key) return;
            pill.classList.toggle('is-online',  status === 'online');
            pill.classList.toggle('is-offline', status === 'offline' && key !== 'big');
            var dot = pill.querySelector('.ai-dot');
            if (dot) {
                var dotState =
                    status === 'online'   ? 'online'   :
                    status === 'checking' ? 'checking' :
                    status === 'offline'  ? (key === 'big' ? 'asleep' : 'offline') :
                                            (key === 'big' ? 'asleep' : 'unknown');
                dot.className = 'ai-dot ai-dot-' + dotState;
            }
            var label = pill.querySelector('.ai-state');
            if (label) {
                var map = AI_LABELS[key] || AI_LABELS.local;
                label.textContent = map[status] || map.unknown;
            }
        });
        if (key === 'big' && aiSleepBtn) {
            aiSleepBtn.disabled = (status !== 'online');
        }
    }

    function pingAi(key) {
        setAiStatus(key, 'checking');
        // For big bro, the first probe forces a cold model load that can take
        // 20–40s, so we give it room and keep the model warm afterwards.
        // For lil bro, the small model is already loaded so we don't pin it.
        var ep = ENDPOINTS[key];
        var isBig = (key === 'big');
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutMs = isBig ? 90000 : 8000;
        var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
        return fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ep.model,
                messages: [
                    { role: 'system', content: 'Reply with the single word OK.' },
                    { role: 'user',   content: 'ping' }
                ],
                stream: false,
                keep_alive: isBig ? '5m' : '0s'
            }),
            signal: controller ? controller.signal : undefined
        }).then(function (res) {
            if (timeoutId) clearTimeout(timeoutId);
            if (!res.ok) {
                return res.text().catch(function () { return ''; }).then(function (body) {
                    console.warn('[pingAi:' + key + '] HTTP ' + res.status + ' from ' + ep.url + ' — body:', body.slice(0, 500));
                    setAiStatus(key, 'offline');
                    return false;
                });
            }
            setAiStatus(key, 'online');
            return true;
        }).catch(function (err) {
            if (timeoutId) clearTimeout(timeoutId);
            console.warn('[pingAi:' + key + '] fetch error on ' + ep.url + ':', err && (err.name + ': ' + err.message));
            setAiStatus(key, 'offline');
            return false;
        });
    }

    function sleepBigBro() {
        if (!aiSleepBtn || aiSleepBtn.disabled) return;
        aiSleepBtn.disabled = true;
        var ep = ENDPOINTS.big;
        setAiStatus('big', 'checking');
        // Posting an empty messages array with keep_alive: 0 tells Ollama
        // to unload the model from VRAM immediately and return.
        return fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ep.model,
                messages: [],
                stream: false,
                keep_alive: 0
            })
        }).then(function (res) {
            setAiStatus('big', res.ok ? 'unknown' : 'offline');
        }).catch(function () {
            setAiStatus('big', 'offline');
        });
    }

    if (aiSleepBtn) {
        aiSleepBtn.addEventListener('click', sleepBigBro);
    }

    Array.prototype.forEach.call(aiStatusPills, function (pill) {
        pill.addEventListener('click', function () {
            pingAi(pill.getAttribute('data-ai-test'));
        });
    });

    // ── AI calls (streaming + one-shot) ──

    function chatStream(endpointKey, systemPrompt, userContent, onToken) {
        var ep = ENDPOINTS[endpointKey];
        setAiStatus(endpointKey, 'checking');
        return fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ep.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                stream: true,
                keep_alive: '60s'
            })
        }).then(function (res) {
            if (!res.ok) {
                var err = new Error('HTTP ' + res.status);
                err.unreachable = (res.status === 502 || res.status === 503 || res.status === 504);
                throw err;
            }
            if (!res.body) throw new Error('No response body');
            var reader = res.body.getReader();
            var decoder = new TextDecoder('utf-8');
            var buffer = '';
            var full = '';

            function pump() {
                return reader.read().then(function (result) {
                    if (result.done) {
                        if (buffer.trim()) {
                            try {
                                var obj = JSON.parse(buffer);
                                if (obj.message && obj.message.content) {
                                    full += obj.message.content;
                                    onToken(obj.message.content);
                                }
                            } catch (e) { /* ignore */ }
                        }
                        return full;
                    }
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (!line) continue;
                        try {
                            var obj = JSON.parse(line);
                            if (obj.message && obj.message.content) {
                                full += obj.message.content;
                                onToken(obj.message.content);
                            }
                            if (obj.error) throw new Error('Ollama: ' + obj.error);
                        } catch (err) {
                            if (err.message && err.message.indexOf('Ollama:') === 0) throw err;
                            // partial JSON, skip
                        }
                    }
                    return pump();
                });
            }
            return pump().then(function (r) { setAiStatus(endpointKey, 'online'); return r; });
        }).catch(function (err) {
            if (!err.unreachable && err.name === 'TypeError') err.unreachable = true;
            setAiStatus(endpointKey, 'offline');
            throw err;
        });
    }

    function chatOnce(endpointKey, systemPrompt, userContent) {
        var ep = ENDPOINTS[endpointKey];
        setAiStatus(endpointKey, 'checking');
        return fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ep.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                stream: false
            })
        }).then(function (res) {
            if (!res.ok) {
                setAiStatus(endpointKey, 'offline');
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        }).then(function (data) {
            setAiStatus(endpointKey, 'online');
            return (data.message && data.message.content) ? data.message.content : '';
        }).catch(function (err) {
            setAiStatus(endpointKey, 'offline');
            throw err;
        });
    }

    // ── Metadata extraction (company + role) ──
    function extractMetadata(jd) {
        return chatOnce(CLASSIFIER_ENDPOINT, METADATA_PROMPT, jd).then(function (raw) {
            var line = (raw || '').split('\n').filter(function (l) { return l.trim().length > 0; })[0] || '';
            var parts = line.split('|');
            var company = (parts[0] || '').trim();
            var role = (parts[1] || '').trim();
            if (!company || /^unknown$/i.test(company)) company = '';
            if (!role || /^unknown$/i.test(role)) role = '';
            return { company: company, role: role };
        });
    }

    // ── Save a new listing (called by the Save button or auto on paste) ──

    function saveNewListing() {
        if (state.savingNewListing) return;
        var url = urlInput.value.trim();
        var jd = jdInput.value.trim();
        if (!jd) {
            setStatus(statusLine, 'Paste a job description first.', 4000);
            jdInput.focus();
            return;
        }

        state.savingNewListing = true;
        saveJobBtn.disabled = true;
        setStatus(statusLine, 'Extracting company and role…');

        extractMetadata(jd).catch(function () {
            return { company: '', role: '' };
        }).then(function (meta) {
            var record = {
                companyName: meta.company,
                roleName: meta.role,
                url: url,
                jd: jd,
                category: MASTER_RESUME_SLOT,
                resume: '',
                cover: '',
                status: 'saved',
                createdAt: new Date().toISOString()
            };
            return createApplication(record).catch(function () {
                // Backend unreachable — still add locally so the UI is usable
                setStatus(statusLine, 'Saved locally — data store unreachable.', 5000);
                return Object.assign({ id: 'local-' + Date.now() }, record);
            }).then(function (saved) {
                var rec = saved || Object.assign({ id: 'local-' + Date.now() }, record);
                state.applications.push(rec);
                renderHistory();
                urlInput.value = '';
                jdInput.value = '';
                var labelBits = [meta.company, meta.role].filter(Boolean).join(' — ');
                setStatus(statusLine, labelBits ? 'Saved: ' + labelBits : 'Saved.', 4000);
            });
        }).catch(function (err) {
            console.error(err);
            setStatus(statusLine, 'Could not save: ' + (err && err.message || 'unknown error'), 6000);
        }).then(function () {
            state.savingNewListing = false;
            saveJobBtn.disabled = false;
        });
    }

    saveJobBtn.addEventListener('click', saveNewListing);
    clearBtn.addEventListener('click', function () {
        urlInput.value = '';
        jdInput.value = '';
        setStatus(statusLine, '', 0);
        jdInput.focus();
    });

    // Auto-trigger: when both URL and JD have content and the user pauses,
    // save the listing without requiring a button click.
    var autoSaveTimer = null;
    function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        if (!urlInput.value.trim() || !jdInput.value.trim()) return;
        autoSaveTimer = setTimeout(function () {
            if (state.savingNewListing) return;
            if (urlInput.value.trim() && jdInput.value.trim()) saveNewListing();
        }, 900);
    }
    urlInput.addEventListener('input', scheduleAutoSave);
    jdInput.addEventListener('input', scheduleAutoSave);

    // ── Stream parser (resume-only output) ──

    function makeStreamParser(onChunk) {
        var buf = '';
        var phase = 'pre';
        var resumeOut = '';
        return {
            push: function (chunk) {
                buf += chunk;
                if (phase === 'pre') {
                    var idx = buf.indexOf('===RESUME===');
                    if (idx !== -1) {
                        buf = buf.substring(idx + '===RESUME==='.length).replace(/^[ \t]*\n?/, '');
                        phase = 'resume';
                    } else {
                        if (buf.length > 4000) buf = buf.slice(-2000);
                        return;
                    }
                }
                if (phase === 'resume') {
                    resumeOut += buf;
                    onChunk(buf);
                    buf = '';
                }
            },
            finish: function () {
                if (buf) {
                    if (phase !== 'resume') {
                        // No marker ever appeared — treat whole stream as resume.
                        resumeOut += buf;
                        onChunk(buf);
                    } else {
                        resumeOut += buf;
                        onChunk(buf);
                    }
                    buf = '';
                }
                return { resume: resumeOut.trim() };
            }
        };
    }

    // ── Generate a custom resume for a saved listing ──

    function generateForApplication(id, opts) {
        opts = opts || {};
        if (state.generatingId) return;
        var app = state.applications.filter(function (a) { return a.id === id; })[0];
        if (!app) return;

        if (!state.masterResume.trim()) {
            setStatus(statusLine, 'Upload a master resume first.', 6000);
            return;
        }

        var endpointKey = opts.useFallback ? 'local' : 'big';

        state.generatingId = id;
        state.activeAppId = id;
        hideFallbackUI();
        showGeneratedResume('');
        customResumeText.classList.add('streaming');
        renderHistory();

        setStatus(statusLine, 'Generating with ' + ENDPOINTS[endpointKey].label + '…');
        if (endpointKey === 'local') showFallbackBanner();

        var parser = makeStreamParser(function (chunk) {
            customResumeText.textContent += chunk;
        });

        var userContent = [
            'MASTER RESUME:',
            state.masterResume,
            '',
            'JOB DESCRIPTION:',
            app.jd || ''
        ].join('\n');

        chatStream(endpointKey, TAILOR_PROMPT, userContent, function (token) {
            parser.push(token);
        }).then(function () {
            var parsed = parser.finish();
            customResumeText.classList.remove('streaming');

            var finalResume = parsed.resume || customResumeText.textContent;
            customResumeText.textContent = finalResume;

            var patch = {
                resume: finalResume,
                modelUsed: endpointKey,
                generatedAt: new Date().toISOString()
            };
            return updateApplication(app.id, patch).then(function () {
                Object.assign(app, patch);
                setStatus(statusLine, 'Done.', 3000);
            }).catch(function () {
                Object.assign(app, patch);
                setStatus(statusLine, 'Generated, but could not save to data store.', 6000);
            });
        }).catch(function (err) {
            customResumeText.classList.remove('streaming');
            if (err && err.unreachable && endpointKey === 'big') {
                hideGeneratedResume();
                setStatus(statusLine, '');
                showFallbackPrompt(
                    "Couldn't reach the Windows PC. Is it powered on and is Ollama running? " +
                    "You can switch to the local fallback model — output quality will be noticeably lower."
                );
            } else {
                console.error(err);
                var msg = (err && err.message) ? err.message : 'unknown error';
                setStatus(statusLine, 'Generation failed: ' + msg, 8000);
            }
        }).then(function () {
            state.generatingId = null;
            renderHistory();
        });
    }

    // ── Init ──
    hideGeneratedResume();
    hideFallbackUI();
    restoreFilename();
    showResumeStatus();
    setAiStatus('big', 'unknown');
    setAiStatus('local', 'unknown');

    loadData().then(function () {
        // Clear any cached filename if we couldn't recover any master text.
        if (!state.masterResume.trim()) rememberFilename('');
        showResumeStatus();
        renderHistory();
        // Probe the local AI (always-on per setup). Don't auto-probe the
        // Windows AI to avoid waking the PC — user can click the badge.
        pingAi('local');
    });

})();
