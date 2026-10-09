# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

FluentDB is a local database management studio (PostgreSQL, MySQL/MariaDB, SQLite) with a schema-aware AI assistant. A Fastify server runs on `127.0.0.1` and serves a React UI. The project language is **French**: docs, UI strings, commit messages, PR titles and CHANGELOG entries are written in French.

## Commands

Requires Node LTS **20 or 22** (pinned in `.nvmrc`, enforced by `engine-strict`). Node 24 breaks `npm install`, because `better-sqlite3` has no prebuilt binary for it.

```bash
npm run dev          # server (tsx watch, :4983) + Vite UI (:5173, proxies /api to the server)
npm run build        # Vite build of the UI, then esbuild bundle of the server to apps/server/dist
npm start            # production: the server also serves the built UI on :4983
npm run typecheck    # tsc on shared, server and web
npm test             # vitest: all projects (server, web, integration)
npm run e2e          # Playwright. Runs apps/server/dist, so run `npm run build` first
```

Running a subset of the tests:

```bash
npx vitest run --project server                          # API/unit tests only
npx vitest run apps/server/test/ddlGen.test.ts           # one file
npx vitest run -t "nom du test"                          # by test name
TEST_PG_URL=postgres://user:pw@127.0.0.1:5432/db npx vitest run --project integration   # real engine; skipped without the env var
npx playwright test e2e/smoke.spec.ts
```

Vitest projects are defined in `vitest.config.ts`: `server` covers `apps/server/test`, `integration` covers `apps/server/test-integration`, and `web` covers `apps/web/src/**/*.test.ts` (pure functions only, node environment). There is no linter. Before pushing, `typecheck` + `test` + `build` must pass (see `CONTRIBUTING.md`).

## Architecture

npm workspaces monorepo. The full write-up is in `docs/ARCHITECTURE.md`; read it before any structural change.

- **`packages/shared`**: TypeScript types and Zod schemas shared by the server and the UI. It is consumed as source (`main: ./src/index.ts`) with no build step. Any API contract change starts here.
- **`apps/server`**: Fastify. `buildApp()` in `src/app.ts` wires services and routes and takes injectable deps (for example `aiProvider`). `src/index.ts` binds the socket. Tests call `buildApp()` + `fastify.inject()`, never a real port, against a seeded SQLite fixture (`test/helpers.ts`, which also provides a fake `AiProvider`).
  - `routes/` holds HTTP and Zod validation only. `services/` holds the logic (`connectionManager` keeps one pool per connection+database, `queryRunner` assigns a `queryId` for cancellation and records history). `store/` handles persistence under `FLUENTDB_DATA_DIR` (connections are AES-256-GCM encrypted; history, tasks and dashboards live in local stores).
  - **`drivers/`** is the core abstraction. `drivers/types.ts` defines `Driver`, and each engine lives in `drivers/<engine>/{driver,dialect,ddl,explain}.ts`, registered in `drivers/registry.ts`. Introspection must normalize to the shared types: the UI never sees engine-specific shapes. `buildDdl` and the `explain` normalizers are pure functions, snapshot-tested per dialect without a database server. Avoid engine conditionals outside `drivers/`.
  - **`ai/`**: `AiProvider` (`ai/types.ts`) is a plain streaming text completion. `aiProviderFromEnv()` (`providers/index.ts`) selects Ollama (local model, default `qwen2.5-coder:3b`) or Gemini from `AI_PROVIDER` / `GEMINI_API_KEY`. There is no function calling: the server extracts fenced ```` ```sql ```` blocks from the stream into `sql_suggestion` SSE events. `schemaContext.ts` builds a compact, prioritized digest of structure only.
- **`apps/web`**: React 18 + Vite + Tailwind 4. TanStack Query holds server state, Zustand (`stores/`) holds UI state, and TanStack Table + Virtual render the grid. CodeMirror 6 provides the editor and React Flow + dagre draw the ERD and query plans. Features are split by domain under `src/features/`, and `src/api/client.ts` is the only path to the server.

## Invariants to preserve

- **The AI layer never references a `Driver`.** Suggested SQL reaches the database only through `POST /query` after a user click. Row data is never sent to the AI, only structure (plus imported table/column comments).
- Grid edits and filters always go through `drivers/sqlBuilder.ts`: parameterized values, and identifiers validated against the introspected catalog. Update/delete `WHERE` clauses use primary key columns only. A table without a PK is read-only. A mutation batch runs in a single transaction, and an update that affects 0 rows returns a 409.
- DDL always follows the preview → apply flow (`buildDdl` returns SQL without executing it).
- The server listens on `127.0.0.1` only. `security/hostGuard.ts` rejects non-local `Host` headers (DNS-rebinding protection). Secrets are never returned by the API.
- The server bundle marks native/heavy dependencies as esbuild externals (`apps/server/package.json` `build` script). A new runtime dependency of that kind must be added to that list.

## Conventions

- Conventional Commits, written in French in the imperative mood, with scopes like `server`, `web`, `shared`, `drivers`, `postgres`, `mysql`, `sqlite`, `ai`, `docker`, `grid`, `editor`, `structure`, `security`, `schema`, `ui`. Branches are named `type/description-courte`. PRs are squash-merged and their title becomes the commit message.
- User-visible changes add a line under `## [Non publié]` in `CHANGELOG.md` (Keep a Changelog, in French, written for users) and update `docs/` when relevant. PRs follow `.github/pull_request_template.md`.
