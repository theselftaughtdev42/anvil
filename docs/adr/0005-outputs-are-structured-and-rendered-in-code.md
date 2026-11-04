# Outputs are structured per Output format and rendered in code

The agent never writes an Output as text. For each Output format, `idea-refiner` defines a structured type (for Gherkin, `GherkinFeature`: a Feature with Scenarios of Given/When/Then steps), the agent returns that type, and a pure function renders it (`render_gherkin`). Anvil stores the rendered text.

The structure is where the format's rules live: validators reject a Feature with no Scenarios, steps out of Given → When → Then order, duplicate Scenario names or empty text, and a model-backed agent gets the rejection back to correct, as with any structured output (see [ADR 0004](0004-the-model-agent-calls-the-model-through-pydantic-ai.md)). Rendering in code keeps keywords, indentation and layout identical whichever model wrote it, so the text always parses, and the stub agent needs no model to produce a real Output.

## Considered Options

- **The model writes the `.feature` text directly**: one fewer type per format, but nothing checks the result short of parsing it after the fact, the layout drifts between models and runs, and a bad reply can't be sent back with a precise error.
- **Store the structure and render on read**: lets the renderer change without regenerating, but every reader needs the package, and the stored text is what the Point of Contact saw and copied.
