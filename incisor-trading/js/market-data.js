/* The client's only seam to the market data service.
 *
 * Everything the page knows about prices arrives through here, the way
 * everything the server knows arrives through server/source.py. Keeping the
 * network in one small module means the view can be read without wondering
 * what it fetches, and a change of endpoint shape touches one file.
 *
 * The browser never talks to the data provider (guide section 9) — only to
 * our own service on the same origin, which Apache reverse-proxies to
 * localhost. Every path below is relative for that reason: there is no
 * configurable host, so there is nowhere for a request to be pointed at by
 * accident.
 *
 * Only one endpoint is used for the dashboard tiles, and that is deliberate.
 * A daily series already contains its own latest quote, so /history answers
 * both the price and the sparkline in one request; asking /quote as well
 * would double the upstream calls to learn something we had already been
 * told. The free tier allows 25 a day.
 *
 * Responses are treated as untrusted (guide section 5). The shape is checked
 * before anything is handed back, so a malformed payload fails here rather
 * than turning into NaN four layers away. Failures reject with a short `kind`
 * and never with upstream prose: the service does not send any, and this
 * module would not display it if it did.
 *
 * Exposes window.IncisorMarketData.
 */

(function (global) {
    'use strict';

    var BASE = '/api/incisor';

    /* Long enough for a cold cache on a home connection, short enough that a
     * hung request becomes a designed "unavailable" state rather than a
     * spinner nobody ever sees the end of. */
    var TIMEOUT_MS = 8000;

    /* A day's trading is a few hundred bars; five years is a bit over 1250.
     * Anything past this is not a series we asked for, and walking it would
     * cost more than refusing it. */
    var MAX_BARS = 4000;

    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;

    /* The catalogue is a committed table, not a feed. Anything an order of
     * magnitude past its size is not the table we asked for. */
    var MAX_SYMBOLS = 5000;

    /* Eleven funds, and no route that can grow the set — a caller cannot ask
     * for more. Anything past this is not the grid we asked for. */
    var MAX_SECTORS = 32;

    /* The window names the grid offers: 1M, 3M, 1Y, or YTD. Whitelisted
     * because each one becomes a data attribute and a lookup key. */
    var WINDOW_PATTERN = /^(?:\d{1,2}[DMY]|YTD)$/;

    function DataError(kind) {
        var error = new Error('market data ' + kind);
        error.kind = kind;
        return error;
    }

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function optionalNumber(value) {
        return isFiniteNumber(value) ? value : null;
    }

    /* ── Shape checks ───────────────────────────────────────────── */

    function readBar(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (typeof raw.date !== 'string') return null;
        if (!isFiniteNumber(raw.close)) return null;
        return {
            date: raw.date,
            open: isFiniteNumber(raw.open) ? raw.open : null,
            high: isFiniteNumber(raw.high) ? raw.high : null,
            low: isFiniteNumber(raw.low) ? raw.low : null,
            close: raw.close,
            volume: isFiniteNumber(raw.volume) ? raw.volume : null
        };
    }

    /* The fields every read route wraps its answer in. `source` and `stale`
     * are the honesty fields — without them the page cannot say whether it is
     * showing a quote, yesterday's close, or an invented number — so a payload
     * missing them is treated as malformed rather than rendered unlabelled. */
    function readCommonEnvelope(payload) {
        if (!payload || typeof payload !== 'object') throw DataError('malformed');
        if (typeof payload.source !== 'string') throw DataError('malformed');
        return {
            source: payload.source,
            delay: typeof payload.delay === 'string' ? payload.delay : '',
            stale: payload.stale === true,
            fetchedAt: typeof payload.fetched_at === 'string' ? payload.fetched_at : ''
        };
    }

    /* The same envelope, for the routes that answer about one symbol. The
     * sector grid is the one that does not — it answers for a fixed set of
     * eleven — so the symbol check lives here rather than in the shared part. */
    function readEnvelope(payload, symbol) {
        var envelope = readCommonEnvelope(payload);
        if (payload.symbol !== symbol) throw DataError('malformed');
        envelope.symbol = symbol;
        return envelope;
    }

    function readHistory(payload, symbol) {
        var envelope = readEnvelope(payload, symbol);

        var series = payload.history;
        if (!series || typeof series !== 'object') throw DataError('malformed');
        if (!Array.isArray(series.bars)) throw DataError('malformed');
        if (series.bars.length === 0 || series.bars.length > MAX_BARS) {
            throw DataError('malformed');
        }

        var bars = [];
        for (var index = 0; index < series.bars.length; index++) {
            var bar = readBar(series.bars[index]);
            if (!bar) throw DataError('malformed');
            bars.push(bar);
        }

        envelope.bars = bars;
        return envelope;
    }

    /* A snapshot: the day's open, high, low and volume, which the daily
     * series does not carry for the session still in progress.
     *
     * `price` is the only field required to be a number. Everything else is
     * kept when it reads as one and nulled when it does not, because a panel
     * that can render an em dash for a missing figure is a better answer than
     * refusing the whole quote over a volume upstream left out.
     */
    function readQuote(payload, symbol) {
        var envelope = readEnvelope(payload, symbol);

        var quote = payload.quote;
        if (!quote || typeof quote !== 'object') throw DataError('malformed');
        if (!isFiniteNumber(quote.price)) throw DataError('malformed');

        envelope.quote = {
            price: quote.price,
            open: optionalNumber(quote.open),
            high: optionalNumber(quote.high),
            low: optionalNumber(quote.low),
            previousClose: optionalNumber(quote.previous_close),
            change: optionalNumber(quote.change),
            changePercent: optionalNumber(quote.change_percent),
            volume: optionalNumber(quote.volume),
            tradingDay: typeof quote.latest_trading_day === 'string'
                ? quote.latest_trading_day : ''
        };
        return envelope;
    }

    /* The searchable name table. Every row is checked, and a row that fails
     * is dropped rather than failing the listing: a catalogue is a
     * convenience, and losing one bad name should not cost the search box. */
    function readCatalog(payload) {
        if (!payload || typeof payload !== 'object') throw DataError('malformed');
        if (!Array.isArray(payload.symbols)) throw DataError('malformed');
        if (payload.symbols.length > MAX_SYMBOLS) throw DataError('malformed');

        var listed = [];
        payload.symbols.forEach(function (row) {
            if (!row || typeof row !== 'object') return;
            if (typeof row.symbol !== 'string' || !SYMBOL_PATTERN.test(row.symbol)) {
                return;
            }
            if (typeof row.name !== 'string' || !row.name) return;
            listed.push({
                symbol: row.symbol,
                name: row.name,
                kind: row.kind === 'etf' ? 'etf' : 'stock',
                tracks: typeof row.tracks === 'string' ? row.tracks : null
            });
        });

        return {
            symbols: listed,
            // False unless the service positively says otherwise: assuming a
            // list is complete when it is not would have the page refuse a
            // ticker it could have answered for.
            exhaustive: payload.exhaustive === true
        };
    }

    /* The sector grid: eleven funds, four windows, one shared date.
     *
     * The only response on this page that carries figures rather than bars.
     * Eleven daily series is a third of a megabyte to answer a question that
     * needs forty-four numbers, so the service computes and this checks the
     * shape of what it computed — which is a smaller job than readHistory's
     * and a stricter one, because there is no series here to fall back on.
     *
     * A row that fails its check is dropped rather than failing the grid, the
     * way a bad catalogue row is: ten sectors and a stated absence is a better
     * answer than none. `asOf` is required, because it is the date every
     * figure is measured to and a ranking with no date is a claim about now
     * that nobody checked.
     */
    function readSectors(payload) {
        var envelope = readCommonEnvelope(payload);

        var grid = payload.sectors;
        if (!grid || typeof grid !== 'object') throw DataError('malformed');
        if (!Array.isArray(grid.sectors) || !Array.isArray(grid.windows)) {
            throw DataError('malformed');
        }
        if (grid.sectors.length > MAX_SECTORS) throw DataError('malformed');

        var windows = grid.windows.filter(function (window) {
            return typeof window === 'string' && WINDOW_PATTERN.test(window);
        });
        if (windows.length === 0) throw DataError('malformed');

        envelope.asOf = typeof grid.as_of === 'string' ? grid.as_of : '';
        envelope.windows = windows;
        envelope.windowLabels = readWindowLabels(grid.window_labels, windows);
        envelope.rows = grid.sectors.map(readSectorRow).filter(Boolean);
        return envelope;
    }

    function readWindowLabels(raw, windows) {
        var labels = {};
        windows.forEach(function (window) {
            var label = raw && typeof raw === 'object' ? raw[window] : null;
            labels[window] = typeof label === 'string' && label ? label : window;
        });
        return labels;
    }

    function readSectorRow(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (typeof raw.symbol !== 'string' || !SYMBOL_PATTERN.test(raw.symbol)) {
            return null;
        }
        if (typeof raw.name !== 'string' || !raw.name) return null;

        var changes = {};
        var supplied = raw.changes && typeof raw.changes === 'object'
            ? raw.changes : {};
        Object.keys(supplied).forEach(function (window) {
            if (WINDOW_PATTERN.test(window)) {
                changes[window] = optionalNumber(supplied[window]);
            }
        });

        return {
            symbol: raw.symbol,
            name: raw.name,
            available: raw.available === true,
            lastClose: optionalNumber(raw.last_close),
            changes: changes
        };
    }

    /* ── Requests ───────────────────────────────────────────────── */

    /* AbortController has been in every shipping browser for years, but a
     * missing one should cost the timeout, not the feature. */
    function withTimeout(url) {
        if (typeof AbortController !== 'function') {
            return { promise: global.fetch(url, { credentials: 'omit' }), done: null };
        }
        var controller = new AbortController();
        var timer = global.setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
        return {
            promise: global.fetch(url, {
                credentials: 'omit',
                signal: controller.signal
            }),
            done: function () { global.clearTimeout(timer); }
        };
    }

    /* Which kind of failure a 404 is. Always rejects; the only question is
     * whether the symbol is missing or the service is. */
    function notFound(response) {
        return response.json().then(function (payload) {
            throw DataError(payload && payload.error === 'symbol_not_found'
                ? 'not_found' : 'http');
        }, function () {
            // A body we could not even parse did not come from our service.
            throw DataError('http');
        });
    }

    /* Any failure to reach the service is one outcome for the page — it has
     * nothing to show — so an abort, a DNS failure and a 503 all arrive here
     * as a rejection with a kind, and the view decides how to say it. */
    function requestJson(url) {
        var attempt = withTimeout(url);
        return attempt.promise.then(function (response) {
            if (attempt.done) attempt.done();
            // A 404 carrying our own service's not-found is the one failure
            // that is about the symbol rather than about us, and the panel
            // says something quite different for it. Any other 404 came from
            // something else in the path — a misconfigured proxy, or a static
            // server standing in for a service that is not running — and
            // reporting that as "no such ticker" would be a confident lie
            // about someone else's failure.
            if (response.status === 404) return notFound(response);
            if (!response.ok) throw DataError('http');
            return response.json().then(null, function () {
                throw DataError('malformed');
            });
        }, function (error) {
            if (attempt.done) attempt.done();
            if (error && error.kind) throw error;
            throw DataError(error && error.name === 'AbortError' ? 'timeout' : 'offline');
        });
    }

    /* Daily bars for one symbol, oldest first.
     *
     * The symbol is checked against the same whitelist the service applies,
     * so a bad one never becomes a request at all. It reaches the URL through
     * encodeURIComponent regardless — belt and braces on the one string here
     * that could ever be attacker-influenced. */
    function history(symbol) {
        if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
            return Promise.reject(DataError('invalid_symbol'));
        }
        var url = BASE + '/history?symbol=' + encodeURIComponent(symbol);
        return requestJson(url).then(function (payload) {
            return readHistory(payload, symbol);
        });
    }

    /* The latest snapshot for one symbol.
     *
     * Costs an upstream call that /history does not, so it is asked for only
     * where the extra fields are the point — the quote panel's day range and
     * volume. The tiles deliberately do not use it (see the note above).
     */
    function quote(symbol) {
        if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
            return Promise.reject(DataError('invalid_symbol'));
        }
        var url = BASE + '/quote?symbol=' + encodeURIComponent(symbol);
        return requestJson(url).then(function (payload) {
            return readQuote(payload, symbol);
        });
    }

    /* The names the page can search by. Local to the service — it reads a
     * committed table and never goes upstream — so it costs no quota and is
     * fetched once per page load. */
    function symbols() {
        return requestJson(BASE + '/symbols').then(readCatalog);
    }

    /* The sector grid. Takes no arguments: the eleven funds are fixed and
     * every window comes back at once, so switching between them on the page
     * costs no request at all — the same bargain the price chart strikes with
     * one series and five ranges. */
    function sectors() {
        return requestJson(BASE + '/sectors').then(readSectors);
    }

    global.IncisorMarketData = {
        BASE: BASE,
        TIMEOUT_MS: TIMEOUT_MS,
        history: history,
        quote: quote,
        symbols: symbols,
        sectors: sectors
    };
})(typeof window !== 'undefined' ? window : this);
