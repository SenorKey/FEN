/* The order ticket.
 *
 * The game's only way to change the portfolio. It is built here rather than
 * served (DEC-072) and it decides nothing itself: what an order may be and
 * when it fills is js/portfolio-orders.js, keeping it is the store, and the
 * store is reached through window.IncisorPortfolio, which js/view-portfolio.js
 * owns because it also owns the moment orders fill. The orders it opens are
 * listed by js/view-orders.js, whose words for an order this borrows.
 *
 * What the ticket does own is saying the rule before the reader meets it. An
 * order never fills at the price shown, so the ticket names the price it
 * *will* fill at — the next open or close — and what cash it holds back until
 * then, before the button is pressed rather than in a refusal afterwards.
 *
 * One /history call for the symbol being traded, which is the call a watched
 * row costs and which the portfolio makes anyway once the order is open.
 * The catalogue behind the symbol list is local to the service and costs no
 * quota; it is still fetched only when the field is first used, since a
 * visit that never trades has no reason to ask.
 *
 * Telemetry (guide section 5): every button carries a generic data-track, so
 * no ticker, quantity or price reaches the beacon.
 *
 * Contract with the markup: a [data-ticket] block, empty until this runs.
 */

(function (global) {
    'use strict';

    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;
    var ledgerMath = global.IncisorPortfolioLedger;
    var orderMath = global.IncisorPortfolioOrders;
    var clock = global.IncisorMarketClock;
    var portfolio = global.IncisorPortfolio;
    var words = global.IncisorOpenOrders;

    var root = document.querySelector('[data-ticket]');

    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;

    /* symbol -> promise of {close, date, source}. Kept for the page load so
     * editing the quantity never asks again. A failed lookup is dropped, so
     * trying the same symbol a second time really does try again. */
    var quotes = {};
    var shown = null;

    var side = 'buy';
    var type = 'market';
    var catalogAsked = false;
    var nodes = {};

    /* ── Building ───────────────────────────────────────────────── */

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function segmented(label, name, options) {
        var field = element('div', 'inc-ticket-field');
        var caption = element('span', 'inc-ticket-label', label);
        caption.id = 'inc-ticket-' + name + '-label';
        var group = element('div', 'inc-segmented');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', caption.id);
        options.forEach(function (option, index) {
            var button = element('button', 'inc-segment', option[1]);
            button.type = 'button';
            button.setAttribute('data-ticket-' + name, option[0]);
            button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            button.setAttribute('data-track', 'order-' + name);
            group.appendChild(button);
        });
        field.appendChild(caption);
        field.appendChild(group);
        return field;
    }

    function inputField(label, name, attributes) {
        var field = element('label', 'inc-ticket-field');
        field.appendChild(element('span', 'inc-ticket-label', label));
        var input = element('input', 'inc-ticket-input');
        input.type = 'text';
        input.value = '';
        input.setAttribute('data-ticket-' + name, '');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        Object.keys(attributes).forEach(function (key) {
            input.setAttribute(key, attributes[key]);
        });
        field.appendChild(input);
        nodes[name] = input;
        return field;
    }

    function build() {
        var heading = element('h3', 'inc-section-heading', 'Place an order');
        heading.id = 'inc-ticket-heading';

        var form = element('form', 'inc-ticket-form');
        form.setAttribute('novalidate', '');
        form.setAttribute('aria-labelledby', heading.id);

        var fields = element('div', 'inc-ticket-fields');
        fields.appendChild(segmented('Side', 'side', [['buy', 'Buy'], ['sell', 'Sell']]));
        fields.appendChild(inputField('Symbol', 'symbol', {
            list: 'inc-ticket-symbols', maxlength: '10', autocapitalize: 'characters',
            placeholder: 'SPY'
        }));
        fields.appendChild(inputField('Shares', 'shares', {
            inputmode: 'numeric', maxlength: '9', placeholder: '10'
        }));
        fields.appendChild(segmented('Order type', 'type',
            [['market', 'Market'], ['limit', 'Limit']]));
        var limitField = inputField('Limit price', 'limit', {
            inputmode: 'decimal', maxlength: '12', placeholder: '0.00'
        });
        limitField.hidden = true;
        nodes.limitField = limitField;
        fields.appendChild(limitField);

        nodes.symbols = element('datalist');
        nodes.symbols.id = 'inc-ticket-symbols';
        fields.appendChild(nodes.symbols);

        var review = element('div', 'inc-ticket-review');
        nodes.quote = element('p', 'inc-ticket-quote');
        nodes.cost = element('p', 'inc-ticket-cost');
        nodes.timing = element('p', 'inc-ticket-timing');
        review.appendChild(nodes.quote);
        review.appendChild(nodes.cost);
        review.appendChild(nodes.timing);

        nodes.submit = element('button', 'inc-ticket-submit', 'Place buy order');
        nodes.submit.type = 'submit';
        nodes.submit.setAttribute('data-track', 'order-submit');

        nodes.message = element('p', 'inc-ticket-message');
        nodes.message.setAttribute('role', 'status');
        nodes.message.hidden = true;

        form.appendChild(fields);
        form.appendChild(review);
        form.appendChild(nodes.submit);
        form.appendChild(nodes.message);

        root.appendChild(heading);
        root.appendChild(form);
        nodes.form = form;
    }

    /* ── Reading the form ───────────────────────────────────────── */

    function money(cents) {
        return figures.formatMoney(cents / 100);
    }

    function typedSymbol() {
        return nodes.symbol.value.trim().toUpperCase();
    }

    /* A whole number of shares, or null. Digits only: "1e3" and "10.0" are
     * numbers to a parser and not a share count to a reader. */
    function typedShares() {
        var text = nodes.shares.value.trim();
        if (!/^\d{1,9}$/.test(text)) return null;
        var shares = Number(text);
        return shares > 0 ? shares : null;
    }

    function typedLimit() {
        var text = nodes.limit.value.trim().replace(/^\$/, '');
        if (!/^\d{1,8}(\.\d{1,4})?$/.test(text)) return null;
        var limit = Number(text);
        return limit > 0 ? limit : null;
    }

    function draft() {
        return {
            kind: side,
            symbol: typedSymbol(),
            shares: typedShares(),
            type: type,
            limit: type === 'limit' ? typedLimit() : null
        };
    }

    /* ── Saying when ────────────────────────────────────────────── */

    /* "the close, 4:00pm ET" or "the open, Monday 9:30am ET": the first price
     * an order placed now can take. */
    function nextPriceNow() {
        var next = clock.sessionAt(new Date()).next;
        if (!next) return null;
        return 'the ' + next.event + ', ' + next.when;
    }

    /* ── Rendering the ticket ───────────────────────────────────── */

    function renderControls() {
        nodes.form.querySelectorAll('[data-ticket-side]').forEach(function (button) {
            button.setAttribute('aria-pressed',
                button.getAttribute('data-ticket-side') === side ? 'true' : 'false');
        });
        nodes.form.querySelectorAll('[data-ticket-type]').forEach(function (button) {
            button.setAttribute('aria-pressed',
                button.getAttribute('data-ticket-type') === type ? 'true' : 'false');
        });
        nodes.limitField.hidden = type !== 'limit';
        nodes.submit.textContent = side === 'buy' ? 'Place buy order' : 'Place sell order';
    }

    /* The quote line follows the last symbol looked up rather than every
     * keystroke, so it never says a lookup is running when none has started. */
    function quoteText() {
        if (!shown) return 'Choose a symbol to see its last close.';
        if (shown.pending) return 'Getting the last close for ' + shown.symbol + '…';
        if (shown.error) return shown.error;
        return shown.symbol + ' last closed at ' + figures.formatMoney(shown.close) + ' on '
            + figures.formatBarDate(shown.date) + (shown.source === 'fixture'
                ? ' · sample data, not a real quote.' : ' · delayed data.');
    }

    function costText(order) {
        var ready = shown && !shown.pending && !shown.error && shown.symbol === order.symbol;
        if (!ready || !order.shares) return '';
        var store = portfolio.store();
        var free = store.available();
        if (order.kind === 'sell') {
            var holding = free.shares[order.symbol] || 0;
            var price = order.type === 'limit' && order.limit ? order.limit : shown.close;
            return (order.type === 'limit' ? 'At least ' : 'About ')
                + money(ledgerMath.amountFor(order.shares, price)) + ' before it fills. '
                + 'Free to sell: ' + holding + ' ' + order.symbol + '.';
        }
        if (order.type === 'limit' && !order.limit) return '';
        var held = orderMath.heldBackFor({ kind: 'buy', shares: order.shares, type: order.type,
            limit: order.limit, reference: shown.close });
        var lead = order.type === 'limit'
            ? 'At most ' + money(held) + ' at your limit, held back until it fills.'
            : 'About ' + money(ledgerMath.amountFor(order.shares, shown.close))
                + ' at the last close. ' + money(held) + ' is held back until it fills '
                + '— the last close plus 5%, since a market order’s price is '
                + 'not known until then.';
        return lead + ' Free to spend: ' + money(Math.max(free.cash, 0)) + '.';
    }

    function timingText() {
        var next = nextPriceNow();
        if (!next) return '';
        var text = type === 'market'
            ? 'Fills at the next price after you place it: ' + next
                + ' — not the last close shown above.'
            : 'Checked against every price from ' + next
                + ', until it fills or you cancel it.';
        if (shown && shown.source === 'fixture') {
            text += ' Sample prices never move forward, so here it will stay open.';
        }
        return text;
    }

    function renderReview() {
        var order = draft();
        nodes.quote.textContent = quoteText();
        nodes.cost.textContent = costText(order);
        nodes.cost.hidden = nodes.cost.textContent === '';
        nodes.timing.textContent = timingText();
    }

    function say(text) {
        nodes.message.textContent = text;
        nodes.message.hidden = text === '';
    }

    /* ── Looking up and placing ─────────────────────────────────── */

    function lookup(symbol) {
        if (quotes[symbol]) return quotes[symbol];
        var request = data.history(symbol).then(function (payload) {
            var quote = figures.quoteFromBars(payload.bars);
            if (!quote) throw new Error('empty');
            if (payload.source === 'fixture') portfolio.sawSample();
            return { symbol: symbol, close: quote.close, date: quote.date,
                source: payload.source };
        });
        quotes[symbol] = request;
        // Returned from the local rather than the cache: a failure can clear
        // the entry before this line is reached, and the caller still needs
        // the request that failed to hear why.
        request.then(null, function () {
            if (quotes[symbol] === request) delete quotes[symbol];
        });
        return request;
    }

    function failureText(symbol, error) {
        if (error && error.kind === 'not_found') {
            return 'No prices for ' + symbol + '. Only symbols this page has data '
                + 'for can be traded.';
        }
        return 'Prices could not be reached, so no order for ' + symbol
            + ' can be placed right now.';
    }

    function show(symbol) {
        if (!SYMBOL_PATTERN.test(symbol)) {
            shown = null;
            renderReview();
            return;
        }
        if (!shown || shown.symbol !== symbol) shown = { symbol: symbol, pending: true };
        renderReview();
        lookup(symbol).then(function (quote) {
            if (typedSymbol() !== symbol) return;
            shown = quote;
            renderReview();
        }, function (error) {
            if (typedSymbol() !== symbol) return;
            shown = { symbol: symbol, error: failureText(symbol, error) };
            renderReview();
        });
    }

    function refusalText(error, order) {
        var store = portfolio.store();
        var free = store.available();
        switch (error) {
            case 'invalid-shares':
                return 'Enter a whole number of shares, 1 or more.';
            case 'invalid-limit':
                return 'Enter a limit price above zero, like 512.50.';
            case 'insufficient-cash':
                return 'Not enough cash. This order holds back '
                    + money(orderMath.heldBackFor(order)) + ' until it fills, and '
                    + money(Math.max(free.cash, 0)) + ' is free to spend.';
            case 'insufficient-shares':
                var holding = free.shares[order.symbol] || 0;
                return holding > 0
                    ? 'You can sell up to ' + holding + ' ' + order.symbol
                        + ': what you hold, less any already on order to sell.'
                    : 'You hold no ' + order.symbol + ' to sell.';
            case 'symbol-limit':
                return 'The portfolio can hold ' + orderMath.SYMBOL_LIMIT + ' different '
                    + 'symbols at a time, counting open orders — as many as the free '
                    + 'data allowance can price. Sell or cancel one first.';
        }
        return 'That order could not be placed. Check the symbol, shares and price.';
    }

    function placedText(order) {
        var next = nextPriceNow();
        return 'Order placed: ' + words.inSentence(order) + ' ' + words.termsOf(order) + '. '
            + (order.type === 'market' ? 'It fills at ' + next + '.'
                : 'It is checked from ' + next + ', until it fills or you cancel it.');
    }

    function place() {
        var order = draft();
        if (!SYMBOL_PATTERN.test(order.symbol)) {
            say('Enter a ticker symbol, like SPY.');
            return;
        }
        if (!order.shares) {
            say(refusalText('invalid-shares'));
            return;
        }
        if (type === 'limit' && !order.limit) {
            say(refusalText('invalid-limit'));
            return;
        }

        nodes.submit.disabled = true;
        lookup(order.symbol).then(function (quote) {
            nodes.submit.disabled = false;
            order.reference = quote.close;
            order.placedAt = new Date().toISOString();
            var result = portfolio.store().place(order);
            if (result.error) {
                say(refusalText(result.error, order));
                return;
            }
            say(placedText(result.order));
            nodes.shares.value = '';
            portfolio.changed();
        }, function (error) {
            nodes.submit.disabled = false;
            say(failureText(order.symbol, error));
        });
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function fillCatalog() {
        if (catalogAsked) return;
        catalogAsked = true;
        data.symbols().then(function (catalog) {
            catalog.symbols.forEach(function (row) {
                var option = element('option');
                option.value = row.symbol;
                option.label = row.name;
                nodes.symbols.appendChild(option);
            });
        }, function () {
            // The list is a convenience: a typed ticker still works, and the
            // lookup is what says whether it has prices.
            catalogAsked = false;
        });
    }

    function onClick(event) {
        var sideButton = event.target.closest('[data-ticket-side]');
        var typeButton = event.target.closest('[data-ticket-type]');
        if (sideButton) side = sideButton.getAttribute('data-ticket-side');
        if (typeButton) type = typeButton.getAttribute('data-ticket-type');
        if (sideButton || typeButton) {
            renderControls();
            renderReview();
        }
    }

    function start() {
        // No mount, or a module missing: the panel above still says what the
        // portfolio holds, and there is nothing true to offer in its place.
        if (!root || !data || !figures || !ledgerMath || !orderMath || !clock
                || !portfolio || !words) {
            return;
        }
        if (!portfolio.store()) return;

        build();
        root.addEventListener('click', onClick);
        nodes.form.addEventListener('submit', function (event) {
            event.preventDefault();
            place();
        });
        nodes.symbol.addEventListener('focus', fillCatalog);
        nodes.symbol.addEventListener('change', function () {
            nodes.symbol.value = typedSymbol();
            show(typedSymbol());
        });
        nodes.shares.addEventListener('input', renderReview);
        nodes.limit.addEventListener('input', renderReview);

        // Free cash moves when an order opens, fills or is cancelled.
        portfolio.onChange(renderReview);
        renderControls();
        renderReview();
    }

    start();
})(typeof window !== 'undefined' ? window : this);
