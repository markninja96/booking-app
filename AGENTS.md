# AGENTS.md

# Guidance for agentic coding in this repo

Repository context

- Workspace root: /Users/marknjihia/Desktop/dojo/booking-app
- Monorepo toolchain: Nx 22.x + NestJS 11 + Jest + ESLint flat config
- Apps: `apps/booking-backend` (API) and `apps/booking-backend-e2e` (e2e tests)

Cursor/Copilot rules

- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found.

Commands (run from repo root)

- Install deps: `npm install`
- List projects/targets: `npx nx show projects`
- Build backend (prod): `npx nx build booking-backend`
- Build backend (dev): `npx nx run booking-backend:build:development`
- Serve backend (dev): `npx nx serve booking-backend`
- Serve backend (prod): `npx nx run booking-backend:serve:production`
- Run unit tests (all): `npx nx test booking-backend`
- Run e2e tests (all): `npx nx run booking-backend-e2e:e2e`
- Lint backend: `npx nx lint booking-backend`
- Lint all projects: `npx nx lint`

Run a single test

- Unit: `npx nx test booking-backend -- --testPathPattern app.controller.spec.ts`
- Unit by name: `npx nx test booking-backend -- --testNamePattern "getData"`
- E2E: `npx nx run booking-backend-e2e:e2e -- --testPathPattern booking-backend.e2e-spec.ts`
- Tip: anything after `--` passes directly to Jest.

Test tooling notes

- Jest configs live at `apps/booking-backend/jest.config.cts` and `apps/booking-backend-e2e/jest.config.cts`
- Jest uses SWC via `.spec.swcrc` for test transforms
- Coverage output goes to `test-output/jest/coverage` under each project
- E2E target depends on backend `build` and `serve` targets

Formatting

- Prettier config: `.prettierrc` (single quotes)
- Indentation: 2 spaces (per `.editorconfig`)
- Trailing whitespace: trimmed; ensure final newline
- Format check: `npx prettier . --check`
- Format fix: `npx prettier . --write`

Linting

- ESLint flat config at `eslint.config.mjs` and `apps/booking-backend/eslint.config.mjs`
- Nx module boundaries are enforced
- Ignore build output: `**/dist`, `**/out-tsc`

TypeScript settings (from `tsconfig.base.json`)

- Strict mode enabled
- Module and resolution: `nodenext`
- Target: `es2022` (app overrides to `es2021`)
- No implicit returns and no unused locals
- Emit is enabled in app tsconfig; avoid running plain `tsc` unless needed

Project layout

- App code: `apps/booking-backend/src`
- Entry point: `apps/booking-backend/src/main.ts`
- Tests: `apps/booking-backend/src/**/*.spec.ts`
- E2E tests: `apps/booking-backend-e2e/src`
- Backend architecture doc: `apps/booking-backend/ARCHITECTURE.md`
- Backend conventions doc: `apps/booking-backend/CONVENTIONS.md`

Key config files

- Nx config: `nx.json`
- Prettier config: `.prettierrc`
- Editor config: `.editorconfig`
- Root ESLint config: `eslint.config.mjs`
- Backend ESLint config: `apps/booking-backend/eslint.config.mjs`
- Root Jest config: `jest.config.ts` (aggregates project configs)

Code style guidelines

Imports

- Order imports: external packages first, then local relative imports
- Use `import type` for type-only imports when possible
- Use relative paths for local modules (no path aliases defined)

Formatting conventions

- Single quotes for strings
- Use semicolons (matches existing code)
- Keep line length reasonable; rely on Prettier for wrapping

Naming

- Classes: PascalCase
- Functions/methods: camelCase
- Constants: UPPER_SNAKE_CASE when truly constant
- Files: dot-separated NestJS style, e.g., `app.controller.ts`

Types

- Prefer explicit return types for public methods
- Avoid `any`; use union types or generics instead
- Use readonly for injected dependencies (`private readonly`)
- Keep DTOs and interfaces explicit; avoid implicit `Record<string, unknown>`

NestJS patterns

- Controllers use decorators from `@nestjs/common`
- Services are `@Injectable()` and injected via constructor
- Modules list `imports`, `controllers`, `providers`
- Global prefix set to `api` in `main.ts`

Error handling

- Prefer NestJS exceptions (`BadRequestException`, `NotFoundException`, etc.)
- Use `Logger` from `@nestjs/common` for app logs
- In async flows, catch and rethrow with context; avoid swallowing errors
- Keep exception messages stable for tests; prefer consistent error shapes

Testing conventions

- Unit tests live next to source in `src/**` as `*.spec.ts`
- Use Jest matchers; keep tests deterministic
- E2E tests rely on global setup/teardown in `apps/booking-backend-e2e`
- Prefer testing public controller/service behavior over private methods
- Keep test data close to the test file unless shared across suites

Build and deploy

- Build uses `webpack-cli build` via Nx target
- Docker target depends on `build` and `prune` targets
- Production bundle output is under `apps/booking-backend/dist`
- Prune targets prepare a minimal deployable `package.json` and `workspace_modules`

Local runtime notes

- Backend listens on `process.env.PORT` or `3000`
- Global API prefix is `api` (see `apps/booking-backend/src/main.ts`)
- Prefer `npx nx serve booking-backend` over running compiled JS directly

General guidance for agents

- Prefer Nx targets (`npx nx <target> <project>`) to keep caching consistent
- Avoid editing generated files in `dist` or `out-tsc`
- Keep changes scoped to the backend unless requested otherwise
- If you introduce new scripts or tools, document them here
