# Generate frontend API types from the OpenAPI spec, types only

The frontend's API types were hand-written copies of the backend's Pydantic models, and nothing failed when they drifted. We generate them from the OpenAPI spec FastAPI serves, using openapi-typescript, into a checked-in `frontend/src/lib/api-schema.d.ts` that a pre-commit hook regenerates, so CI's `lint` job fails on drift. We generate types only: `api()`, `ApiError` and the hand-written TanStack Query helpers stay, because they hold behaviour a generator would replace or break. See [the research](../research/frontend-backend-type-sync.md) for the full comparison.

## Considered Options

- **Hey API** (the generator FastAPI's docs feature), **Orval**, **Kubb**: they generate the client and query helpers too. Their query keys aren't hierarchical, so invalidating `['requirements']` would stop refreshing the detail queries, and `ApiError`'s message handling would have to be rebuilt. They'd remove about 150 hand-written lines and add a few thousand generated ones. If generated hooks are ever wanted, Orval fits best: it can keep `api()` and shape its keys.
- **openapi-fetch**: returns `{ data, error }` instead of throwing, so `ApiError` handling would move. It's a possible later step if path/response mismatches start to bite.
- **pydantic-to-typescript**: reads the models rather than the API FastAPI serves, and is barely maintained.
