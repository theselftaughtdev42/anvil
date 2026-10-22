import importlib.util
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import pytest

from anvil import PROJECT_ROOT

SCRIPT = PROJECT_ROOT / "scripts" / "check_docstrings.py"

# scripts/ isn't a package, so load the checker straight from its file.
_spec = importlib.util.spec_from_file_location("check_docstrings", SCRIPT)
assert _spec and _spec.loader
check_docstrings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_docstrings)


def lines_flagged(source: str) -> list[int]:
    return [v.line for v in check_docstrings.check(dedent(source))]


@pytest.mark.parametrize(
    "source",
    [
        """
        # Explains f.
        def f(): ...
        """,
        """
        # Explains f.
        async def f(): ...
        """,
        """
        # Explains C.
        class C: ...
        """,
        """
        # Explains f.
        @decorator
        @other(arg=1)
        def f(): ...
        """,
    ],
)
def test_flags_comment_above_declaration(source: str) -> None:
    assert lines_flagged(source) == [2]


def test_flags_comment_above_method() -> None:
    assert lines_flagged(
        """
        class C:
            # Explains m.
            def m(self): ...
        """
    ) == [3]


def test_flags_each_line_of_a_comment_block() -> None:
    assert lines_flagged(
        """
        # One.
        # Two.
        def f(): ...
        """
    ) == [2, 3]


def test_flags_comment_beside_a_directive() -> None:
    assert lines_flagged(
        """
        # Explains f.
        # noqa: E501
        def f(): ...
        """
    ) == [2]


@pytest.mark.parametrize(
    "source",
    [
        '''
        def f():
            """A docstring."""
        ''',
        """
        # Separated by a blank line.

        def f(): ...
        """,
        """
        x = 1  # A trailing comment.
        def f(): ...
        """,
        """
        def f():
            # Explains the line below, not f.
            return 1
        """,
        """
        # noqa: E501
        # type: ignore[misc]
        # ty: ignore[unresolved-reference]
        # pragma: no cover
        # fmt: off
        @decorator
        def f(): ...
        """,
    ],
)
def test_skips(source: str) -> None:
    assert lines_flagged(source) == []


def test_cli_exits_nonzero_and_names_the_line(tmp_path: Path) -> None:
    bad = tmp_path / "bad.py"
    bad.write_text("# Explains f.\ndef f(): ...\n")
    good = tmp_path / "good.py"
    good.write_text('def f():\n    """A docstring."""\n')

    result = subprocess.run(
        [sys.executable, SCRIPT, good, bad],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert result.stdout.startswith(f"{bad}:1: comment above 'f'")

    result = subprocess.run([sys.executable, SCRIPT, good], check=False)
    assert result.returncode == 0
