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
 * Asking twice for one thing costs one request: a call finding that URL
 * already out joins it rather than repeating it, so surfaces never have to
 * coordinate over what they fetch. See requestJson.
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

    /* The route sends one year of reported quarters. A decade of filings is
     * a payload we did not ask for and a table nobody scrolls, so the ceiling
     * is generous rather than exact — it bounds the work, and the surface
     * shows what it was sent. */
    var MAX_REPORTS = 40;

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

    /* A string field, or '' when it is missing or is not one. The text
     * counterpart of optionalNumber below: every field on this wire is
     * allowed to be absent, and a view that had to check the type of each
     * one would check some of them. */
    function optionalText(value) {
        return typeof value === 'string' ? value : '';
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
    /* The filings panel. Both halves may be absent and neither is an error.
     *
     * `filings` is null for every fund on this page, because a fund files no
     * income statement; `measures` is null when the bars behind it are not
     * cached. Reading them as optional here rather than guarding in the view
     * keeps "absent" a shape the view can render rather than a case it has to
     * remember.
     */
    function readFundamentals(payload, symbol) {
        var envelope = readEnvelope(payload, symbol);
        var body = payload.fundamentals;
        if (!body || typeof body !== 'object') throw DataError('malformed');
        envelope.filings = readFilings(body.filings);
        envelope.measures = readMeasures(body.measures);
        envelope.reporting = readReporting(body.reporting);
        return envelope;
    }

    /* The reporting calendar. Absent for every fund on this page, like the
     * filings beside it, and absent in one more case of its own: a company
     * that has filed once has reports and no projection, because one report
     * is not a rhythm. Each part is read on its own so that a missing one
     * costs only itself. */
    function readReporting(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!Array.isArray(raw.quarters)) return null;
        return {
            last: readLastReport(raw.last),
            next: readProjection(raw.next),
            quarters: raw.quarters.slice(0, MAX_REPORTS).map(readQuarter)
        };
    }

    function readLastReport(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            end: optionalText(raw.end),
            filed: optionalText(raw.filed),
            form: optionalText(raw.form),
            lagDays: optionalNumber(raw.lag_days)
        };
    }

    function readProjection(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var earliest = optionalText(raw.earliest);
        var latest = optionalText(raw.latest);
        if (!earliest || !latest) return null;
        return {
            earliest: earliest,
            latest: latest,
            periodEnd: optionalText(raw.period_end),
            lagMin: optionalNumber(raw.lag_min),
            lagMax: optionalNumber(raw.lag_max),
            basisReports: optionalNumber(raw.basis_reports),
            cadenceDays: optionalNumber(raw.cadence_days)
        };
    }

    function readQuarter(raw) {
        if (!raw || typeof raw !== 'object') return {};
        return {
            end: optionalText(raw.end),
            filed: optionalText(raw.filed),
            form: optionalText(raw.form),
            eps: optionalNumber(raw.eps),
            dividend: optionalNumber(raw.dividend),
            epsYearAgo: optionalNumber(raw.eps_year_ago),
            epsChange: optionalNumber(raw.eps_change)
        };
    }

    function readFilings(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            entityName: typeof raw.entity_name === 'string' ? raw.entity_name : '',
            asOf: typeof raw.as_of === 'string' ? raw.as_of : '',
            filed: typeof raw.filed === 'string' ? raw.filed : '',
            form: typeof raw.form === 'string' ? raw.form : '',
            quarters: optionalNumber(raw.quarters),
            sharesOutstanding: optionalNumber(raw.shares_outstanding),
            revenue: optionalNumber(raw.revenue),
            netIncome: optionalNumber(raw.net_income),
            eps: optionalNumber(raw.eps),
            dividendsPerShare: optionalNumber(raw.dividends_per_share),
            grossMargin: optionalNumber(raw.gross_margin),
            operatingMargin: optionalNumber(raw.operating_margin),
            netMargin: optionalNumber(raw.net_margin)
        };
    }

    /* The three figures measured from the price series alone.
     *
     * Any one of them may be absent while the others are not — a benchmark
     * that never moved has no beta and no correlation, and the symbol's own
     * volatility is unaffected by that. So the window is what makes the
     * object worth having, and a payload with a window and three blanks is
     * still read rather than discarded: the panel renders each figure it has
     * and dashes the rest, which is what it does for a filing too.
     */
    function readMeasures(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var sessions = optionalNumber(raw.sessions);
        if (sessions === null) return null;
        return {
            beta: optionalNumber(raw.beta),
            volatility: optionalNumber(raw.volatility),
            correlation: optionalNumber(raw.correlation),
            sessions: sessions,
            benchmark: typeof raw.benchmark === 'string' ? raw.benchmark : ''
        };
    }

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
    function fetchJson(url) {
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

    /* The requests currently out, by URL. No prototype, so a URL can never
     * arrive at an inherited property name and read as a request. */
    var inFlight = Object.create(null);

    /* One request per URL while it is out.
     *
     * Surfaces ask the same question in the same tick far more than they look
     * like they do: on a Trade tab holding SPY, the index strip, the
     * portfolio, the equity curve and its benchmark each want
     * /history?symbol=SPY, so one page load asked for that series four times
     * (D22). The service caches, so the repeats cost no upstream quota and
     * nothing on screen was wrong — they cost four round trips on a home
     * connection where one would do, and the count grew with every surface
     * added to the tab.
     *
     * The seam is the right place for it rather than any one view, because
     * no view can see what another is asking for. It is also why this keys on
     * the URL rather than the route: the URL is what makes two asks the same
     * ask, and every route gets the guard without having to remember it.
     *
     * The *request* is shared, never the answer. An entry is dropped the
     * moment it settles, in either direction, which makes this single-flight
     * and not a cache: a settled answer is the service's to cache and it
     * already does, while one held here would go stale with nothing to expire
     * it, and a rejected one would hand its failure to every later caller —
     * the one bug this kind of memo reliably grows.
     *
     * Callers share the raw payload and each reads it separately, so every
     * surface still gets its own checked object and none of them can be
     * reached by what another does with one.
     */
    function requestJson(url) {
        if (inFlight[url]) return inFlight[url];

        var request = fetchJson(url);
        inFlight[url] = request;

        function settled() {
            if (inFlight[url] === request) delete inFlight[url];
        }
        request.then(settled, settled);
        return request;
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

    /* What a company's last filings said, plus how far the symbol moves for a
     * move in the market.
     *
     * Free upstream in both halves: the filings come from SEC EDGAR, which
     * does not ration us, and the beta is measured over bars the page has
     * already fetched. So a lookup costs the same two calls it did before
     * this panel existed.
     *
     * Two surfaces read the answer — the filings panel and the reporting
     * calendar, started in the same tick by js/view-symbol.js — so a lookup
     * would make this request twice. requestJson joins it, as it does for
     * every route.
     */
    function fundamentals(symbol) {
        if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
            return Promise.reject(DataError('invalid_symbol'));
        }
        var url = BASE + '/fundamentals?symbol=' + encodeURIComponent(symbol);
        return requestJson(url).then(function (payload) {
            return readFundamentals(payload, symbol);
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
        fundamentals: fundamentals,
        symbols: symbols,
        sectors: sectors
    };
})(typeof window !== 'undefined' ? window : this);
