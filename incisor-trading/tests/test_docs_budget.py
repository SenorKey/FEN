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
  `BACKLOG.md`          the queue. Also read in full, and it caught the same
                        disease: 47% of it was completed work, re-read every
                        session forever. D10 collapsed each finished task to a
                        one-line record in `## Done` — in this file, not a
                        second one, because nobody follows a pointer to closed
                        work (DEC-068).
  `AUDITS.md`           the four answers behind each audit-log row, under a
                        dated heading. Split out by D11 for the same reason
                        D9 split the memory, and unbudgeted for the same one:
                        it is opened at a surface, never read front to back.

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
and the index reached that: D11's own entry put the file 136 bytes over, and it
was paid for by moving two lines out rather than by raising anything. Both were
already stated in full beside the code they bind — `DEC-016` in
`js/view-symbol.js`, `DEC-044` in `server/fixtures/make_fixtures.py` — so the
index was carrying a second copy of a comment that cannot drift from what it
explains. Expect this, not a seventy-first line.

**Integrity**, across each split. A split trades a size problem for a silent
correctness problem unless the two files are held together: an index line
pointing at an ID that no longer exists is how every index that has ever rotted
began, and nothing fails when it happens. Both bijections are asserted both
ways — the memory's on `DEC-NNN`, the audit log's on the date and task ID its
row and its heading share, since an audit has no ID of its own and inventing an
eighth namespace beside the seven in guide section 19 would cost more than it
carries.

**Shape**, on the backlog. A byte ceiling alone is what the old "two screens"
rule was, and it failed because nothing stopped a one-liner becoming an essay.
So the ceiling here is paired with the rules that produced it: a finished task
is a row in `## Done` and never a bullet, an audit is a row in the audit log
and never its own four paragraphs, and a row of either kind is a record rather
than a retelling. Break one and the ceiling is only a matter of time — which is
not a prediction, it is what happened twice. D10 met its 32,000 and the audit
log put the file back over it within the same session, because the collapse
reached the section it was told to fix and not the section growing beside it.
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

# Ratchet, like CEILING. D11 landed the audit-log collapse at 21,405, so this
# is 595 bytes of headroom rather than the 462 D10 left — deliberately tight
# both times. A session that cannot fit a new entry has found the next thing to
# fix rather than a number to raise.
BACKLOG_CEILING = 22_000

# A record, not a retelling. Long enough for the task, its verdict and the
# `DEC` IDs it settled; short enough that twenty-two of them are a page. The
# 1,573-character rows that made D9 a defect were one-liners once, so a length
# cap travels with every collapse this project does.
MAX_DONE_ROW = 300

# Same rule, one section down, and set to the index's cap rather than the Done
# rows' because an audit row does the index's job: it has to say enough that a
# session skimming knows whether the surface moved under it, without opening
# `AUDITS.md`. Seven rows weighed 13,219 bytes before D11 — 41% of a file read
# in full every session, growing forever because `O6` never completes.
MAX_AUDIT_ROW = 200

INDEX_ROW = re.compile(r'^\|\s*(DEC-\d{3})\s*\|')
DONE_ROW = re.compile(r'^\|\s*[TDOS]\d+[a-z]?\s*\|')
DETAIL_HEADING = re.compile(r'^##\s+(DEC-\d{3})\s+—\s+\S')

# `| 09-02 | **Fundamentals panel** (T11) | Minor edits | ... |` keyed to
# `## 09-02 — Fundamentals panel (T11)`. The date alone will not do: a surface
# is due again after any revamp, so one task ID can carry two audits.
AUDIT_ROW = re.compile(r'^\|\s*(\d{2}-\d{2})\s*\|[^|]*?\((T\d+[a-z]?)\)\s*\|')
AUDIT_HEADING = re.compile(r'^##\s+(\d{2}-\d{2})\s+—\s+.*\((T\d+[a-z]?)\)\s*$')


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


def _audit_rows():
    """Every audit-log row, as the (date, task) pair that keys it."""
    return [AUDIT_ROW.match(line).groups()
            for line in _read('BACKLOG.md').splitlines()
            if AUDIT_ROW.match(line)]


def _audit_headings():
    return [AUDIT_HEADING.match(line).groups()
            for line in _read('AUDITS.md').splitlines()
            if AUDIT_HEADING.match(line)]


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


