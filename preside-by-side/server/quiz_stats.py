#!/usr/bin/env python3
"""
How the Case Chronicle quizzes have been answered, read from the suggest
service's database. Read-only: it opens the database so that it cannot
write, and changes nothing.

On the server, as the service's own user (the database is its file):

    sudo -u preside python3 /var/www/frontendneeded.com/preside-by-side/server/quiz_stats.py

Options:
    --quiz doe-v-bonnell    one quiz (default: every quiz in quizzes.py)
    --since 2026-12-01      only answers from that day on (local time)
    --tz America/Chicago    the time zone days are counted in (default)
    --csv answers           every answer as CSV instead of the report,
    --csv results           or every finished quiz; redirect it to a file:
                            ... quiz_stats.py --csv answers > answers.csv
    --db PATH               default $DB_PATH, else the service's database

What the database keeps (suggest.py, tables quiz_answers and quiz_results):
one row per answer and one per finished quiz, each with the time it came
in (UTC, to the microsecond), the run it belongs to (one go at the quiz in
one browser tab), the date the page's answer key was as of, and a keyed
hash of the reader's IP. The hash can be counted and compared but not
turned back into an address. A run's first answer to a question is the
one kept, so a question's count is the number of runs that answered it.
"""

import argparse
import csv
import datetime
import os
import sqlite3
import sys
from collections import Counter, defaultdict
from zoneinfo import ZoneInfo

from quizzes import QUIZ_CHOICES, QUIZZES

DEFAULT_DB = '/var/lib/preside-by-side/suggestions.db'


def connect(path):
    if not os.path.exists(path):
        sys.exit(f'no database at {path}')
    conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def local(ts, tz):
    return datetime.datetime.fromisoformat(ts).astimezone(tz)


def pct(n, total):
    return f'{n * 100 / total:5.1f}%' if total else '    -'


def table(head, rows):
    widths = [max(len(str(x)) for x in col) for col in zip(head, *rows)]
    line = lambda r: '  '.join(
        str(x).ljust(w) if i == 0 else str(x).rjust(w) for i, (x, w) in enumerate(zip(r, widths))
    )
    print(line(head))
    print('  '.join('-' * w for w in widths))
    for r in rows:
        print(line(r))


def fetch(conn, sql, quiz, since_utc):
    where = 'quiz = ?' + (' AND received_at >= ?' if since_utc else '')
    args = (quiz, since_utc) if since_utc else (quiz,)
    return conn.execute(sql.format(where=where), args).fetchall()


