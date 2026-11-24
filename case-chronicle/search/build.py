"""Build the Case Chronicle search files.

    python3 case-chronicle/search/build.py

Run it after any change to a case's pages, and commit what it writes,
or the search on the live site keeps finding the old wording. It reads
every case's five pages and writes, beside this file:

    index.json      one line per case: its folder, name and a fingerprint
    <case>.json     every searchable passage on that case's five pages

The hub searches every case file; a case page searches its own. A view
page does not use these files at all: search.js reads the page it is
on. The Restricted Section is left out on purpose, so the hub's search
cannot give its door away.

A passage is one card: a chronology entry, a flow card, a question in
the Argument View, a person in the courtroom, a glossary term, and so on. Text
that is in no card belongs to the nearest thing above it with an id.
Each passage keeps a key that search.js can find again on the page:
the card's id, or for a card with none, its class and its place among
the cards of that class ("cf-card:3"). The rules for both live in
search.js as well, under "Shared with build.py"; change them together.

The views repeat their case page's masthead, party cards, Notes and
glossary word for word, so those are read from the case page only.
Otherwise one word in the glossary would come back five times.

Standard library only, so it runs anywhere Python 3 does.
"""

import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHRONICLE = HERE.parent
ROOT_URL = '/case-chronicle/'

# The order a case's pages are listed in, with the names search.js shows.
VIEWS = [
    ('', 'Case page'),
    ('flow/', 'TLDR View'),
    ('chronology/', 'Chronological View'),
    ('argument/', 'Argument View'),
    ('courtroom/', 'Courtroom View'),
]

# ── Shared with search.js: keep the two in step ──
UNITS = ['tl-ev', 'tl-phase', 'tl-mark', 'tl-end', 'cf-card', 'cf-part', 'row',
         'cr-who', 'party', 'door-slot', 'note']
SKIP_TAGS = {'script', 'style', 'svg', 'noscript', 'template', 'nav',
             'footer', 'button', 'input', 'textarea', 'select', 'head'}
SKIP_CLASSES = {'tl-key', 'fix', 'cm', 'cr-days', 'gloss-b', 'crumb', 'row-n',
                'to-top', 'sect-nav'}
TITLE_TAGS = {'h1', 'h2', 'h3', 'h4', 'dt'}
TITLE_CLASSES = {'cr-name', 'tl-phase-l', 'row-q'}
META_CLASSES = {'tl-date', 'cf-ban'}
# What a view leaves out because the case page already has it.
VIEW_SKIP_CLASSES = {'masthead', 'band-notes', 'gloss', 'party'}

# Elements that sit inside a line of text. Every other element starts
# and ends a word, so its text is kept apart from what is around it.
INLINE = {'a', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'sup', 'sub',
          'mark', 'abbr', 'cite', 'code', 'q', 'time', 'kbd', 'var', 'dfn',
          'bdi', 'bdo', 'wbr'}


def breaks(el):
    """Whether a word ends where this element starts and ends. A ruling
    stamp is a link set hard against the date it follows."""
    return el.tag not in INLINE or 'chip' in el.cls
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'source', 'track', 'wbr'}


class El:
    __slots__ = ('tag', 'attrs', 'cls', 'kids', 'parent')

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.cls = set((self.attrs.get('class') or '').split())
        self.kids = []
        self.parent = parent

    @property
    def id(self):
        return self.attrs.get('id')


