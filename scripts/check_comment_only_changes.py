"""Fail when a commit adds comments or docstrings away from any code it changes.

AGENTS.md ("Comments and docstrings") keeps comments to the code being changed.
Each file is compared with HEAD, and a diff hunk that only adds comments or
docstrings fails. Directive comments count as code. It reads the files on disk:
while committing, pre-commit sets unstaged changes aside, so those are exactly
what's being committed.
"""

import ast
import difflib
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

PY_DIRECTIVE = re.compile(
    r"#\s*(noqa|type:\s*ignore|ty:\s*ignore|pragma|fmt:|ruff:|isort:)"
)
TS_COMMENT = re.compile(r"\s*(//|/\*|\*)")
TS_DIRECTIVE = re.compile(
    r"\s*(//|/\*)\s*(oxlint-|eslint-|@ts-(expect-error|ignore|nocheck)|anvil:)"
)
CONTEXT = 3
"""Lines of context around each hunk, as in `git diff`."""


def python_commentary(source: str) -> set[int]:
    """Lines (from 0) that hold only a comment or part of a docstring."""
    lines = set()
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if (
            token.type == tokenize.COMMENT
            and not token.line[: token.start[1]].strip()
            and not PY_DIRECTIVE.match(token.string)
        ):
            lines.add(token.start[0] - 1)
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return lines
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        ):
            lines.update(range(node.lineno - 1, (node.end_lineno or node.lineno)))
    return lines


def ts_commentary(source: str) -> set[int]:
    """Lines (from 0) that hold only a comment or part of a docstring."""
    return {
        n
        for n, line in enumerate(source.splitlines())
        if TS_COMMENT.match(line) and not TS_DIRECTIVE.match(line)
    }


def comment_only_hunks(old: str, new: str, commentary: set[int]) -> list[int]:
    """The first added line (from 1) of each hunk that adds only comments.

    `commentary` holds the lines of `new` that are comments or docstrings.
    """
    old_lines, new_lines = old.splitlines(), new.splitlines()

    def is_prose(n: int) -> bool:
        return n in commentary or not new_lines[n].strip()

    flagged = []
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    for hunk in matcher.get_grouped_opcodes(CONTEXT):
        changes = [op for op in hunk if op[0] != "equal"]
        changes_code = any(
            tag != "insert" or not all(is_prose(n) for n in range(j1, j2))
            for tag, _, _, j1, j2 in changes
        )
        adds_comment = any(
            n in commentary for _, _, _, j1, j2 in changes for n in range(j1, j2)
        )
        if adds_comment and not changes_code:
            flagged.append(changes[0][3] + 1)
    return flagged


def at_head(path: str) -> str | None:
    result = subprocess.run(
        ["git", "show", f"HEAD:./{path}"], check=False, capture_output=True
    )
    return result.stdout.decode() if result.returncode == 0 else None


def main(paths: list[str]) -> int:
    failed = False
    for path in paths:
        old, file = at_head(path), Path(path)
        if old is None or not file.exists():
            continue
        new = file.read_text()
        if Path(path).suffix in {".py", ".pyi"}:
            commentary = python_commentary(new)
        else:
            commentary = ts_commentary(new)
        for line in comment_only_hunks(old, new, commentary):
            failed = True
            print(
                f"{path}:{line}: adds comments away from any code change; keep "
                'them to the code you change (AGENTS.md, "Comments and docstrings")'
            )
    if failed:
        print("If they're wanted: SKIP=comment-only-changes git commit ...")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