def report(conn, quiz, spec, tz, since_utc):
    answers = fetch(conn, 'SELECT received_at, run, question, choice, ip_hash '
                          'FROM quiz_answers WHERE {where} ORDER BY id', quiz, since_utc)
    results = fetch(conn, 'SELECT received_at, run, label, ip_hash '
                          'FROM quiz_results WHERE {where} ORDER BY id', quiz, since_utc)

    print(f'\n=== {quiz} ===')
    if not answers and not results:
        print('No answers yet.')
        return

    # ── overview ──
    runs = {a['run'] for a in answers}
    first_q = spec['questions'][0]
    started = {a['run'] for a in answers if a['question'] == first_q}
    finished = {r['run'] for r in results}
    readers = {a['ip_hash'] for a in answers} | {r['ip_hash'] for r in results}
    per_reader = Counter(r['ip_hash'] for r in results)
    times = [local(x['received_at'], tz) for x in (*answers, *results)]

    print(f'From {min(times):%b %d, %Y %H:%M} to {max(times):%b %d, %Y %H:%M} ({tz.key})\n')
    table(['', 'count'], [
        ['Runs (goes at the quiz)', len(runs)],
        ['Started (answered question 1)', len(started)],
        ['Finished (got a label)', len(finished)],
        ['Finish rate', pct(len(finished), len(started)).strip()],
        ['Readers (distinct IP hashes)', len(readers)],
        ['Readers who finished more than once', sum(1 for n in per_reader.values() if n > 1)],
        ['Answers', len(answers)],
    ])

    # ── each question ──
    # A question's total is how many runs reached it, so reading down the
    # Total column shows where people stop.
    by_q = defaultdict(Counter)
    for a in answers:
        by_q[a['question']][a['choice']] += 1
    print()
    rows = []
    for i, q in enumerate(spec['questions'], 1):
        c = by_q.get(q, Counter())
        total = sum(c.values())
        rows.append([f'{i:>2} {q}', *(f'{c[k]} {pct(c[k], total)}' for k in QUIZ_CHOICES), total])
    table(['Question', *(k.capitalize() for k in QUIZ_CHOICES), 'Total'], rows)

    # ── labels ──
    labels = Counter(r['label'] for r in results)
    print()
    table(['Label', 'Count', 'Share'],
          [[t, labels[t], pct(labels[t], len(results)).strip()] for t in spec['types']]
          + [[t + ' (no longer offered)', n, pct(n, len(results)).strip()]
             for t, n in labels.items() if t not in spec['types']])
    seed = spec.get('result_seed', 0)
    if seed:
        print(f'These counts are all real. The page adds {seed} artificial result to every label '
              f'(result_seed in quizzes.py), so the shares readers see include {seed * len(spec["types"])} '
              'made-up results. Set it to 0 to remove them.')

    # ── each day ──
    days = defaultdict(lambda: {'answers': 0, 'finished': 0, 'readers': set()})
    for a in answers:
        d = days[local(a['received_at'], tz).date()]
        d['answers'] += 1
        d['readers'].add(a['ip_hash'])
    for r in results:
        days[local(r['received_at'], tz).date()]['finished'] += 1
    print()
    table(['Day', 'Answers', 'Finished', 'Readers'],
          [[f'{d:%a %b %d, %Y}', v['answers'], v['finished'], len(v['readers'])]
           for d, v in sorted(days.items())])


def dump(conn, which, quizzes, tz, since_utc):
    out = csv.writer(sys.stdout)
    if which == 'answers':
        cols = ['quiz', 'run', 'question', 'choice', 'key_version', 'ip_hash']
        table_name = 'quiz_answers'
    else:
        cols = ['quiz', 'run', 'label', 'key_version', 'ip_hash']
        table_name = 'quiz_results'
    out.writerow(['date', 'time', 'utc', *cols])
    for quiz in quizzes:
        for r in fetch(conn, f'SELECT received_at, {", ".join(cols)} FROM {table_name} '
                             'WHERE {where} ORDER BY id', quiz, since_utc):
            t = local(r['received_at'], tz)
            out.writerow([t.date().isoformat(), t.strftime('%H:%M:%S'), r['received_at'],
                          *(r[c] for c in cols)])


def main():
    ap = argparse.ArgumentParser(description='Case Chronicle quiz stats (read-only).')
    ap.add_argument('--quiz', choices=sorted(QUIZZES))
    ap.add_argument('--since', type=datetime.date.fromisoformat, metavar='YYYY-MM-DD')
    ap.add_argument('--tz', default='America/Chicago')
    ap.add_argument('--csv', choices=('answers', 'results'))
    ap.add_argument('--db', default=os.environ.get('DB_PATH', DEFAULT_DB))
    args = ap.parse_args()

    tz = ZoneInfo(args.tz)
    since_utc = None
    if args.since:
        start = datetime.datetime.combine(args.since, datetime.time(), tz)
        since_utc = start.astimezone(datetime.timezone.utc).isoformat()
    quizzes = [args.quiz] if args.quiz else list(QUIZZES)

    conn = connect(args.db)
    if args.csv:
        dump(conn, args.csv, quizzes, tz, since_utc)
    else:
        for quiz in quizzes:
            report(conn, quiz, QUIZZES[quiz], tz, since_utc)
        print()


if __name__ == '__main__':
    main()
