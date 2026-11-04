"""A Gherkin Feature as structured output, and its rendering to `.feature` text.

Supports Background, Rules and Scenario Outlines, but not tags, data tables, doc
strings or localised keywords.
"""

import re
from collections.abc import Iterable, Sequence
from enum import StrEnum
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator


def single_line(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError("must be a single line")
    return value


Line = Annotated[str, Field(min_length=1), AfterValidator(single_line)]
"""Non-blank once stripped, and on one line, since Gherkin is line-based."""

# Cucumber reads a description line starting with one of these as a comment, a tag
# or the next block, so it would drop that line or the rest of the description.
DESCRIPTION_LINE_STARTS = (
    "#",
    "@",
    "Rule:",
    "Background:",
    "Scenario:",
    "Example:",
    "Scenario Outline:",
    "Scenario Template:",
)


def free_text(value: str) -> str:
    for line in value.splitlines():
        if line.strip().startswith(DESCRIPTION_LINE_STARTS):
            raise ValueError(
                f"A description line can't start with {line.strip().split()[0]}"
            )
    return value


Description = Annotated[str, AfterValidator(free_text)]
"""Free text for readers, possibly several lines or empty."""


class StepKeyword(StrEnum):
    GIVEN = "Given"
    WHEN = "When"
    THEN = "Then"
    AND = "And"
    BUT = "But"


# And and But continue the step before, so they take its place in the order.
STEP_ORDER = {StepKeyword.GIVEN: 0, StepKeyword.WHEN: 1, StepKeyword.THEN: 2}

PLACEHOLDER = re.compile(r"<([^<>]+)>")


class GherkinModel(BaseModel):
    """Field docstrings go into the JSON schema, so a model writing a Feature as
    structured output reads them as field descriptions."""

    model_config = ConfigDict(
        frozen=True, str_strip_whitespace=True, use_attribute_docstrings=True
    )


class GherkinStep(GherkinModel):
    keyword: StepKeyword
    """Given for the starting state, When for what someone does, Then for the
    outcome. And or But continues the kind of step before it."""
    text: Line
    """The step without its keyword, for example "I open the delivery text". In a
    Scenario Outline, `<column>` stands for a value from its Examples."""


def check_order(steps: Iterable[GherkinStep], where: str) -> int:
    """The order of the last step, after checking they go Given, When, Then and
    don't start with And or But. -1 when there are none.
    """
    current = -1
    for step in steps:
        if step.keyword in STEP_ORDER:
            order = STEP_ORDER[step.keyword]
            if order < current:
                raise ValueError(
                    f"{step.keyword} can't follow a later step; "
                    "steps go Given, then When, then Then"
                )
            current = order
        elif current == -1:
            raise ValueError(f"{where} can't start with {step.keyword}")
    return current


Cell = Annotated[str, AfterValidator(single_line)]


class GherkinExamples(GherkinModel):
    """The table of cases for a Scenario Outline: one row per case, each as wide as
    the header.
    """

    header: tuple[Line, ...] = Field(min_length=1)
    """The column names, each used in the steps as a `<column>` placeholder."""
    rows: tuple[tuple[Cell, ...], ...] = Field(min_length=1)
    """The values for each case, in the header's column order."""

    @model_validator(mode="after")
    def rectangular(self) -> Self:
        duplicates = repeated(self.header)
        if duplicates:
            raise ValueError(f"Examples columns must be unique: {duplicates}")
        for number, row in enumerate(self.rows, start=1):
            if len(row) != len(self.header):
                raise ValueError(
                    f"Examples row {number} has {len(row)} cells "
                    f"but the header has {len(self.header)}"
                )
        return self


class GherkinScenario(GherkinModel):
    """One example of the behaviour: optional Givens, then Whens, then Thens.

    It ends in a Then, and And or But never comes first. With Examples it's a
    Scenario Outline, run once per row.
    """

    name: Line
    """Names the case it covers, unique across the Feature."""
    steps: tuple[GherkinStep, ...] = Field(min_length=1)
    examples: GherkinExamples | None = None
    """Only for cases that differ by data alone, which makes this a Scenario
    Outline. Null for a plain Scenario."""

    @model_validator(mode="after")
    def steps_in_order(self) -> Self:
        if check_order(self.steps, "A Scenario") != STEP_ORDER[StepKeyword.THEN]:
            raise ValueError("A Scenario must end with a Then")
        return self

    @model_validator(mode="after")
    def placeholders_have_columns(self) -> Self:
        if self.examples is None:
            return self
        placeholders = {
            name for step in self.steps for name in PLACEHOLDER.findall(step.text)
        }
        missing = sorted(placeholders - set(self.examples.header))
        if missing:
            raise ValueError(
                "Placeholders need an Examples column: "
                + ", ".join(f"<{name}>" for name in missing)
            )
        return self


class GherkinRule(GherkinModel):
    """A business rule the Feature follows, with the Scenarios that illustrate it."""

    name: Line
    """The rule itself, stated briefly."""
    description: Description = ""
    """Free text explaining the rule, possibly empty."""
    scenarios: tuple[GherkinScenario, ...] = Field(min_length=1)


class GherkinFeature(GherkinModel):
    """A Gherkin Feature: a name, a free-text description, an optional Background,
    and Scenarios, directly or grouped into Rules. It has at least one Scenario, and
    their names are unique across the Feature.
    """

    name: Line
    """A short name for the behaviour."""
    description: Description = ""
    """Free text under the Feature line, such as "As a … I want … So that …". May be
    several lines, or empty."""
    background: tuple[GherkinStep, ...] = ()
    """Steps run before every Scenario, setting up state: no Thens. Empty unless
    every Scenario starts the same way."""
    scenarios: tuple[GherkinScenario, ...] = ()
    """Scenarios not under a Rule."""
    rules: tuple[GherkinRule, ...] = ()
    """Business rules, each with the Scenarios that illustrate it."""

    def all_scenarios(self) -> list[GherkinScenario]:
        return [
            *self.scenarios,
            *(scenario for rule in self.rules for scenario in rule.scenarios),
        ]

    @model_validator(mode="after")
    def background_sets_up(self) -> Self:
        if check_order(self.background, "A Background") == STEP_ORDER[StepKeyword.THEN]:
            raise ValueError("A Background can't have Then steps")
        return self

    @model_validator(mode="after")
    def has_unique_scenarios(self) -> Self:
        names = [scenario.name for scenario in self.all_scenarios()]
        if not names:
            raise ValueError("A Feature needs at least one Scenario")
        duplicates = repeated(names)
        if duplicates:
            raise ValueError(f"Scenario names must be unique: {duplicates}")
        return self


def repeated(values: Sequence[str]) -> str:
    return ", ".join(sorted({value for value in values if values.count(value) > 1}))


INDENT = "  "


def render_gherkin(feature: GherkinFeature) -> str:
    """The Feature as `.feature` text: English keywords, two-space indentation, a
    blank line before each block and a final newline. Scenarios outside Rules come
    first, as Gherkin requires.
    """
    lines = [f"Feature: {feature.name}", *description(feature.description, 1)]
    if feature.background:
        lines += ["", f"{INDENT}Background:", *steps(feature.background, 2)]
    for scenario in feature.scenarios:
        lines += render_scenario(scenario, 1)
    for rule in feature.rules:
        lines += ["", f"{INDENT}Rule: {rule.name}", *description(rule.description, 2)]
        for scenario in rule.scenarios:
            lines += render_scenario(scenario, 2)
    return "\n".join(lines) + "\n"


def description(text: str, depth: int) -> list[str]:
    return [
        f"{INDENT * depth}{line.strip()}" if line.strip() else ""
        for line in text.splitlines()
    ]


def steps(steps: Iterable[GherkinStep], depth: int) -> list[str]:
    return [f"{INDENT * depth}{step.keyword} {step.text}" for step in steps]


def render_scenario(scenario: GherkinScenario, depth: int) -> list[str]:
    keyword = "Scenario" if scenario.examples is None else "Scenario Outline"
    lines = ["", f"{INDENT * depth}{keyword}: {scenario.name}"]
    lines += steps(scenario.steps, depth + 1)
    if scenario.examples is not None:
        lines += ["", f"{INDENT * (depth + 1)}Examples:"]
        lines += table(scenario.examples, depth + 2)
    return lines


def table(examples: GherkinExamples, depth: int) -> list[str]:
    """The Examples as a table with aligned columns and `\\` and `|` escaped."""
    rows = [
        [cell.replace("\\", "\\\\").replace("|", "\\|") for cell in row]
        for row in (examples.header, *examples.rows)
    ]
    widths = [max(len(row[column]) for row in rows) for column in range(len(rows[0]))]
    return [
        INDENT * depth
        + "| "
        + " | ".join(cell.ljust(width) for cell, width in zip(row, widths, strict=True))
        + " |"
        for row in rows
    ]
