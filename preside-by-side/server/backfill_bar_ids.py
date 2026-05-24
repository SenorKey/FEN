#!/usr/bin/env python3
"""
One-off (idempotent) backfill: ensure every bar in data/presidents/*.json
carries a stable `id` field used by the ratings system.

Run from the repo root:
    python3 server/backfill_bar_ids.py

Idempotent — bars that already have an `id` are left untouched, so re-runs
after adding new bars only assign IDs to the newcomers. Files are only
rewritten when something actually changed, so this never produces a noisy
diff on a fully-IDed dataset.

ID format: 10 characters from a 32-char unambiguous alphabet (no 0/O/1/I/l).
~50 bits of entropy; collision probability across the whole dataset is
vanishingly small and re-rolls are cheap if it ever bites.
"""

import json
import pathlib
import secrets
import sys

ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
ID_LEN = 10

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'presidents'


def new_id():
    return ''.join(secrets.choice(ALPHABET) for _ in range(ID_LEN))


def main():
    if not DATA_DIR.is_dir():
        sys.exit(f'data dir not found: {DATA_DIR}')

    seen = set()
    total_added = 0
    files_touched = 0

    for path in sorted(DATA_DIR.glob('*.json')):
        with path.open() as f:
            bars = json.load(f)

        changed = False
        reordered = []
        for bar in bars:
            existing = bar.get('id')
            if existing and existing not in seen:
                seen.add(existing)
            else:
                while True:
                    candidate = new_id()
                    if candidate not in seen:
                        break
                bar['id'] = candidate
                seen.add(candidate)
                changed = True
                total_added += 1

            # Rebuild with `id` first so it reads as the primary key. If
            # the bar already had id-first ordering, this is a no-op write
            # and the `changed` flag below won't be set on its account.
            ordered = {'id': bar['id']}
            for k, v in bar.items():
                if k == 'id':
                    continue
                ordered[k] = v
            if list(bar.keys()) != list(ordered.keys()):
                changed = True
            reordered.append(ordered)

        if changed:
            with path.open('w') as f:
                json.dump(reordered, f, indent=2, ensure_ascii=False)
                f.write('\n')
            files_touched += 1
            print(f'  {path.name}: {sum(1 for b in reordered if b.get("id"))} ids present')

    print(f'done — {total_added} ids assigned across {files_touched} file(s)')


if __name__ == '__main__':
    main()