class TestTheBacklogStaysAQueue(unittest.TestCase):
    """D10. The backlog is read in full every session, so closed work costs
    every future session what it cost this one — and it had grown to 47% of the
    file. The cure was not a second file (DEC-068): a finished task is a row in
    `## Done`, and what a session needs from one is elsewhere already."""

    def test_the_backlog_fits_its_budget(self):
        size = len(_read('BACKLOG.md').encode('utf-8'))
        self.assertLessEqual(
            size, BACKLOG_CEILING,
            'BACKLOG.md is %d bytes against a ceiling of %d. Take D11, which '
            'moves the audit log out the way D10 moved the completed tasks. '
            'Do not raise the ceiling.' % (size, BACKLOG_CEILING))

    def test_no_completed_task_is_still_a_bullet(self):
        """The rule the ceiling rests on. `[x]` marks a task carrying its full
        acceptance criteria and completion note; a closed one is a `## Done`
        row. This is what actually stopped the growth — the byte count is only
        how it was noticed."""
        checked = [line for line in _read('BACKLOG.md').splitlines()
                   if line.startswith('- [x]')]
        self.assertEqual(
            checked, [],
            'completed tasks left as bullets: %s. Collapse each to a dated '
            'one-line record in ## Done, filing anything in its notes that a '
            'future session could act on as its own entry first (guide S19).'
            % ' / '.join(line[:60] for line in checked))

    def test_no_done_row_grows_into_an_essay(self):
        over = [(line.split('|')[1].strip(), len(line))
                for line in _read('BACKLOG.md').splitlines()
                if DONE_ROW.match(line) and len(line) > MAX_DONE_ROW]
        self.assertEqual(
            over, [],
            'Done rows over %d characters: %s. A record says what shipped, '
            'when, and what it concluded; the reasoning belongs in the DEC '
            'lines it names, the audit-log row, or the code.'
            % (MAX_DONE_ROW, ', '.join('%s (%d)' % pair for pair in over)))

    def test_the_done_section_is_not_empty(self):
        """Guards the two checks above, which both pass on a file with no
        history in it at all."""
        rows = [line for line in _read('BACKLOG.md').splitlines()
                if DONE_ROW.match(line)]
        self.assertGreater(len(rows), 20)


class TestTheAuditLogStaysALog(unittest.TestCase):
    """D11. The section D10 was forbidden to touch, which was 41% of the
    backlog by the time D10 finished — and the only one of the three that
    grows forever by design, since `O6` never completes and a revamp makes a
    surface due again. The four answers moved to `AUDITS.md`; the row stayed."""

    def test_no_audit_row_grows_into_an_essay(self):
        over = [('%s %s' % pair, len(line))
                for line, pair in ((line, AUDIT_ROW.match(line).groups())
                                   for line in _read('BACKLOG.md').splitlines()
                                   if AUDIT_ROW.match(line))
                if len(line) > MAX_AUDIT_ROW]
        self.assertEqual(
            over, [],
            'audit rows over %d characters: %s. The row carries the date, the '
            'surface, the verdict and the finding in one line; the four '
            'answers go under a dated heading in AUDITS.md.'
            % (MAX_AUDIT_ROW, ', '.join('%s (%d)' % pair for pair in over)))

    def test_every_audit_row_resolves_to_an_entry(self):
        dangling = sorted(set(_audit_rows()) - set(_audit_headings()))
        self.assertEqual(
            dangling, [],
            'in the audit log but absent from AUDITS.md: %s. A verdict whose '
            'reasoning cannot be found is a verdict nobody can argue with.'
            % ', '.join('%s %s' % pair for pair in dangling))

    def test_every_audit_entry_is_logged(self):
        orphans = sorted(set(_audit_headings()) - set(_audit_rows()))
        self.assertEqual(
            orphans, [],
            'in AUDITS.md but not in the audit log: %s. The log is the only '
            'thing read every session, so an unlogged audit is a surface that '
            'falls due again with the work already done.'
            % ', '.join('%s %s' % pair for pair in orphans))

    def test_no_audit_is_recorded_twice(self):
        for name, keys in (('BACKLOG.md', _audit_rows()),
                           ('AUDITS.md', _audit_headings())):
            duplicates = sorted({k for k in keys if keys.count(k) > 1})
            self.assertEqual(
                duplicates, [],
                '%s records %s twice. A surface audited again on a later date '
                'is a second entry, not a rewrite of the first.'
                % (name, ', '.join('%s %s' % pair for pair in duplicates)))

    def test_the_audit_log_is_not_empty(self):
        """Guards all four checks above, which pass on a log of zero rows."""
        self.assertGreater(len(_audit_rows()), 5)


if __name__ == '__main__':
    unittest.main()
