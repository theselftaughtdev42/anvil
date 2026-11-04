from typing import Any

import pytest
from gherkin.parser import Parser
from gherkin.pickles.compiler import Compiler
from idea_refiner import (
    GherkinExamples,
    GherkinFeature,
    GherkinRule,
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


def outline(steps_text: str = "I pay <amount>", **examples: object) -> dict:
    return {
        **scenario("Pay", (WHEN, steps_text), (THEN, "it's paid")),
        "examples": {"header": ["amount"], "rows": [["£1"], ["£2"]], **examples},
    }


def rule(*scenarios: dict) -> dict:
    return {"name": "R", "scenarios": list(scenarios) or [scenario()]}


def test_feature_needs_a_scenario() -> None:
    with pytest.raises(ValidationError, match="at least one Scenario"):
        GherkinFeature(name="Rebook", scenarios=())


def test_feature_with_scenarios_only_in_rules_is_valid() -> None:
    feature = GherkinFeature.model_validate({"name": "F", "rules": [rule()]})

    assert [s.name for s in feature.all_scenarios()] == ["Rebook"]


def test_rule_needs_a_scenario() -> None:
    with pytest.raises(ValidationError, match="scenarios"):
        GherkinRule(name="R", scenarios=())


@pytest.mark.parametrize(
    "feature",
    [
        {"scenarios": [scenario("Rebook"), scenario(" Rebook ")]},
        {"scenarios": [scenario("Rebook")], "rules": [rule(scenario("Rebook"))]},
        {"rules": [rule(scenario("Rebook")), rule(scenario("Rebook"))]},
    ],
    ids=["in the feature", "feature and rule", "two rules"],
)
def test_feature_rejects_duplicate_scenario_names(feature: dict) -> None:
    with pytest.raises(ValidationError, match="unique: Rebook"):
        GherkinFeature.model_validate({"name": "F", **feature})


@pytest.mark.parametrize(
    "keywords",
    [(GIVEN,), (GIVEN, AND, BUT), (GIVEN, WHEN), (WHEN,)],
    ids=["given", "and and but", "given when", "when"],
)
def test_background_accepts_steps_without_then(
    keywords: tuple[StepKeyword, ...],
) -> None:
    GherkinFeature.model_validate(
        {
            "name": "F",
            "background": steps(*((k, "a") for k in keywords)),
            "scenarios": [scenario()],
        }
    )


@pytest.mark.parametrize(
    ("keywords", "message"),
    [
        ((GIVEN, THEN), "can't have Then steps"),
        ((THEN,), "can't have Then steps"),
        ((AND, GIVEN), "can't start with And"),
        ((WHEN, GIVEN), "can't follow a later step"),
    ],
    ids=["given then", "only then", "starts with and", "out of order"],
)
def test_background_rejects(keywords: tuple[StepKeyword, ...], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        GherkinFeature.model_validate(
            {
                "name": "F",
                "background": steps(*((k, "a") for k in keywords)),
                "scenarios": [scenario()],
            }
        )


def test_outline_accepts_placeholders_with_columns() -> None:
    scenario = GherkinScenario.model_validate(
        outline(
            "I pay <amount> by <method>",
            header=["amount", "method", "unused"],
            rows=[["£1", "card", ""]],
        )
    )

    assert scenario.examples == GherkinExamples(
        header=("amount", "method", "unused"), rows=(("£1", "card", ""),)
    )


def test_outline_rejects_a_placeholder_without_a_column() -> None:
    with pytest.raises(ValidationError, match="column: <currency>, <method>"):
        GherkinScenario.model_validate(outline("I pay <amount> <currency> <method>"))


def test_angle_brackets_without_examples_are_plain_text() -> None:
    assert GherkinScenario.model_validate(scenario("A", (THEN, "I see <nothing>")))


@pytest.mark.parametrize(
    ("examples", "message"),
    [
        ({"rows": [["£1", "extra"]]}, "row 1 has 2 cells but the header has 1"),
        ({"rows": [["£1"], []]}, "row 2 has 0 cells"),
        ({"rows": []}, "rows"),
        ({"header": []}, "header"),
        ({"header": ["amount", " amount"], "rows": [["1", "2"]]}, "unique: amount"),
        ({"header": [" "]}, "at least 1 character"),
        ({"rows": [["two\nlines"]]}, "single line"),
    ],
    ids=[
        "row too wide",
        "row too narrow",
        "no rows",
        "no header",
        "repeated column",
        "blank column",
        "cell over two lines",
    ],
)
def test_examples_reject(examples: dict, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        GherkinScenario.model_validate(outline(**examples))


@pytest.mark.parametrize(
    "line",
    [
        "# a comment",
        "@tag",
        "Rule: no refunds",
        "Background:",
        "Scenario: x",
        "Example: x",
        "Scenario Outline: x",
        "Scenario Template: x",
    ],
)
def test_descriptions_reject_lines_gherkin_would_misread(line: str) -> None:
    text = f"As a customer\n  {line}"
    with pytest.raises(ValidationError, match="description line can't start"):
        GherkinFeature.model_validate(
            {"name": "F", "description": text, "scenarios": [scenario()]}
        )
    with pytest.raises(ValidationError, match="description line can't start"):
        GherkinRule.model_validate({**rule(), "description": text})


def test_descriptions_allow_keywords_mid_line() -> None:
    assert GherkinFeature.model_validate(
        {
            "name": "F",
            "description": "Out of scope: the Rule: refunds #1",
            "scenarios": [scenario()],
        }
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


EVERY_KEYWORD = GherkinFeature.model_validate(
    {
        "name": "Rebook a missed delivery",
        "description": "As a customer\nI want to rebook it\n\nOut of scope: refunds",
        "background": steps((GIVEN, "I missed a delivery"), (AND, "I have the text")),
        "scenarios": [scenario("Another day", (WHEN, "I pick a day"), (THEN, "done"))],
        "rules": [
            {
                "name": "Only free days",
                "description": "The depot sets the slots.\nSundays are closed.",
                "scenarios": [
                    {
                        "name": "Days on offer",
                        "steps": steps(
                            (GIVEN, "<day> has <slots> slots"),
                            (WHEN, "I open the link"),
                            (THEN, "<day> is <shown>"),
                            (BUT, "not a Sunday"),
                        ),
                        "examples": {
                            "header": ["day", "slots", "shown"],
                            "rows": [
                                ["Tuesday", "3", "offered"],
                                ["Wed | Thu", "0", "not offered"],
                                ["Back\\slash", "", "offered"],
                            ],
                        },
                    },
                    scenario("No days free", (THEN, "I'm told so")),
                ],
            },
            {"name": "Texts", "scenarios": [scenario("Confirm", (THEN, "a text"))]},
        ],
    }
)


def test_renders_background_rules_and_outlines() -> None:
    assert render_gherkin(EVERY_KEYWORD) == (
        "Feature: Rebook a missed delivery\n"
        "  As a customer\n"
        "  I want to rebook it\n"
        "\n"
        "  Out of scope: refunds\n"
        "\n"
        "  Background:\n"
        "    Given I missed a delivery\n"
        "    And I have the text\n"
        "\n"
        "  Scenario: Another day\n"
        "    When I pick a day\n"
        "    Then done\n"
        "\n"
        "  Rule: Only free days\n"
        "    The depot sets the slots.\n"
        "    Sundays are closed.\n"
        "\n"
        "    Scenario Outline: Days on offer\n"
        "      Given <day> has <slots> slots\n"
        "      When I open the link\n"
        "      Then <day> is <shown>\n"
        "      But not a Sunday\n"
        "\n"
        "      Examples:\n"
        "        | day         | slots | shown       |\n"
        "        | Tuesday     | 3     | offered     |\n"
        "        | Wed \\| Thu  | 0     | not offered |\n"
        "        | Back\\\\slash |       | offered     |\n"
        "\n"
        "    Scenario: No days free\n"
        "      Then I'm told so\n"
        "\n"
        "  Rule: Texts\n"
        "\n"
        "    Scenario: Confirm\n"
        "      Then a text\n"
    )


def parse(feature: GherkinFeature) -> Any:
    # gherkin-official types a Rule's or Feature's children wrongly, as Envelopes.
    return Parser().parse(render_gherkin(feature))["feature"]


def test_cucumber_parses_every_keyword_as_written() -> None:
    parsed = parse(EVERY_KEYWORD)

    assert parsed["name"] == "Rebook a missed delivery"
    assert parsed["description"].splitlines() == [
        "  As a customer",
        "  I want to rebook it",
        "",
        "  Out of scope: refunds",
    ]
    background, plain, *rules = parsed["children"]
    assert [s["text"] for s in background["background"]["steps"]] == [
        "I missed a delivery",
        "I have the text",
    ]
    assert plain["scenario"]["name"] == "Another day"
    first, second = (child["rule"] for child in rules)
    assert first["name"] == "Only free days"
    assert first["description"].split("\n") == [
        "    The depot sets the slots.",
        "    Sundays are closed.",
    ]
    outline = first["children"][0]["scenario"]
    assert outline["keyword"] == "Scenario Outline"
    assert [c["value"] for c in outline["examples"][0]["tableHeader"]["cells"]] == [
        "day",
        "slots",
        "shown",
    ]
    assert second["name"] == "Texts"


def test_cucumber_runs_an_outline_once_per_row() -> None:
    document = Parser().parse(render_gherkin(EVERY_KEYWORD))

    pickles = Compiler().compile({**document, "uri": "rebook.feature"})

    days = [p["steps"][2]["text"] for p in pickles if p["name"] == "Days on offer"]
    assert days == [
        "Tuesday has 3 slots",
        "Wed | Thu has 0 slots",
        "Back\\slash has  slots",
    ]
    # The Background runs before every Scenario.
    assert all(p["steps"][0]["text"] == "I missed a delivery" for p in pickles)
    assert len(pickles) == 6


def test_cucumber_parses_a_plain_feature() -> None:
    feature = GherkinFeature.model_validate({"name": "F", "scenarios": [scenario()]})

    assert [c["scenario"]["name"] for c in parse(feature)["children"]] == ["Rebook"]
