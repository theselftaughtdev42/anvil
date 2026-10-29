# The model agent calls the model through pydantic-ai

`ModelAgent` in `idea-refiner` asks a language model through pydantic-ai, so the operator picks any provider with `AGENT_MODEL=provider:model` and its standard environment variables, and the package has no provider code of its own. Provider SDKs are optional extras (`idea-refiner[anthropic]`, `idea-refiner[openai]`); the OpenAI one also covers OpenAI-compatible endpoints such as OVHcloud AI Endpoints, Ollama and vLLM.

Each `RefinementAgent` method is one agent run: `name_idea` returns plain text, and `ask_questions` returns a `list[QuestionDraft]` as structured output, so the verdict that a Requirement is clear enough is still an empty list rather than a separate call.

Calls are synchronous and happen inside the request. Dealing Questions holds the Requirement's row lock while the model replies, so two requests can't deal twice, and the new Questions are in the response. A slow model holds a lock and a worker for as long as `AGENT_TIMEOUT_SECONDS`, which is acceptable with one operator and only one request per Requirement at a time.

A reply that doesn't match the output type goes back to the model to correct, up to `OUTPUT_RETRIES` times, all within the timeout. When retries run out, the timeout passes or the provider fails, pydantic-ai's `AgentRunError` becomes `AgentUnavailable`, the one error a method raises. Anvil answers it with a 503 and the request's transaction rolls back, so nothing is saved: no Requirement without a title and no half-dealt batch. Trying again starts from the same state.

## Considered Options

- **A single provider's SDK** (e.g. Anthropic's): fewer layers, but ties the package to one vendor, when the operator wants to choose between a hosted model and an open one on their own infrastructure.
- **LiteLLM**: as provider-agnostic, but it is a translation layer with its own proxy and config, and structured output and output retries would still be ours to build. pydantic-ai validates the output against the Pydantic types the package already has.
- **Our own adapters** per provider: full control, but every provider, its structured-output quirks and its retries would be code to write and keep up.
- **Dealing in the background** (a job queue, with the UI polling or streaming): frees the request and the lock, but needs a worker, a pending state on the Requirement and a way to report failure later. Worth it once calls are too slow to wait for, or there are many users; not for one operator.
- **Saving a partial Requirement on failure** (e.g. the idea without a title, to name later): keeps the author's input, but every reader would have to handle an untitled Requirement and something would have to retry the naming. The UI keeps the typed idea, so a 503 loses nothing.
