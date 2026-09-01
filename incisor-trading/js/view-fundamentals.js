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

    function setFigure(name, value) {
        dom.fill(panel, '[data-fundamental-figure="' + name + '"]', value);
    }

    /* Every figure back to an em dash.
     *
     * Called before each render rather than only on failure: a fund has no
     * revenue and a company listed last month has no beta, and a panel that
     * only overwrote what it had would leave the previous symbol's numbers
     * standing under the new one's name.
     */
    function blankFigures() {
        var slots = panel.querySelectorAll('[data-fundamental-figure]');
        for (var index = 0; index < slots.length; index++) {
            slots[index].textContent = figures.DASH;
        }
    }

    function renderPriceDerived(filings, price) {
        setFigure('market-cap', figures.formatBigMoney(
            figures.marketCap(filings.sharesOutstanding, price)));
        setFigure('pe', figures.formatRatio(
            figures.priceToEarnings(price, filings.eps)));
        setFigure('dividend-yield', figures.formatMarginPercent(
            figures.dividendYield(filings.dividendsPerShare, price)));
    }

    function renderFilings(filings) {
        setFigure('eps', figures.formatPrice(filings.eps));
        setFigure('shares', figures.formatVolume(filings.sharesOutstanding));
        setFigure('revenue', figures.formatBigMoney(filings.revenue));
        setFigure('gross-margin',
            figures.formatMarginPercent(filings.grossMargin));
        setFigure('operating-margin',
            figures.formatMarginPercent(filings.operatingMargin));
        setFigure('net-margin', figures.formatMarginPercent(filings.netMargin));
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

    function renderBeta(beta) {
        if (!beta) return;
        setFigure('beta', figures.formatRatio(beta.value));
    }

    /* What the beta covers, in the same shape the filing sentence takes.
     * Every coloured or comparative figure on this page names its own window
     * — the tile says 1d, the chart says over six months — and a beta is
     * meaningless without knowing how long and against what. */
    function betaSentence(beta) {
        return 'Beta measured over ' + beta.sessions + ' sessions against '
            + beta.benchmark + '.';
    }

    /* The provenance line, worded for filings rather than for prices.
     *
     * It cannot reuse figures.provenanceFor: that sentence talks about
     * delayed closes and end-of-day bars, and none of those words are true of
     * a quarterly filing. What the two share is the honesty field — in
     * fixture mode these numbers are invented and the page has to say so.
     */
    function renderProvenance(envelope, filings, beta) {
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
        if (beta) parts.push(betaSentence(beta));

        line.setAttribute('data-provenance-state', state);
        dom.fill(line, '[data-fundamental-provenance-message]',
            parts.join(' '));
    }

    function render(symbol, envelope) {
        blankFigures();
        nameSymbol(symbol);
        renderBeta(envelope.beta);

        if (!envelope.filings) {
            // Every ETF on this page lands here, and it is the ordinary
            // answer rather than a failure. Said in fund language: a reader
            // who searched XLK has not made a mistake, and ten em dashes
            // would suggest they had.
            setState('fund');
            say('No company files for ' + symbol + '. It is a fund rather '
                + 'than a company, so there is no revenue, no earnings and no '
                + 'margin to report — a fund holds shares in companies '
                + 'that file their own. What can be measured from its price '
                + 'is below.');
            renderProvenance(envelope, null, envelope.beta);
            return;
        }

        renderFilings(envelope.filings);
        renderPriceDerived(envelope.filings, showing && showing.price);
        setState('ready');
        say(envelope.filings.entityName || symbol);
        renderProvenance(envelope, envelope.filings, envelope.beta);
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
