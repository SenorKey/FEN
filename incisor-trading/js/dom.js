/* The three DOM writes every view on this page makes.
 *
 * Small enough to look unnecessary, and here for one reason: the rule about
 * how data reaches the screen should be written down once rather than
 * re-decided in each view. Everything this page renders arrived over the
 * network, and a ticker or a company name is an attacker-influenced string
 * (guide section 5) — so text is written as text, and no view is ever left
 * choosing.
 *
 * No element creation here. A view that builds nodes already has `document`
 * in hand, and passing it around to save two lines would cost more clarity
 * than it saved.
 *
 * Exposes window.IncisorDom.
 */

(function (global) {
    'use strict';

    var DIRECTIONS = ['inc-up', 'inc-down', 'inc-flat'];

    /* Writes text into the first descendant matching `selector`.
     *
     * Text, never markup: this is the single place on the page where a value
     * from the network becomes something a reader sees, and the property that
     * would parse it as HTML is not used here or anywhere else. The page tests
     * grep the shipped source for that property by name, so it is described
     * rather than spelled out even in a comment.
     */
    function fill(root, selector, value) {
        if (!root) return null;
        var node = root.querySelector(selector);
        if (node) node.textContent = value;
        return node;
    }

    /* Marks a node as up, down or flat, clearing whichever it was before.
     *
     * Colour is never the only signal (guide section 13) — every element that
     * takes one of these classes also carries an arrow glyph and an explicit
     * sign — so this sets the colour and the caller sets the words.
     */
    function setDirection(node, way) {
        if (!node) return;
        node.classList.remove(DIRECTIONS[0], DIRECTIONS[1], DIRECTIONS[2]);
        node.classList.add('inc-' + way);
    }

    /* Removes a node's children. Used before redrawing an SVG, where leaving
     * the previous shapes underneath would silently stack one chart on the
     * next rather than replacing it. */
    function empty(node) {
        if (!node) return;
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    global.IncisorDom = {
        fill: fill,
        setDirection: setDirection,
        empty: empty
    };
})(typeof window !== 'undefined' ? window : this);
