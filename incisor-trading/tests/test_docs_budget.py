#!/usr/bin/env python3
"""Budgets and integrity checks on the memory the routine reads every session.

The memory is two files with two different jobs, split at D9:

  `DECISIONS.md`        the index. Read **in full** every session — one line
                        per entry, carrying the claim and its reason in brief.
                        Budgeted, because that is the only reason it works.
  `DECISIONS-DETAIL.md` the reasoning, under a stable `DEC-NNN` heading.
                        Opened at an ID, never read front to back, and
                        deliberately **not** budgeted: storage is free and
                        attention is not.

Two properties are enforced here, and they fail in opposite directions.

**Size**, on the index alone. Past some length it stops being read carefully and
the anti-loop mechanism degrades with nothing failing to show it. Guide section
16 used to cap it at "roughly two screens", which measured lines — rows ran past
1,500 characters, so 104 lines weighed 57KB and the rule passed while the file
grew five-fold in five days. The same shape as the 600-line rule measuring
concatenated files, recorded under Recurring traps. Bytes are what a reader
pays, so bytes are what is measured, and CEILING is a ratchet: it only ever
moves **down**. When a new entry will not fit, that is the signal to consolidate
(S6) or to move a surface-scoped decision beside the surface it binds — not to
raise the number. At roughly 165 bytes an entry the ceiling holds about seventy,
and the index is near that now, so the next few sessions should expect to move a
decision into a file header rather than to add a seventy-first line here.

**Integrity**, across both. A split trades a size problem for a silent
correctness problem unless the two files are held together: an index line
pointing at an ID that no longer exists is how every index that has ever rotted
began, and nothing fails when it happens. The bijection is asserted both ways.
"""

import os
import re
import unittest

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')

# Ratchet. Lower it whenever a consolidation lands; never raise it.
CEILING = 12_000

# Long enough to state a claim and its reason, short enough that seventy of them
# stay readable in one sitting. This is the cap D9 exists to install: the 57KB
# file is what happens without one, since its 1,573-character rows were
# one-liners once and nobody decided to write essays. A claim that will not fit
# belongs in the detail file, or beside the code it binds (guide section 16).
MAX_INDEX_LINE = 200

INDEX_ROW = re.compile(r'^\|\s*(DEC-\d{3})\s*\|')
DETAIL_HEADING = re.compile(r'^##\s+(DEC-\d{3})\s+—\s+\S')


def _read(name):
    with open(os.path.join(DOCS, name), encoding='utf-8') as handle:
        return handle.read()


def _index_ids():
    """Every ID in the index, in file order, duplicates kept for the count."""
    return [INDEX_ROW.match(line).group(1)
            for line in _read('DECISIONS.md').splitlines()
            if INDEX_ROW.match(line)]


def _detail_ids():
    return [DETAIL_HEADING.match(line).group(1)
            for line in _read('DECISIONS-DETAIL.md').splitlines()
            if DETAIL_HEADING.match(line)]


class TestTheIndexStaysReadable(unittest.TestCase):

    def test_the_index_fits_its_budget(self):
        size = len(_read('DECISIONS.md').encode('utf-8'))
        self.assertLessEqual(
            size, CEILING,
            'DECISIONS.md is %d bytes against a ceiling of %d. Consolidate (S6), '
            'or move a surface-scoped decision into that surface\'s file header. '
            'Do not raise the ceiling.' % (size, CEILING))

    def test_no_index_line_exceeds_the_cap(self):
        """The rule that keeps the index an index rather than a second essay."""
        over = [(line.split('|')[1].strip(), len(line))
                for line in _read('DECISIONS.md').splitlines()
                if INDEX_ROW.match(line) and len(line) > MAX_INDEX_LINE]
        self.assertEqual(
            over, [],
            'index lines over %d characters: %s. Move the reasoning to '
            'DECISIONS-DETAIL.md under that ID, or beside the code it binds; '
            'leave the claim and a short reason here.'
            % (MAX_INDEX_LINE, ', '.join('%s (%d)' % pair for pair in over)))

    def test_the_index_is_not_empty(self):
        """Guards the two checks above, which both pass on a file of zero rows."""
        self.assertGreater(len(_index_ids()), 50)


class TestTheTwoFilesAgree(unittest.TestCase):
    """The bijection. Without it the split trades size for silent rot."""

    def test_every_index_id_resolves_to_a_detail_entry(self):
        dangling = sorted(set(_index_ids()) - set(_detail_ids()))
        self.assertEqual(
            dangling, [],
            'indexed but absent from DECISIONS-DETAIL.md: %s. An index line '
            'pointing at nothing is worse than no line.' % ', '.join(dangling))

    def test_every_detail_entry_is_indexed(self):
        orphans = sorted(set(_detail_ids()) - set(_index_ids()))
        self.assertEqual(
            orphans, [],
            'in DECISIONS-DETAIL.md but not indexed: %s. An entry nobody can '
            'find from the index is not memory.' % ', '.join(orphans))

    def test_no_id_is_used_twice(self):
        for name, ids in (('DECISIONS.md', _index_ids()),
                          ('DECISIONS-DETAIL.md', _detail_ids())):
            duplicates = sorted({i for i in ids if ids.count(i) > 1})
            self.assertEqual(
                duplicates, [],
                '%s reuses %s. IDs are assigned once and never reused, '
                'including for entries later superseded.'
                % (name, ', '.join(duplicates)))

    def test_the_files_hold_the_same_number_of_entries(self):
        """Set arithmetic above hides a duplicate paired with a missing one."""
        self.assertEqual(len(_index_ids()), len(_detail_ids()))


if __name__ == '__main__':
    unittest.main()
