# Keeping frontend and backend types in sync

Research for [#56](https://github.com/theselftaughtdev42/anvil/issues/56), gathered on 2026-10-22. It ends in a **recommendation for you to decide on**: no ADR or ticket has been written yet.

Versions and dates come from the npm registry (`https://registry.npmjs.org/<package>`) and PyPI. "Tried" means I ran the generator against Anvil's real spec in a scratch directory. Nothing was installed in the repo.

## Where things stand

- Every API type is a hand-written copy. `Requirement` in `frontend/src/lib/requirements.ts` mirrors `RequirementPublic` in `src/anvil/requirements.py`. `Project` mirrors `ProjectPublic` (`src/anvil/projects.py`), `QuestionStack`/`OpenQuestion`/`AnsweredQuestion` are copied into `frontend/src/lib/questions.ts`, and `Config` into `frontend/src/lib/config.ts`. Request bodies are hand-written too, e.g. `{ project_id, idea }` in `createRequirement`.
- The field docstrings are copied as well, e.g. the `progress` docstring appears on both sides.
- `api<T>()` (`frontend/src/lib/api.ts`) trusts the `T` the caller passes. Its `ApiError` and `retryUnlessClientError` turn FastAPI's `detail` into a message, and `frontend/src/lib/api.test.ts` covers that behaviour.
- Query keys are hierarchical on purpose. `['requirements', id]` sits under `['requirements']`, so `invalidateQueries({ queryKey: requirementsKey })` in `frontend/src/components/idea-prompt.tsx` and `requirement-project.tsx` also refreshes the detail queries. `project-form.tsx` does the same with `projectKey`/`projectsKey`.
- Fixtures are typed against the hand-written types: `requirement(overrides: Partial<Requirement>): Requirement` in `frontend/src/pages/home-page.test.tsx`.
- The frontend compiles with `erasableSyntaxOnly` and `verbatimModuleSyntax` (`frontend/tsconfig.app.json`), so a generator that emits TS `enum`s would break the build.
- CI's `lint` job runs every pre-commit hook with `uv sync` and `npm ci` already done (`.github/workflows/ci.yml`, `.pre-commit-config.yaml`). A hook that regenerates a file fails when the file changes, the same way `ruff-format` does.

## What the spec gives a generator

I dumped it with `app.openapi()` on the pinned FastAPI 0.143.0 and Pydantic 2.14.1. That needs a `DATABASE_URL` value but no running database (`src/anvil/settings.py`; tried with a dummy DSN).

- **OpenAPI 3.1.0.** FastAPI says any client tool "must support this version" ([FastAPI: Generating SDKs](https://fastapi.tiangolo.com/advanced/generate-clients/)). All the candidates below parsed it.
- **Nullable fields** come out as `anyOf: [..., {type: null}]` and stay in `required`, e.g. `progress` and `why`. Every generator I tried emits `progress: Progress | null`, which matches the hand-written type.
- **Enums.** `RequirementStatus` is `{type: string, enum: [...]}` and becomes the union `'draft' | 'in_progress' | 'complete'`.
- **operationIds are long**, e.g. `list_requirements_api_requirements_get`. That only matters for generators that name functions after them. FastAPI's documented fix is `generate_unique_id_function`, which builds the id from the tag and the function name ([FastAPI: Generating SDKs](https://fastapi.tiangolo.com/advanced/generate-clients/)).
- **Field docstrings don't reach the spec today.** Pydantic only turns them into `description` with `ConfigDict(use_attribute_docstrings=True)`. With that set, openapi-typescript renders them as `@description` in TSDoc (tried), so docstrings would stop being duplicated. Model docstrings already reach the spec (e.g. `Config`).
- **Separate Input/Output schemas.** FastAPI's docs say a model with defaults gets `Item-Input`/`Item-Output` schemas ([FastAPI: Separate OpenAPI Schemas](https://fastapi.tiangolo.com/how-to/separate-openapi-schemas/)). On the pinned versions the docs' own example does *not* split (tried). It splits only when the schemas really differ: with a `computed_field`, or with `json_schema_serialization_defaults_required=True` (tried both). Anvil has neither today, so its schemas have plain names. If one appears later, the generated type is renamed (`RequirementPublic` becomes `RequirementPublic-Output`), and that rename breaks the frontend's imports loudly, at compile time. `separate_input_output_schemas=False` turns the split off (same page).

## Options

### A. openapi-typescript, types only

[openapi-typescript](https://openapi-ts.dev/cli) 7.13.0 (2026-02-11) generates a types-only `.d.ts` with `paths` and `components`. `--root-types --root-types-no-schema-prefix` also exports each schema as a plain alias, e.g. `export type RequirementPublic = components['schemas']['RequirementPublic']` (tried). It emits unions, not enums, unless you pass `--enum` (CLI docs). It has a `--check` flag: "Check that the generated types are up-to-date" (CLI docs). The source shows it exits 1 when the output differs (`checkStaleOutput` in `bin/cli.js`). The repo was last pushed 2026-09-25 (`gh api repos/openapi-ts/openapi-typescript`).

`api()`, the keys and the `queryOptions` stay as they are. Only the hand-written interfaces go:

```ts
// frontend/src/lib/requirements.ts
import type { RequirementCreate, RequirementList, RequirementPublic } from '@/lib/api-schema'

export type Requirement = RequirementPublic

export function requirementQuery(id: string) {
  return queryOptions({
    queryKey: requirementKey(id),
    queryFn: () => api<Requirement>(`/requirements/${id}`),
    retry: retryUnlessClientError,
  })
}

export function createRequirement(body: { projectId: string; idea: string }): Promise<Requirement> {
  return api<Requirement>('/requirements', {
    method: 'POST',
    json: { project_id: body.projectId, idea: body.idea } satisfies RequirementCreate,
  })
}
```

What it leaves open: the pairing of a path with its `T` is still hand-written, so `api<Project>('/requirements/…')` would typecheck. If that ever bites, a small helper over `paths` closes it without a runtime dependency (typechecked in scratch):

```ts
type JsonOk<Op> = Op extends { responses: { 200: { content: { 'application/json': infer T } } } } ? T : never
type Get<P extends keyof paths> = JsonOk<paths[P]['get']>
```

### B. openapi-typescript + openapi-fetch (and maybe openapi-react-query)

[openapi-fetch](https://openapi-ts.dev/openapi-fetch/) 0.17.0 is a 6 kB client typed by `paths`. Paths, params, bodies and responses are all checked. Each call returns `{ data, error, response }` instead of throwing (same page). Adopting it would mean either rebuilding `ApiError`'s message logic as middleware or a wrapper, or keeping `api()` beside it. The `api.test.ts` cases would move with it.

openapi-react-query 0.5.4 builds keys as `[method, path, init]`, e.g. `['get', '/api/requirements/{requirement_id}', {params}]` (source: `dist/index.mjs`). The detail key is therefore not under the list key, which breaks the prefix invalidation above. Using openapi-fetch inside the existing hand-written `queryOptions` avoids that (typechecked in scratch):

```ts
queryFn: async () => {
  const { data, error } = await client.GET('/api/requirements', { params: { query: { project_id: projectId } } })
  if (error) throw …
  return data
},
```

### C. Full client + TanStack Query generators: Hey API, Orval, Kubb

All three generate types, an HTTP client, and `queryOptions`/mutation helpers per operation. Each one replaces `frontend/src/lib/*.ts` instead of feeding it.

- **[@hey-api/openapi-ts](https://heyapi.dev/openapi-ts/plugins/tanstack-query)** 0.99.0 (2026-06-22) is the generator FastAPI's docs feature for TypeScript ([FastAPI: Generating SDKs](https://fastapi.tiangolo.com/advanced/generate-clients/)). Its README says it is "in initial development. Please pin an exact version". Keys are a single object, `[{ _id, baseUrl, path, query, … }]` (plugin docs; tried), so prefix invalidation by `['requirements']` doesn't work. `tags: true` adds operation tags to the key, but that is still not a hierarchy. Function names come from operationIds, e.g. `getRequirementApiRequirementsRequirementIdGetOptions` (tried). Its own fetch client and `throwOnError: true` replace `api()`.
- **[Orval](https://orval.dev/docs/reference/configuration/output.md)** 8.44.0 (2026-10-21) is the most adaptable of the three:
  - a `mutator` keeps Anvil's `api()` as the HTTP layer;
  - `override.fetch.includeHttpResponseReturnType: false` returns the data instead of `{ data, status, headers }`, which is the default (docs; tried);
  - `shouldSplitQueryKey` turns keys into arrays, and a `queryKey` mutator can shape them;
  - the default `enumGenerationType: 'const'` emits `as const` objects, which are erasable;
  - the default keys are path strings, `['/api/requirements', params]` vs `['/api/requirements/<id>']` (tried).
- **[Kubb](https://kubb.dev/plugins/plugin-react-query/)** (core 5.12.1, plugin-react-query 5.5.4, both this month) generates `queryOptions`/`mutationOptions` through separate `plugin-ts` and client plugins, which means more moving parts for the same result.

### D. pydantic-to-typescript

It converts Pydantic models straight to interfaces and needs the `json2ts` CLI from json-schema-to-typescript ([README](https://github.com/phillipdupuis/pydantic-to-typescript)). The last release was 2.0.0 on 2024-11-22, which is also the repo's last push (PyPI; `gh api`). It sees models, not the API: it doesn't know which models FastAPI serves, and it skips FastAPI's view of them (serialization mode, Input/Output). It's less maintained and less accurate than reading the spec FastAPI already serves.

## Comparison on the issue's three axes

| | Delivery | Fit with `frontend/src/lib/` helpers | Fixture afterwards |
|---|---|---|---|
| **A** openapi-typescript types | One checked-in `.d.ts`; `--check` or a regenerating hook catches drift | Keeps `api()`, keys, `queryOptions`; only interfaces swap | Unchanged shape; typed `RequirementPublic` |
| **B** + openapi-fetch | Same `.d.ts` | Keeps keys if `queryOptions` stay hand-written; `ApiError` handling moves to middleware | Unchanged |
| **C** Hey API / Orval / Kubb | Many generated files (client, sdk, hooks) | Replaces the helpers; keys need overriding to keep prefix invalidation; names need `generate_unique_id_function` | Unchanged (types are still plain), but tests stub calls to generated functions |
| **D** pydantic-to-typescript | Python step + `json2ts` | Types only, like A | Unchanged |

### Delivery

- **Build step only (not checked in).** The frontend build would need Python and the backend importable. Today `frontend` builds with Node alone, and in the `frontend-test` CI job it never runs `uv sync`. It's also invisible in review.
- **Checked-in file plus a drift check.** API changes show up as a reviewable diff in the PR, and `npm run build` stays Node-only. The check fits a local pre-commit hook beside `ruff-format`:
  - The hook triggers on `^src/anvil/`, dumps `app.openapi()` with a placeholder `DATABASE_URL`, and writes `frontend/src/lib/api-schema.d.ts`.
  - pre-commit fails when the file changes, so it fixes the file locally and catches drift in CI's `lint` job, which already has both toolchains.
  - The CI job has no `.env`, so the hook sets the placeholder itself.
  - The generated file must be excluded from the `comment-only-changes` hook, or a backend docstring edit would produce a "comment-only" hunk in it. It should also be ignored by oxlint.
- Checking in `openapi.json` too is optional. It makes the API diff easier to read than the `.d.ts` diff, at the cost of one more generated file.

### Fixture

The fixture keeps its shape. Only the type changes, and with `export type Requirement = RequirementPublic` not even the import does:

```ts
import type { Requirement } from '@/lib/requirements' // now an alias of the generated RequirementPublic

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    id: 'abc-123',
    title: 'Route change alerts',
    idea: 'Drivers should see route changes on their phone without calling the depot.',
    project: { id: 'p1', name: 'Driver app' },
    status: 'draft',
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2),
    progress: null,
    ...overrides,
  }
}
```

The difference is what happens on drift. A new required field such as #44's `progress`, a rename, or a new status fails `tsc` in the fixture and in `statusLabels: Record<RequirementStatus, string>`, instead of passing silently. I checked this in scratch with a misspelled key under `@ts-expect-error`.

## Recommendation (for you to decide)

**Option A**: generate types only with openapi-typescript, as a checked-in `frontend/src/lib/api-schema.d.ts` that a pre-commit hook keeps current, so CI's `lint` job catches drift.

- It removes the duplication the issue is about without touching `api()`, `ApiError`, the hierarchical keys or the tests.
- It adds one dev dependency and no runtime code.
- It's the smallest step that makes drift fail.

B can follow later, if path/response mismatches or hand-typed bodies start to bite: either the `paths`-typed helper above, or openapi-fetch inside the existing `queryOptions`. C replaces too much of `frontend/src/lib/` and fights the key design. If you ever do want generated hooks, Orval (mutator + split keys) is the one to try.

Small extras worth bundling into the implementation ticket:

- `use_attribute_docstrings=True` on the `*Public` models, so field docstrings flow into the generated TSDoc instead of being copied.
- `export type Requirement = RequirementPublic` aliases to keep the frontend's domain names (GLOSSARY.md) and avoid churn.
- `satisfies RequirementCreate` (etc.) on request bodies.

## Open questions

- Should `openapi.json` be checked in next to the `.d.ts` for a readable API diff?
- Is a pre-commit hook that imports the backend acceptable on every backend commit? It's fast (about 1.6 s to dump and generate, measured in scratch), but it couples the frontend file to Python changes. The alternative is a CI-only `openapi-typescript --check` step.
- Keep the frontend names (`Requirement`, `Project`) as aliases, or adopt the backend's `*Public` names directly?
- Is it worth switching `generate_unique_id_function` to tag + function name now? It's only needed for B's helpers or C.
