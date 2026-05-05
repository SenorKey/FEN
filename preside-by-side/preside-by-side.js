/* ==========================================================================
   Preside by Side — Interactions
   - President data defined as objects keyed by id; each president owns its
     own bars. A `selection` map decides which president is shown on each
     side of the page.
   - Desktop: bar click toggles inline expansion (same-side bars push down)
   - Mobile:  bar click opens a native <dialog> modal
   ========================================================================== */

(function () {
    'use strict';

    /* --------------------------------------------------------------------------
       Presidents — single source of truth.

       Each president is an object keyed by a stable `id` (used by `selection`
       below to decide who appears on which side, and later by any selector
       UI). Bars belong to the president, not to a side of the page.

       To add a new president: add another entry to this object with their
       own bars array. To edit a bar: edit it in place. The render step
       sorts bars by severity descending, so source order doesn't matter.

       Bar schema:
         severity:    Number (1–10)
         title:       String — full title (desktop outer label + detail panel)
         shortLabel:  String — 2–3 words max, shown inside the bar on mobile
         description: String — long-form text in the expanded panel / modal
         sources:     Array<{ url: String, text: String }>
       -------------------------------------------------------------------------- */
    const presidents = {
        biden: {
            id: 'biden',
            firstName: 'Joseph R.',
            lastName: 'Biden',
            ordinal: '46th President',
            party: 'democrat',
            bars: [
                {
                    severity: 9,
                    title: 'Bar One',
                    shortLabel: 'Bar 1',
                    description: 'Description 1 — placeholder text describing the action being measured. This area is where a longer explanation lives: what happened, when, the people and institutions involved, and why it matters relative to other items on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Two',
                    shortLabel: 'Bar 2',
                    description: 'Description 2 — placeholder text. Replace with actual content describing the second item on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Bar Four',
                    shortLabel: 'Bar 4',
                    description: 'Description 4 — placeholder text describing the fourth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 2,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar One',
                    shortLabel: 'Bar 1',
                    description: 'Description 1 — placeholder text describing the action being measured. This area is where a longer explanation lives: what happened, when, the people and institutions involved, and why it matters relative to other items on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Bar Two',
                    shortLabel: 'Bar 2',
                    description: 'Description 2 — placeholder text. Replace with actual content describing the second item on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Bar Four',
                    shortLabel: 'Bar 4',
                    description: 'Description 4 — placeholder text describing the fourth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 3,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                }
            ]
        },
        trump: {
            id: 'trump',
            firstName: 'Donald J.',
            lastName: 'Trump',
            ordinal: '45th & 47th President',
            party: 'republican',
            bars: [
                {
                    severity: 10,
                    title: 'Bar One',
                    shortLabel: 'Bar 1',
                    description: 'Description 1 — placeholder text describing the action being measured. This area is where a longer explanation lives: what happened, when, the people and institutions involved, and why it matters relative to other items on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Bar Two',
                    shortLabel: 'Bar 2',
                    description: 'Description 2 — placeholder text describing the second item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Bar Four',
                    shortLabel: 'Bar 4',
                    description: 'Description 4 — placeholder text describing the fourth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 3,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Bar One',
                    shortLabel: 'Bar 1',
                    description: 'Description 1 — placeholder text describing the action being measured. This area is where a longer explanation lives: what happened, when, the people and institutions involved, and why it matters relative to other items on the chart.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Bar Two',
                    shortLabel: 'Bar 2',
                    description: 'Description 2 — placeholder text describing the second item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' },
                        { url: '#', text: 'Source 2 — placeholder citation' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Bar Three',
                    shortLabel: 'Bar 3',
                    description: 'Description 3 — placeholder text describing the third item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 2,
                    title: 'Bar Four',
                    shortLabel: 'Bar 4',
                    description: 'Description 4 — placeholder text describing the fourth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                },
                {
                    severity: 1,
                    title: 'Bar Five',
                    shortLabel: 'Bar 5',
                    description: 'Description 5 — placeholder text describing the fifth item.',
                    sources: [
                        { url: '#', text: 'Source 1 — placeholder citation' }
                    ]
                }
            ]
        }
    };

    /* --------------------------------------------------------------------------
       Selection — which president is currently shown on each side. The HTML
       still hardcodes name badges and silhouettes for Biden/Trump, so for
       now this just mirrors that. When a president-picker UI is added,
       updating these values (and re-running renderSide) is what will swap
       the bars for a different president.
       -------------------------------------------------------------------------- */
    const selection = {
        left: 'biden',
        right: 'trump'
    };

    /* --------------------------------------------------------------------------
       Render — build bar markup from the data above and inject into the
       containers. Runs once on script load (the script is `defer`-ed in
       the HTML, so the DOM is parsed by the time we get here).

       Animation delays are set inline per bar so that adding a 6th, 7th,
       Nth bar Just Works without touching the CSS.
       -------------------------------------------------------------------------- */

    // Animation timing — mirrors what the old CSS nth-child rules produced
    const BAR_FILL_BASE_DELAY = 0.15;        // first bar's --bar-fill-delay
    const SEVERITY_NUMBER_BASE_DELAY = 0.85; // first bar's severity number
    const LABEL_BASE_DELAY = 0.95;           // first bar's outer label
    const STAGGER_STEP = 0.13;               // gap between consecutive bars

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function renderSourcesList(sources) {
        return sources.map(function (src) {
            return '<li><a href="' + escapeHtml(src.url) + '" rel="noopener">' +
                escapeHtml(src.text) + '</a></li>';
        }).join('');
    }

    function renderBar(bar, index, side) {
        // Per-side ID prefix so left and right never collide
        const idPrefix = side === 'left' ? 'L' : 'R';
        const labelId = 'label-' + idPrefix + (index + 1);
        const detailId = 'detail-' + idPrefix + (index + 1);

        // Per-bar animation delays — replaces the old static nth-child rules
        const fillDelay = (BAR_FILL_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';
        const numberDelay = (SEVERITY_NUMBER_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';
        const labelDelay = (LABEL_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';

        // Label and bar render in opposite DOM order per side so the label
        // sits on the OUTSIDE of the bar (away from the centerline).
        const labelSpan =
            '<span class="bar-label-outer" id="' + labelId + '" style="animation-delay: ' + labelDelay + ';">' +
            escapeHtml(bar.title) +
            '</span>';

        const buttonHtml =
            '<button class="bar-fill" type="button" aria-expanded="false"' +
            ' aria-controls="' + detailId + '"' +
            ' aria-labelledby="' + labelId + '"' +
            ' data-title="' + escapeHtml(bar.title) + '"' +
            ' style="--severity: ' + bar.severity + '; animation-delay: ' + fillDelay + ';">' +
            '<span class="severity-number" style="animation-delay: ' + numberDelay + ';">' + bar.severity + '</span>' +
            '<span class="bar-label-inner">' + escapeHtml(bar.shortLabel) + '</span>' +
            '</button>';

        const rowHtml = side === 'left'
            ? '<div class="bar-row">' + labelSpan + buttonHtml + '</div>'
            : '<div class="bar-row">' + buttonHtml + labelSpan + '</div>';

        const detailHtml =
            '<div class="bar-detail" id="' + detailId + '" hidden>' +
            '<div class="bar-detail-inner">' +
            '<h3 class="detail-title">' + escapeHtml(bar.title) + '</h3>' +
            '<p class="detail-description">' + escapeHtml(bar.description) + '</p>' +
            '<div class="detail-sources">' +
            '<h4 class="sources-heading">Sources</h4>' +
            '<ol class="sources-list">' + renderSourcesList(bar.sources) + '</ol>' +
            '</div>' +
            '</div>' +
            '</div>';

        const article = document.createElement('article');
        article.className = 'bar';
        article.dataset.side = side;
        article.innerHTML = rowHtml + detailHtml;
        return article;
    }

    function renderSide(side) {
        const container = document.getElementById('bars-' + side);
        if (!container) return;

        // Look up the president currently assigned to this side
        const presidentId = selection[side];
        const president = presidents[presidentId];
        if (!president) {
            // Defensive: if the selection points at an unknown president
            // (e.g. typo, or future deletion), clear the side rather than
            // crashing. Keeps the rest of the page working.
            container.replaceChildren();
            return;
        }

        // Sort by severity descending — source order in bars no longer matters
        const sorted = president.bars.slice().sort(function (a, b) {
            return b.severity - a.severity;
        });

        const frag = document.createDocumentFragment();
        sorted.forEach(function (bar, i) {
            frag.appendChild(renderBar(bar, i, side));
        });

        container.replaceChildren(frag);
    }

    renderSide('left');
    renderSide('right');

    /* --------------------------------------------------------------------------
       Everything below is the original interaction code.
       -------------------------------------------------------------------------- */

    const MOBILE_QUERY = '(max-width: 1000px)';
    const mql = window.matchMedia(MOBILE_QUERY);
    const isMobile = () => mql.matches;

    // Modal elements (now a native <dialog>)
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalSeverity = document.getElementById('modal-severity');
    const modalSourcesList = document.getElementById('modal-sources-list');

    // Kept in sync with the .modal-sheet transition duration in CSS
    const MODAL_TRANSITION_MS = 400;

    // Track currently expanded bar (desktop) so we can collapse it
    let currentlyExpanded = null;
    // Element that had focus before the modal opened, restored on close
    let lastFocusedBeforeModal = null;

    /* --------------------------------------------------------------------------
       Click handling — delegated from the document so dynamically-added bars
       (e.g. from the future moderation queue) start working immediately
       without needing to re-bind handlers.
       -------------------------------------------------------------------------- */
    document.addEventListener('click', (e) => {
        const fill = e.target.closest('.bar-fill');
        if (!fill) return;
        const bar = fill.closest('.bar');
        if (!bar) return;

        if (isMobile()) {
            openModal(bar);
        } else {
            toggleExpand(bar);
        }
    });

    /* --------------------------------------------------------------------------
       Desktop: inline expansion
       -------------------------------------------------------------------------- */
    function toggleExpand(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        const isOpen = bar.classList.contains('expanded');

        // Single-open behavior — collapse any other open bar first
        if (currentlyExpanded && currentlyExpanded !== bar) {
            collapseBar(currentlyExpanded);
        }

        if (isOpen) {
            collapseBar(bar);
            currentlyExpanded = null;
        } else {
            bar.classList.add('expanded');
            fill.setAttribute('aria-expanded', 'true');
            if (detail) detail.removeAttribute('hidden');
            currentlyExpanded = bar;
        }
    }

    function collapseBar(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        bar.classList.remove('expanded');
        fill.setAttribute('aria-expanded', 'false');

        if (detail) {
            // The detail has THREE concurrent transitions (max-height,
            // margin-top, opacity). transitionend fires once per property,
            // and opacity finishes first. Filter on propertyName so we
            // wait for max-height to complete before re-hiding the element
            // — and only THEN remove the listener. Previously the listener
            // tore itself down on the first event regardless of property,
            // so the [hidden] attribute often never got reapplied.
            const onEnd = (e) => {
                if (e.propertyName !== 'max-height') return;
                detail.removeEventListener('transitionend', onEnd);
                if (!bar.classList.contains('expanded')) {
                    detail.setAttribute('hidden', '');
                }
            };
            detail.addEventListener('transitionend', onEnd);
        }
    }

    /* --------------------------------------------------------------------------
       Mobile: native <dialog> modal
       -------------------------------------------------------------------------- */
    function openModal(bar) {
        const side = bar.dataset.side;
        const fill = bar.querySelector('.bar-fill');
        const title = fill.dataset.title || 'Detail';
        const severity = fill.style.getPropertyValue('--severity').trim();
        const detail = bar.querySelector('.bar-detail');
        const description = detail ? detail.querySelector('.detail-description')?.textContent || '' : '';
        const sources = detail ? detail.querySelectorAll('.sources-list li') : [];

        modal.dataset.side = side;
        modalTitle.textContent = title;
        modalDescription.textContent = description;
        modalSeverity.textContent = severity;

        // Rebuild sources list — cloneNode preserves nested elements
        // exactly without an innerHTML re-parse round-trip, and would
        // also preserve any event listeners we attach in the future.
        modalSourcesList.replaceChildren();
        sources.forEach((srcLi) => {
            modalSourcesList.appendChild(srcLi.cloneNode(true));
        });

        // Capture focus so we can restore it when the modal closes
        lastFocusedBeforeModal = document.activeElement;

        modal.showModal();
        // Trigger entrance animation on next frame — adding the class in the
        // same frame as showModal() would skip the transition because the
        // browser hasn't yet committed the dialog's "from" state.
        requestAnimationFrame(() => modal.classList.add('is-open'));
    }

    function closeModal() {
        modal.classList.remove('is-open');
        // Wait for the slide-out + backdrop fade to finish before actually
        // closing the dialog, otherwise it snaps to display:none mid-frame.
        setTimeout(() => {
            if (modal.open) modal.close();
            if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
                lastFocusedBeforeModal.focus();
            }
            lastFocusedBeforeModal = null;
        }, MODAL_TRANSITION_MS);
    }

    // Click on the backdrop (which bubbles to the dialog with target===dialog)
    // or on any element marked data-modal-close (the close button).
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            return;
        }
        if (e.target.closest('[data-modal-close]')) {
            closeModal();
        }
    });

    // ESC dismissal — <dialog> fires a `cancel` event before closing. We
    // preventDefault so we can run our animated close path instead of the
    // dialog snapping closed instantly.
    modal.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeModal();
    });

    /* --------------------------------------------------------------------------
       Breakpoint crossings — listen directly to matchMedia's `change` event
       instead of polling resize. Fires only when the breakpoint is actually
       crossed, no manual lastIsMobile tracking required.
       -------------------------------------------------------------------------- */
    mql.addEventListener('change', () => {
        if (currentlyExpanded) {
            collapseBar(currentlyExpanded);
            currentlyExpanded = null;
        }
        if (modal.open) {
            closeModal();
        }
    });
})();