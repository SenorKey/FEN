#!/usr/bin/env python3
"""Budgets on the documents the routine has to read.

`DECISIONS.md` is read *in full* at the start of every session, which is the
only reason it works as memory. That makes its size a correctness property of
the routine rather than tidiness: past some length it stops being read
carefully, and the anti-loop mechanism quietly degrades with no failure to see.

Guide section 16 used to cap it at "roughly two screens", which measured lines.
Rows here are single lines running past 1,500 characters, so 104 lines weighed
57KB and the rule passed while the file grew five-fold in five days. The same
shape as the 600-line rule measuring concatenated files, recorded under
Recurring traps. Bytes are what a reader actually pays, so bytes are what is
measured.

CEILING is a ratchet. It only ever moves **down**, and the number is written
here rather than in prose because a budget nothing enforces is a wish. When a
new entry will not fit, that is the signal to consolidate (S6) or to move a
surface-scoped decision next to the surface it binds — not to raise the number.
"""

import os
import unittest

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')

# Ratchet. Lower it whenever a consolidation lands; never raise it.
# Target is 20_000 — see the T-task filed against this.
CEILING = 60_000

# Long enough to state a decision and its reason, short enough that fifty of
# them stay readable. Existing rows predate this; the ratchet brings them down.
ENTRY_TARGET = 500


class TestDecisionsStaysReadable(unittest.TestCase):

    def _decisions(self):
        with open(os.path.join(DOCS, 'DECISIONS.md'), encoding='utf-8') as handle:
            return handle.read()

    def test_the_file_fits_its_budget(self):
        size = len(self._decisions().encode('utf-8'))
        self.assertLessEqual(
            size, CEILING,
            'DECISIONS.md is %d bytes against a ceiling of %d. Consolidate (S6), '
            'or move a surface-scoped decision into that surface\'s file header. '
            'Do not raise the ceiling.' % (size, CEILING))

    def test_the_worst_entry_is_reported(self):
        """Not a failure — a number the next consolidation can aim at."""
        rows = [line for line in self._decisions().splitlines()
                if line.startswith('| 0')]
        if not rows:
            return
        longest = max(len(row) for row in rows)
        over = sum(1 for row in rows if len(row) > ENTRY_TARGET)
        self.assertLessEqual(
            longest, 4_000,
            'a single entry runs %d characters; %d of %d rows exceed the %d-char '
            'target. An entry nobody finishes reading is not memory.'
            % (longest, over, len(rows), ENTRY_TARGET))


if __name__ == '__main__':
    unittest.main()
