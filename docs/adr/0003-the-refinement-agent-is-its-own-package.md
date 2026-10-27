# The refinement agent is its own package

The agent that names ideas and asks Questions lives in `packages/idea-refiner/`, a uv workspace member that Anvil depends on with `{ workspace = true }`. Anvil is its only consumer for now; the aim is to publish it on PyPI once it stands on its own.

It knows nothing of Anvil: no FastAPI, no database, and none of Anvil's terms. It refines a `Subject` (a title and the original idea) with optional `context`, and Anvil maps Requirements and the Project Context onto those in `refinement.py`. Choosing the agent (`Settings.agent`, `AgentDep`) stays in Anvil.

The consumer sets the output limits. Topic and title lengths and the number of suggestions depend on where the output ends up, such as Anvil's `question.topic` column, so they're passed to the agent as `Limits` and the agent checks its own output against them.

The API is unstable (`0.x`) until a real, model-backed agent has reshaped it: async calls, a verdict on when an idea is clear enough, and what happens when the model breaks a limit are all still to come. With one consumer in the same repo, changing it costs a single commit.

## Considered Options

- **Keep it in `anvil/agent/` with an import lint rule.** Enforces the same boundary for less, but doesn't get the code ready to reuse elsewhere.
- **Its own repo from the start.** Every change to the API would need a release and a dependency bump in Anvil while the API is still moving. Moving the member out later only changes its `tool.uv.sources` entry (use `git filter-repo --subdirectory-filter` to keep its history).
- **The package owns the limits.** Simpler, but another consumer's columns won't match Anvil's.
