# Repository Guidelines

## Project Overview

A TypeScript monorepo for planning Diamond Skytree and Pearl Skytree photography. It calculates astronomical events, presents calendars and locations in a React web app, and supports authenticated location administration.

## Architecture & Data Flow

- `apps/client/` is the React/Vite SPA; `apps/server/` is the Express API and background worker; `packages/` contains shared contracts and utilities.
- Client entry: `apps/client/src/main.tsx` → `App.tsx` routes/pages → hooks and services. `services/apiClient.ts` is the HTTP boundary.
- Server entry: `apps/server/src/server.ts` configures middleware, DI, and routes. Routes/controllers call services; services depend on repository interfaces, with Prisma implementations registered in `apps/server/src/di/ServiceRegistry.ts`.
- Typical read flow: controller → service → repository → Prisma/PostgreSQL. Astronomical event computation and cached events are handled by server services; Redis/BullMQ supports background work.
- Keep shared contracts in `packages/types`; shared time/logging/error utilities belong in `packages/utils`. Shared React components belong in `packages/ui`.

## Key Directories

- `apps/client/src/`: pages, components, feature hooks, API/auth/favorites services, and client utilities.
- `apps/server/src/`: `controllers/`, `routes/`, `services/`, `repositories/`, `middleware/`, `di/`, and worker/server entry points.
- `packages/types/src/`, `packages/utils/src/`, `packages/ui/src/`: cross-workspace contracts and implementations.
- `prisma/`: PostgreSQL schema and migrations (`schema.prisma`).
- `tests/e2e/`, `tests/e2e-integration/`, `tests/unit/`, `tests/integration/`; server Jest tests are in `apps/server/tests/`.
- `scripts/`: administration, architecture validation, configuration, database, and testing helpers. Check `package.json` and the actual script path before relying on older docs.
- `docs/`: architecture, calculations, API, setup, operations, and E2E guidance. `docs/README.md` is the index; verify linked paths exist.

## Development Commands

Run from the repository root:

```sh
npm ci
npm run dev                 # client, server, worker
npm run dev:client          # client only
npm run dev:server          # server only
npm run dev:worker          # worker only
npm run build
npm run typecheck
npm run lint
npm test
npm run validate-architecture
npm run check-circular
```

Root scripts are defined in `package.json`; workspace-specific scripts are available with `--workspace=apps/server` or `--workspace=apps/client`. Build shared packages before E2E when needed: `npm run build:packages`.

## Code Conventions & Common Patterns

- Follow each workspace's existing TypeScript configuration and patterns. Put reusable cross-workspace logic in shared packages rather than duplicating it.
- Server services consume interfaces and dependencies are wired through the DI container/`ServiceRegistry`; keep Prisma access in repositories.
- Use shared event/API types from `packages/types`. Avoid unnecessary `any` and preserve strict typing where enabled.
- Use `timeUtils` from `packages/utils` for user-facing JST formatting/conversion. Astronomical calculations have documented rules; consult `docs/astronomical-calculations.md`, `docs/diamond-pearl-skytree-conditions.md`, and `docs/skytree-elevation-calculation.md` when changing them. Verify behavior against source; design docs may lag implementation.
- Use `getComponentLogger` and structured Pino logging, not `console.*` in application code. Follow existing error utilities and explicit controller/service error handling.
- Keep server work asynchronous using the existing Promise-based service APIs and Redis/BullMQ path where applicable. Client feature state and request lifecycle generally live in hooks; follow the existing hook/service boundary.
- Preserve authentication, validation, rate-limit, and CSRF boundaries when changing APIs.

## Code, Tests, Commits, and Comments

- Code should make **how** the behavior is implemented clear.
- Tests should make **what** behavior is expected clear.
- Commit messages should explain **why** the change is needed.
- Comments should explain **why not** an apparently reasonable alternative was chosen, including relevant constraints or non-obvious intent. Do not use comments to paraphrase the code's behavior.

## Important Files

- `package.json`: workspace definitions and authoritative root commands.
- `apps/client/src/main.tsx`, `apps/client/src/App.tsx`: client boot and routing.
- `apps/client/src/services/apiClient.ts`: client API boundary.
- `apps/server/src/server.ts`, `apps/server/src/routes/index.ts`: server setup and route assembly.
- `apps/server/src/di/ServiceRegistry.ts`: concrete dependency registration.
- `packages/types/src/common.ts`, `packages/utils/src/timeUtils.ts`, `packages/utils/src/logger.ts`: shared contracts, time, and logging.
- `prisma/schema.prisma`, `prisma.config.ts`: database schema and Prisma configuration.
- `playwright.config.ts`, `playwright.integration.config.ts`: browser test configurations.

## Contribution Workflow

- Never commit credentials, tokens, private dumps, or user data; keep secrets in ignored local environment files. Preserve authentication, validation, rate limiting, and CSRF controls.

- Before non-trivial work, search existing GitHub Issues and Pull Requests; use Issues as the canonical tracker and keep changes focused.
- Work on a feature branch and open a Pull Request; do not edit, commit, or push directly to `main`.
- Follow `CONTRIBUTING.md` for PR expectations and Conventional Commit messages. Report only checks actually run.
- Keep root documentation to `README.md`, `README.ja.md`, `CONTRIBUTING.md`, `LICENSE`, and `AGENTS.md`; put other long-form documentation under `docs/`.
- Use `orca:*` labels only to represent ORCA execution state, not release categories.

## Runtime/Tooling Preferences

- Use **Node.js >=26.10.0** and **npm >=11.19.1**, as required by root `package.json`; this is an npm-workspaces monorepo with `package-lock.json`.
- Client build/dev uses Vite; server build uses TypeScript and Prisma generation; PostgreSQL is accessed through Prisma and Redis is used for queue/cache infrastructure.
- Use existing npm scripts and workspace dependencies. Do not add a package manager, framework, or dependency without a demonstrated need.
- Local run and E2E setup may require PostgreSQL/Redis and environment variables; consult `docs/installation.md`, `docs/environment-variables.md`, and `docs/troubleshooting.md`.

## Testing & QA

- `npm test` runs workspace tests; the server uses Jest (`apps/server/jest.config.cjs`) with tests under `apps/server/tests/`.
- `npm run test:e2e` runs Playwright browser smoke tests in `tests/e2e/`; `npm run test:e2e:ui` opens the Playwright UI. See `docs/playwright-e2e.md` for setup and behavior.
- `npm run test:e2e:integration` runs real-backend workflows in `tests/e2e-integration/`. It mutates a dedicated test database and requires explicit disposable PostgreSQL/Redis test services and `E2E_TEST_DATABASE=1`; never point it at production.
- Run the narrow relevant test first, then appropriate workspace or root checks. No repository-wide coverage threshold is configured in the inspected test setup.
- Integration artifacts can contain sensitive data; sanitize with `node scripts/testing/sanitize-e2e-artifacts.mjs` before sharing. Keep credentials and database dumps out of logs and artifacts.
