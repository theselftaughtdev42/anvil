import pytest
from idea_refiner import (
    GherkinFeature,
    GherkinScenario,
    GherkinStep,
    StepKeyword,
    render_gherkin,
)
from pydantic import ValidationError

GIVEN, WHEN, THEN, AND, BUT = StepKeyword


def steps(*pairs: tuple[StepKeyword, str]) -> list[dict]:
    return [{"keyword": keyword, "text": text} for keyword, text in pairs]


def scenario(name: str = "Rebook", *pairs: tuple[StepKeyword, str]) -> dict:
    return {
        "name": name,
        "steps": steps(*pairs) or steps((GIVEN, "a"), (WHEN, "b"), (THEN, "c")),
    }


@pytest.mark.parametrize(
    "keywords",
    [
        (GIVEN, WHEN, THEN),
        (WHEN, THEN),
        (THEN,),
        (GIVEN, AND, BUT, WHEN, AND, THEN, AND, BUT),
        (GIVEN, GIVEN, WHEN, WHEN, THEN, THEN),
    ],
    ids=["given when then", "no given", "only then", "and and but", "repeats"],
)
def test_scenario_accepts_steps_in_order(keywords: tuple[StepKeyword, ...]) -> None:
    GherkinScenario.model_validate(
        scenario("A", *((keyword, "a step") for keyword in keywords))
    )


@pytest.mark.parametrize(
    "keywords",
    [
        (WHEN, GIVEN, THEN),
        (GIVEN, THEN, WHEN, THEN),
        (AND, WHEN, THEN),
        (BUT, THEN),
        (GIVEN, WHEN),
        (GIVEN,),
    ],
    ids=[
        "given after when",
        "when after then",
        "starts with and",
        "starts with but",
        "no then",
        "only given",
    ],
)
def test_scenario_rejects_steps_out_of_order(
    keywords: tuple[StepKeyword, ...],
) -> None:
    with pytest.raises(ValidationError):
        GherkinScenario.model_validate(
            scenario("A", *((keyword, "a step") for keyword in keywords))
        )


def test_scenario_needs_a_step() -> None:
    with pytest.raises(ValidationError, match="steps"):
        GherkinScenario(name="A", steps=())


def test_feature_needs_a_scenario() -> None:
    with pytest.raises(ValidationError, match="scenarios"):
        GherkinFeature(name="Rebook", scenarios=())


def test_feature_rejects_duplicate_scenario_names() -> None:
    with pytest.raises(ValidationError, match="unique: Rebook"):
        GherkinFeature.model_validate(
            {"name": "F", "scenarios": [scenario("Rebook"), scenario(" Rebook ")]}
        )


@pytest.mark.parametrize(
    "feature",
    [
        {"name": " ", "scenarios": [scenario()]},
        {"name": "F", "scenarios": [scenario("\t")]},
        {"name": "F", "scenarios": [scenario("A", (THEN, "  "))]},
    ],
    ids=["feature name", "scenario name", "step text"],
)
def test_rejects_empty_text(feature: dict) -> None:
    with pytest.raises(ValidationError, match="at least 1 character"):
        GherkinFeature.model_validate(feature)


@pytest.mark.parametrize(
    "feature",
    [
        {"name": "Two\nlines", "scenarios": [scenario()]},
        {"name": "F", "scenarios": [scenario("Two\nlines")]},
        {"name": "F", "scenarios": [scenario("A", (THEN, "two\r\nlines"))]},
    ],
    ids=["feature name", "scenario name", "step text"],
)
def test_rejects_text_over_several_lines(feature: dict) -> None:
    with pytest.raises(ValidationError, match="single line"):
        GherkinFeature.model_validate(feature)


def test_description_may_be_empty() -> None:
    assert GherkinFeature.model_validate({"name": "F", "scenarios": [scenario()]})


def test_renders_english_keywords_with_two_space_indentation() -> None:
    feature = GherkinFeature(
        name="Rebook a missed delivery",
        description="As a customer\n  I want to rebook it\n\nSo that I needn't call",
        scenarios=(
            GherkinScenario(
                name="Another day",
                steps=(
                    GherkinStep(keyword=GIVEN, text="I missed a delivery"),
                    GherkinStep(keyword=AND, text="I have the text"),
                    GherkinStep(keyword=WHEN, text="I pick another day"),
                    GherkinStep(keyword=THEN, text="it moves to that day"),
                    GherkinStep(keyword=BUT, text="not to a Sunday"),
                ),
            ),
            GherkinScenario(
                name="No days free",
                steps=(GherkinStep(keyword=THEN, text="I'm told so"),),
            ),
        ),
    )

    assert render_gherkin(feature) == (
        "Feature: Rebook a missed delivery\n"
        "  As a customer\n"
        "  I want to rebook it\n"
        "\n"
        "  So that I needn't call\n"
        "\n"
        "  Scenario: Another day\n"
        "    Given I missed a delivery\n"
        "    And I have the text\n"
        "    When I pick another day\n"
        "    Then it moves to that day\n"
        "    But not to a Sunday\n"
        "\n"
        "  Scenario: No days free\n"
        "    Then I'm told so\n"
    )


def test_renders_no_description_lines_when_there_is_none() -> None:
    feature = GherkinFeature.model_validate({"name": "F", "scenarios": [scenario()]})

    assert render_gherkin(feature) == (
        "Feature: F\n\n  Scenario: Rebook\n    Given a\n    When b\n    Then c\n"
    )
