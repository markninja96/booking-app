# Agent Guardrails (Booking Backend)

This file supplements the root `AGENTS.md` with backend-specific rules.
Always follow root guidance first, then these app-level rules.

Repository context

- App path: `apps/booking-backend`
- Runtime: NestJS 11 (Nx workspace)
- Docs: `apps/booking-backend/ARCHITECTURE.md`, `apps/booking-backend/CONVENTIONS.md`

Non-negotiables

- Runtime validation: Zod only. `class-validator` / `class-transformer` are forbidden.
- Auth: Passport JWT (`@nestjs/passport`, `passport-jwt`). No custom JWT parsing in controllers.
- Persistence: PostgreSQL + Drizzle. No Prisma/TypeORM.
- Async jobs: BullMQ on Redis. No Redis Streams for jobs in this repo.
- Notifications: Nest WebSocket Gateway. Horizontal scaling uses Redis adapter/pubsub.
- Internal entrypoint: gRPC via Nest microservices.

Scope control

- Implement ONLY features listed in `STAGES.md`.
- No extra entities, endpoints, or “nice-to-haves” unless explicitly requested.

Quality gates (after each stage)

- `pnpm nx lint booking-backend`
- `pnpm nx build booking-backend`
- `pnpm nx test booking-backend`
- If any fail: fix immediately before proceeding.

Run a single test

- Unit: `pnpm nx test booking-backend -- --testPathPattern app.controller.spec.ts`
- Unit by name: `pnpm nx test booking-backend -- --testNamePattern "getData"`
- E2E: `pnpm nx run booking-backend-e2e:e2e -- --testPathPattern booking-backend.e2e-spec.ts`

Architectural invariants

- Postgres is the source of truth.
- Booking creation commits to DB before best-effort enqueue/emit.
- BullMQ reminder jobs use deterministic jobId: `reminder:{bookingId}`.

Output discipline (after each stage)

- Stage summary
- Pseudo-commit message
- File list (added/modified/deleted)
- Commands executed + results
