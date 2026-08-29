/* A DOM small enough to run the page's views in JavaScriptCore.
 *
 * Not a browser and not pretending to be one. It implements exactly what the
 * shipped views document themselves as using, which is the point: if a view
 * starts reaching for something else, the stub fails loudly rather than the
 * view quietly going untested. tools/shoot.py covers everything this cannot —
 * layout, contrast, and whether any of it looks right.
 *
 * Shared by strip_model.jxa.js, symbol_model.jxa.js and chart_model.jxa.js.
 * Loaded with `new Function('exports', ...)` and assigns into `exports`; there
 * is no module system here and no build step to add one.
 *
 * Selector support is deliberately narrow: `[attr]`, `[attr="value"]` and
 * `.class`. Anything needing real selector matching belongs in a browser.
 */

function El(tag, attrs) {
    this.tag = tag;
    this.tagName = String(tag).toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.parent = null;
    this.textContent = '';
    this.namespace = null;
    this.hidden = false;
    this.firstChild = null;
    this.listeners = {};

    var declared = {};
    this.style = {
        setProperty: function (name, value) { declared[name] = value; },
        getPropertyValue: function (name) { return declared[name] || ''; }
    };

    var self = this;
    this.classList = {
        add: function () {
            var list = self.classes();
            Array.prototype.forEach.call(arguments, function (name) {
                if (list.indexOf(name) === -1) list.push(name);
            });
            self.attrs['class'] = list.join(' ');
        },
        remove: function () {
            var drop = Array.prototype.slice.call(arguments);
            self.attrs['class'] = self.classes().filter(function (name) {
                return drop.indexOf(name) === -1;
            }).join(' ');
        },
        contains: function (name) {
            return self.classes().indexOf(name) !== -1;
        }
    };
}

/* `className` and `id` are properties on a real element and attributes at the
 * same time, and views use both spellings. Defining them here keeps the two
 * in step instead of letting a value set one way be invisible the other. */
Object.defineProperty(El.prototype, 'className', {
    get: function () { return this.attrs['class'] || ''; },
    set: function (value) { this.attrs['class'] = String(value); }
});

Object.defineProperty(El.prototype, 'id', {
    get: function () { return this.attrs.id || ''; },
    set: function (value) { this.attrs.id = String(value); }
});

El.prototype.classes = function () {
    return (this.attrs['class'] || '').split(' ').filter(function (name) {
        return name.length > 0;
    });
};

El.prototype.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
        ? this.attrs[name] : null;
};

El.prototype.setAttribute = function (name, value) {
    this.attrs[name] = String(value);
};

El.prototype.removeAttribute = function (name) {
    delete this.attrs[name];
};

El.prototype.matches = function (selector) {
    if (selector.charAt(0) === '[') {
        var inner = selector.slice(1, -1);
        var split = inner.indexOf('=');
        if (split === -1) {
            return Object.prototype.hasOwnProperty.call(this.attrs, inner);
        }
        var name = inner.slice(0, split);
        var wanted = inner.slice(split + 1).replace(/^["']|["']$/g, '');
        return this.getAttribute(name) === wanted;
    }
    if (selector.charAt(0) === '.') {
        return this.classes().indexOf(selector.slice(1)) !== -1;
    }
    return false;
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

El.prototype.querySelector = function (selector) {
    var found = this.querySelectorAll(selector);
    return found.length ? found[0] : null;
};

El.prototype.closest = function (selector) {
    var node = this;
    while (node) {
        if (node.matches && node.matches(selector)) return node;
        node = node.parent;
    }
    return null;
};

El.prototype.contains = function (node) {
    while (node) {
        if (node === this) return true;
        node = node.parent;
    }
    return false;
};

El.prototype.appendChild = function (child) {
    child.parent = this;
    this.children.push(child);
    this.firstChild = this.children[0];
    return child;
};

El.prototype.removeChild = function (child) {
    this.children = this.children.filter(function (node) {
        return node !== child;
    });
    this.firstChild = this.children.length ? this.children[0] : null;
    return child;
};

El.prototype.addEventListener = function (type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
};

/* Dispatch, without bubbling. Every listener the views bind is on a container
 * and reads `event.target`, so a test names the target directly rather than
 * the stub simulating a walk up the tree. */
El.prototype.fire = function (type, event) {
    var fired = event || {};
    if (!fired.target) fired.target = this;
    fired.preventDefault = fired.preventDefault || function () {
        fired.defaultPrevented = true;
    };
    (this.listeners[type] || []).forEach(function (handler) {
        handler(fired);
    });
    return fired;
};

El.prototype.scrollIntoView = function () { };

/* A fixed box, so a view that reads a pointer position against the element's
 * own geometry can be driven with no layout engine. The width is the one the
 * chart's tests do their arithmetic against; nothing here has a real size. */
El.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 720, height: 240, right: 720, bottom: 240 };
};

/* A document whose querySelector searches a list of detached roots, which is
 * how a view gets handed only the part of the page it is under test for. */
function makeDocument(roots) {
    var doc = new El('#document', {});
    doc.children = roots;
    roots.forEach(function (root) { root.parent = doc; });

    return {
        querySelector: function (selector) {
            for (var index = 0; index < roots.length; index++) {
                if (roots[index].matches(selector)) return roots[index];
                var inside = roots[index].querySelector(selector);
                if (inside) return inside;
            }
            return null;
        },
        querySelectorAll: function (selector) {
            var found = [];
            roots.forEach(function (root) {
                if (root.matches(selector)) found.push(root);
                found = found.concat(root.querySelectorAll(selector));
            });
            return found;
        },
        getElementById: function (id) {
            return this.querySelector('[id="' + id + '"]');
        },
        createElement: function (tag) { return new El(tag, {}); },
        createElementNS: function (ns, tag) {
            var element = new El(tag, {});
            element.namespace = ns;
            return element;
        },
        addEventListener: function (type, handler) {
            doc.addEventListener(type, handler);
        },
        fire: function (type, event) { return doc.fire(type, event); }
    };
}

exports.El = El;
exports.makeDocument = makeDocument;
