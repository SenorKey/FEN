/* ==========================================================================
   Preside by Side — Interactions
   - Presidents keyed by id; each owns its own bars.
   - `selection` decides which president appears on each side.
   - JS renders bars, name badges, AND the picker dropdowns from these.
   - Desktop: bar click toggles inline expansion (same-side bars push down).
   - Mobile:  bar click opens a native <dialog> modal.
   ========================================================================== */

(function () {
    'use strict';

    /* --------------------------------------------------------------------------
       Presidents — single source of truth.

       Each entry is keyed by a stable `id`. The `selection` map below
       references those ids to decide who appears on which side. The
       picker dropdowns are also driven from this object.

       Adding a new president = adding an entry here. Nothing else needs
       to change for the picker to find them.

       President fields:
         id:          String — stable identifier; matches the object key
         firstName:   String — shown above the last name in the badge
         lastName:    String — shown big in the badge
         displayName: String (optional) — shown in the picker dropdown.
                      Falls back to lastName. Use this to disambiguate
                      common surnames (e.g. "G.W. Bush" vs "G.H.W. Bush").
         ordinal:     Number | Number[] — used by formatOrdinal() to render
                      "46th President" / "45th & 47th President".
                      Single number for one-term presidents, array for
                      non-consecutive multi-term cases.
         party:       String — drives future color theming (not wired up
                      yet; sides currently theme by .side-left / .side-right
                      in CSS).
         bars:        Array<Bar> — see Bar schema below. Empty array is fine.

       Bar schema:
         severity:    Number (1–10)
         title:       String — full title (desktop outer label + detail panel)
         shortLabel:  String — 2–3 words max, shown inside the bar on mobile
         description: String — long-form text in the expanded panel / modal
         sources:     Array<{ url: String, text: String }>
       -------------------------------------------------------------------------- */
    const presidents = {
        trump: {
            id: 'trump',
            firstName: 'Donald J.',
            lastName: 'Trump',
            ordinal: [45, 47],
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
        },
        biden: {
            id: 'biden',
            firstName: 'Joseph R.',
            lastName: 'Biden',
            ordinal: 46,
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
        // ── Scaffolded presidents — empty bars, ready to fill in ──
        obama: {
            id: 'obama',
            firstName: 'Barack H.',
            lastName: 'Obama',
            ordinal: 44,
            party: 'democrat',
            bars: []
        },
        gwBush: {
            id: 'gwBush',
            firstName: 'George W.',
            lastName: 'Bush',
            displayName: 'G.W. Bush',
            ordinal: 43,
            party: 'republican',
            bars: []
        },
        clinton: {
            id: 'clinton',
            firstName: 'William J.',
            lastName: 'Clinton',
            ordinal: 42,
            party: 'democrat',
            bars: []
        }
    };

    /* --------------------------------------------------------------------------
       Selection — which president is currently shown on each side. The
       pickers mutate this. Could later be persisted (localStorage, URL
       params) but right now it just resets to the default on each load.
       -------------------------------------------------------------------------- */
    const selection = {
        left: 'biden',
        right: 'trump'
    };

    /* --------------------------------------------------------------------------
       formatOrdinal — turn 46 into "46<sup>th</sup> President" or
       [45, 47] into "45<sup>th</sup> & 47<sup>th</sup> President".

       Returns HTML (not plain text) because the styling of the suffix
       relies on the <sup> tag — see `.name-detail sup` in styles.css.
       Callers must use innerHTML, not textContent. The data is author-
       controlled (defined above in this file), so this is safe.
       -------------------------------------------------------------------------- */
    function formatOrdinal(n) {
        function suffix(num) {
            const lastDigit = num % 10;
            const lastTwo = num % 100;
            // 11/12/13 are the special cases that don't follow the
            // last-digit rule — they all take 'th'.
            if (lastDigit === 1 && lastTwo !== 11) return 'st';
            if (lastDigit === 2 && lastTwo !== 12) return 'nd';
            if (lastDigit === 3 && lastTwo !== 13) return 'rd';
            return 'th';
        }
        function fmt(num) {
            return num + '<sup>' + suffix(num) + '</sup>';
        }
        if (Array.isArray(n)) {
            return n.map(fmt).join(' &amp; ') + ' President';
        }
        return fmt(n) + ' President';
    }

    /* --------------------------------------------------------------------------
       Render — build bar markup from the data above and inject into the
       containers. Runs once on script load (the script is `defer`-ed in
       the HTML, so the DOM is parsed by the time we get here) and again
       whenever `selection[side]` changes via a picker.

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

    /* --------------------------------------------------------------------------
       Name badge — populate the existing .name-badge spans inside each
       side from the currently-selected president's data.

       The HTML keeps the badge structure (the spans with their classes)
       but ships them empty. This function fills them in. Re-run on every
       selection change.
       -------------------------------------------------------------------------- */
    function renderNameBadge(side) {
        const sideEl = document.querySelector('.side-' + side);
        if (!sideEl) return;
        const badge = sideEl.querySelector('.name-badge');
        if (!badge) return;

        const president = presidents[selection[side]];
        if (!president) {
            // Mirror the renderSide defensive path — clear rather than crash.
            badge.querySelector('.name-first').textContent = '';
            badge.querySelector('.last-name').textContent = '';
            badge.querySelector('.name-detail').textContent = '';
            // Reset section landmark to a generic label.
            sideEl.setAttribute('aria-label', side === 'left' ? 'Left president' : 'Right president');
            return;
        }

        // textContent for plain strings (auto-escapes anything weird).
        badge.querySelector('.name-first').textContent = president.firstName;
        badge.querySelector('.last-name').textContent = president.lastName;
        // innerHTML for the ordinal because formatOrdinal returns markup
        // (<sup> tags). Safe because the input is author-controlled data.
        badge.querySelector('.name-detail').innerHTML = formatOrdinal(president.ordinal);
        // Update the section landmark so screen readers navigating by
        // landmark hear the actual president's name (e.g. "Joseph R. Biden")
        // rather than a generic "Left president". Re-announces on change.
        sideEl.setAttribute('aria-label', president.firstName + ' ' + president.lastName);
        // Drive the side's color theme. The CSS [data-party="..."] block
        // defines --party-* variables; the side's background gradient,
        // radial accent, bar fills, and detail accent border all read
        // those vars, so a single attribute swap repaints the side.
        sideEl.dataset.party = president.party;
    }

    /* --------------------------------------------------------------------------
       Picker — render the <option>s inside an existing <select>.

       The select element itself stays put across re-renders (preserving
       the change listener attached once below); only its options get
       replaced. Each call recomputes which presidents to show:

         - Skip the one already chosen on the OTHER side (filter rule)
         - Mark this side's current selection as `selected`
         - Use displayName when present (lets "G.W. Bush" disambiguate
           from a future H.W. Bush without changing his lastName)
       -------------------------------------------------------------------------- */
    function renderPicker(side) {
        const select = document.getElementById('picker-' + side);
        if (!select) return;

        const otherSide = side === 'left' ? 'right' : 'left';
        const excludeId = selection[otherSide];
        const currentId = selection[side];

        // Drive the picker cell's border tint via data-party. The
        // .president-picker base rule reads rgba(var(--party-rgb), 0.45),
        // so changing the wrapper's data-party recolors the border.
        const cell = select.parentElement;
        const currentPresident = presidents[currentId];
        if (cell && currentPresident) {
            cell.dataset.party = currentPresident.party;
        }

        // Wipe and rebuild — small enough that this is simpler than diffing
        select.replaceChildren();

        Object.values(presidents).forEach(function (p) {
            if (p.id === excludeId) return; // hidden because they're on the other side
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.displayName || p.lastName;
            if (p.id === currentId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    /* --------------------------------------------------------------------------
       Picker change handler — orchestrates the four updates that need
       to happen when a side switches presidents:

         1. Update `selection` (the source of truth)
         2. Re-render this side's bars
         3. Re-render this side's name badge
         4. Re-render the OTHER side's picker, so the new pick is filtered
            out of its option list

       Note that step 4 does NOT re-render this side's own picker. The
       current selection in this side's <select> is already correct
       (the user just chose it), and the option list doesn't need to
       change because the OTHER side's selection didn't change.
       -------------------------------------------------------------------------- */
    function onPickerChange(side, newId) {
        if (selection[side] === newId) return; // no-op
        if (!presidents[newId]) return;        // defensive: unknown id

        selection[side] = newId;
        renderSide(side);
        renderNameBadge(side);
        renderPicker(side === 'left' ? 'right' : 'left');
    }

    // Wire up picker change listeners ONCE. The select elements themselves
    // don't get re-created on selection changes — only their options — so
    // these listeners survive every re-render.
    ['left', 'right'].forEach(function (side) {
        const select = document.getElementById('picker-' + side);
        if (!select) return;
        select.addEventListener('change', function (e) {
            onPickerChange(side, e.target.value);
        });
    });

    // Initial render — bars, badges, pickers (in that order, but it
    // doesn't strictly matter; they all read from `selection`).
    renderSide('left');
    renderSide('right');
    renderNameBadge('left');
    renderNameBadge('right');
    // Reveal the name badges now that they're populated. Done before
    // the picker render so an error in renderPicker doesn't strand the
    // badges in their pre-hydration hidden state — a half-broken page
    // shouldn't leave the most prominent text invisible.
    document.body.classList.add('hydrated');
    renderPicker('left');
    renderPicker('right');

    /* --------------------------------------------------------------------------
       Everything below is the original interaction code, unchanged.
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

        // Drive the modal's color theme from the bar's president, not the
        // bar's side. Means the modal sheet border + severity number both
        // adopt the right party color whichever side opened it. Defensive
        // empty string clears any stale value if the lookup ever fails.
        const president = presidents[selection[side]];
        modal.dataset.party = president ? president.party : '';

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