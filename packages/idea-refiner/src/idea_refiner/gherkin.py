"""A Gherkin Feature as structured output, and its rendering to `.feature` text.

Rule, Background and Scenario Outlines aren't supported yet.
"""

from enum import StrEnum
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, Field, model_validator


def single_line(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError("must be a single line")
    return value


Line = Annotated[str, Field(min_length=1), AfterValidator(single_line)]
"""Non-blank once stripped, and on one line, since Gherkin is line-based."""


class StepKeyword(StrEnum):
    GIVEN = "Given"
    WHEN = "When"
    THEN = "Then"
    AND = "And"
    BUT = "But"


# And and But continue the step before, so they take its place in the order.
STEP_ORDER = {StepKeyword.GIVEN: 0, StepKeyword.WHEN: 1, StepKeyword.THEN: 2}


class GherkinStep(BaseModel, frozen=True, str_strip_whitespace=True):
    keyword: StepKeyword
    text: Line
    """The step without its keyword, for example "I open the delivery text"."""


class GherkinScenario(BaseModel, frozen=True, str_strip_whitespace=True):
    """One example of the behaviour: optional Givens, then Whens, then Thens.

    It ends in a Then, and And or But never comes first.
    """

    name: Line
    steps: tuple[GherkinStep, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def steps_in_order(self) -> Self:
        current = -1
        for step in self.steps:
            if step.keyword in STEP_ORDER:
                order = STEP_ORDER[step.keyword]
                if order < current:
                    raise ValueError(
                        f"{step.keyword} can't follow a later step; "
                        "steps go Given, then When, then Then"
                    )
                current = order
            elif current == -1:
                raise ValueError(f"A Scenario can't start with {step.keyword}")
        if current != STEP_ORDER[StepKeyword.THEN]:
            raise ValueError("A Scenario must end with a Then")
        return self


class GherkinFeature(BaseModel, frozen=True, str_strip_whitespace=True):
    """A Gherkin Feature: a name, a free-text description and its Scenarios, whose
    names are unique.
    """

    name: Line
    description: str = ""
    """Free text under the Feature line, such as "As a … I want … So that …". May be
    several lines, or empty."""
    scenarios: tuple[GherkinScenario, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_scenario_names(self) -> Self:
        names = [scenario.name for scenario in self.scenarios]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise ValueError(f"Scenario names must be unique: {', '.join(duplicates)}")
        return self


INDENT = "  "


def render_gherkin(feature: GherkinFeature) -> str:
    """The Feature as `.feature` text: English keywords, two-space indentation, a
    blank line before each Scenario and a final newline.
    """
    lines = [f"Feature: {feature.name}"]
    lines += [
        f"{INDENT}{line.strip()}" if line.strip() else ""
        for line in feature.description.splitlines()
    ]
    for scenario in feature.scenarios:
        lines += ["", f"{INDENT}Scenario: {scenario.name}"]
        lines += [f"{INDENT * 2}{step.keyword} {step.text}" for step in scenario.steps]
    return "\n".join(lines) + "\n"
