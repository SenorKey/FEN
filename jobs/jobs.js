/* ═══════════════════════════════════════════════
   jobs.js — Page logic for /jobs
   frontendneeded.com

   Vanilla JS, ES5-friendly. Talks to three endpoints:
     /api/chat-big    — Ollama on the Windows PC (big model, may be off)
     /api/chat        — Ollama on the Fedora PC (small fallback, always on)
     /api/jobs-data   — JSON store on the Fedora box
   ═══════════════════════════════════════════════ */

(function () {

    // ── Endpoint config ──
    // 'big'   = Mistral Small 22B (Q4_K_M) on the Windows PC (4080).
    //           Configured to unload from VRAM 1 minute after the last
    //           request so the PC can be reused for games etc. shortly
    //           after using /jobs.
    // 'local' = Llama 3 on the Fedora PC. Used for the metadata extractor
    //           always, and as the user-initiated fallback for generation
    //           when the Windows PC is unreachable.
    var ENDPOINTS = {
        big:   { url: '/api/chat-big', model: 'mistral-small:22b-instruct-2409-q4_K_M', label: 'Mistral Small 22B Q4_K_M (Windows)' },
        local: { url: '/api/chat',     model: 'llama3',                                  label: 'Llama 3 (local fallback)' }
    };

    // The classifier is one-shot and trivial — always use local.
    var CLASSIFIER_ENDPOINT = 'local';

    // ── State ──
    var state = {
        resumes: {
            software: '',
            seo: '',
            it: ''
        },
        applications: [],
        // workspace
        activeAppId: null,           // null = new, otherwise viewing a saved one
        activeResumeTab: 'software',
        activeFilter: 'all',
        // generation
        generating: false,
        lastInput: null              // { company, url, jd, category }
    };

    // ── DOM ──
    var $ = function (id) { return document.getElementById(id); };

    var urlInput = $('urlInput');
    var jdInput = $('jdInput');
    var categorySelect = $('categorySelect');
    var generateBtn = $('generateBtn');
    var clearBtn = $('clearBtn');
    var statusLine = $('statusLine');

    var outputEmpty = $('outputEmpty');
    var outputPanes = $('outputPanes');
    var outputActions = $('outputActions');
    var suggestionBox = $('suggestionBox');
    var suggestionText = $('suggestionText');
    var resumeText = $('resumeText');
    var coverText = $('coverText');
    var markAppliedBtn = $('markAppliedBtn');
    var regenBtn = $('regenBtn');

    var fallbackBanner = $('fallbackBanner');
    var fallbackPrompt = $('fallbackPrompt');
    var useFallbackBtn = $('useFallbackBtn');
    var dismissFallbackBtn = $('dismissFallbackBtn');

    var historyList = $('historyList');
    var filterPills = document.querySelectorAll('.filter-pill');

    var resumeTabs = document.querySelectorAll('.resume-tab');
    var resumeSaveStatus = $('resumeSaveStatus');
    var resumeDrop = $('resumeDrop');
    var resumeFileInput = $('resumeFileInput');

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

    function shortDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function categoryLabel(c) {
        return { software: 'Software dev', seo: 'SEO / Web', it: 'IT' }[c] || c;
    }

    function statusLabel(s) {
        return {
            saved: 'Saved',
            applied: 'Applied',
            interview: 'Interview',
            closed: 'Closed'
        }[s] || s;
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
                state.resumes.software = data.resumes.software || '';
                state.resumes.seo = data.resumes.seo || '';
                state.resumes.it = data.resumes.it || '';
            }
            if (data && Array.isArray(data.applications)) {
                state.applications = data.applications;
            }
        }).catch(function (err) {
            console.warn('Could not load data:', err);
            setStatus(statusLine, 'Data store unreachable — running in memory only.', 6000);
        });
    }

    function saveResume(category, text) {
        return api('/resumes/' + category, { method: 'PUT', body: { text: text } });
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

    // ── Master resume editor ──

    function showResumeTabStatus() {
        var text = state.resumes[state.activeResumeTab] || '';
        if (text.trim()) {
            resumeSaveStatus.textContent = 'Resume loaded — ' + text.length + ' characters.';
        } else {
            resumeSaveStatus.textContent = 'No resume saved yet — drop a PDF.';
        }
    }

    function selectResumeTab(category) {
        state.activeResumeTab = category;
        resumeTabs.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === category);
        });
        showResumeTabStatus();
    }

    resumeTabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
            selectResumeTab(btn.getAttribute('data-tab'));
        });
    });

    // ── PDF upload (drag/drop + file picker) ──

    function extractPdfText(file) {
        if (!window.pdfjsLib) {
            return Promise.reject(new Error('PDF library not loaded'));
        }
        return file.arrayBuffer().then(function (buf) {
            return window.pdfjsLib.getDocument({ data: buf }).promise;
        }).then(function (pdf) {
            var pagePromises = [];
            for (var i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(function (page) {
                    return page.getTextContent().then(function (content) {
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
            return pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
        });
    }

    function handleResumeFile(file) {
        if (!file) return;
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
            setStatus(resumeSaveStatus, 'Only PDF files are supported.', 4000);
            return;
        }
        resumeDrop.classList.add('busy');
        setStatus(resumeSaveStatus, 'Extracting text from ' + file.name + '…');
        extractPdfText(file).then(function (text) {
            if (!text) {
                setStatus(resumeSaveStatus, 'No text found in that PDF.', 5000);
                return;
            }
            var cat = state.activeResumeTab;
            state.resumes[cat] = text;
            setStatus(resumeSaveStatus, 'Saving…');
            return saveResume(cat, text).then(function () {
                setStatus(resumeSaveStatus, 'Saved — ' + text.length + ' characters from ' + file.name + '.', 4000);
            }).catch(function () {
                setStatus(resumeSaveStatus, 'Saved locally — data store unreachable.', 5000);
            });
        }).catch(function (err) {
            console.error(err);
            setStatus(resumeSaveStatus, 'Could not read that PDF: ' + (err.message || 'unknown error'), 6000);
        }).then(function () {
            resumeDrop.classList.remove('busy');
            resumeFileInput.value = '';
        });
    }

    resumeDrop.addEventListener('click', function () {
        resumeFileInput.click();
    });

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

    // Also accept a drop anywhere on the page (but only over the resumes panel)
    ['dragover', 'drop'].forEach(function (evt) {
        document.addEventListener(evt, function (e) {
            if (e.target && resumeDrop.contains(e.target)) return;
            // Prevent the browser from navigating away if the user misses the zone.
            if (evt === 'dragover') e.preventDefault();
            if (evt === 'drop') e.preventDefault();
        });
    });

    // ── History list ──

    function renderHistory() {
        var items = state.applications.slice();
        items.sort(function (a, b) {
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        if (state.activeFilter !== 'all') {
            items = items.filter(function (it) { return it.status === state.activeFilter; });
        }

        if (items.length === 0) {
            historyList.innerHTML = '<p class="body-text" style="color: var(--muted); margin-top: 14px;">' +
                'No applications match this filter.</p>';
            return;
        }

        historyList.innerHTML = items.map(function (app) {
            var company = app.companyName || app.company || '';
            var role = app.roleName || '';
            var title;
            if (company && role) title = company + ' — ' + role;
            else if (company) title = company;
            else if (role) title = role;
            else title = '(untitled posting)';

            var meta = [shortDate(app.createdAt), categoryLabel(app.category)].filter(Boolean).join(' • ');
            var pillClass = 'status-' + (app.status || 'saved');
            var titleHtml = app.url
                ? '<a class="history-item-title-link" href="' + escapeHtml(app.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a>'
                : escapeHtml(title);
            return [
                '<div class="history-item' + (app.id === state.activeAppId ? ' active' : '') + '"',
                '     data-id="' + escapeHtml(app.id) + '">',
                '  <div class="history-item-main">',
                '    <div class="history-item-title">' + titleHtml + '</div>',
                '    <div class="history-item-meta">' + escapeHtml(meta) + '</div>',
                '  </div>',
                '  <div class="history-item-side">',
                '    <span class="status-pill ' + pillClass + '">' + statusLabel(app.status) + '</span>',
                '    <button class="history-item-delete" data-delete="' + escapeHtml(app.id) + '"',
                '            aria-label="Delete">×</button>',
                '  </div>',
                '</div>'
            ].join('\n');
        }).join('');

        Array.prototype.forEach.call(historyList.querySelectorAll('.history-item'), function (el) {
            el.addEventListener('click', function (e) {
                if (e.target && e.target.hasAttribute('data-delete')) return;
                if (e.target && e.target.closest && e.target.closest('.history-item-title-link')) return;
                loadApplication(el.getAttribute('data-id'));
            });
        });
        Array.prototype.forEach.call(historyList.querySelectorAll('[data-delete]'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-delete');
                if (!confirm('Delete this application record?')) return;
                deleteApplication(id).then(function () {
                    state.applications = state.applications.filter(function (a) { return a.id !== id; });
                    if (state.activeAppId === id) {
                        state.activeAppId = null;
                        clearWorkspace();
                    }
                    renderHistory();
                }).catch(function () {
                    alert('Could not delete. Try again.');
                });
            });
        });
    }

    filterPills.forEach(function (pill) {
        pill.addEventListener('click', function () {
            state.activeFilter = pill.getAttribute('data-filter');
            filterPills.forEach(function (p) { p.classList.toggle('active', p === pill); });
            renderHistory();
        });
    });

    function loadApplication(id) {
        var app = state.applications.filter(function (a) { return a.id === id; })[0];
        if (!app) return;

        state.activeAppId = id;
        urlInput.value = app.url || '';
        jdInput.value = app.jd || '';
        categorySelect.value = app.category || 'auto';

        hideFallbackUI();
        showOutput(app.resume || '', app.cover || '', app.suggestionReason || '');

        // If this record was generated with the fallback model, surface that.
        if (app.modelUsed === 'local') {
            showFallbackBanner();
        }

        renderHistory();
    }

    // ── Workspace / output ──

    function clearWorkspace() {
        state.activeAppId = null;
        state.lastInput = null;
        urlInput.value = '';
        jdInput.value = '';
        categorySelect.value = 'auto';
        hideOutput();
        hideFallbackUI();
        renderHistory();
    }

    clearBtn.addEventListener('click', clearWorkspace);

    function hideOutput() {
        outputEmpty.hidden = false;
        outputPanes.hidden = true;
        outputActions.hidden = true;
        suggestionBox.hidden = true;
        resumeText.textContent = '';
        coverText.textContent = '';
    }

    function showOutput(resume, cover, suggestion) {
        outputEmpty.hidden = true;
        outputPanes.hidden = false;
        outputActions.hidden = false;
        resumeText.textContent = resume;
        coverText.textContent = cover;
        if (suggestion) {
            suggestionBox.hidden = false;
            suggestionText.textContent = suggestion;
        } else {
            suggestionBox.hidden = true;
        }
    }

    // ── Fallback UI ──

    function hideFallbackUI() {
        fallbackBanner.hidden = true;
        fallbackPrompt.hidden = true;
    }

    function showFallbackPrompt(message) {
        // The "Windows PC is unreachable, want to use local?" prompt.
        var textEl = fallbackPrompt.querySelector('.fallback-prompt-text');
        if (textEl) textEl.textContent = message;
        fallbackPrompt.hidden = false;
        fallbackBanner.hidden = true;
    }

    function showFallbackBanner() {
        // The "you're currently viewing fallback output" banner.
        fallbackPrompt.hidden = true;
        fallbackBanner.hidden = false;
    }

    dismissFallbackBtn.addEventListener('click', function () {
        fallbackPrompt.hidden = true;
    });

    useFallbackBtn.addEventListener('click', function () {
        if (!state.lastInput) return;
        doGenerate({ reuseInput: true, useFallback: true });
    });

    // ── Copy buttons ──

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.copy-btn');
        if (!btn) return;
        var targetId = btn.getAttribute('data-copy-target');
        var target = $(targetId);
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

    // ── Download buttons (plain PDF / docx) ──

    function safeFileBase(kind) {
        var app = state.applications.filter(function (a) { return a.id === state.activeAppId; })[0];
        var raw = (app && (app.companyName || app.company)) || '';
        var company = raw.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
        var prefix = kind === 'cover' ? 'CoverLetter' : 'Resume';
        return company ? prefix + '_' + company : prefix;
    }

    function downloadPdf(text, filename) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library failed to load.');
            return;
        }
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ unit: 'pt', format: 'letter' });
        var margin = 54; // ~0.75"
        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var maxW = pageW - margin * 2;
        var lineH = 14;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);

        var paragraphs = String(text || '').split('\n');
        var y = margin;
        for (var i = 0; i < paragraphs.length; i++) {
            var wrapped = paragraphs[i] === ''
                ? ['']
                : doc.splitTextToSize(paragraphs[i], maxW);
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
        var sourceId = btn.getAttribute('data-source');
        var kind = btn.getAttribute('data-kind');
        var source = $(sourceId);
        if (!source) return;
        var text = source.textContent;
        if (!text.trim()) return;
        var base = safeFileBase(kind);
        if (format === 'pdf') {
            downloadPdf(text, base + '.pdf');
        } else if (format === 'docx') {
            downloadDocx(text, base + '.docx');
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

    // ── AI call: streaming Ollama through a configurable endpoint ──
    function chatStream(endpointKey, systemPrompt, userContent, onToken) {
        var ep = ENDPOINTS[endpointKey];
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
                // Tell Ollama to keep the model loaded in VRAM for 1 minute
                // after this request, then unload to free the GPU. Lets the
                // Windows PC be used for games / normal work shortly after.
                // Server-side OLLAMA_KEEP_ALIVE=1m is the default; this is
                // a per-request reinforcement so the policy holds even if
                // the env var isn't picked up.
                keep_alive: '60s'
            })
        }).then(function (res) {
            if (!res.ok) {
                // 502 / 503 / 504 = Apache couldn't reach upstream (Windows PC off)
                var err = new Error('HTTP ' + res.status);
                err.unreachable = (res.status === 502 || res.status === 503 || res.status === 504);
                throw err;
            }
            if (!res.body) {
                throw new Error('No response body');
            }
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
                            if (obj.error) {
                                throw new Error('Ollama: ' + obj.error);
                            }
                        } catch (err) {
                            if (err.message && err.message.indexOf('Ollama:') === 0) throw err;
                            // partial JSON, skip
                        }
                    }
                    return pump();
                });
            }
            return pump();
        }).catch(function (err) {
            // Network-level failure (e.g. CORS, DNS, Apache totally down).
            // Distinguish unreachable here too so the caller can offer fallback.
            if (!err.unreachable && err.name === 'TypeError') {
                err.unreachable = true;
            }
            throw err;
        });
    }

    function chatOnce(endpointKey, systemPrompt, userContent) {
        var ep = ENDPOINTS[endpointKey];
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
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (data) {
            return (data.message && data.message.content) ? data.message.content : '';
        });
    }

    // ── Parse streamed output into resume / cover letter ──
    function makeStreamParser() {
        var buf = '';
        var phase = 'pre';
        var resumeOut = '';
        var coverOut = '';

        function applyTo(target, text) { target.textContent += text; }

        return {
            push: function (chunk) {
                buf += chunk;

                if (phase === 'pre') {
                    var idx = buf.indexOf('===RESUME===');
                    if (idx !== -1) {
                        buf = buf.substring(idx + '===RESUME==='.length).replace(/^[ \t]*\n?/, '');
                        phase = 'resume';
                        resumeText.classList.add('streaming');
                    } else {
                        if (buf.length > 4000) buf = buf.slice(-2000);
                        return;
                    }
                }

                if (phase === 'resume') {
                    var idx2 = buf.indexOf('===COVER LETTER===');
                    if (idx2 !== -1) {
                        var resumeChunk = buf.substring(0, idx2).replace(/\s+$/, '');
                        applyTo(resumeText, resumeChunk);
                        resumeOut += resumeChunk;
                        resumeText.classList.remove('streaming');
                        buf = buf.substring(idx2 + '===COVER LETTER==='.length).replace(/^[ \t]*\n?/, '');
                        phase = 'cover';
                        coverText.classList.add('streaming');
                    } else {
                        var safe = buf.length - 25;
                        if (safe > 0) {
                            var out = buf.substring(0, safe);
                            applyTo(resumeText, out);
                            resumeOut += out;
                            buf = buf.substring(safe);
                        }
                        return;
                    }
                }

                if (phase === 'cover') {
                    applyTo(coverText, buf);
                    coverOut += buf;
                    buf = '';
                }
            },
            finish: function () {
                if (phase === 'resume' && buf) { applyTo(resumeText, buf); resumeOut += buf; }
                else if (phase === 'cover' && buf) { applyTo(coverText, buf); coverOut += buf; }
                resumeText.classList.remove('streaming');
                coverText.classList.remove('streaming');
                return { resume: resumeOut.trim(), cover: coverOut.trim() };
            }
        };
    }

    // ── Generate flow ──
    // opts: { reuseInput?: bool, useFallback?: bool }
    function doGenerate(opts) {
        opts = opts || {};
        if (state.generating) return;

        var url, jd, category;
        if (opts.reuseInput && state.lastInput) {
            url = state.lastInput.url;
            jd = state.lastInput.jd;
            category = state.lastInput.category;
        } else {
            url = urlInput.value.trim();
            jd = jdInput.value.trim();
            category = categorySelect.value;
        }

        if (!jd) {
            setStatus(statusLine, 'Paste a job description first.', 4000);
            jdInput.focus();
            return;
        }

        var endpointKey = opts.useFallback ? 'local' : 'big';
        state.lastInput = { url: url, jd: jd, category: category };
        state.generating = true;
        generateBtn.disabled = true;
        clearBtn.disabled = true;
        regenBtn.disabled = true;
        markAppliedBtn.disabled = true;
        hideFallbackUI();
        setStatus(statusLine, 'Working…');

        var chosenCategory = category === 'auto' ? 'software' : category;
        var detectedCompany = '';
        var detectedRole = '';
        var suggestion = '';

        // Metadata extractor always runs on local (fast, lightweight).
        // It picks the resume category (when set to auto) and pulls the
        // hiring company name + role title out of the job description.
        var pickMetadataStep = chatOnce(CLASSIFIER_ENDPOINT, METADATA_PROMPT, jd).then(function (raw) {
            var line = (raw || '').split('\n').filter(function (l) { return l.trim().length > 0; })[0] || '';
            var parts = line.split('|');
            var cat = (parts[0] || '').trim().toLowerCase();
            var company = (parts[1] || '').trim();
            var role = (parts[2] || '').trim();
            var reason = (parts[3] || '').trim();
            if (['software', 'seo', 'it'].indexOf(cat) === -1) cat = 'software';
            if (!company || /^unknown$/i.test(company)) company = '';
            if (!role || /^unknown$/i.test(role)) role = '';

            detectedCompany = company;
            detectedRole = role;
            if (category === 'auto') {
                chosenCategory = cat;
                suggestion = 'AI detected ' + (company || 'unknown company') + ' — ' + (role || 'unknown role') +
                    ' • Using ' + categoryLabel(cat) + ' resume' + (reason ? ' (' + reason + ')' : '');
            } else {
                suggestion = 'AI detected ' + (company || 'unknown company') + ' — ' + (role || 'unknown role') +
                    ' • Using ' + categoryLabel(chosenCategory) + ' resume (you picked)';
            }
        }).catch(function () {
            suggestion = 'Metadata extractor unreachable — proceeding without company/role detection.';
        });

        pickMetadataStep.then(function () {
            var master = state.resumes[chosenCategory] || '';
            if (!master.trim()) {
                setStatus(statusLine, 'No master resume saved for ' + categoryLabel(chosenCategory) + '. Add one on the right.', 8000);
                throw new Error('NO_MASTER');
            }

            hideOutput();
            outputEmpty.hidden = true;
            outputPanes.hidden = false;
            outputActions.hidden = false;
            if (suggestion) {
                suggestionBox.hidden = false;
                suggestionText.textContent = suggestion;
            }

            if (endpointKey === 'local') {
                showFallbackBanner();
            }

            var parser = makeStreamParser();
            var userContent = [
                'MASTER RESUME:',
                master,
                '',
                'JOB DESCRIPTION:',
                jd
            ].join('\n');

            setStatus(statusLine, 'Generating with ' + ENDPOINTS[endpointKey].label + '… first request may be slow if the model is cold.');

            return chatStream(endpointKey, TAILOR_PROMPT, userContent, function (token) {
                parser.push(token);
            }).then(function () {
                var parsed = parser.finish();

                if (!parsed.resume && !parsed.cover) {
                    parsed.resume = resumeText.textContent;
                    parsed.cover = '(The model did not output a cover letter section. Try Regenerate.)';
                    coverText.textContent = parsed.cover;
                }

                var record = {
                    companyName: detectedCompany,
                    roleName: detectedRole,
                    url: url,
                    jd: jd,
                    category: chosenCategory,
                    suggestionReason: suggestion,
                    resume: parsed.resume,
                    cover: parsed.cover,
                    status: 'saved',
                    modelUsed: endpointKey,
                    createdAt: new Date().toISOString()
                };
                return createApplication(record).then(function (saved) {
                    var rec = saved || Object.assign({ id: 'local-' + Date.now() }, record);
                    state.applications.push(rec);
                    state.activeAppId = rec.id;
                    renderHistory();
                    setStatus(statusLine, 'Done.', 3000);
                }).catch(function () {
                    setStatus(statusLine, 'Generated, but could not save to data store.', 6000);
                });
            });
        }).catch(function (err) {
            if (err && err.message === 'NO_MASTER') {
                // already messaged above
            } else if (err && err.unreachable && endpointKey === 'big') {
                hideOutput();
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
            state.generating = false;
            generateBtn.disabled = false;
            clearBtn.disabled = false;
            regenBtn.disabled = false;
            markAppliedBtn.disabled = false;
        });
    }

    generateBtn.addEventListener('click', function () { doGenerate({}); });
    regenBtn.addEventListener('click', function () {
        // Regenerate against whichever endpoint produced the visible output.
        var useFallback = !fallbackBanner.hidden;
        doGenerate({ reuseInput: true, useFallback: useFallback });
    });

    // ── Mark applied (cycles through statuses) ──

    var STATUS_CYCLE = ['saved', 'applied', 'interview', 'closed'];

    markAppliedBtn.addEventListener('click', function () {
        if (!state.activeAppId) return;
        var app = state.applications.filter(function (a) { return a.id === state.activeAppId; })[0];
        if (!app) return;

        var idx = STATUS_CYCLE.indexOf(app.status || 'saved');
        var next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

        var patch = { status: next };
        if (next === 'applied' && !app.appliedAt) {
            patch.appliedAt = new Date().toISOString();
        }

        updateApplication(app.id, patch).then(function () {
            Object.assign(app, patch);
            setStatus(statusLine, 'Status → ' + statusLabel(next), 2500);
            renderHistory();
        }).catch(function () {
            setStatus(statusLine, 'Could not update status.', 4000);
        });
    });

    // ── Init ──

    selectResumeTab('software');
    hideOutput();
    hideFallbackUI();

    loadData().then(function () {
        showResumeTabStatus();
        renderHistory();
    });

})();
