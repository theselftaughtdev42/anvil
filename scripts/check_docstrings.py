"""Fail when a `#` comment sits directly above a `def`, `class` or class attribute.

AGENTS.md ("Comments and docstrings") says to explain a function or class with
a docstring, not a comment above it. Ruff has no custom rules, so pre-commit
and CI run this script on the Python files instead.
"""

import ast
import io
import re
import sys
import tokenize
from collections.abc import Iterator
from pathlib import Path
from typing import NamedTuple

# Comments that steer a tool rather than explain the code below them.
DIRECTIVE = re.compile(
    r"#\s*(noqa|type:\s*ignore|ty:\s*ignore|pragma|fmt:|ruff:|isort:)"
)


class Violation(NamedTuple):
    line: int
    name: str


def full_line_comments(source: str) -> dict[int, str]:
    """Map each line holding only a comment to that comment's text."""
    comments = {}
    tokens = tokenize.generate_tokens(io.StringIO(source).readline)
    for token in tokens:
        if token.type == tokenize.COMMENT and not token.line[: token.start[1]].strip():
            comments[token.start[0]] = token.string
    return comments


def declarations(tree: ast.Module) -> Iterator[tuple[int, str]]:
    """Each def, class and class attribute, as its first line (decorators
    included) and name."""
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            yield (
                min([node.lineno] + [d.lineno for d in node.decorator_list]),
                node.name,
            )
        if isinstance(node, ast.ClassDef):
            for statement in node.body:
                if isinstance(statement, ast.Assign):
                    yield statement.lineno, ast.unparse(statement.targets[0])
                elif isinstance(statement, ast.AnnAssign):
                    yield statement.lineno, ast.unparse(statement.target)


def check(source: str) -> list[Violation]:
    """Find comments directly above a declaration."""
    comments = full_line_comments(source)
    violations = []
    for first_line, name in declarations(ast.parse(source)):
        line = first_line - 1
        while line in comments:
            if not DIRECTIVE.match(comments[line]):
                violations.append(Violation(line, name))
            line -= 1
    return sorted(violations)


def main(paths: list[str]) -> int:
    failed = False
    for path in paths:
        for violation in check(Path(path).read_text()):
            failed = True
            print(
                f"{path}:{violation.line}: comment above {violation.name!r}; "
                'use a docstring instead (AGENTS.md, "Comments and docstrings")'
            )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
