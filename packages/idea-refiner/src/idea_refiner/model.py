"""A RefinementAgent backed by a language model, through pydantic-ai.

Needs one of the package's provider extras, such as `idea-refiner[anthropic]`.
"""

import logging
import time
from collections.abc import Sequence

from pydantic_ai import Agent, AgentRunResult
from pydantic_ai.exceptions import AgentRunError
from pydantic_ai.models import Model, infer_model

from idea_refiner.base import AgentUnavailable, AskedQuestion, QuestionDraft, Subject

logger = logging.getLogger(__name__)

NAME_INSTRUCTIONS = """\
Give the idea a short title: a few words that read as a headline, such as \
"Rebook missed deliveries by text". Reply with the title alone, with no quotes \
and no full stop. When context is given, it's background about where the idea \
comes from.\
"""

ASK_INSTRUCTIONS = """\
You help make an idea clear enough to act on, by asking its author Questions.

You're given the Subject (its title and the idea as its author wrote it), \
sometimes context about where the idea comes from, every Question asked so far \
with its answer, and feedback: what the author said was still missing each time \
they disagreed that the Subject was clear enough.

Ask the next 1 to 3 Questions that would most help make the Subject clear \
enough to act on. Ask fewer when only one or two are worth asking; never pad a \
batch with weak Questions. Never repeat an asked Question, even reworded, and \
don't ask about anything the context or the answers already cover. Build on \
the answers to go deeper. Make sure every piece of feedback is covered.

When the Subject is already clear enough to act on, return an empty list.

For each Question give:
- topic: a short label of 2 to 4 words, such as "Edge cases"
- text: the Question itself
- why: why you're asking, in one sentence
- suggestions: at most three short suggested answers\
"""


class ModelAgent:
    """A RefinementAgent that asks a language model, one model request per call.

    `model` is a pydantic-ai model, or a `provider:model` string such as
    `anthropic:claude-sonnet-5-5`, whose provider reads its API key and base URL
    from its standard environment variables.

    A reply that doesn't match the expected output is sent back to the model to
    correct, up to `OUTPUT_RETRIES` times. Each call, retries included, must finish
    within `timeout_seconds`.

    Raises pydantic-ai's UserError on construction when the provider is unknown or
    its configuration is incomplete.
    """

    OUTPUT_RETRIES = 2

    def __init__(self, model: Model | str, timeout_seconds: float = 60) -> None:
        self.model = infer_model(model)
        self.timeout_seconds = timeout_seconds
        self._namer = Agent(
            self.model,
            name="name_idea",
            instructions=NAME_INSTRUCTIONS,
            retries={"output": self.OUTPUT_RETRIES},
        )
        self._asker = Agent(
            self.model,
            name="ask_questions",
            output_type=list[QuestionDraft],
            instructions=ASK_INSTRUCTIONS,
            retries={"output": self.OUTPUT_RETRIES},
        )

    def name_idea(self, idea: str, context: str | None) -> str:
        prompt = section("Idea", idea)
        if context:
            prompt = section("Context", context) + prompt
        return self._run(self._namer, prompt).strip()

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
        feedback: Sequence[str],
    ) -> list[QuestionDraft]:
        prompt = section("Subject", f"Title: {subject.title}\n\nIdea:\n{subject.idea}")
        if context:
            prompt += section("Context", context)
        prompt += section(
            "Questions asked so far",
            "\n\n".join(describe(question) for question in asked)
            or "No Questions yet.",
        )
        if feedback:
            prompt += section(
                "Feedback, oldest first", "\n".join(f"- {note}" for note in feedback)
            )
        return self._run(self._asker, prompt)

    def _run[T](self, agent: Agent[None, T], prompt: str) -> T:
        start = time.perf_counter()
        try:
            result: AgentRunResult[T] = agent.run_sync(
                prompt, timeout=self.timeout_seconds
            )
        # pydantic-ai raises an AgentRunError for exhausted retries, timeouts and
        # provider or network failures alike; anything else is a bug and propagates.
        except AgentRunError as error:
            logger.warning("%s failed: %s", agent.name, error)
            raise AgentUnavailable(f"{agent.name} failed: {error}") from error
        usage = result.usage
        logger.info(
            "%s with %s:%s took %.0f ms, %d input and %d output tokens",
            agent.name,
            self.model.system,
            self.model.model_name,
            (time.perf_counter() - start) * 1000,
            usage.input_tokens,
            usage.output_tokens,
        )
        return result.output


def section(heading: str, body: str) -> str:
    return f"## {heading}\n\n{body}\n\n"


def describe(question: AskedQuestion) -> str:
    answer = question.answer if question.answer is not None else "(unanswered)"
    return f"{question.topic}: {question.text}\nAnswer: {answer}"