class Tree(HTMLParser):
    """A plain element tree. The pages are hand-written and close their
    tags, so an end tag closes back to its own start and nothing more."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = El('#root', {}, None)
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        el = El(tag, attrs, self.stack[-1])
        self.stack[-1].kids.append(el)
        if tag not in VOID:
            self.stack.append(el)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].kids.append(El(tag, attrs, self.stack[-1]))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].kids.append(data)


def parse(path):
    t = Tree()
    t.feed(path.read_text(encoding='utf-8'))
    t.close()
    return t.root


def elements(el):
    for k in el.kids:
        if isinstance(k, El):
            yield k
            yield from elements(k)


def unit_class(el):
    for c in UNITS:
        if c in el.cls:
            return c
    return None


def is_gloss_entry(el):
    return el.tag == 'div' and el.parent is not None and 'gloss-l' in el.parent.cls


def assign_keys(root):
    """Every card's key, counted over the whole document the way
    document.querySelectorAll counts it."""
    keys, seen = {}, {}
    for el in elements(root):
        if is_gloss_entry(el):
            dt = next((k for k in el.kids if isinstance(k, El) and k.tag == 'dt' and k.id), None)
            keys[el] = dt.id if dt else None
            continue
        c = unit_class(el)
        if not c:
            continue
        n = seen.get(c, 0)
        seen[c] = n + 1
        keys[el] = el.id or f'{c}:{n}'
    return keys


def squeeze(parts):
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()


def text_of(el, skip):
    out = []

    def walk(e):
        for k in e.kids:
            if isinstance(k, str):
                out.append(k)
            elif not skip(k):
                if breaks(k):
                    out.append(' ')
                walk(k)
                if breaks(k):
                    out.append(' ')
    walk(el)
    return squeeze(out)


def read_page(path, is_case_page):
    root = parse(path)
    keys = assign_keys(root)
    passages = {}   # key -> [title, meta, parts]
    order = []

    def skip(el):
        if el.tag in SKIP_TAGS or el.cls & SKIP_CLASSES:
            return True
        if el.attrs.get('aria-hidden') == 'true':
            return True
        return not is_case_page and bool(el.cls & VIEW_SKIP_CLASSES)

    def passage(key):
        if key not in passages:
            passages[key] = ['', '', []]
            order.append(key)
        return passages[key]

    def walk(el, unit, near_id):
        for k in el.kids:
            if isinstance(k, str):
                key = unit or near_id
                if key and k.strip():
                    passage(key)[2].append(k)
                elif key in passages:
                    passages[key][2].append(' ')
                continue
            if skip(k):
                continue
            u, nid = unit, near_id
            if k in keys and keys[k]:
                u = keys[k]
            elif not unit and k.id:
                nid = k.id
            if u and u == unit:
                p = passage(u)
                if not p[0] and (k.tag in TITLE_TAGS or k.cls & TITLE_CLASSES):
                    p[0] = text_of(k, skip)
                    continue
                if not p[1] and k.cls & META_CLASSES:
                    p[1] = text_of(k, skip)
                    continue
            key = u or nid
            block = breaks(k)
            if block and key:
                passage(key)[2].append(' ')
            walk(k, u, nid)
            if block and key:
                passage(key)[2].append(' ')

    body = next((e for e in elements(root) if e.tag == 'body'), root)
    walk(body, None, None)

    out = []
    for key in order:
        title, meta, parts = passages[key]
        text = squeeze(parts)
        if title or text:
            out.append([key, title, meta, text])
    return root, out


def case_title(root):
    h1 = next((e for e in elements(root) if e.tag == 'h1'), None)
    return text_of(h1, lambda e: False) if h1 else ''


def shelf_order():
    """Cases in the order the hub's shelf stands them."""
    hub = (CHRONICLE / 'index.html').read_text(encoding='utf-8')
    seen = []
    for slug in re.findall(r'href="/case-chronicle/([a-z0-9-]+)/"', hub):
        if slug not in seen and slug != 'restricted-section':
            seen.append(slug)
    for d in sorted(CHRONICLE.iterdir()):
        if (d / 'index.html').exists() and d.name not in seen and d.name != 'restricted-section':
            seen.append(d.name)
    return seen


def main():
    manifest = []
    for slug in shelf_order():
        case_dir = CHRONICLE / slug
        if not (case_dir / 'index.html').exists():
            continue
        pages, title = [], ''
        for sub, label in VIEWS:
            path = case_dir / sub / 'index.html'
            if not path.exists():
                continue
            root, passages = read_page(path, is_case_page=(sub == ''))
            if sub == '':
                title = case_title(root)
            pages.append({'u': f'{ROOT_URL}{slug}/{sub}', 'v': label, 'e': passages})
        data = {'s': slug, 't': title, 'pages': pages}
        blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        (HERE / f'{slug}.json').write_bytes(blob)
        count = sum(len(p['e']) for p in pages)
        manifest.append({'s': slug, 't': title, 'h': hashlib.sha1(blob).hexdigest()[:10], 'n': count})
        print(f'{slug:26} {len(pages)} pages {count:5} passages {len(blob) / 1024:7.1f} KB')

    blob = json.dumps({'cases': manifest}, ensure_ascii=False, separators=(',', ':'))
    (HERE / 'index.json').write_text(blob + '\n', encoding='utf-8')
    print(f'{len(manifest)} cases written to {HERE}')


if __name__ == '__main__':
    main()
