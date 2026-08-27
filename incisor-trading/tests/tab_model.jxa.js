/* Exercises the real incisor.js tab controller outside a browser.
 *
 * A scheduled session cannot start the dev server, so the keyboard model —
 * which is an acceptance criterion, not a nicety — would otherwise ship
 * unverified. JavaScriptCore is on every Mac via osascript, so the module runs
 * here against a DOM stub built from the real index.html.
 *
 * The stub implements only what incisor.js documents itself as using. If the
 * module starts reaching for more of the DOM this fails loudly rather than
 * quietly passing, which is the intent.
 *
 * Run by test_tab_behaviour.py. Arguments: <page-dir> <dom-spec-json>
 */

function run(argv) {
    'use strict';
    ObjC.import('Foundation');

    function read(path) {
        return $.NSString.stringWithContentsOfFileEncodingError(
            path, $.NSUTF8StringEncoding, null).js;
    }

    var pageDir = argv[0];
    var spec = JSON.parse(read(argv[1]));
    var source = read(pageDir + '/incisor.js');

    var results = [];
    var failed = 0;

    function check(name, condition, detail) {
        results.push({ test: name, pass: !!condition, detail: detail || '' });
        if (!condition) failed++;
    }

    /* ── Minimal DOM ────────────────────────────────────────────── */

    var byId = {};
    var focusLog = [];

    function El(tag, attrs) {
        this.tag = tag;
        this.attrs = attrs || {};
        this.hidden = false;
        this.children = [];
        this.parent = null;
        this.listeners = {};
    }

    El.prototype.getAttribute = function (name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name)
            ? this.attrs[name] : null;
    };
    El.prototype.setAttribute = function (name, value) {
        this.attrs[name] = String(value);
    };
    El.prototype.focus = function () { focusLog.push(this.attrs.id); };
    El.prototype.addEventListener = function (type, handler) {
        (this.listeners[type] = this.listeners[type] || []).push(handler);
    };
    El.prototype.matches = function (selector) {
        return selector === '[role="tab"]' && this.attrs.role === 'tab';
    };
    El.prototype.closest = function (selector) {
        var node = this;
        while (node) {
            if (node.matches(selector)) return node;
            node = node.parent;
        }
        return null;
    };
    El.prototype.querySelectorAll = function (selector) {
        var found = [];
        (function walk(node) {
            node.children.forEach(function (child) {
                if (child.matches(selector)) found.push(child);
                walk(child);
            });
        })(this);
        return found;
    };
    El.prototype.dispatch = function (type, event) {
        event.target = event.target || this;
        event.defaultPrevented = false;
        event.preventDefault = function () { event.defaultPrevented = true; };
        (this.listeners[type] || []).forEach(function (handler) { handler(event); });
        return event;
    };

    var tablist = new El('div', { 'class': 'inc-tablist', role: 'tablist' });

    spec.tabs.forEach(function (tab) {
        var element = new El('button', {
            id: tab.id,
            role: 'tab',
            'aria-controls': tab.controls,
            'aria-selected': tab.selected,
            tabindex: tab.tabindex
        });
        element.parent = tablist;
        tablist.children.push(element);
        byId[tab.id] = element;
    });

    spec.panels.forEach(function (panel) {
        var element = new El('section', { id: panel.id, role: 'tabpanel' });
        element.hidden = panel.hidden;
        byId[panel.id] = element;
    });

    var documentStub = {
        querySelector: function (selector) {
            return selector === '.inc-tablist' ? tablist : null;
        },
        getElementById: function (id) { return byId[id] || null; }
    };

    /* ── Load the module under test ─────────────────────────────── */

    /* The module is handed its `document` as an explicit parameter rather than
     * eval'd against this scope: JavaScriptCore's strict-mode eval does not
     * expose the surrounding variables, and being explicit documents the only
     * global incisor.js actually depends on. */
    /* The shell also starts the market clock, which needs a window. Neither
     * the clock module nor a [data-clock] element exists in this stub, so the
     * clock bows out on its own — which is itself worth proving: the tab
     * controller must not depend on the clock having loaded. */
    var windowStub = { setInterval: function () { return 0; } };

    try {
        (new Function('document', 'window', source))(documentStub, windowStub);
        check('incisor.js parses and runs', true);
    } catch (error) {
        check('incisor.js parses and runs', false, String(error));
        return JSON.stringify({ failed: failed, total: results.length, results: results });
    }

    /* ── Assertions ─────────────────────────────────────────────── */

    var tabIds = spec.tabs.map(function (tab) { return tab.id; });

    function snapshot() {
        return tabIds.map(function (id) {
            var tab = byId[id];
            var panel = byId[tab.getAttribute('aria-controls')];
            return {
                id: id,
                selected: tab.getAttribute('aria-selected'),
                tabindex: tab.getAttribute('tabindex'),
                hidden: panel.hidden
            };
        });
    }

    function expectOnly(wanted, label) {
        var problems = [];
        snapshot().forEach(function (row) {
            var shouldBeActive = row.id === wanted;
            if ((row.selected === 'true') !== shouldBeActive) {
                problems.push(row.id + ' aria-selected=' + row.selected);
            }
            if (row.tabindex !== (shouldBeActive ? '0' : '-1')) {
                problems.push(row.id + ' tabindex=' + row.tabindex);
            }
            if (row.hidden === shouldBeActive) {
                problems.push(row.id + ' panel hidden=' + row.hidden);
            }
        });
        check(label, problems.length === 0, problems.join('; '));
    }

    function press(fromId, key) {
        return tablist.dispatch('keydown', { key: key, target: byId[fromId] });
    }

    expectOnly('tab-dashboard', 'initial state: only the first tab is selected and shown');

    tablist.dispatch('click', { target: byId['tab-trade'] });
    expectOnly('tab-trade', 'clicking a tab selects it and hides the other panels');

    focusLog = [];
    press('tab-trade', 'ArrowRight');
    expectOnly('tab-learn', 'ArrowRight advances to the next tab');
    check('ArrowRight moves focus with the selection',
        focusLog[focusLog.length - 1] === 'tab-learn',
        'focus log: ' + JSON.stringify(focusLog));

    press('tab-learn', 'ArrowRight');
    expectOnly('tab-dashboard', 'ArrowRight wraps from the last tab to the first');

    press('tab-dashboard', 'ArrowLeft');
    expectOnly('tab-learn', 'ArrowLeft wraps from the first tab to the last');

    press('tab-learn', 'Home');
    expectOnly('tab-dashboard', 'Home jumps to the first tab');

    press('tab-dashboard', 'End');
    expectOnly('tab-learn', 'End jumps to the last tab');

    check('a handled key calls preventDefault',
        press('tab-learn', 'ArrowLeft').defaultPrevented === true);

    var tabKey = press('tab-trade', 'Tab');
    check('Tab keeps its native behaviour', tabKey.defaultPrevented === false);
    expectOnly('tab-trade', 'a key the controller ignores changes nothing');

    check('a keydown from outside the tab strip is ignored',
        tablist.dispatch('keydown', { key: 'ArrowRight', target: tablist })
            .defaultPrevented === false);

    check('exactly one panel is visible at any time',
        snapshot().filter(function (row) { return !row.hidden; }).length === 1);

    return JSON.stringify({ failed: failed, total: results.length, results: results });
}
