## Frontend components

`frontend/src/components/ui/` holds shadcn primitives only, added with `npx shadcn add <name>`; Anvil's own components live in `frontend/src/components/`. When you hand-edit a primitive, mark the edit with an `// anvil:` comment saying why and cover it with a test, so a re-add or upstream diff keeps it.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on theselftaughtdev42/anvil, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
