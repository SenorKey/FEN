"""Shared setup for the service tests.

incisor.py reads its configuration and creates its schema at import time — the
same as it does under gunicorn — so the environment has to be right *before*
the first import. Both test modules import this one first, which means the
service is configured once no matter which of them unittest discovers first,
and the scratch database is registered for cleanup exactly once.
"""

import atexit
import os
import sys
import tempfile

_handle = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_handle.close()
DB_PATH = _handle.name

os.environ['DB_PATH'] = DB_PATH
os.environ['INCISOR_DATA_SOURCE'] = 'fixture'
os.environ.setdefault('ALLOWED_ORIGIN',
                      'https://frontendneeded.com,https://www.frontendneeded.com')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@atexit.register
def _remove_scratch_database():
    # WAL leaves two sidecar files next to the database.
    for suffix in ('', '-wal', '-shm'):
        try:
            os.unlink(DB_PATH + suffix)
        except OSError:
            pass
