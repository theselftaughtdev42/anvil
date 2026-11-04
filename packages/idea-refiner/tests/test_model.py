import asyncio
import logging
from typing import Any

import pytest
from idea_refiner import (
    AgentUnavailable,
    AskedQuestion,
    GherkinFeature,
    GherkinScenario,
    GherkinStep,
    QuestionDraft,
    StepKeyword,
    Subject,
)
from idea_refiner.model import ModelAgent
from pydantic_ai import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.messages import UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

SUBJECT = Subject(
    title="Rebook missed deliveries",
    idea="customers should be able to rebook a missed delivery from the text",
)


class ScriptedModel:
    """Replies with `output`, as text or as the output tool's arguments (a dict as
    they are, anything else wrapped as pydantic-ai wraps a non-object), and keeps
    the user prompt of every request. Given several outputs, replies with the next
    one each request, repeating the last.
    """

    def __init__(self, output: Any, *more: Any) -> None:
        self.outputs = [output, *more]
        self.prompts: list[str] = []
        self.requests = 0

    def __call__(self, messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        self.prompts.extend(
            str(part.content)
            for message in messages
            for part in message.parts
            if isinstance(part, UserPromptPart)
        )
        output = self.outputs[min(self.requests, len(self.outputs) - 1)]
        self.requests += 1
        if info.output_tools:
            tool = info.output_tools[0].name
            args = output if isinstance(output, dict) else {"response": output}
            return ModelResponse(parts=[ToolCallPart(tool, args)])
        return ModelResponse(parts=[TextPart(output)])

    def agent(self) -> ModelAgent:
        return ModelAgent(FunctionModel(self))


def ask(
    model: ScriptedModel,
    asked: list[AskedQuestion] | None = None,
    context: str | None = None,
    feedback: list[str] | None = None,
) -> list[QuestionDraft]:
    return model.agent().ask_questions(SUBJECT, asked or [], context, feedback or [])


def test_name_idea_returns_the_models_title() -> None:
    model = ScriptedModel("  Rebook missed deliveries by text \n")

    assert model.agent().name_idea(SUBJECT.idea, None) == (
        "Rebook missed deliveries by text"
    )


def test_name_idea_sends_the_idea_and_context() -> None:
    model = ScriptedModel("A title")

    model.agent().name_idea(SUBJECT.idea, "We run a parcel network.")

    [prompt] = model.prompts
    assert SUBJECT.idea in prompt
    assert "We run a parcel network." in prompt


def test_name_idea_sends_no_context_when_there_is_none() -> None:
    model = ScriptedModel("A title")

    model.agent().name_idea(SUBJECT.idea, None)

    [prompt] = model.prompts
    assert "context" not in prompt.lower()
    assert "None" not in prompt


def test_ask_questions_sends_everything_it_knows() -> None:
    model = ScriptedModel([])
    asked = [
        AskedQuestion(topic="Who", text="Who will use this most?", answer="Drivers"),
        AskedQuestion(topic="When", text="When do you need it by?"),
    ]

    ask(
        model,
        asked=asked,
        context="We run a parcel network.",
        feedback=["Nothing about refunds", "Still nothing about refunds"],
    )

    [prompt] = model.prompts
    for expected in (
        SUBJECT.title,
        SUBJECT.idea,
        "We run a parcel network.",
        "Who will use this most?",
        "Drivers",
        "When do you need it by?",
        "Nothing about refunds",
        "Still nothing about refunds",
    ):
        assert expected in prompt
    # Asked Questions and feedback keep their order.
    assert prompt.index("Who will use this most?") < prompt.index("When do you need")
    assert prompt.index("Nothing about") < prompt.index("Still nothing about")


def test_ask_questions_sends_no_context_when_there_is_none() -> None:
    model = ScriptedModel([])

    ask(model)

    [prompt] = model.prompts
    assert "context" not in prompt.lower()
    assert "None" not in prompt


def test_ask_questions_returns_the_models_drafts() -> None:
    model = ScriptedModel(
        [
            {
                "topic": " Refunds ",
                "text": "Can a rebooked delivery be refunded?",
                "why": "Refunds change what rebooking has to undo.",
                "suggestions": ["Yes", "No"],
            },
            {"topic": "Cut-off", "text": "How late can a customer rebook?"},
        ]
    )

    assert ask(model) == [
        QuestionDraft(
            topic="Refunds",
            text="Can a rebooked delivery be refunded?",
            why="Refunds change what rebooking has to undo.",
            suggestions=("Yes", "No"),
        ),
        QuestionDraft(topic="Cut-off", text="How late can a customer rebook?"),
    ]


def test_an_empty_reply_means_nothing_more_to_ask() -> None:
    assert ask(ScriptedModel([])) == []


def test_each_call_is_logged_with_model_usage_and_latency(
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = ScriptedModel([])
    agent = model.agent()

    with caplog.at_level(logging.INFO, logger="idea_refiner"):
        agent.ask_questions(SUBJECT, [], None, [])

    [record] = caplog.records
    assert record.levelno == logging.INFO
    message = record.getMessage()
    assert agent.model.model_name in message
    assert "tokens" in message
    assert " ms" in message


def test_accepts_a_provider_and_model_string(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "not-a-real-key")

    agent = ModelAgent("anthropic:claude-sonnet-5-5")

    assert agent.model.system == "anthropic"
    assert agent.model.model_name == "claude-sonnet-5-5"


INVALID = [{"topic": "", "text": "A Question with no topic"}]
VALID = [{"topic": "Refunds", "text": "Can a rebooked delivery be refunded?"}]


def test_an_invalid_reply_is_sent_back_to_be_corrected() -> None:
    model = ScriptedModel(INVALID, VALID)

    assert ask(model) == [
        QuestionDraft(topic="Refunds", text="Can a rebooked delivery be refunded?")
    ]
    assert model.requests == 2


def test_replies_that_stay_invalid_make_the_agent_unavailable() -> None:
    model = ScriptedModel(INVALID)

    with pytest.raises(AgentUnavailable):
        ask(model)
    assert model.requests == 1 + ModelAgent.OUTPUT_RETRIES


def test_a_provider_error_makes_the_agent_unavailable() -> None:
    error = ModelAPIError("function", "Connection refused")

    def fail(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        raise error

    agent = ModelAgent(FunctionModel(fail))

    with pytest.raises(AgentUnavailable) as raised:
        agent.name_idea(SUBJECT.idea, None)
    assert raised.value.__cause__ is error


def test_a_call_slower_than_the_timeout_makes_the_agent_unavailable() -> None:
    async def hang(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        await asyncio.sleep(10)
        return ModelResponse(parts=[TextPart("Too late")])

    agent = ModelAgent(FunctionModel(hang), timeout_seconds=0.05)

    with pytest.raises(AgentUnavailable):
        agent.name_idea(SUBJECT.idea, None)


FEATURE: dict[str, Any] = {
    "name": "Rebook missed deliveries",
    "description": "As a customer\nI want to rebook from the text",
    "scenarios": [
        {
            "name": "Another day",
            "steps": [
                {"keyword": "Given", "text": "I missed a delivery"},
                {"keyword": "When", "text": "I pick another day"},
                {"keyword": "Then", "text": "it moves to that day"},
            ],
        }
    ],
}


def write(
    model: ScriptedModel,
    asked: list[AskedQuestion] | None = None,
    context: str | None = None,
    feedback: list[str] | None = None,
) -> GherkinFeature:
    return model.agent().write_gherkin(SUBJECT, asked or [], context, feedback or [])


def test_write_gherkin_returns_the_models_feature() -> None:
    assert write(ScriptedModel(FEATURE)) == GherkinFeature(
        name="Rebook missed deliveries",
        description="As a customer\nI want to rebook from the text",
        scenarios=(
            GherkinScenario(
                name="Another day",
                steps=(
                    GherkinStep(keyword=StepKeyword.GIVEN, text="I missed a delivery"),
                    GherkinStep(keyword=StepKeyword.WHEN, text="I pick another day"),
                    GherkinStep(keyword=StepKeyword.THEN, text="it moves to that day"),
                ),
            ),
        ),
    )


def test_write_gherkin_sends_everything_it_knows() -> None:
    model = ScriptedModel(FEATURE)

    write(
        model,
        asked=[AskedQuestion(topic="Who", text="Who will use this?", answer="Drivers")],
        context="We run a parcel network.",
        feedback=["Nothing about refunds"],
    )

    [prompt] = model.prompts
    for expected in (
        SUBJECT.title,
        SUBJECT.idea,
        "We run a parcel network.",
        "Who will use this?",
        "Drivers",
        "Nothing about refunds",
    ):
        assert expected in prompt


def test_a_feature_out_of_order_is_sent_back_to_be_corrected() -> None:
    [scenario] = FEATURE["scenarios"]
    reversed_steps = {**scenario, "steps": scenario["steps"][::-1]}
    model = ScriptedModel({**FEATURE, "scenarios": [reversed_steps]}, FEATURE)

    assert write(model).scenarios[0].name == "Another day"
    assert model.requests == 2


def test_a_feature_that_stays_invalid_makes_the_agent_unavailable() -> None:
    model = ScriptedModel({**FEATURE, "scenarios": []})

    with pytest.raises(AgentUnavailable):
        write(model)
    assert model.requests == 1 + ModelAgent.OUTPUT_RETRIES
