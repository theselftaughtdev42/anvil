# The refinement agent is its own package

The agent that names ideas and asks Questions lives in `packages/idea-refiner/`, a uv workspace member that Anvil depends on with `{ workspace = true }`. Anvil is its only consumer for now; the aim is to publish it on PyPI once it stands on its own.

It knows nothing of Anvil: no FastAPI, no database, and none of Anvil's terms. It refines a `Subject` (a title and the original idea) with optional `context`, and Anvil maps Requirements and the Project Context onto those in `refinement.py`. Choosing the agent (`Settings.agent`, `AgentDep`) stays in Anvil.

Output lengths are guidance to the agent, not validated. The package's docstrings ask for a short title, a 2–4 word topic and at most three suggestions, and a model-backed agent states those in its prompt or output schema. Nothing checks them, so a long value never fails a request: consumers store unbounded text and clip it on display.

The API is unstable (`0.x`) while the model-backed agent settles. Calls stay synchronous, and malformed model output ends in `AgentUnavailable` after retries; see [ADR 0004](0004-the-model-agent-calls-the-model-through-pydantic-ai.md). The verdict on when an idea is clear enough is an empty batch from `ask_questions`, not a separate call. With one consumer in the same repo, changing it costs a single commit.

## Considered Options

- **Keep it in `anvil/agent/` with an import lint rule.** Enforces the same boundary for less, but doesn't get the code ready to reuse elsewhere.
- **Its own repo from the start.** Every change to the API would need a release and a dependency bump in Anvil while the API is still moving. Moving the member out later only changes its `tool.uv.sources` entry (use `git filter-repo --subdirectory-filter` to keep its history).
- **Consumer-set `Limits` checked by the agent.** Rejected: a slightly long topic would fail the whole request, when a cut-off label is harmless.
