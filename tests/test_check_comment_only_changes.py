import importlib.util
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import pytest

from anvil import PROJECT_ROOT

SCRIPT = PROJECT_ROOT / "scripts" / "check_comment_only_changes.py"

# scripts/ isn't a package, so load the checker straight from its file.
_spec = importlib.util.spec_from_file_location("check_comment_only_changes", SCRIPT)
assert _spec and _spec.loader
checker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(checker)

PY_OLD = dedent(
    """\
    def f():
        a = 1
        return a


    def h():
        c = 3
        return c


    def g():
        b = 2
        return b
    """
)

TS_OLD = dedent(
    """\
    export function f() {
      const a = 1
      return a
    }

    export function h() {
      const c = 3
      return c
    }

    export function g() {
      const b = 2
      return b
    }
    """
)


def py_flagged(new: str) -> list[int]:
    new = dedent(new)
    return checker.comment_only_hunks(PY_OLD, new, checker.python_commentary(new))


def ts_flagged(new: str) -> list[int]:
    new = dedent(new)
    return checker.comment_only_hunks(TS_OLD, new, checker.ts_commentary(new))


@pytest.mark.parametrize(
    "new",
    [
        PY_OLD.replace("    a = 1", "    # Explains a.\n    a = 1"),
        PY_OLD.replace("def f():", 'def f():\n    """A docstring."""'),
        PY_OLD.replace(
            "def f():", 'def f():\n    """A docstring\n\n    over lines.\n    """'
        ),
    ],
)
def test_flags_python_comment_added_alone(new: str) -> None:
    assert py_flagged(new) == [2]


@pytest.mark.parametrize(
    ("new", "line"),
    [
        (TS_OLD.replace("  const a = 1", "  // Explains a.\n  const a = 1"), 2),
        (
            TS_OLD.replace("export function f", "/** Docstring. */\nexport function f"),
            1,
        ),
        (
            TS_OLD.replace(
                "export function f", "/**\n * Docstring.\n */\nexport function f"
            ),
            1,
        ),
    ],
)
def test_flags_ts_comment_added_alone(new: str, line: int) -> None:
    assert ts_flagged(new) == [line]


def test_flags_each_hunk() -> None:
    new = PY_OLD.replace("    a = 1", "    # One.\n    a = 1").replace(
        "    b = 2", "    # Two.\n    b = 2"
    )
    assert py_flagged(new) == [2, 13]


def test_flags_only_the_hunk_without_code() -> None:
    new = PY_OLD.replace("    a = 1", "    # One.\n    a = 10").replace(
        "    b = 2", "    # Two.\n    b = 2"
    )
    assert py_flagged(new) == [13]


@pytest.mark.parametrize(
    "new",
    [
        PY_OLD,
        PY_OLD.replace("    a = 1", "    # Explains a.\n    a = 10"),
        PY_OLD.replace("    a = 1\n    return a", "    # Explains a.\n    return 1"),
        PY_OLD.replace("    a = 1", "    a = 1\n\n"),
        PY_OLD.replace("    a = 1", "    # noqa: E501\n    a = 1"),
        PY_OLD.replace("def f():", "@decorator  # Explains it.\ndef f():"),
    ],
)
def test_skips_python(new: str) -> None:
    assert py_flagged(new) == []


@pytest.mark.parametrize(
    "new",
    [
        TS_OLD.replace("  const a = 1", "  // Explains a.\n  const a = 10"),
        TS_OLD.replace("  const a = 1", "  // oxlint-disable-next-line\n  const a = 1"),
        TS_OLD.replace("  const a = 1", "  // anvil: why\n  const a = 1"),
        TS_OLD.replace("  const a = 1", "  // @ts-expect-error\n  const a = 1"),
    ],
)
def test_skips_ts(new: str) -> None:
    assert ts_flagged(new) == []


def test_skips_rewording_a_comment() -> None:
    old = PY_OLD.replace("    a = 1", "    # Explains a.\n    a = 1")
    new = PY_OLD.replace("    a = 1", "    # Explains a, better.\n    a = 1")
    assert checker.comment_only_hunks(old, new, checker.python_commentary(new)) == []


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True)


def run_in(repo: Path, *paths: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, SCRIPT, *paths],
        check=False,
        capture_output=True,
        text=True,
        cwd=repo,
    )


def test_cli_compares_the_file_with_head(tmp_path: Path) -> None:
    git(tmp_path, "init", "-q")
    (tmp_path / "f.py").write_text(PY_OLD)
    git(tmp_path, "add", "f.py")
    git(
        tmp_path,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-qm",
        "init",
    )

    (tmp_path / "f.py").write_text(
        PY_OLD.replace("    a = 1", "    # Explains a.\n    a = 1")
    )
    result = run_in(tmp_path, "f.py")
    assert result.returncode == 1
    assert result.stdout.startswith("f.py:2: adds comments away from any code change")

    (tmp_path / "new.py").write_text("# A new file.\n")
    assert run_in(tmp_path, "new.py").returncode == 0
