## Frontend components

`frontend/src/components/ui/` holds shadcn primitives only, added with `npx shadcn add <name>`; Anvil's own components live in `frontend/src/components/`. When you hand-edit a primitive, mark the edit with an `// anvil:` comment saying why and cover it with a test, so a re-add or upstream diff keeps it.

## Comments and docstrings

- Comment sparingly: add a comment or docstring only where a reader would otherwise misread the code, and only on code you're changing.
- Explain a function, class, component, type, field or module with a docstring (TSDoc `/** */` on the frontend), not a comment above it. Give one only when its name and types don't already make it obvious.
- Keep docstrings to a short summary. Skip Args/Returns (or `@param`/`@returns`) when the signature is well typed; add them only for what the types don't say, such as units, side effects or what an exception means.
- Inline comments say *why* (a constraint, workaround, linked bug or surprising choice), never *what* the next line does.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on theselftaughtdev42/anvil, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
