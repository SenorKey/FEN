/* ==========================================================================
   Preside by Side — Interactions
   - Presidents keyed by id; each owns its own bars.
   - `selection` decides which president appears on each side.
   - JS renders bars, name badges, AND the picker dropdowns from these.
   - Three views (body[data-view], toggled by the centerline pill):
       'user' (default)  every event is an unrated track; the visitor
                         hovers/clicks to set their own 1–10 severity
                         (desktop) or rates via the modal scale (mobile).
                         No AI score is shown — including sort order.
       'others'          the community averages — each bar sized by the
                         mean of all reader votes (with the vote count
                         beside it), zero-vote bars shown as empty rails.
       'ai'              the AI-assisted bars, with the visitor's own
                         ratings overlaid as "you · n" markers.
   - Desktop: bar click toggles inline expansion (same-side bars push
     down) — except unrated bars in the user view, where the bar is the
     rating control and the event label opens the panel instead.
   - Mobile:  bar click opens a native <dialog> modal.
   ========================================================================== */

(function () {
    'use strict';

    /* --------------------------------------------------------------------------
       Presidents — lightweight metadata index, single source of truth for
       who appears in the picker and how their name/portrait/party renders.

       Each entry is keyed by a stable `id`. The `selection` map below
       references those ids to decide who appears on which side. The
       picker dropdowns are also driven from this object.

       Adding a new president = adding an entry here AND dropping a
       <id>.json file alongside the others under data/presidents/. The
       picker shows them as soon as the metadata entry exists; the bars
       column hydrates when their JSON file loads.

       President fields:
         id:          String — stable identifier; matches the object key
                      AND the basename of data/presidents/<id>.json.
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

       Bars (severity, title, shortLabel, description, sources) live in
       data/presidents/<id>.json and are fetched on demand via loadBars()
       — see below. Splitting the bulky descriptions + source URLs out of
       this file shrinks initial JS by ~80%, and visitors only pay the
       data cost for presidents they actually open.

       Bar schema (in the JSON files):
         id:          String — stable 10-char identifier from the unambiguous
                      alphabet [23456789ABCDEFGHJKLMNPQRSTUVWXYZ]. Used as
                      the key for reader severity ratings on the server side.
                      Assigned once by server/backfill_bar_ids.py; new bars
                      added by hand must get a fresh id (re-run the script).
         severity:    Number (1–10) — author rating
         title:       String — full title (detail panel + modal heading)
         shortLabel:  String — 2–3 words max, shown on the bar on every breakpoint
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
            portrait: '/assets/images/trump.webp'
        },
        biden: {
            id: 'biden',
            firstName: 'Joseph R.',
            lastName: 'Biden',
            ordinal: 46,
            party: 'democrat',
            portrait: '/assets/images/biden.webp'
        },
        obama: {
            id: 'obama',
            firstName: 'Barack H.',
            lastName: 'Obama',
            ordinal: 44,
            party: 'democrat',
            portrait: '/assets/images/obama.webp'
        },
        gwBush: {
            id: 'gwBush',
            firstName: 'George W.',
            lastName: 'Bush',
            displayName: 'G.W. Bush',
            ordinal: 43,
            party: 'republican',
            portrait: '/assets/images/gwb.webp'
        },
        clinton: {
            id: 'clinton',
            firstName: 'William J.',
            lastName: 'Clinton',
            ordinal: 42,
            party: 'democrat',
            portrait: '/assets/images/clinton.webp'
        },
        reagan: {
            id: 'reagan',
            firstName: 'Ronald W.',
            lastName: 'Reagan',
            ordinal: 40,
            party: 'republican'
        },
        jackson: {
            id: 'jackson',
            firstName: 'Andrew',
            lastName: 'Jackson',
            ordinal: 7,
            party: 'democrat'
        },
        johnson: {
            id: 'johnson',
            firstName: 'Andrew',
            lastName: 'Johnson',
            ordinal: 17,
            party: 'democrat',
            portrait: '/assets/images/johnson.webp'
        },
        tRoosevelt: {
            id: 'tRoosevelt',
            firstName: 'Theodore',
            lastName: 'Roosevelt',
            displayName: 'T. Roosevelt',
            ordinal: 26,
            party: 'republican',
            portrait: '/assets/images/troosevelt.webp'
        },
        fdRoosevelt: {
            id: 'fdRoosevelt',
            firstName: 'Franklin D.',
            lastName: 'Roosevelt',
            displayName: 'F.D. Roosevelt',
            ordinal: 32,
            party: 'democrat',
            portrait: '/assets/images/fdr.webp'
        },
        jefferson: {
            id: 'jefferson',
            firstName: 'Thomas',
            lastName: 'Jefferson',
            ordinal: 3,
            party: 'democratic-republican',
            portrait: '/assets/images/jefferson.webp'
        },
        hoover: {
            id: 'hoover',
            firstName: 'Herbert',
            lastName: 'Hoover',
            ordinal: 31,
            party: 'republican',
            portrait: '/assets/images/hoover.webp'
        },
        cleveland: {
            id: 'cleveland',
            firstName: 'Grover',
            lastName: 'Cleveland',
            ordinal: [22, 24],
            party: 'democrat',
            portrait: '/assets/images/cleveland.webp'
        },
        hayes: {
            id: 'hayes',
            firstName: 'Rutherford B.',
            lastName: 'Hayes',
            ordinal: 19,
            party: 'republican',
            portrait: '/assets/images/hayes.webp'
        },
        buchanan: {
            id: 'buchanan',
            firstName: 'James',
            lastName: 'Buchanan',
            ordinal: 15,
            party: 'democrat',
            portrait: '/assets/images/buchanan.webp'
        },
        harding: {
            id: 'harding',
            firstName: 'Warren G.',
            lastName: 'Harding',
            ordinal: 29,
            party: 'republican',
            portrait: '/assets/images/harding.webp'
        },
        fillmore: {
            id: 'fillmore',
            firstName: 'Millard',
            lastName: 'Fillmore',
            ordinal: 13,
            party: 'whig',
            portrait: '/assets/images/fillmore.webp'
        },
        washington: {
            id: 'washington',
            firstName: 'George',
            lastName: 'Washington',
            ordinal: 1,
            party: 'noparty',
            portrait: '/assets/images/washington.webp'
        }
    };

    /* --------------------------------------------------------------------------
       Bars data — fetched lazily per president.

       Each president's heavy content (multi-paragraph descriptions + source
       URLs) lives in data/presidents/<id>.json. We only fetch the two
       presidents currently selected on load; the rest hydrate on demand
       when the user picks them. A single in-flight promise per president is
       cached so two simultaneous picker changes can't double-fetch.

       Failed fetches are dropped from the cache so a later attempt (after
       a transient network hiccup, say) re-fires instead of serving up the
       cached error forever.
       -------------------------------------------------------------------------- */
    const BARS_DATA_PATH = '/preside-by-side/data/presidents/';
    const barsPromises = Object.create(null);

    function loadBars(id) {
        if (barsPromises[id]) return barsPromises[id];
        const p = fetch(BARS_DATA_PATH + encodeURIComponent(id) + '.json', {
            credentials: 'same-origin'
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .catch(function (err) {
                delete barsPromises[id];
                throw err;
            });
        barsPromises[id] = p;
        return p;
    }

    /* --------------------------------------------------------------------------
       Selection — which president is currently shown on each side. The
       pickers mutate this. These are the defaults; a matchup encoded in
       the URL (?left=<id>&right=<id>) overrides them on load — see
       readSelectionFromUrl below.
       -------------------------------------------------------------------------- */
    const selection = {
        left: 'biden',
        right: 'trump'
    };

    /* --------------------------------------------------------------------------
       URL persistence — a matchup can be shared or bookmarked via
       ?left=<id>&right=<id> search params. On load we read them, ignoring
       unknown ids and any pairing that would put the same president on
       both sides (the picker forbids that, so the URL must too). On every
       picker change syncSelectionToUrl writes the current selection back
       with history.replaceState, keeping the address bar in sync without
       stacking entries on the back button.
       -------------------------------------------------------------------------- */
    (function readSelectionFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const left = params.get('left');
        const right = params.get('right');
        if (left && presidents[left]) selection.left = left;
        // The right side may not duplicate whatever left just resolved to.
        if (right && presidents[right] && right !== selection.left) {
            selection.right = right;
        }
    })();

    function syncSelectionToUrl() {
        const params = new URLSearchParams(window.location.search);
        params.set('left', selection.left);
        params.set('right', selection.right);
        history.replaceState(
            null,
            '',
            window.location.pathname + '?' + params.toString() + window.location.hash
        );
    }

    /* --------------------------------------------------------------------------
       View mode — which severity the bars display.

         'user' (default)  every event renders as an unrated track until
                           the visitor rates it themselves; no AI score
                           is visible anywhere (including sort order —
                           see the --order-user notes in renderSide).
         'others'          the community averages from /api/ratings/,
                           sized by mean reader vote with the count
                           shown beside it. Zero-vote bars stay rails.
         'ai'              the original AI-assisted bars, with the
                           visitor's own ratings overlaid as markers.

       The default is deliberately 'user': the page wants the reader's
       judgment before it shows anyone else's — the AI's or the crowd's.
       ?view=ai / ?view=others in the URL override (shareable), and the
       toggle keeps the param in sync the same way the pickers sync
       ?left/?right. The body[data-view] attribute is what CSS keys
       every mode difference off; it's set here, before the first
       render, so bars never flash the wrong mode.
       -------------------------------------------------------------------------- */
    let viewMode = 'user';
    (function readViewFromUrl() {
        const fromUrl = new URLSearchParams(window.location.search).get('view');
        if (fromUrl === 'ai' || fromUrl === 'others') {
            viewMode = fromUrl;
        }
    })();
    document.body.dataset.view = viewMode;

    function syncViewToUrl() {
        const params = new URLSearchParams(window.location.search);
        if (viewMode === 'user') params.delete('view');
        else params.set('view', viewMode);
        const qs = params.toString();
        history.replaceState(
            null,
            '',
            window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
        );
    }

    /* --------------------------------------------------------------------------
       formatOrdinal — turn 46 into "46<sup>th</sup> President" or
       [45, 47] into "45<sup>th</sup> & 47<sup>th</sup> President".

       Returns HTML (not plain text) because the styling of the suffix
       relies on the <sup> tag — see `.name-detail sup` in styles.css.
       Callers must use innerHTML, not textContent. The data is author-
       controlled (defined above in this file), so this is safe.
       -------------------------------------------------------------------------- */
    // Ordinal suffix for a number — 'st', 'nd', 'rd', or 'th'.
    // 11/12/13 are the special cases that don't follow the last-digit
    // rule — they all take 'th'.
    function ordinalSuffix(num) {
        const lastDigit = num % 10;
        const lastTwo = num % 100;
        if (lastDigit === 1 && lastTwo !== 11) return 'st';
        if (lastDigit === 2 && lastTwo !== 12) return 'nd';
        if (lastDigit === 3 && lastTwo !== 13) return 'rd';
        return 'th';
    }

    function formatOrdinal(n) {
        function fmt(num) {
            return num + '<sup>' + ordinalSuffix(num) + '</sup>';
        }
        if (Array.isArray(n)) {
            return n.map(fmt).join(' &amp; ') + ' President';
        }
        return fmt(n) + ' President';
    }

    /* --------------------------------------------------------------------------
       formatParty — turn a party id ("democratic-republican") into a
       display label ("Democratic-Republican"). Title-cases each hyphen-
       separated segment so any future party id renders correctly without
       a hardcoded lookup.
       -------------------------------------------------------------------------- */
    function formatParty(party) {
        if (!party) return '';
        // Special case — Washington and any other unaffiliated executive
        // render as "Nonpartisan" rather than a literal "Noparty".
        if (party === 'noparty') return 'Nonpartisan';
        return party
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('-');
    }

    /* --------------------------------------------------------------------------
       Render — build bar markup from the data above and inject into the
       containers. Runs once on script load (the script is `defer`-ed in
       the HTML, so the DOM is parsed by the time we get here) and again
       whenever `selection[side]` changes via a picker.

       Bar entrance choreography lives in CSS. The only timing data JS
       contributes is each bar's index, written to a --bar-index custom
       property on the .bar element; CSS does the calc() to derive the
       per-element animation-delay from that index. Adding a 6th, 7th,
       Nth bar Just Works — the index increments and the existing CSS
       rules pick it up. To retune the choreography, edit the
       --bar-*-base-delay / --bar-stagger variables in the CSS :root
       block; no JS change or page reload of this file is required.
       -------------------------------------------------------------------------- */

    /* --------------------------------------------------------------------------
       Bar template — the inert markup lives in index.html as
       <template id="bar-template">. We grab it once at module init and
       cloneNode for each bar rather than reparsing a string per render.

       Why a template instead of an HTML string + innerHTML:

         1. Safety is structural. textContent and the DOM attribute APIs
            escape by definition, so bar data cannot break out of its
            insertion context — no hand-rolled escapeHtml to call (and
            forget) at every interpolation site. The day user-submitted
            bars land in V2, the renderer is already safe by default.

         2. Refactor-friendly. Adding a new field or rearranging the
            structure means editing one HTML block, not chasing string
            concatenations across a render function.

         3. Cheaper on re-render. The template's DocumentFragment is
            parsed once; subsequent clones are a tree copy, not a parse.
       -------------------------------------------------------------------------- */
    const barTemplate = document.getElementById('bar-template');

    // Build one <li><a> for a source entry. Shared between the inline
    // detail panel (rendered eagerly in renderBar) and the mobile modal
    // (rebuilt on open), so the URL scheme guard lives in one place.
    function appendSourceItem(listEl, src) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        const safeUrl = /^https?:\/\//i.test(src.url) ? src.url : '#';
        a.href = safeUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = src.text;
        li.appendChild(a);
        listEl.appendChild(li);
    }

    function renderBar(bar, index, side, userOrder) {
        // Clone the <article class="bar"> sub-tree from the template's
        // DocumentFragment. firstElementChild skips any whitespace text
        // nodes the HTML parser left around our <article>.
        const node = barTemplate.content.firstElementChild.cloneNode(true);

        // Stash the source data on the node so openModal can read the
        // canonical bar object directly, instead of scraping fields back
        // out of the DOM (data-title, --severity, .detail-description
        // textContent, cloned <li>s). Decouples the modal from the
        // inline detail markup — changing one no longer silently breaks
        // the other.
        node._barData = bar;

        node.dataset.side = side;
        // Lets the rating sync path find every rendered instance of this
        // event without walking _barData on each node.
        node.dataset.barId = bar.id || '';
        // Expose the bar's ordinal positions to CSS. --bar-index-ai is
        // the DOM (AI severity) position, --order-user the neutral
        // alphabetical one; the stylesheet derives both the flex `order`
        // and the entrance-stagger --bar-index from whichever matches
        // the active view. JS owns the indexes, CSS owns the timing.
        node.style.setProperty('--bar-index-ai', index);
        node.style.setProperty('--order-user', userOrder);

        // Per-side ID prefix so the left and right columns never collide
        // on label/detail ids — they share a single document.
        const idPrefix = side === 'left' ? 'L' : 'R';
        const labelId = 'label-' + idPrefix + (index + 1);
        const detailId = 'detail-' + idPrefix + (index + 1);

        const labelOuter = node.querySelector('.bar-label-outer');
        labelOuter.id = labelId;
        labelOuter.textContent = bar.shortLabel;
        // The label is a button that toggles the same detail panel the
        // fill controls — the only route to the panel for unrated bars
        // in the rating view, where the fill is busy being a rating
        // control.
        labelOuter.setAttribute('aria-controls', detailId);
        labelOuter.setAttribute('aria-expanded', 'false');

        const fill = node.querySelector('.bar-fill');
        fill.setAttribute('aria-controls', detailId);
        fill.setAttribute('aria-labelledby', labelId);
        // The AI score feeds --severity-ai; the visitor's own rating (if
        // any) feeds --severity-user via updateBarRatingState below. CSS
        // resolves whichever the active view reads into --severity,
        // which drives both the width calc and the rail fallback.
        fill.style.setProperty('--severity-ai', bar.severity);

        node.querySelector('.bar-label-inner').textContent = bar.shortLabel;

        const detail = node.querySelector('.bar-detail');
        detail.id = detailId;

        node.querySelector('.detail-title').textContent = bar.title;
        node.querySelector('.detail-description').textContent = bar.description;

        // Build the sources list with createElement so the href is set
        // via the DOM API (not interpolated into an HTML string) and the
        // link text is set via textContent. The href is also scheme-checked
        // so a hostile `javascript:` URL cannot execute at click time.
        const sourcesList = node.querySelector('.sources-list');
        bar.sources.forEach(function (src) {
            appendSourceItem(sourcesList, src);
        });

        // Hydrate the inline panel's reader-rating block (mirrors the
        // modal hydration in openModal). Done at render time rather than
        // expand time so the buttons + stored-vote state are ready the
        // instant the panel slides open.
        setupRatingUi(bar, selection[side], node.querySelector('.bar-rating'));

        // Hover/keyboard handlers for the rating track (the click side
        // of the interaction is delegated at the document level with
        // everything else). No-ops outside the user view / on rated
        // bars / on mobile — the guards live in the handlers so a bar
        // rated mid-session sheds the behavior without re-wiring.
        wireRatingTrack(node, fill);

        // Resolve rated/unrated state, the displayed number, the AI-view
        // marker, and the fill's accessibility role for the current view.
        updateBarRatingState(node);

        // Right-side bars need the outer label AFTER the bar in DOM
        // order so it ends up on the outside edge (away from the
        // centerline). The template authors left-side order; we move
        // the label to the end of the row for right-side bars rather
        // than maintain two parallel templates.
        if (side === 'right') {
            const row = node.querySelector('.bar-row');
            row.appendChild(labelOuter);
        }

        return node;
    }

    /* --------------------------------------------------------------------------
       Per-label tight-fit — desktop fallback for outer labels that would
       clip past the viewport edge at their natural single-line size.

       Bar widths are fixed (20%–80% of the half-viewport). For most labels
       in the dataset that leaves enough outer gutter at common desktop
       widths. When a particular label still doesn't fit — long words,
       narrow viewports, or both — this function tags it with .label-tight
       and sets its max-width to the available outer space, which lets it
       wrap to two lines at a smaller font size. Two wrapped lines at
       0.85rem / 1.1 line-height stay comfortably within the 62px bar
       height, so the row's overall height doesn't change.

       Only one label is shrunk per offender; non-overflowing labels keep
       their default styling. We don't shrink the bars themselves —
       silhouette stability across selections is the whole point of the
       fixed-width strategy.
       -------------------------------------------------------------------------- */
    function applyLabelTightFit() {
        const labels = document.querySelectorAll('.bar-label-outer');
        if (!labels.length) return;

        // Mobile uses inner labels, so any leftover .label-tight from a
        // desktop session needs to be cleared (and it'd be a no-op
        // anyway since outer labels are hidden).
        const onMobile = mql.matches;

        const SAFETY = 8;       // breathing room past the viewport edge
        const GAP = 18;         // mirrors .bar-row { gap: 18px }
        const BREATHING = 6;    // shave a few px off max-width so wrapped
        // text doesn't kiss the edge
        const vw = window.innerWidth;

        labels.forEach(function (label) {
            // Always reset before re-measuring; the previous render or
            // a wider viewport may have applied .label-tight that no
            // longer applies.
            label.classList.remove('label-tight');
            label.style.maxWidth = '';

            if (onMobile) return;

            const bar = label.closest('.bar');
            if (!bar) return;
            const fill = bar.querySelector('.bar-fill');
            if (!fill) return;

            const labelRect = label.getBoundingClientRect();
            // The bar-fill's entrance animation is a clip-path reveal
            // rather than a scaleX transform, so the element's layout
            // box is honest at every frame of the animation. That means
            // getBoundingClientRect reports the bar's true on-screen
            // rect even on the very first paint, and we can read its
            // edges directly without falling back to offsetLeft/
            // offsetWidth + offsetParent gymnastics.
            const fillRect = fill.getBoundingClientRect();
            const fillLayoutLeft = fillRect.left;
            const fillLayoutRight = fillRect.right;
            const side = bar.dataset.side;

            let availableOuter = 0;

            if (side === 'left') {
                // Label sits to the LEFT of the bar; gutter is from
                // the viewport edge to the bar's left edge.
                availableOuter = fillLayoutLeft - GAP - SAFETY - BREATHING;
            } else {
                // Label sits to the RIGHT of the bar; gutter is from
                // the bar's right edge to the viewport edge.
                availableOuter = vw - fillLayoutRight - GAP - SAFETY - BREATHING;
            }

            // Fire the tight fallback proactively whenever the label's
            // natural single-line width exceeds the gutter, so labels
            // wrap *before* they get visually cramped against the bar
            // or clip past the viewport edge.
            if (labelRect.width <= availableOuter) return;
            if (availableOuter < 40) availableOuter = 40; // hard floor;
            // anything narrower would be unreadable even wrapped, but
            // line-clamp + ellipsis still saves us from breaking layout.

            label.classList.add('label-tight');
            label.style.maxWidth = availableOuter.toFixed(1) + 'px';
        });
    }

    // Per-side render token. Each renderSide call bumps the side's token;
    // when the async loadBars resolves, the handler bails if a newer call
    // has bumped the token since (i.e. the user picked someone else mid-
    // fetch). Without this, a slow fetch for president A landing after a
    // quick fetch for B would overwrite B's bars with A's.
    const renderTokens = { left: 0, right: 0 };

    function renderSide(side) {
        const container = document.getElementById('bars-' + side);
        if (!container) return;

        const presidentId = selection[side];
        const president = presidents[presidentId];
        if (!president) {
            // Defensive: if the selection points at an unknown president
            // (e.g. typo, or future deletion), clear the side rather than
            // crashing. Keeps the rest of the page working.
            container.replaceChildren();
            return;
        }

        const token = ++renderTokens[side];
        // Clear immediately so the column doesn't keep showing the old
        // president's bars while the new president's JSON is in flight.
        container.replaceChildren();

        loadBars(presidentId).then(function (bars) {
            // A newer render call superseded us — drop this result.
            if (renderTokens[side] !== token) return;

            // Sort by severity descending — source order in the JSON file
            // doesn't matter for layout. This stays the DOM order (and
            // the AI view's visual order).
            const sorted = bars.slice().sort(function (a, b) {
                return b.severity - a.severity;
            });

            // The reader-rating view must not leak the AI's ranking
            // through row order, so it re-sorts alphabetically via the
            // CSS `order` property — a neutral, deterministic shuffle
            // that stays stable across visits and doesn't reflow as the
            // visitor rates. Computed here once and written to each bar
            // as --order-user.
            const alpha = bars.slice().sort(function (a, b) {
                return (a.shortLabel || '').localeCompare(b.shortLabel || '');
            });
            const userOrderById = {};
            alpha.forEach(function (b, i) { userOrderById[b.id] = i; });

            const frag = document.createDocumentFragment();
            sorted.forEach(function (bar, i) {
                const userOrder = userOrderById[bar.id] != null ? userOrderById[bar.id] : i;
                frag.appendChild(renderBar(bar, i, side, userOrder));
            });

            container.replaceChildren(frag);
            // Bars are now in the DOM with measurable widths — re-fit
            // labels for this side. Cheap and idempotent.
            applyLabelTightFit();

            // Community averages arrive on their own fetch (deduped +
            // cached per president). Once they land, stamp this side's
            // bars with their others-view width/number/order. The token
            // check repeats because this resolves later than the bars.
            loadRatings(presidentId).then(function () {
                if (renderTokens[side] !== token) return;
                applyOthersRatings(container, presidentId);
            });
        }).catch(function () {
            if (renderTokens[side] !== token) return;
            // Network or parse failure — leave the column empty rather
            // than half-rendered. The promise was dropped from the cache
            // so the next picker change for this president will retry.
            container.replaceChildren();
        });
    }

    /* --------------------------------------------------------------------------
       Name badge — populate the spans inside .picker-cell > .picker-badge
       from the currently-selected president's data.

       The badge text lives in the picker cell (which straddles the
       header/comparison boundary), not inside .side-left/.side-right.
       We still touch the .side- element to update its aria-label
       (section landmark) and data-party (background + bar theming).
       -------------------------------------------------------------------------- */
    function renderNameBadge(side) {
        const cell = document.querySelector('.picker-cell[data-side="' + side + '"]');
        if (!cell) return;
        const sideEl = document.querySelector('.side-' + side);
        // The picker trigger button carries the accessible name for the
        // dropdown. The visible spans below are aria-hidden, so the
        // button's aria-label must carry the full identifying text and
        // an action hint — kept in sync with `selection[side]` on every
        // re-render.
        const trigger = cell.querySelector('.picker-badge');
        const sideWord = side === 'left' ? 'Left' : 'Right';

        const nf = cell.querySelector('.name-first');
        const ln = cell.querySelector('.last-name');
        const nd = cell.querySelector('.name-detail');
        const np = cell.querySelector('.name-party');

        const president = presidents[selection[side]];
        if (!president) {
            // Mirror the renderSide defensive path — clear rather than crash.
            if (nf) nf.textContent = '';
            if (ln) ln.textContent = '';
            if (nd) nd.textContent = '';
            if (np) np.textContent = '';
            if (sideEl) sideEl.setAttribute('aria-label', side === 'left' ? 'Left president' : 'Right president');
            // Fall back to the generic picker label when no president is
            // resolved (e.g. an unknown selection id).
            if (trigger) trigger.setAttribute('aria-label', 'Pick president for the ' + sideWord.toLowerCase() + ' side');
            return;
        }

        // textContent for plain strings (auto-escapes anything weird).
        if (nf) nf.textContent = president.firstName;
        if (ln) ln.textContent = president.lastName;
        // innerHTML for the ordinal because formatOrdinal returns markup
        // (sup tags). Safe because the input is author-controlled data.
        if (nd) nd.innerHTML = formatOrdinal(president.ordinal);
        if (np) np.textContent = formatParty(president.party);

        // Rich, dynamic aria-label collapses what would otherwise be two
        // separate screen-reader announcements (label + current option)
        // into one self-describing string, e.g. "Left president: Biden —
        // change". lastName is preferred over firstName + lastName here
        // to match what's visually emphasized in the badge and what each
        // option's textContent says, keeping the spoken label aligned
        // with the visual UI.
        if (trigger) {
            trigger.setAttribute(
                'aria-label',
                sideWord + ' president: ' + (president.displayName || president.lastName) + ' — change'
            );
        }

        // Repaint the picker badge border. --party-rgb is inherited from
        // the nearest data-party ancestor, and the badge's border reads it.
        // Without this, switching across parties leaves a stale outline.
        cell.dataset.party = president.party;

        if (sideEl) {
            // Re-announce the section landmark with the new president's name.
            sideEl.setAttribute('aria-label', president.firstName + ' ' + president.lastName);
            // Drive the side's color theme. The CSS [data-party="..."] block
            // defines --party-* variables; the side's background gradient,
            // radial accent, bar fills, and detail accent border all read
            // those vars, so a single attribute swap repaints the side.
            sideEl.dataset.party = president.party;
        }
    }

    /* --------------------------------------------------------------------------
       Portrait — swap the <img> src on the masthead portrait for this side.

       The <img> tag itself stays put across selection changes; only `src`,
       `alt`, and the data-loaded flag get updated. The CSS animation reads
       data-loaded, so removing it before setting a new src restarts the
       fade-in for the next portrait. If the new president has no portrait
       defined, the img stays hidden (no src, no data-loaded).
       -------------------------------------------------------------------------- */
    function renderPortrait(side) {
        const img = document.querySelector('.president-portrait[data-side="' + side + '"]');
        if (!img) return;

        const president = presidents[selection[side]];

        // Drop any prior loaded state so the animation can replay for the
        // new portrait once it loads.
        img.removeAttribute('data-loaded');

        // Force a style flush between the remove above and any (potentially
        // synchronous) re-add below. For a cached portrait, img.complete
        // becomes true immediately after `img.src = ...`, so the `if` block
        // further down sets data-loaded back in the same task — without
        // this flush the browser would only see the net state (still
        // present), wouldn't register a [data-loaded] transition, and the
        // portraitFadeIn animation wouldn't restart. The previous portrait's
        // animation is `forwards`, so the new image would inherit its final
        // opacity (0.7) and appear to pop in instead of fading. Reading
        // offsetWidth forces a synchronous layout + style recalc, which
        // makes the un-loaded state observable.
        void img.offsetWidth;

        if (!president || !president.portrait) {
            img.removeAttribute('src');
            img.alt = '';
            return;
        }

        img.alt = president.firstName + ' ' + president.lastName;
        // Wait for the new image to finish decoding before flipping
        // data-loaded — otherwise the fade-in can start against a blank
        // <img> and snap to the image mid-animation.
        img.onload = function () {
            img.setAttribute('data-loaded', '');
        };
        img.onerror = function () {
            img.removeAttribute('src');
            img.removeAttribute('data-loaded');
            img.alt = '';
        };
        img.src = president.portrait;
        // Some browsers cache the image and skip onload — handle that.
        if (img.complete && img.naturalWidth > 0) {
            img.setAttribute('data-loaded', '');
        }
    }

    /* --------------------------------------------------------------------------
       Picker — custom listbox popover, grouped by party.

       Replaces a native <select>: the badge is a <button> that toggles
       a styled .picker-menu sibling inside .picker-cell. Each call wipes
       and rebuilds the menu's sections + options. Cheap enough (under
       ~20 options) that diffing isn't worth the complexity.

       Each call recomputes:
         - Sections, grouped by party. Section order is fixed below.
         - Options within a section, sorted chronologically by ordinal.
         - The OTHER side's current selection rendered as disabled
           (visible but not pickable), so users can see who they'd be
           displacing rather than having that president silently vanish.
         - This side's current selection marked aria-selected + checked.
       -------------------------------------------------------------------------- */

    // The menu is laid out in three columns: Democrats, Republicans,
    // and Other (a catch-all for historical/minor parties). Each column
    // can contain one or more party sections.
    const PARTY_COLUMNS = [
        { id: 'democrats', parties: ['democrat'] },
        { id: 'republicans', parties: ['republican'] },
        { id: 'other', parties: ['democratic-republican', 'federalist', 'whig', 'noparty'] }
    ];
    const PARTY_LABELS = {
        democrat: 'Democrats',
        republican: 'Republicans',
        'democratic-republican': 'Democratic-Republicans',
        federalist: 'Federalists',
        whig: 'Whigs',
        noparty: 'Nonpartisan'
    };

    // Smaller ordinal-only formatter for menu rows (e.g. "46th",
    // "45th & 47th"). The badge's formatOrdinal appends "President"
    // which would be redundant in a list of presidents.
    // Multi-term presidents (Cleveland, Trump) get newline-joined
    // ordinals so each fits in the narrow ordinal column without
    // overlapping the name; the CSS uses white-space: pre-line.
    function formatOrdinalShort(n) {
        function fmt(num) { return num + ordinalSuffix(num); }
        if (Array.isArray(n)) return n.map(fmt).join('\n&\n');
        return fmt(n);
    }

    function firstOrdinal(p) {
        return Array.isArray(p.ordinal) ? p.ordinal[0] : p.ordinal;
    }

    // Most recent (largest) ordinal — Cleveland and Trump have two
    // non-consecutive terms; for "sort by most recent" we want the
    // later term to anchor their position.
    function latestOrdinal(p) {
        return Array.isArray(p.ordinal) ? Math.max.apply(null, p.ordinal) : p.ordinal;
    }

    function renderPicker(side) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        const otherSide = side === 'left' ? 'right' : 'left';
        const disabledId = selection[otherSide];
        const currentId = selection[side];

        // Drive the picker cell's border tint via data-party. The
        // .picker-badge base rule reads rgba(var(--party-rgb), 0.45),
        // so changing data-party on the cell recolors the border.
        const cell = trigger.closest('.picker-cell');
        const currentPresident = presidents[currentId];
        if (cell && currentPresident) {
            cell.dataset.party = currentPresident.party;
        }

        // Bucket presidents by party in a single pass, then sort each
        // bucket by most recent ordinal first (largest at top).
        const buckets = {};
        Object.values(presidents).forEach(function (p) {
            (buckets[p.party] = buckets[p.party] || []).push(p);
        });
        Object.keys(buckets).forEach(function (party) {
            buckets[party].sort(function (a, b) {
                return latestOrdinal(b) - latestOrdinal(a);
            });
        });

        const frag = document.createDocumentFragment();

        PARTY_COLUMNS.forEach(function (col) {
            const column = document.createElement('div');
            column.className = 'picker-column';
            column.dataset.column = col.id;

            col.parties.forEach(function (party) {
                const list = buckets[party];
                if (!list || list.length === 0) return;

                const section = document.createElement('div');
                section.className = 'picker-section';
                section.dataset.party = party;
                section.setAttribute('role', 'group');

                const headerId = 'picker-' + side + '-section-' + party;
                const header = document.createElement('div');
                header.className = 'picker-section-header';
                header.id = headerId;
                header.textContent = PARTY_LABELS[party] || formatParty(party);
                section.setAttribute('aria-labelledby', headerId);
                section.appendChild(header);

                list.forEach(function (p) {
                    const opt = document.createElement('button');
                    opt.type = 'button';
                    opt.className = 'picker-option';
                    opt.dataset.id = p.id;
                    opt.id = 'picker-' + side + '-opt-' + p.id;
                    opt.setAttribute('role', 'option');
                    opt.setAttribute('tabindex', '-1');
                    if (Array.isArray(p.ordinal) && p.ordinal.length > 1) {
                        opt.dataset.multiOrdinal = 'true';
                    }

                    const isSelected = p.id === currentId;
                    const isDisabled = p.id === disabledId;
                    opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    if (isDisabled) {
                        opt.setAttribute('aria-disabled', 'true');
                        opt.setAttribute('aria-label',
                            (p.displayName || (p.firstName + ' ' + p.lastName)) +
                            ' — already chosen on the ' + otherSide + ' side');
                    }

                    const ordinal = document.createElement('span');
                    ordinal.className = 'picker-option-ordinal';
                    ordinal.textContent = formatOrdinalShort(p.ordinal);
                    opt.appendChild(ordinal);

                    const name = document.createElement('span');
                    name.className = 'picker-option-name';
                    name.textContent = p.displayName || (p.firstName + ' ' + p.lastName);
                    opt.appendChild(name);

                    const check = document.createElement('span');
                    check.className = 'picker-option-check';
                    check.setAttribute('aria-hidden', 'true');
                    check.textContent = '✓';
                    opt.appendChild(check);

                    section.appendChild(opt);
                });

                column.appendChild(section);
            });

            frag.appendChild(column);
        });

        menu.replaceChildren(frag);

        // Keep aria-activedescendant on the listbox pointing at the
        // currently-selected option so screen readers announce the
        // right row when the menu is opened with the keyboard.
        const selectedOpt = menu.querySelector('.picker-option[aria-selected="true"]');
        if (selectedOpt) {
            menu.setAttribute('aria-activedescendant', selectedOpt.id);
        } else {
            menu.removeAttribute('aria-activedescendant');
        }
    }

    /* --------------------------------------------------------------------------
       Picker open/close + keyboard nav.

       Exactly one menu open at a time. Click-outside, Escape, and
       selecting an option all close it; closing always returns focus
       to the trigger button so keyboard users land back where they
       started.

       Keyboard model on the menu:
         - ArrowDown / ArrowUp move the "active" option (visual
           highlight + aria-activedescendant), skipping disabled rows.
         - Home / End jump to first/last enabled option.
         - Enter / Space pick the active option.
         - Escape closes.
       The listbox itself takes focus (tabindex=-1) when opened so the
       keyboard handler below sees keydown events.
       -------------------------------------------------------------------------- */
    let openSide = null;

    function getEnabledOptions(menu) {
        return Array.prototype.slice.call(
            menu.querySelectorAll('.picker-option:not([aria-disabled="true"])')
        );
    }

    function setActiveOption(menu, opt) {
        if (!opt) return;
        menu.querySelectorAll('.picker-option.is-active').forEach(function (n) {
            n.classList.remove('is-active');
        });
        opt.classList.add('is-active');
        menu.setAttribute('aria-activedescendant', opt.id);
        // Keep the active row in view without scrolling the whole page.
        if (typeof opt.scrollIntoView === 'function') {
            opt.scrollIntoView({ block: 'nearest' });
        }
    }

    function openPicker(side) {
        if (openSide && openSide !== side) closePicker(openSide, { restoreFocus: false });
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openSide = side;

        // Seed the active option to the current selection so arrow keys
        // start from the user's known anchor instead of the top.
        const selectedOpt = menu.querySelector('.picker-option[aria-selected="true"]');
        const firstEnabled = getEnabledOptions(menu)[0];
        const initial = (selectedOpt && selectedOpt.getAttribute('aria-disabled') !== 'true')
            ? selectedOpt
            : firstEnabled;
        if (initial) setActiveOption(menu, initial);

        // Defer focus by a tick — flipping `hidden` and then immediately
        // focusing in the same task can be ignored by some browsers.
        requestAnimationFrame(function () { menu.focus(); });
    }

    function closePicker(side, opts) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;
        if (menu.hidden) return;

        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (openSide === side) openSide = null;

        if (!opts || opts.restoreFocus !== false) {
            trigger.focus();
        }
    }

    function togglePicker(side) {
        const menu = document.getElementById('picker-menu-' + side);
        if (!menu) return;
        if (menu.hidden) openPicker(side);
        else closePicker(side);
    }

    function onPickerChange(side, newId) {
        if (selection[side] === newId) return;     // no-op
        if (!presidents[newId]) return;            // defensive: unknown id

        // renderSide() below detaches all bars on this side. Drop the
        // reference so toggleExpand doesn't later call collapseBar on a
        // ghost node and leak a transitionend listener.
        if (currentlyExpanded && currentlyExpanded.dataset.side === side) {
            currentlyExpanded.classList.remove('expanded');
            currentlyExpanded = null;
        }

        selection[side] = newId;
        syncSelectionToUrl();
        renderSide(side);
        renderNameBadge(side);
        renderPortrait(side);
        // Both pickers need a rebuild: this side's selected row moves,
        // and the OTHER side's disabled row moves to the new selection.
        renderPicker(side);
        renderPicker(side === 'left' ? 'right' : 'left');
        // renderSide re-fits labels once the new bars arrive — no need
        // to call applyLabelTightFit here against the now-empty column.
    }

    // Wire trigger buttons + menus once. Children inside them get
    // replaced on every renderPicker, but these top-level listeners
    // survive across re-renders.
    ['left', 'right'].forEach(function (side) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            togglePicker(side);
        });

        trigger.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker(side);
            }
        });

        // Use a click delegate on the menu so newly rendered options
        // are handled without re-binding per option.
        menu.addEventListener('click', function (e) {
            const opt = e.target.closest('.picker-option');
            if (!opt || !menu.contains(opt)) return;
            if (opt.getAttribute('aria-disabled') === 'true') return;
            onPickerChange(side, opt.dataset.id);
            closePicker(side);
        });

        menu.addEventListener('mousemove', function (e) {
            const opt = e.target.closest('.picker-option');
            if (!opt || opt.getAttribute('aria-disabled') === 'true') return;
            setActiveOption(menu, opt);
        });

        menu.addEventListener('keydown', function (e) {
            const options = getEnabledOptions(menu);
            if (options.length === 0) return;
            const active = menu.querySelector('.picker-option.is-active');
            const idx = active ? options.indexOf(active) : -1;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setActiveOption(menu, options[(idx + 1 + options.length) % options.length]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setActiveOption(menu, options[(idx - 1 + options.length) % options.length]);
                    break;
                case 'Home':
                    e.preventDefault();
                    setActiveOption(menu, options[0]);
                    break;
                case 'End':
                    e.preventDefault();
                    setActiveOption(menu, options[options.length - 1]);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (active) {
                        onPickerChange(side, active.dataset.id);
                        closePicker(side);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    closePicker(side);
                    break;
                case 'Tab':
                    closePicker(side, { restoreFocus: false });
                    break;
            }
        });
    });

    // Click anywhere outside the open picker closes it. Captured at the
    // document level since the menus float over the comparison content.
    document.addEventListener('click', function (e) {
        if (!openSide) return;
        const cell = document.querySelector('.picker-cell[data-side="' + openSide + '"]');
        if (cell && cell.contains(e.target)) return;
        closePicker(openSide, { restoreFocus: false });
    });

    // Closing on Escape from anywhere — handy when focus has drifted
    // off the menu (e.g. after a tab out). With no picker open, Escape
    // instead backs out of any pending (unconfirmed) bar rating.
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (openSide) {
            closePicker(openSide);
            return;
        }
        cancelAllPendingRatings();
    });

    // Mobile-query setup hoisted above the initial render so
    // applyLabelTightFit can read mql.matches on its very first call.
    const MOBILE_QUERY = '(max-width: 1000px)';
    const mql = window.matchMedia(MOBILE_QUERY);
    const isMobile = () => mql.matches;

    // Initial render. renderSide is async — it kicks off the per-president
    // bars fetch and renders when it resolves. Both sides fire in parallel
    // so the network requests overlap. Everything else (badges, portraits,
    // pickers) reads from the synchronous metadata index and lands on the
    // first paint. renderSide schedules its own applyLabelTightFit when
    // its bars land, so no top-level call is needed here.
    renderSide('left');
    renderSide('right');
    renderNameBadge('left');
    renderNameBadge('right');
    renderPortrait('left');
    renderPortrait('right');
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

    // Modal elements (now a native <dialog>)
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalSeverity = document.getElementById('modal-severity');
    const modalSourcesList = document.getElementById('modal-sources-list');

    /* --------------------------------------------------------------------------
       Reader severity ratings — same .bar-rating block lives in TWO
       surfaces:
         - The mobile modal sheet (singleton, hydrated on openModal)
         - Each desktop inline detail panel (one per rendered bar,
           hydrated by renderBar)

       Both surfaces share the same JS path: setupRatingUi(bar, pid, el)
       takes the .bar-rating container, fills its scale/status
       descendants, and tags the scale with data-president-id /
       data-bar-id so a single document-level click delegate can dispatch
       the POST regardless of which surface was clicked.

       Per-president averages are fetched once per side (renderSide) and
       cached for the rest of the session — they feed the "others" view's
       bar widths and the modal's average, not these rating blocks. The
       server returns every bar with at least one non-quarantined vote,
       so a missing entry simply means nobody has rated it yet.

       Failed fetches resolve to an empty map rather than throwing — a
       ratings outage shouldn't break a bar, just leave the others view
       showing empty rails.
       -------------------------------------------------------------------------- */
    const RATINGS_ENDPOINT = '/api/ratings/';
    const RATE_ENDPOINT = '/api/rate';
    const ratingsData = Object.create(null);     // pid -> { bar_id: {avg,count,sum} }
    const ratingsLoading = Object.create(null);  // pid -> Promise

    function loadRatings(pid) {
        if (ratingsData[pid]) return Promise.resolve(ratingsData[pid]);
        if (ratingsLoading[pid]) return ratingsLoading[pid];
        const p = fetch(RATINGS_ENDPOINT + encodeURIComponent(pid), {
            credentials: 'same-origin'
        })
            .then(function (r) { return r.ok ? r.json() : {}; })
            .catch(function () { return {}; })
            .then(function (data) {
                // Server returns plain object; clone into a null-proto map
                // so accidental prototype-name bar_ids ("constructor", etc.)
                // can't trip lookups. Belt-and-suspenders — bar IDs come
                // from a fixed alphabet that excludes those names.
                const safe = Object.create(null);
                if (data && typeof data === 'object') {
                    Object.keys(data).forEach(function (k) { safe[k] = data[k]; });
                }
                ratingsData[pid] = safe;
                delete ratingsLoading[pid];
                return safe;
            });
        ratingsLoading[pid] = p;
        return p;
    }

    /* --------------------------------------------------------------------------
       Per-user vote memory — localStorage, expiring after a week. The
       server tracks votes per (bar, IP-hash) for the aggregates; this is
       purely UI state so the visitor's own ratings (bar lengths in the
       default view, highlighted scale buttons, "you" markers) survive
       across visits. Device-local storage was chosen over an IP-keyed
       server lookup deliberately: it's exact (shared/rotating IPs would
       surface someone else's ratings), and it costs the server nothing
       as the audience grows.

       Entries are stored as {"v": <1-10>, "t": <epoch ms>} and expire
       VOTE_TTL_MS after their last write — getMyVote self-cleans on
       read, and the purge pass below sweeps anything not re-read. The
       pre-TTL format was a bare number; those migrate in place with a
       fresh timestamp on first read. If localStorage is unavailable
       (private mode, blocked storage), everything degrades to "no
       remembered ratings" — the server still counted the votes.
       -------------------------------------------------------------------------- */
    const VOTE_STORAGE_PREFIX = 'pbs:rating:';
    const VOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    function getMyVote(barId) {
        try {
            const key = VOTE_STORAGE_PREFIX + barId;
            const raw = localStorage.getItem(key);
            if (raw == null) return null;

            let value;
            let savedAt;
            if (raw.charAt(0) === '{') {
                const parsed = JSON.parse(raw);
                value = parseInt(parsed.v, 10);
                savedAt = typeof parsed.t === 'number' ? parsed.t : 0;
            } else {
                // Legacy bare-number entry — migrate with a fresh clock
                // so it gets a full week from today rather than dying
                // immediately for lack of a timestamp.
                value = parseInt(raw, 10);
                savedAt = Date.now();
                if (value >= 1 && value <= 10) {
                    localStorage.setItem(key, JSON.stringify({ v: value, t: savedAt }));
                }
            }

            if (!(value >= 1 && value <= 10)) return null;
            if (Date.now() - savedAt > VOTE_TTL_MS) {
                localStorage.removeItem(key);
                return null;
            }
            return value;
        } catch (_) { return null; }
    }

    function setMyVote(barId, n) {
        try {
            localStorage.setItem(
                VOTE_STORAGE_PREFIX + barId,
                JSON.stringify({ v: n, t: Date.now() })
            );
        } catch (_) { /* quota / private mode — survive silently */ }
    }

    // One sweep per page load: read every stored vote so expired entries
    // delete themselves (getMyVote handles the removal). Keys are
    // snapshotted first because removing while iterating localStorage
    // shifts the index ordering out from under localStorage.key(i).
    (function purgeExpiredVotes() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.indexOf(VOTE_STORAGE_PREFIX) === 0) keys.push(key);
            }
            keys.forEach(function (key) {
                getMyVote(key.slice(VOTE_STORAGE_PREFIX.length));
            });
        } catch (_) { /* storage unavailable — nothing to purge */ }
    })();

    // Populate an empty .bar-rating-scale with ten 1–10 buttons. Idempotent
    // — if the scale already has children, returns immediately. Called from
    // setupRatingUi so the cost is paid lazily on each container's first
    // hydration, not at module init.
    function ensureRatingButtons(scaleEl) {
        if (!scaleEl || scaleEl.firstElementChild) return;
        const frag = document.createDocumentFragment();
        for (let n = 1; n <= 10; n++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bar-rating-btn';
            btn.dataset.value = String(n);
            btn.textContent = String(n);
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');
            btn.setAttribute('aria-label', n + ' out of 10');
            frag.appendChild(btn);
        }
        scaleEl.appendChild(frag);
    }

    function setRatingStatus(containerEl, text, kind) {
        const statusEl = containerEl && containerEl.querySelector('.bar-rating-status');
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.remove('is-error', 'is-success');
        if (kind) statusEl.classList.add('is-' + kind);
    }

    function applyVoteHighlight(scaleEl, value) {
        if (!scaleEl) return;
        Array.prototype.forEach.call(scaleEl.children, function (btn) {
            const v = parseInt(btn.dataset.value, 10);
            btn.setAttribute('aria-checked', (value === v) ? 'true' : 'false');
            btn.disabled = false;
        });
    }

    // State machine — three logical states owned via classes on the
    // .bar-rating container; CSS handles the visibility transitions.
    //   'idle'       no pending selection, no thanks shown
    //   'pending'    user has tapped a number, submit button visible
    //   'submitted'  POST landed (or stored vote on re-open); thanks shown
    function setRatingState(containerEl, state) {
        if (!containerEl) return;
        containerEl.classList.remove('has-pending', 'is-submitted');
        if (state === 'pending') containerEl.classList.add('has-pending');
        else if (state === 'submitted') containerEl.classList.add('is-submitted');
    }

    function updateThanksMessage(containerEl, rating) {
        const txt = containerEl && containerEl.querySelector('.bar-rating-thanks-text');
        if (!txt) return;
        // innerHTML for the <strong> wrap around the user's number; the
        // rating is a 1–10 integer parsed by JS, never a raw user string.
        txt.innerHTML =
            'Thanks — your rating of <strong>' + rating +
            '</strong> has been recorded.';
    }

    // Wire one .bar-rating container to a (president, bar). Called from
    // openModal for the modal's block and from renderBar for each inline
    // panel's block. Idempotent — re-calling with a different bar swaps
    // the data-* tags, resets pending state, and re-renders.
    function setupRatingUi(bar, presidentId, containerEl) {
        if (!containerEl || !bar) return;
        const scaleEl = containerEl.querySelector('.bar-rating-scale');
        if (!scaleEl) return;

        ensureRatingButtons(scaleEl);
        scaleEl.dataset.presidentId = presidentId || '';
        scaleEl.dataset.barId = bar.id || '';

        setRatingStatus(containerEl, '', null);
        containerEl._pendingVote = null;

        const stored = getMyVote(bar.id);
        // Highlight the stored value on the scale so a "Change my rating"
        // toggle (or a quick state-transition glance) shows the user's
        // current pick. New voters get no highlight.
        applyVoteHighlight(scaleEl, stored);
        if (stored != null) {
            updateThanksMessage(containerEl, stored);
            setRatingState(containerEl, 'submitted');
        } else {
            setRatingState(containerEl, 'idle');
        }
    }

    function updateAverageOptimistic(presidentId, barId, oldVote, newVote) {
        const map = ratingsData[presidentId];
        if (!map) return;
        const entry = map[barId];
        // No entry means zero votes (the server returns every bar with
        // at least one) — this vote is the first, so create the entry
        // and the bar materializes in the others view immediately. If
        // the cache and localStorage disagree (oldVote exists but the
        // entry is missing — stale fetch racing a vote elsewhere), a
        // single-vote entry is still the best local guess; the next
        // page load re-fetches the truth.
        if (!entry) {
            map[barId] = { avg: newVote, count: 1, sum: newVote };
            return;
        }
        // Work off the integer running total the server sent (entry.sum)
        // instead of reconstructing it as `entry.avg * entry.count`. The
        // reconstruction is lossy — avg arrives already rounded to one
        // decimal, so a bar with avg=7.3 count=100 would have its sum
        // recomputed as 729.9999... and the displayed average would
        // drift further from the server's truth on every subsequent vote
        // until the next page-load re-fetched and snapped it back.
        //
        // Fallback for transient mismatches (new JS vs. cached pre-`sum`
        // server response, or any browser that loaded the page during a
        // deploy): seed sum from the rounded reconstruction once. Drift
        // is bounded to whatever this one vote introduces; subsequent
        // votes work off the integer sum we just stored.
        if (typeof entry.sum !== 'number') {
            entry.sum = Math.round(entry.avg * entry.count);
        }
        if (oldVote != null) {
            entry.sum = entry.sum - oldVote + newVote;
        } else {
            entry.sum = entry.sum + newVote;
            entry.count = entry.count + 1;
        }
        entry.avg = Math.round((entry.sum / entry.count) * 10) / 10;
    }

    /* --------------------------------------------------------------------------
       applyOthersRatings — stamp one side's bars with the community
       averages once they've loaded: width/number/count via
       updateBarRatingState, plus the others-view row order. Bars rank
       by average descending (mirroring the AI view's severity-sorted
       chart), zero-vote bars sink to the bottom, and ties fall back to
       the alphabetical order so the result is deterministic. The order
       is computed here — at render/ratings-load time — and deliberately
       NOT recomputed on optimistic votes, so rows don't jump around
       under the cursor as the visitor rates.
       -------------------------------------------------------------------------- */
    function applyOthersRatings(container, presidentId) {
        const map = ratingsData[presidentId] || {};
        const nodes = Array.prototype.slice.call(container.querySelectorAll('.bar'));
        nodes.forEach(updateBarRatingState);

        const label = function (node) {
            return (node._barData && node._barData.shortLabel) || '';
        };
        const ranked = nodes.slice().sort(function (a, b) {
            const ea = map[a.dataset.barId];
            const eb = map[b.dataset.barId];
            if (ea && eb && eb.avg !== ea.avg) return eb.avg - ea.avg;
            if (ea && !eb) return -1;
            if (!ea && eb) return 1;
            return label(a).localeCompare(label(b));
        });
        ranked.forEach(function (node, i) {
            node.style.setProperty('--order-others', i);
        });

        // Widths just changed if the others view is active — re-fit the
        // outer labels once the 0.55s width transition settles.
        if (viewMode === 'others') setTimeout(applyLabelTightFit, 620);

        // The modal could be sitting open on one of these bars showing
        // its em-dash placeholder; fill the number in now that we know.
        if (modal.open) renderModalSeverity();
    }

    // After a successful vote, mirror UI changes into every other
    // .bar-rating block currently displaying the same bar — the modal
    // and the bar's own inline panel can both reference the same id
    // simultaneously. Each matching container snaps to the submitted
    // state with the up-to-date thanks message and average line.
    function syncAllSurfacesForBar(presidentId, barId) {
        const scales = document.querySelectorAll(
            '.bar-rating-scale[data-bar-id="' + barId + '"]'
        );
        const stored = getMyVote(barId);
        Array.prototype.forEach.call(scales, function (scaleEl) {
            // Skip scales pointing at a different president — rare but
            // possible if two presidents reference the same id string.
            if (scaleEl.dataset.presidentId !== presidentId) return;
            const container = scaleEl.closest('.bar-rating');
            if (!container) return;
            applyVoteHighlight(scaleEl, stored);
            if (stored != null) {
                updateThanksMessage(container, stored);
                container._pendingVote = null;
                setRatingState(container, 'submitted');
            }
        });

        // The bar itself is a rating surface now too — refresh its
        // rated/unrated state, displayed number, and AI-view marker so
        // a vote cast in the detail panel or modal reshapes the bar.
        const barNodes = document.querySelectorAll('.bar[data-bar-id="' + barId + '"]');
        Array.prototype.forEach.call(barNodes, function (node) {
            if (selection[node.dataset.side] !== presidentId) return;
            updateBarRatingState(node);
        });

        // And the modal's big number, if it's open on this event.
        if (modal.open && modal.dataset.barId === barId) {
            renderModalSeverity();
        }

        // A new rating changes a bar's width in the user view, which
        // changes the outer label's available gutter. Re-fit once the
        // width transition has settled; cheap and idempotent.
        setTimeout(applyLabelTightFit, 620);
    }

    /* --------------------------------------------------------------------------
       submitVote — the one POST /rate path, shared by the detail-panel /
       modal 1–10 scales and the bar-track confirm flow. Persists to
       localStorage, nudges the cached average, and fans the new state
       out to every surface. Throws on failure (with the server's
       message when it sent one) so each caller can render the error in
       its own status slot.
       -------------------------------------------------------------------------- */
    async function submitVote(presidentId, barId, newVote) {
        const oldVote = getMyVote(barId);
        if (oldVote === newVote) {
            // Nothing to commit — just make sure every surface agrees.
            syncAllSurfacesForBar(presidentId, barId);
            return;
        }
        const res = await fetch(RATE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                president: presidentId,
                bar_id: barId,
                rating: newVote
            })
        });
        if (!res.ok) {
            let serverMsg = '';
            try {
                const body = await res.json();
                if (body && body.error) serverMsg = body.error;
            } catch (_) { /* not JSON */ }
            throw new Error(serverMsg || ('HTTP ' + res.status));
        }
        setMyVote(barId, newVote);
        updateAverageOptimistic(presidentId, barId, oldVote, newVote);
        syncAllSurfacesForBar(presidentId, barId);
    }

    /* --------------------------------------------------------------------------
       Bar-track rating — the default view's direct-manipulation flow.

       State lives on each .bar node:
         node._pendingSev        the clicked-but-unconfirmed 1–10 value
         .is-pending (class)     confirm/cancel chips + notch visible
         .is-saving  (class)     POST in flight; chips inert
         data-user-rated (attr)  a stored vote exists; the fill is a real
                                 bar again and clicks toggle the detail

       The fill's pointer handlers translate cursor X into a snapped
       severity by inverting the same --bar-base/--bar-step width
       formula CSS uses (read live from computed style so retuning the
       chart geometry never desyncs the math).
       -------------------------------------------------------------------------- */

    // Is this bar currently acting as a rating track? All three guards
    // matter: AI view shows finished bars, rated bars have graduated to
    // normal bar behavior, and mobile rates through the modal's scale.
    function railActive(node) {
        return viewMode === 'user' &&
            !node.hasAttribute('data-user-rated') &&
            !isMobile();
    }

    function severityFromPointer(node, fill, clientX) {
        const rect = fill.getBoundingClientRect();
        if (!rect.width) return null;
        // Fraction of the track between the centerline edge (0) and the
        // outer edge (1) — sides mirror, so measure from opposite ends.
        const frac = node.dataset.side === 'left'
            ? (rect.right - clientX) / rect.width
            : (clientX - rect.left) / rect.width;
        const styles = getComputedStyle(fill);
        const base = parseFloat(styles.getPropertyValue('--bar-base')) || 13.33;
        const step = parseFloat(styles.getPropertyValue('--bar-step')) || 6.67;
        const trackMax = base + 10 * step;
        const sev = Math.round((frac * trackMax - base) / step);
        return Math.min(10, Math.max(1, sev));
    }

    function setPreview(fill, sev) {
        fill.style.setProperty('--preview-sev', sev);
        const num = fill.querySelector('.rate-number');
        if (num) num.textContent = sev;
    }

    function setRateStatus(node, text, kind) {
        const el = node.querySelector('.rate-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-error');
        if (kind) el.classList.add('is-' + kind);
    }

    function setPendingRating(node, sev) {
        const fill = node.querySelector('.bar-fill');
        if (!fill) return;
        node._pendingSev = sev;
        node.classList.add('is-pending');
        fill.style.setProperty('--pending-sev', sev);
        setPreview(fill, sev);
        const confirmBtn = node.querySelector('.rate-confirm');
        if (confirmBtn) confirmBtn.textContent = 'Confirm ' + sev;
        setRateStatus(node, '', null);
        updateRailAria(node);
    }

    function cancelPendingRating(node) {
        node._pendingSev = null;
        node.classList.remove('is-pending', 'is-saving');
        const fill = node.querySelector('.bar-fill');
        if (fill) fill.classList.remove('is-previewing');
        setRateStatus(node, '', null);
        updateRailAria(node);
    }

    function cancelAllPendingRatings() {
        document.querySelectorAll('.bar.is-pending').forEach(cancelPendingRating);
    }

    async function confirmPendingRating(node) {
        const sev = node._pendingSev;
        if (!(sev >= 1 && sev <= 10)) return;
        if (node.classList.contains('is-saving')) return;
        const bar = node._barData;
        const presidentId = selection[node.dataset.side];
        if (!bar || !bar.id || !presidentId) return;

        node.classList.add('is-saving');
        try {
            await submitVote(presidentId, bar.id, sev);
            // submitVote → syncAllSurfacesForBar already flipped this
            // node to its rated state; just retire the pending UI.
            node._pendingSev = null;
            node.classList.remove('is-pending', 'is-saving');
            const fill = node.querySelector('.bar-fill');
            if (fill) fill.classList.remove('is-previewing');
            setRateStatus(node, '', null);
        } catch (err) {
            // Keep the pending state so the visitor can simply hit
            // confirm again once the hiccup passes.
            node.classList.remove('is-saving');
            const msg = err && err.message
                ? 'Couldn’t save — ' + err.message
                : 'Couldn’t save — try again in a moment.';
            setRateStatus(node, msg, 'error');
        }
    }

    function wireRatingTrack(node, fill) {
        fill.addEventListener('pointermove', function (e) {
            if (!railActive(node)) return;
            const sev = severityFromPointer(node, fill, e.clientX);
            if (sev == null) return;
            fill.classList.add('is-previewing');
            setPreview(fill, sev);
        });

        fill.addEventListener('pointerleave', function () {
            fill.classList.remove('is-previewing');
            // With a pending pick, the preview snaps back to the clicked
            // value instead of vanishing — the .is-pending CSS keeps it
            // visible at that width.
            if (node.classList.contains('is-pending') && node._pendingSev != null) {
                setPreview(fill, node._pendingSev);
            }
        });

        // Slider-style keyboard support while the fill is a rating
        // track. Enter/Space are intercepted here (preventDefault stops
        // the button's synthetic click, whose coordinates would be
        // garbage) — arrows nudge, Enter confirms, Escape backs out.
        fill.addEventListener('keydown', function (e) {
            if (!railActive(node)) return;
            const current = node._pendingSev;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowUp':
                    e.preventDefault();
                    setPendingRating(node, Math.min(10, (current == null ? 4 : current) + 1));
                    break;
                case 'ArrowLeft':
                case 'ArrowDown':
                    e.preventDefault();
                    setPendingRating(node, Math.max(1, (current == null ? 6 : current) - 1));
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (current != null) confirmPendingRating(node);
                    else setPendingRating(node, 5);
                    break;
                case 'Escape':
                    if (current != null) {
                        e.preventDefault();
                        cancelPendingRating(node);
                    }
                    break;
            }
        });
    }

    /* --------------------------------------------------------------------------
       updateBarRatingState — resolve one bar's presentation from the
       stored vote + active view. Called at render, after every vote
       (via syncAllSurfacesForBar), and for all bars on a view toggle
       or breakpoint crossing.
       -------------------------------------------------------------------------- */
    function updateBarRatingState(node) {
        const bar = node._barData;
        if (!bar) return;
        const fill = node.querySelector('.bar-fill');
        if (!fill) return;
        const vote = bar.id ? getMyVote(bar.id) : null;

        if (vote != null) {
            node.setAttribute('data-user-rated', '');
            fill.style.setProperty('--severity-user', vote);
        } else {
            node.removeAttribute('data-user-rated');
            fill.style.removeProperty('--severity-user');
        }

        // Community average for this bar, if the per-president ratings
        // fetch has landed. Mirrors the vote handling above: the entry
        // feeds --severity-others (the others-view width — fractional
        // averages are fine, the width calc() doesn't care) and
        // data-others-rated gates the rated/ghost-rail presentation the
        // same way data-user-rated does for the reader view.
        const othersMap = ratingsData[selection[node.dataset.side]];
        const others = (bar.id && othersMap) ? othersMap[bar.id] : null;
        if (others) {
            node.setAttribute('data-others-rated', '');
            fill.style.setProperty('--severity-others', others.avg);
        } else {
            node.removeAttribute('data-others-rated');
            fill.style.removeProperty('--severity-others');
        }

        // The big number at the bar's tip: the AI score in the AI view,
        // the community average in the others view, the visitor's own
        // rating in the user view (CSS hides the element entirely while
        // unrated there). toFixed(1) so an average reads as an average
        // — "7.0" says aggregate where "7" would claim a single voice.
        const num = node.querySelector('.severity-number');
        if (num) {
            num.textContent = viewMode === 'ai'
                ? bar.severity
                : viewMode === 'others'
                    ? (others ? others.avg.toFixed(1) : '')
                    : (vote != null ? vote : '');
        }

        // "n votes" tag beside the average — a 1-vote average is honest
        // data but shouldn't masquerade as consensus, so the sample size
        // stays on screen with it. Doubles as the "no ratings yet" hint
        // on zero-vote rails. CSS shows it only in the others view.
        const votesTag = node.querySelector('.others-votes');
        if (votesTag) {
            votesTag.textContent = others
                ? others.count + (others.count === 1 ? ' vote' : ' votes')
                : 'no ratings yet';
        }

        // "you · n" marker for the AI view (CSS keeps it display:none
        // outside that view / without a vote).
        const marker = node.querySelector('.user-marker');
        if (marker && vote != null) {
            marker.style.setProperty('--marker-sev', vote);
            const tag = marker.querySelector('.user-marker-tag');
            if (tag) tag.textContent = 'you · ' + vote;
        }

        updateRailAria(node);
    }

    // The fill button wears two hats: detail-panel toggle (AI view,
    // rated bars, mobile) and rating track (user view, unrated,
    // desktop). Swap its announced semantics to match. aria-labelledby
    // must be removed in track mode because it would override the
    // aria-label that carries the slider instructions.
    function updateRailAria(node) {
        const fill = node.querySelector('.bar-fill');
        const bar = node._barData;
        if (!fill || !bar) return;

        if (railActive(node)) {
            fill.removeAttribute('aria-expanded');
            fill.removeAttribute('aria-labelledby');
            const pending = node._pendingSev;
            fill.setAttribute('aria-label',
                'Rate severity for ' + bar.shortLabel + (pending != null
                    ? ' — pending ' + pending + ' of 10. Press Enter to confirm, Escape to cancel.'
                    : '. Use arrow keys to choose 1 to 10, then Enter to confirm.'));
        } else {
            fill.removeAttribute('aria-label');
            const labelOuter = node.querySelector('.bar-label-outer');
            if (labelOuter && labelOuter.id) {
                fill.setAttribute('aria-labelledby', labelOuter.id);
            }
            fill.setAttribute('aria-expanded',
                node.classList.contains('expanded') ? 'true' : 'false');
        }
    }

    // One document-level click delegate covers every .bar-rating block
    // — the modal sheet's and every inline panel's. It dispatches three
    // distinct controls based on which element the user actually hit:
    //   .bar-rating-btn      — pre-submit selection (no network)
    //   .bar-rating-submit   — commits the pending pick (POST)
    //   .bar-rating-change   — reverts a submitted block to scale-visible
    document.addEventListener('click', async function (e) {

        // --- Pre-submit number selection ----------------------------
        const numBtn = e.target.closest('.bar-rating-btn');
        if (numBtn && !numBtn.disabled) {
            const scaleEl = numBtn.closest('.bar-rating-scale');
            if (!scaleEl) return;
            const container = scaleEl.closest('.bar-rating');
            const newVote = parseInt(numBtn.dataset.value, 10);
            if (!(newVote >= 1 && newVote <= 10)) return;
            const barId = scaleEl.dataset.barId;
            if (!barId) return;

            container._pendingVote = newVote;
            applyVoteHighlight(scaleEl, newVote);
            setRatingStatus(container, '', null);

            // Only show the submit button when the pending pick differs
            // from what's already stored — re-clicking the user's prior
            // value just goes back to idle (no committable change).
            const stored = getMyVote(barId);
            setRatingState(container, newVote === stored ? 'idle' : 'pending');
            return;
        }

        // --- Submit pending pick ------------------------------------
        const submitBtn = e.target.closest('.bar-rating-submit');
        if (submitBtn && !submitBtn.disabled) {
            const container = submitBtn.closest('.bar-rating');
            if (!container) return;
            const scaleEl = container.querySelector('.bar-rating-scale');
            if (!scaleEl) return;
            const newVote = container._pendingVote;
            if (!(newVote >= 1 && newVote <= 10)) return;
            const presidentId = scaleEl.dataset.presidentId;
            const barId = scaleEl.dataset.barId;
            if (!presidentId || !barId) return;

            const oldVote = getMyVote(barId);
            // If the pending pick already matches what's stored (e.g.
            // user re-clicked their existing vote then submit, racing
            // around the idle/pending boundary), skip the POST and just
            // flip to submitted — the server would silent-success under
            // the per-(bar,IP) write cap anyway.
            if (oldVote === newVote) {
                container._pendingVote = null;
                updateThanksMessage(container, newVote);
                setRatingState(container, 'submitted');
                return;
            }

            submitBtn.disabled = true;
            const scaleButtons = scaleEl.children;
            Array.prototype.forEach.call(scaleButtons, function (b) { b.disabled = true; });
            setRatingStatus(container, '', null);

            try {
                // Shared POST path (also used by the bar-track confirm
                // flow). On success it persists the vote, nudges the
                // cached average, and calls syncAllSurfacesForBar —
                // which flips this container to 'submitted' too (it
                // matches the selector), so no local state work needed.
                await submitVote(presidentId, barId, newVote);
            } catch (err) {
                const msg = err && err.message
                    ? 'Couldn’t save — ' + err.message
                    : 'Couldn’t save — try again in a moment.';
                setRatingStatus(container, msg, 'error');
            } finally {
                submitBtn.disabled = false;
                Array.prototype.forEach.call(scaleButtons, function (b) { b.disabled = false; });
            }
            return;
        }

        // --- Revert submitted → idle so the scale is interactive again
        const changeBtn = e.target.closest('.bar-rating-change');
        if (changeBtn) {
            const container = changeBtn.closest('.bar-rating');
            if (!container) return;
            const scaleEl = container.querySelector('.bar-rating-scale');
            const stored = scaleEl ? getMyVote(scaleEl.dataset.barId) : null;
            container._pendingVote = null;
            setRatingStatus(container, '', null);
            applyVoteHighlight(scaleEl, stored);
            setRatingState(container, 'idle');
            return;
        }
    });

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
        // Confirm / cancel chips for a pending bar-track rating.
        const confirmBtn = e.target.closest('.rate-confirm');
        if (confirmBtn) {
            const pendingBar = confirmBtn.closest('.bar');
            if (pendingBar) confirmPendingRating(pendingBar);
            return;
        }
        const cancelBtn = e.target.closest('.rate-cancel');
        if (cancelBtn) {
            const pendingBar = cancelBtn.closest('.bar');
            if (pendingBar) cancelPendingRating(pendingBar);
            return;
        }

        // Event-name label — opens the detail panel in every view, and
        // is the only route to it for unrated bars in the rating view
        // (where the fill below is busy being a rating control).
        const labelBtn = e.target.closest('.bar-label-outer');
        if (labelBtn) {
            const labelBar = labelBtn.closest('.bar');
            if (!labelBar) return;
            if (isMobile()) openModal(labelBar);
            else toggleExpand(labelBar);
            return;
        }

        const fill = e.target.closest('.bar-fill');
        if (!fill) return;
        const bar = fill.closest('.bar');
        if (!bar) return;

        if (isMobile()) {
            openModal(bar);
            return;
        }

        // Default view, unrated: a click on the track parks a pending
        // rating at the clicked position. Keyboard activations arrive
        // as clicks with no usable coordinates (e.detail === 0) — the
        // fill's keydown handler owns that path and already
        // preventDefault()s, so the guard is belt-and-suspenders.
        if (railActive(bar)) {
            if (e.detail === 0) return;
            const sev = severityFromPointer(bar, fill, e.clientX);
            if (sev != null) setPendingRating(bar, sev);
            return;
        }

        toggleExpand(bar);
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
            const labelBtn = bar.querySelector('.bar-label-outer');
            if (labelBtn) labelBtn.setAttribute('aria-expanded', 'true');
            // When the fill is acting as a rating track its expanded
            // state belongs to the label button alone — strip the
            // attribute we just set rather than fork the logic above.
            updateRailAria(bar);
            if (detail) detail.removeAttribute('hidden');
            currentlyExpanded = bar;
        }
    }

    function collapseBar(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        bar.classList.remove('expanded');
        fill.setAttribute('aria-expanded', 'false');
        const labelBtn = bar.querySelector('.bar-label-outer');
        if (labelBtn) labelBtn.setAttribute('aria-expanded', 'false');
        updateRailAria(bar);

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

    // The modal's headline number, per view. data-empty drives the
    // quiet placeholder styling; the ::before eyebrow ("Your severity" /
    // "Others' average" / "AI severity") follows body[data-view] in
    // CSS, and data-votes feeds the others view's count suffix the same
    // way (CSS attr() — set here, rendered there).
    function renderModalSeverity() {
        const bar = modal._severityBar;
        if (!bar) return;
        modalSeverity.removeAttribute('data-votes');
        if (viewMode === 'ai') {
            modalSeverity.textContent = bar.severity;
            modalSeverity.removeAttribute('data-empty');
            return;
        }
        if (viewMode === 'others') {
            const map = ratingsData[modal._severityPid];
            const entry = (bar.id && map) ? map[bar.id] : null;
            if (entry) {
                modalSeverity.textContent = entry.avg.toFixed(1);
                modalSeverity.setAttribute('data-votes',
                    entry.count + (entry.count === 1 ? ' vote' : ' votes'));
                modalSeverity.removeAttribute('data-empty');
            } else {
                modalSeverity.textContent = '—';
                modalSeverity.setAttribute('data-empty', '');
            }
            return;
        }
        const vote = bar.id ? getMyVote(bar.id) : null;
        if (vote != null) {
            modalSeverity.textContent = vote;
            modalSeverity.removeAttribute('data-empty');
        } else {
            modalSeverity.textContent = '—';
            modalSeverity.setAttribute('data-empty', '');
        }
    }

    function openModal(barEl) {
        // renderBar stashes the canonical bar object on the node, so we
        // populate the modal straight from data rather than scraping it
        // back out of the inline detail DOM. Keeps the two views
        // decoupled — selectors on .detail-description / .sources-list
        // can change without silently emptying the modal.
        const bar = barEl._barData;
        if (!bar) return;

        // Drive the modal's color theme from the bar's president, not the
        // bar's side. Means the modal sheet border + severity number both
        // adopt the right party color whichever side opened it. Defensive
        // empty string clears any stale value if the lookup ever fails.
        const president = presidents[selection[barEl.dataset.side]];
        modal.dataset.party = president ? president.party : '';

        modalTitle.textContent = bar.title;
        modalDescription.textContent = bar.description;
        // The big number mirrors the active view: the AI score, the
        // community average, or the visitor's own rating (an em-dash
        // placeholder until they use the scale below — at which point
        // syncAllSurfacesForBar calls renderModalSeverity again and the
        // number fills in live). The president id rides along so the
        // others branch can find the right ratings map.
        modal.dataset.barId = bar.id || '';
        modal._severityBar = bar;
        modal._severityPid = selection[barEl.dataset.side];
        renderModalSeverity();

        modalSourcesList.replaceChildren();
        bar.sources.forEach((src) => appendSourceItem(modalSourcesList, src));

        // Hydrate the reader-rating block: button highlight + thanks
        // state from localStorage. Done after the other text populates
        // so an exception in the ratings path doesn't strand the rest
        // of the modal half-populated.
        setupRatingUi(
            bar,
            selection[barEl.dataset.side],
            modal.querySelector('.bar-rating')
        );

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

        // Wait for the slide-out to finish before actually closing the
        // dialog — otherwise it snaps to display:none mid-frame and the
        // exit animation is never seen. We listen to the sheet's own
        // `transitionend` rather than a setTimeout tied to a hard-coded
        // duration: if anyone tweaks the CSS `transition: transform 0.4s`
        // value the JS keeps working automatically, with no hidden
        // CSS↔JS coupling waiting to break.
        const sheet = modal.querySelector('.modal-sheet');

        const finalizeClose = () => {
            if (modal.open) modal.close();
            if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
                lastFocusedBeforeModal.focus();
            }
            lastFocusedBeforeModal = null;
        };

        // Defensive fallback: if the sheet element is missing for any
        // reason (markup change, etc.), close immediately rather than
        // leaving the dialog stuck open waiting for an event that will
        // never fire.
        if (!sheet) {
            finalizeClose();
            return;
        }

        // `transitionend` fires once per animated property on the sheet.
        // Filtering by `propertyName` — and by `e.target` so a bubbled
        // event from a descendant element can't trigger close — is the
        // same pattern used in `collapseBar` above. Without the filter
        // we'd finalize on whichever property happens to finish first,
        // which may not be the visible slide.
        const onEnd = (e) => {
            if (e.target !== sheet || e.propertyName !== 'transform') return;
            sheet.removeEventListener('transitionend', onEnd);
            finalizeClose();
        };
        sheet.addEventListener('transitionend', onEnd);
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
        // The bar-track rating flow is desktop-only (mobile rates in
        // the modal) — drop any half-made picks and re-resolve each
        // fill's semantics for the new breakpoint.
        cancelAllPendingRatings();
        document.querySelectorAll('.bar').forEach(updateBarRatingState);
        // Crossing the breakpoint flips outer/inner labels — clear or
        // re-apply tight-fit accordingly.
        applyLabelTightFit();
    });

    /* --------------------------------------------------------------------------
       Viewport resize — bar widths track viewport (they're %-based), so
       a label that fit at 1600px may clip at 1100px. rAF-debounced so
       drag-resize coalesces to one recompute per frame.
       -------------------------------------------------------------------------- */
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            applyLabelTightFit();
        });
    });

    /* --------------------------------------------------------------------------
       View toggle — flips body[data-view] between the reader-rating
       default, the community averages, and the AI scores. Most of the
       visual change is pure CSS (widths morph via the .bar-fill width
       transition, rails appear, markers fade in); JS re-resolves each
       bar's number text + ARIA role, refreshes the caption, and mirrors
       the mode to the URL.
       -------------------------------------------------------------------------- */
    const VIEW_CAPTIONS = {
        user: 'Every event starts unrated — hover a track, click where you’d put it, confirm to save.',
        others: 'How other readers rate these events on average — vote counts ride each bar’s tip.',
        ai: 'AI-assisted severity shown — white notches mark your own ratings.'
    };

    function updateViewToggleUi() {
        document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.dataset.mode === viewMode ? 'true' : 'false');
        });
        const caption = document.querySelector('.view-caption');
        if (caption) caption.textContent = VIEW_CAPTIONS[viewMode] || '';
    }

    function setViewMode(mode) {
        if (mode !== 'user' && mode !== 'others' && mode !== 'ai') return;
        if (viewMode === mode) return;
        // A half-made pick has no meaning in the AI view — clear before
        // the rails it lived on restyle out from under it.
        cancelAllPendingRatings();
        viewMode = mode;
        document.body.dataset.view = mode;
        updateViewToggleUi();
        document.querySelectorAll('.bar').forEach(updateBarRatingState);
        syncViewToUrl();
        // Bar widths animate between views (0.55s) — re-fit the outer
        // labels once the geometry has settled.
        setTimeout(applyLabelTightFit, 620);
    }

    document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setViewMode(btn.dataset.mode);
        });
    });
    // The static markup defaults to the user view; reconcile in case
    // ?view=ai overrode the default before render.
    updateViewToggleUi();

    /* --------------------------------------------------------------------------
       Suggestion box — posts same-origin to /api/suggest.

       The browser never sees the Discord webhook URL. Apache reverse-
       proxies /api/suggest to a local Python service that (1) appends the
       submission to a SQLite queue on disk and (2) fires the Discord
       webhook server-side using a URL held in /etc/preside-by-side/
       config.env. See preside-by-side/server/suggest.py for the service
       and apache-snippet.conf for the proxy directives.

       The honeypot field handles the casual-bot case at the browser; the
       service repeats the check server-side along with an Origin header
       check, length limits, and URL validation for the source field.
       -------------------------------------------------------------------------- */
    const SUGGEST_ENDPOINT = '/api/suggest';
    const SUGGEST_SUBMIT_COOLDOWN_MS = 4000;

    const suggestForm = document.getElementById('suggest-form');
    if (suggestForm) {
        const statusEl = suggestForm.querySelector('#suggest-status');
        const submitBtn = suggestForm.querySelector('.suggest-submit');
        const sourceInput = suggestForm.querySelector('input[name="source"]');
        const defaultSubmitLabel = submitBtn.textContent;
        const invalidSubmitLabel = 'Fix link or clear it';
        let lastSubmitAt = 0;

        function setStatus(text, kind) {
            statusEl.textContent = text;
            statusEl.classList.remove('is-error', 'is-success');
            if (kind) statusEl.classList.add('is-' + kind);
        }

        // Heuristic: value looks like a bare domain (e.g. "foo.com",
        // "www.nytimes.com/article") that's just missing the scheme.
        function looksLikeBareDomain(s) {
            return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(s);
        }

        function setSourceInvalid(invalid) {
            if (invalid) {
                sourceInput.classList.add('is-invalid');
                submitBtn.textContent = invalidSubmitLabel;
                submitBtn.disabled = true;
            } else {
                sourceInput.classList.remove('is-invalid');
                if (submitBtn.textContent === invalidSubmitLabel) {
                    submitBtn.textContent = defaultSubmitLabel;
                }
                submitBtn.disabled = false;
            }
        }

        sourceInput.addEventListener('blur', () => {
            const v = sourceInput.value.trim();
            if (!v) { setSourceInvalid(false); return; }
            if (/^https?:\/\//i.test(v)) { setSourceInvalid(false); return; }
            if (looksLikeBareDomain(v)) {
                sourceInput.value = 'https://' + v;
                setSourceInvalid(false);
                return;
            }
            setSourceInvalid(true);
        });

        // Editing after a failed blur clears the red so the user isn't
        // scolded mid-correction; blur will re-check.
        sourceInput.addEventListener('input', () => {
            if (sourceInput.classList.contains('is-invalid')) setSourceInvalid(false);
        });

        suggestForm.addEventListener('reset', () => setSourceInvalid(false));

        suggestForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (sourceInput.classList.contains('is-invalid')) return;

            const now = Date.now();
            if (now - lastSubmitAt < SUGGEST_SUBMIT_COOLDOWN_MS) return;

            const data = new FormData(suggestForm);
            // Honeypot — real users leave this empty; if filled, silently
            // accept-and-discard so bots don't learn they were caught.
            if ((data.get('website') || '').toString().trim() !== '') {
                setStatus('Sent. Thank you.', 'success');
                suggestForm.reset();
                return;
            }

            const president = (data.get('president') || '').toString().trim();
            const event = (data.get('event') || '').toString().trim();
            const source = (data.get('source') || '').toString().trim();
            const why = (data.get('why') || '').toString().trim();

            if (!president || !event) {
                setStatus('President and Event are required.', 'error');
                return;
            }

            lastSubmitAt = now;
            submitBtn.disabled = true;
            const originalLabel = submitBtn.textContent;
            submitBtn.textContent = 'Sending…';
            setStatus('', null);

            try {
                const res = await fetch(SUGGEST_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ president, event, source, why, website: '' })
                });
                if (!res.ok) {
                    // Surface the server's structured error message when present
                    // (e.g. "source must be a valid http(s) URL") so the user can
                    // self-correct instead of getting a generic "try again".
                    let serverMsg = '';
                    try {
                        const body = await res.json();
                        if (body && body.error) serverMsg = body.error;
                    } catch (_) { /* not JSON; fall through to generic */ }
                    throw new Error(serverMsg || ('HTTP ' + res.status));
                }
                setStatus('Sent. Thank you.', 'success');
                suggestForm.reset();
            } catch (err) {
                const msg = err && err.message
                    ? 'Could not send — ' + err.message
                    : 'Could not send — please try again in a moment.';
                setStatus(msg, 'error');
                lastSubmitAt = 0;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
            }
        });
    }
})();