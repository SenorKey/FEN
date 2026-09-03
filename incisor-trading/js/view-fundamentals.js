/* The fundamentals panel: what the company itself has filed.
 *
 * The only surface on this page whose numbers are not prices. They come from
 * SEC EDGAR through GET /fundamentals, which is a second upstream — public
 * domain, unrationed — so opening a company costs the dashboard nothing
 * against the twenty-five calls a day the quote provider allows.
 *
 * It owns its own request, unlike the price chart, which is handed the series
 * the quote panel already fetched. There is nothing here to hand over: the
 * lookup fetches prices and this fetches filings, and they are different
 * calls to different places. What it does take from the lookup is the last
 * price, because three of the ten figures need one.
 *
 * **The three that need a price are computed here.** Market cap, P/E and
 * dividend yield are each a filing over a price, and the price has to be the
 * one on the card above — a ratio worked out against some other price is a
 * contradiction a reader would be right to notice and unable to resolve. So
 * the server sends shares, earnings and dividends, and the division happens
 * beside the number it is divided by (js/market-figures.js).
 *
 * The explanations are page copy and live in index.html. This only toggles
 * whether they are shown, which is what keeps what the panel teaches in the
 * served document rather than in a script.
 *
 * **Four groups of three, and the grouping is the surface rather than styling
 * on it.** Against the price / What the business did / What it keeps of each
 * sale / How it has moved. Each group is its own measured surface with its own
 * hook prefix, and each render function below fills exactly one.
 *
 * The three margins are the one relationship this panel explicitly teaches --
 * the same sale with one more cost taken off each time -- and one flowing grid
 * of ten put them 819px apart across a row break at 1440 and split them again
 * at two columns, while the copy under the third said they always fall in
 * order. No ordering of a single grid keeps a trio together at four columns
 * and at two, so the grid was what had to go; the ordering tricks that look
 * like the cheap fix all break at the other column count. The groups were not
 * invented for the layout: renderValuation, renderEarned, renderMargins and
 * renderMeasures are the shape this file was already in, and only the markup
 * was flat.
 *
 * Worth knowing before anyone simplifies it: each group is grid-auto-flow:
 * column over two template rows with display: contents on the row div, so
 * labels share one row and values share the next, and a label that wraps
 * cannot push its value below its neighbours. Row flow interleaves labels and
 * values and is a worse layout than the one being fixed. The explained state
 * is the deliberate exception and goes back to blocks, because there is
 * nothing to align once each figure carries a paragraph.
 *
 * Contract with the markup: a [data-fundamental] block whose data-state is
 * one of empty / loading / ready / fund / unavailable, holding
 * [data-fundamental-figure] spans named for each figure.
 *
 * Exposes window.IncisorFundamentals for js/view-symbol.js to drive.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;

    /* The groups, in the order they are read. Listed once so that blanking
     * a stale symbol's figures is derived from the set of groups rather than
     * from a second list of names that has to be kept in step with it.
     *
     * Which groups a fund shows is not decided here — that is one rule about
     * whole groups and it lives in css/fundamentals.css beside the state it
     * keys on. */
    var GROUPS = ['valuation', 'earned', 'margin', 'measured'];

    var panel = document.querySelector('[data-fundamental]');
    var body = panel && panel.querySelector('[data-fundamental-body]');
    var explain = panel && panel.querySelector('[data-fundamental-explain]');

    /* Which symbol the panel is currently showing, so a slow answer for one
     * the reader has moved on from is dropped rather than overwriting the one
     * they are looking at. The same guard js/view-symbol.js keeps, for the
     * same reason: two lookups in quick succession resolve in whatever order
     * the network decides. */
    var showing = null;

    /* Whether the explanations are open. Kept across lookups on purpose — a
     * reader who asked what a margin is has not stopped wanting to know
     * because they opened a second company. */
    var explained = false;

    function setState(state) {
        panel.setAttribute('data-state', state);
        if (body) body.hidden = state !== 'ready' && state !== 'fund';
    }

    function say(message) {
        dom.fill(panel, '[data-fundamental-message]', message);
    }

    /* The ticker in the heading, hidden when there is not one. The chart
     * does the same and for the same reason: a head naming the last symbol
     * over a panel that no longer holds it is worse than a head naming
     * none. */
    function nameSymbol(symbol) {
        var slot = panel.querySelector('[data-fundamental-symbol]');
        if (!slot) return;
        slot.textContent = symbol || '';
        slot.hidden = !symbol;
    }

    function setFigure(group, name, value) {
        dom.fill(panel, '[data-' + group + '-figure="' + name + '"]', value);
    }

    /* Every figure slot on the panel, group by group. Derived from GROUPS
     * rather than written out, so a group added later is blanked without
     * anyone remembering to add it here.
     *
     * One query per group rather than one comma-joined selector: a joined
     * one reads better and is the thing a DOM stub is least likely to
     * support, so it would work in the browser and quietly match nothing
     * under test — which is the whole value of the test gone. */
    function figureSlots() {
        var slots = [];
        for (var index = 0; index < GROUPS.length; index++) {
            var found = panel.querySelectorAll(
                '[data-' + GROUPS[index] + '-figure]');
            for (var slot = 0; slot < found.length; slot++) {
                slots.push(found[slot]);
            }
        }
        return slots;
    }

    /* Every figure back to an em dash.
     *
     * Called before each render rather than only on failure: a fund has no
     * revenue and a company listed last month has no beta, and a panel that
     * only overwrote what it had would leave the previous symbol's numbers
     * standing under the new one's name.
     */
    function blankFigures() {
        var slots = figureSlots();
        for (var index = 0; index < slots.length; index++) {
            slots[index].textContent = figures.DASH;
        }
    }

    /* Each render function fills exactly one group, which is the seam the
     * markup was regrouped along: these three lists already existed here
     * and only the grid downstairs was flat. */
    function renderValuation(filings, price) {
        setFigure('valuation', 'market-cap', figures.formatBigMoney(
            figures.marketCap(filings.sharesOutstanding, price)));
        setFigure('valuation', 'pe', figures.formatRatio(
            figures.priceToEarnings(price, filings.eps)));
        setFigure('valuation', 'dividend-yield', figures.formatMarginPercent(
            figures.dividendYield(filings.dividendsPerShare, price)));
    }

    function renderEarned(filings) {
        setFigure('earned', 'revenue', figures.formatBigMoney(filings.revenue));
        setFigure('earned', 'eps', figures.formatPrice(filings.eps));
        setFigure('earned', 'shares',
            figures.formatVolume(filings.sharesOutstanding));
    }

    function renderMargins(filings) {
        setFigure('margin', 'gross',
            figures.formatMarginPercent(filings.grossMargin));
        setFigure('margin', 'operating',
            figures.formatMarginPercent(filings.operatingMargin));
        setFigure('margin', 'net',
            figures.formatMarginPercent(filings.netMargin));
    }

    /* What the figures cover, in words, because a trailing year is not always
     * one. A company with two quarters of filings gets a sum over two, and a
     * panel that called it a year would be stating something the filing does
     * not support — the same rule the 52-week range follows when it has less
     * than a year of bars. */
    function windowPhrase(quarters) {
        if (quarters === 4) return 'the last four reported quarters';
        if (quarters === 1) return 'one reported quarter';
        return quarters + ' reported quarters';
    }

    function filingSentence(filings) {
        var parts = ['Figures cover ' + windowPhrase(filings.quarters)];
        if (filings.asOf) {
            parts.push('ending ' + figures.formatBarDate(filings.asOf));
        }
        if (filings.form && filings.filed) {
            parts.push('as reported in a ' + filings.form + ' filed '
                + figures.formatBarDate(filings.filed));
        }
        return parts.join(', ') + '.';
    }

    /* The three figures read off one pairing of daily returns. Any of them
     * may be absent while the others are not — a benchmark that never moved
     * has no beta and no correlation, and this symbol's own volatility does
     * not depend on the benchmark at all — so each is set on its own and a
     * missing one stays an em dash. */
    function renderMeasures(measures) {
        if (!measures) return;
        setFigure('measured', 'beta', figures.formatRatio(measures.beta));
        setFigure('measured', 'volatility',
            figures.formatMarginPercent(measures.volatility));
        setFigure('measured', 'correlation',
            figures.formatRatio(measures.correlation));
    }

    /* What the price measures cover, in the same shape the filing sentence
     * takes. Every coloured or comparative figure on this page names its own
     * window — the tile says 1d, the chart says over six months — and a beta
     * is meaningless without knowing how long and against what.
     *
     * One sentence for all three because all three come off one pairing over
     * one window: stating it per figure would be three copies of the same
     * fact, and stating it of only the beta would leave the two beside it
     * covering a span nothing on the page named. */
    function measuresSentence(measures) {
        return 'Beta, volatility and correlation measured over '
            + measures.sessions + ' sessions against ' + measures.benchmark
            + '.';
    }

    /* The provenance line, worded for filings rather than for prices.
     *
     * It cannot reuse figures.provenanceFor: that sentence talks about
     * delayed closes and end-of-day bars, and none of those words are true of
     * a quarterly filing. What the two share is the honesty field — in
     * fixture mode these numbers are invented and the page has to say so.
     */
    function renderProvenance(envelope, filings, measures) {
        var line = panel.querySelector('[data-fundamental-provenance]');
        if (!line) return;

        if (!envelope) {
            line.setAttribute('data-provenance-state', 'error');
            dom.fill(line, '[data-fundamental-provenance-message]',
                'Filing data unavailable. The service could not be reached, '
                + 'so nothing here is shown.');
            return;
        }

        /* Built from what is actually on screen rather than from a fixed
         * sentence. A fund shows a beta and no filings, so a line saying
         * "invented filings" would be describing figures that are not there
         * — which is the surface claiming a provenance for nothing. */
        var state = 'live';
        var parts = [];
        if (envelope.source === 'fixture') {
            state = 'sample';
            parts.push('Sample data · invented figures, not real filings or '
                + 'quotes.');
        } else if (filings) {
            parts.push(envelope.stale
                ? 'Filings from SEC EDGAR · last refreshed some time ago.'
                : 'Filings from SEC EDGAR.');
        }
        if (filings) parts.push(filingSentence(filings));
        if (measures) parts.push(measuresSentence(measures));

        line.setAttribute('data-provenance-state', state);
        dom.fill(line, '[data-fundamental-provenance-message]',
            parts.join(' '));
    }

    function render(symbol, envelope) {
        blankFigures();
        nameSymbol(symbol);
        renderMeasures(envelope.measures);

        if (!envelope.filings) {
            // Every ETF on this page lands here, and it is the ordinary
            // answer rather than a failure. Said in fund language: a reader
            // who searched XLK has not made a mistake, and ten em dashes
            // would suggest they had.
            //
            // It leads with what is absent before showing what is present,
            // which reads backwards and is right anyway: this reader typed a
            // ticker expecting a company, so the first thing they need is why
            // the figures they came for are not here. The T11 audit looked at
            // the ordering and left it.
            setState('fund');
            say('No company files for ' + symbol + '. It is a fund rather '
                + 'than a company, so there is no revenue, no earnings and no '
                + 'margin to report — a fund holds shares in companies '
                + 'that file their own. What can be measured from its price '
                + 'is below.');
            renderProvenance(envelope, null, envelope.measures);
            return;
        }

        renderEarned(envelope.filings);
        renderMargins(envelope.filings);
        renderValuation(envelope.filings, showing && showing.price);
        setState('ready');
        say(envelope.filings.entityName || symbol);
        renderProvenance(envelope, envelope.filings, envelope.measures);
    }

    /* ── The API js/view-symbol.js drives ───────────────────────── */

    /* A symbol was looked up, and this is the price the card is showing.
     *
     * The price comes in rather than being fetched again: the panel above has
     * it, and the three ratios below have to be derived from the same one a
     * reader can see.
     */
    function show(symbol, price) {
        showing = { symbol: symbol, price: price };
        blankFigures();
        nameSymbol(symbol);
        setState('loading');
        say('Reading what ' + symbol + ' last filed…');

        data.fundamentals(symbol).then(function (envelope) {
            if (!showing || showing.symbol !== symbol) return;
            render(symbol, envelope);
        }, function () {
            if (!showing || showing.symbol !== symbol) return;
            blankFigures();
            setState('unavailable');
            // Never the upstream's words, and never a guess at whose fault it
            // was: the filings service is separate from the price service, so
            // this one being down says nothing about the card above.
            say('The filings for ' + symbol + ' could not be loaded. The '
                + 'prices above are unaffected — they come from a '
                + 'different service.');
            renderProvenance(null, null, null);
        });
    }

    function reset() {
        showing = null;
        blankFigures();
        setState('empty');
        nameSymbol(null);
        say('Look up a symbol above to see what its last filings reported.');
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function setExplained(open) {
        explained = open;
        explain.setAttribute('aria-expanded', open ? 'true' : 'false');
        // An attribute rather than a class, so the state is legible in the
        // inspector next to data-state and is one thing for CSS to key on.
        if (open) {
            panel.setAttribute('data-explained', '');
        } else {
            panel.removeAttribute('data-explained');
        }
        dom.fill(panel, '[data-fundamental-explain]',
            open ? 'Hide what these mean' : 'What do these mean?');
    }

    function start() {
        if (!panel || !body || !explain) return;
        if (!dom || !data || !figures) return;

        explain.addEventListener('click', function () {
            setExplained(!explained);
        });
        setExplained(false);

        global.IncisorFundamentals = { show: show, reset: reset };
    }

    start();
})(typeof window !== 'undefined' ? window : this);
