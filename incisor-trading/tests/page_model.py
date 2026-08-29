"""Parses index.html into a plain list of elements the tests can assert over.

There is no HTML parser dependency to add here — html.parser is stdlib, and the
page is small enough that a flat element list with a depth on each entry answers
every question the tests ask. Anything needing real selector matching belongs in
the browser, not here.
"""

import os
from html.parser import HTMLParser

PAGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Elements the spec says never take a closing tag; tracking them separately is
# what lets the parser detect genuinely unbalanced markup.
VOID_ELEMENTS = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
}


def read(name):
    with open(os.path.join(PAGE_DIR, name), encoding='utf-8') as handle:
        return handle.read()


class _Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.open_tags = []
        self.mismatched = []

    def handle_starttag(self, tag, attrs):
        self.elements.append({
            'tag': tag,
            'attrs': dict(attrs),
            'depth': len(self.open_tags),
            'line': self.getpos()[0],
        })
        if tag not in VOID_ELEMENTS:
            self.open_tags.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID_ELEMENTS:
            return
        if self.open_tags and self.open_tags[-1][0] == tag:
            self.open_tags.pop()
            return
        self.mismatched.append((tag, self.getpos()[0]))
        for index in range(len(self.open_tags) - 1, -1, -1):
            if self.open_tags[index][0] == tag:
                del self.open_tags[index:]
                return


class Page:
    """The parsed page, with the few lookups the tests actually need."""

    def __init__(self, source):
        collector = _Collector()
        collector.feed(source)
        self.source = source
        self.elements = collector.elements
        self.unclosed = collector.open_tags
        self.mismatched = collector.mismatched
        self.by_id = {
            element['attrs']['id']: element
            for element in self.elements if element['attrs'].get('id')
        }

    def with_role(self, role):
        return [e for e in self.elements if e['attrs'].get('role') == role]

    def with_tag(self, tag):
        return [e for e in self.elements if e['tag'] == tag]

    def descendants(self, element):
        """Elements nested inside `element`, by depth in document order."""
        start = self.elements.index(element)
        out = []
        for candidate in self.elements[start + 1:]:
            if candidate['depth'] <= element['depth']:
                break
            out.append(candidate)
        return out

    def ancestors(self, element):
        """Ancestor elements, nearest first, by walking back to shallower depths."""
        start = self.elements.index(element)
        depth = element['depth']
        out = []
        for candidate in reversed(self.elements[:start]):
            if candidate['depth'] < depth:
                out.append(candidate)
                depth = candidate['depth']
                if depth == 0:
                    break
        return out

    def is_inside(self, element, tag):
        return any(a['tag'] == tag for a in self.ancestors(element))

    def surfaces(self, least_hooks=3):
        """(attribute, line span) for every block that owns a set of hooks.

        A surface on this page is an element carrying a `data-x` attribute
        with `data-x-*` hooks inside it — that pairing is the contract each
        view module documents at the top of its file. Deriving the list from
        that shape rather than writing it out is what keeps a rule about
        surfaces covering the next surface somebody adds.

        The span is measured to the last element inside, which is a line or
        two short of the closing tag. Close enough for a rule about whether a
        block can be read in one go, and it never overstates.
        """
        found = []
        for element in self.elements:
            for name in element['attrs']:
                if not name.startswith('data-'):
                    continue
                inside = self.descendants(element)
                hooks = [child for child in inside
                         if any(hook.startswith(name + '-')
                                for hook in child['attrs'])]
                if len(hooks) < least_hooks:
                    continue
                found.append((name, inside[-1]['line'] - element['line']))
        return found


def classes(element):
    return set((element['attrs'].get('class') or '').split())
