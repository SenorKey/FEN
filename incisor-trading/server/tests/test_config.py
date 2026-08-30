"""Tests for configuration loading — that a key set in config.env takes effect.

D4 was one key read one import too early. `store.py` read DB_PATH at its own
import, `incisor.py` imports store above the line that opens $CONFIG_FILE, and
so the only value the store could ever see was the module default. It looked
like it worked because the example config repeats that default, so the two
agreed by coincidence.

So there are two tests here, not one. `TestDatabasePathFromConfigFile` is the
D4 acceptance criterion, driven in a subprocess because the import order is the
whole subject and this process imported the service long ago.
`TestNoModuleReadsConfigAtImport` is the general rule the defect was an
instance of: the edge reads the environment, after loading the file, and
nothing else reads it at all. That one is an AST walk rather than a grep over
the source, because the word "environ" appears in the prose of both files that
explain why it is not there — the trap in docs/DECISIONS.md about a rule
forbidding a token in comments too.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import ast
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

import service_fixture  # noqa: F401  — configures the service before import

SERVER_DIR = pathlib.Path(__file__).resolve().parent.parent

# The edge, and the only file allowed to read the environment at module level.
EDGE_MODULE = 'incisor.py'


def module_paths():
    """Every service module, tests excluded. Derived, so a new module is covered."""
    return sorted(
        path for path in SERVER_DIR.glob('*.py') if not path.name.startswith('_'))


def module_level_statements(tree):
    """Top-level statements only — a read inside a function runs after config."""
    for statement in tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        yield statement


def environment_reads(statement):
    """Line numbers where this statement reaches for the process environment."""
    lines = []
    for node in ast.walk(statement):
        if isinstance(node, ast.Attribute) and node.attr in ('environ', 'getenv'):
            lines.append(node.lineno)
    return lines


class TestDatabasePathFromConfigFile(unittest.TestCase):
    """The D4 criterion: DB_PATH in $CONFIG_FILE alone puts the database there.

    Run in a subprocess with DB_PATH scrubbed from the environment, because
    load_env_file() uses setdefault — an inherited DB_PATH would win over the
    file and the test would pass without proving anything.
    """

    def resolve_paths_with(self, config_text, create_the_database):
        """Boot the service under a config file and report where the store went.

        `create_the_database` decides whether store.init() is allowed to run.
        The configured case wants it to, because a file appearing at the path
        is the strongest evidence the key took effect. The default case cannot
        have it: the default is /var/lib, creating it needs root, and where the
        path resolves to is the question rather than whether it is writable.
        """
        with tempfile.TemporaryDirectory() as directory:
            config_file = os.path.join(directory, 'config.env')
            wanted = os.path.join(directory, 'from-config.db')
            with open(config_file, 'w') as handle:
                handle.write(config_text.format(db_path=wanted))

            environment = {
                key: value for key, value in os.environ.items()
                if key not in ('DB_PATH', 'INCISOR_DATA_SOURCE')
            }
            environment['CONFIG_FILE'] = config_file
            environment['PYTHONPATH'] = str(SERVER_DIR)

            program = 'import store;'
            if not create_the_database:
                program += ' store.init = lambda: None;'
            program += ' import incisor; print(incisor.DB_PATH); print(store.DB_PATH)'

            completed = subprocess.run(
                [sys.executable, '-c', program],
                capture_output=True, text=True, env=environment, cwd=str(SERVER_DIR),
                timeout=60,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            edge_path, store_path = completed.stdout.split()
            return wanted, edge_path, store_path, os.path.exists(wanted)

    def test_the_service_uses_the_path_the_config_file_names(self):
        wanted, edge_path, store_path, created = self.resolve_paths_with(
            'INCISOR_DATA_SOURCE=fixture\nDB_PATH={db_path}\n',
            create_the_database=True)
        self.assertEqual(edge_path, wanted)
        self.assertEqual(store_path, wanted, 'the store kept its own default')
        self.assertTrue(created, 'no database was created where config.env said')

    def test_a_config_file_without_the_key_falls_back_to_the_default(self):
        """The default has to survive the fix, or the systemd unit stops working.

        The unit sets no DB_PATH of its own; it relies on this default and on
        ReadWritePaths naming the same directory.
        """
        _, edge_path, store_path, _ = self.resolve_paths_with(
            'INCISOR_DATA_SOURCE=fixture\n', create_the_database=False)
        self.assertEqual(edge_path, '/var/lib/incisor-trading/incisor.db')
        self.assertEqual(store_path, edge_path)


class TestNoModuleReadsConfigAtImport(unittest.TestCase):
    """The class of bug D4 belonged to, asserted for every module at once.

    A module imported by incisor.py is imported before $CONFIG_FILE is read, so
    an environment read at its module level is a key that cannot be configured.
    Only the edge may read the environment at module level, and only below the
    line that loads the file.
    """

    def test_only_the_edge_reads_the_environment_at_module_level(self):
        for path in module_paths():
            if path.name == EDGE_MODULE:
                continue
            tree = ast.parse(path.read_text(), filename=str(path))
            found = [
                line for statement in module_level_statements(tree)
                for line in environment_reads(statement)
            ]
            self.assertEqual(
                found, [],
                '%s reads the environment at import, before %s has loaded '
                '$CONFIG_FILE, so the key it reads cannot be configured. Read '
                'it in %s and pass the value in. (lines %s)'
                % (path.name, EDGE_MODULE, EDGE_MODULE, found))

    def test_nothing_imports_the_environment_under_another_name(self):
        """`from os import environ` would read the same thing past the check above."""
        for path in module_paths():
            tree = ast.parse(path.read_text(), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module == 'os':
                    imported = {alias.name for alias in node.names}
                    self.assertEqual(
                        imported & {'environ', 'getenv'}, set(),
                        '%s line %d imports the environment directly, which '
                        'hides it from the module-level check'
                        % (path.name, node.lineno))

    def test_the_edge_reads_the_environment_only_after_loading_the_file(self):
        path = SERVER_DIR / EDGE_MODULE
        tree = ast.parse(path.read_text(), filename=str(path))

        load_lines = [
            statement.lineno
            for statement in module_level_statements(tree)
            if isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Call)
            and getattr(statement.value.func, 'id', None) == 'load_env_file'
        ]
        self.assertEqual(
            len(load_lines), 1,
            '%s must call load_env_file() exactly once at module level' % EDGE_MODULE)

        # The call reads $CONFIG_FILE in its own argument, so its own line counts
        # as loaded — every later read sees whatever the file put in place.
        for statement in module_level_statements(tree):
            for line in environment_reads(statement):
                self.assertGreaterEqual(
                    line, load_lines[0],
                    'line %d of %s reads the environment above the '
                    'load_env_file() call on line %d, so config.env cannot '
                    'affect it' % (line, EDGE_MODULE, load_lines[0]))


if __name__ == '__main__':
    unittest.main()
