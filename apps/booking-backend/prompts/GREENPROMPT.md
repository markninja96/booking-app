Stage-Gated Agent Prompt (Booking Backend: NestJS + Zod + Passport JWT + Drizzle/Postgres + BullMQ + WS + gRPC)

You are a senior backend engineer agent. Build a minimal bookings backend for solo service providers.

Hard constraints (non-negotiable)

- Runtime validation: Zod only (no class-validator/class-transformer).
- Auth: Passport JWT (@nestjs/passport, passport-jwt). No manual JWT parsing in controllers.
- Persistence: Postgres + Drizzle (no Prisma/TypeORM).
- Jobs: BullMQ on Redis (delayed reminders).
- Notifications: Nest WebSocket Gateway + Redis adapter/pubsub.
- Internal entrypoint: gRPC via Nest microservices.

Scope control

- Implement ONLY features listed in `apps/booking-backend/STAGES.md`.
- No extra entities/endpoints/nice-to-haves unless explicitly requested.

Repo quality gates (must pass continuously)

- `pnpm nx lint booking-backend`
- `pnpm nx build booking-backend`
- `pnpm nx test booking-backend`
  If a gate fails, fix immediately before moving on.

Stage 0 — Project scaffolding & conventions (STOP when done)
Tasks

- Create NestJS project with strict TS.
- Add ESLint + Prettier configs.
- Add `.env.example`.
- Add `README.md` skeleton with run commands placeholders.
- Add `docker-compose.yml` placeholder.

Gate
✅ `pnpm nx build booking-backend`
✅ `pnpm nx lint booking-backend`
✅ `pnpm nx test booking-backend` (can be default test, must pass)

Output: list created files and commands to run.

Stage 1 — Infrastructure: Docker Compose + Config (STOP when done)
Tasks

- Implement `docker-compose.yml` for postgres, redis, and optional app.
- Add Nest ConfigModule reading env vars.
- Add health endpoint: GET `/health` returns ok + DB connectivity check if easy.

Gate
✅ `docker compose up -d postgres redis`
✅ `pnpm nx build booking-backend && pnpm nx lint booking-backend && pnpm nx test booking-backend`

Output: exact env vars needed + how to start deps + how to run app.

Stage 2 — Database: Drizzle schema + migrations (STOP when done)
Data model

- bookings(id, provider_id, customer_id, start_time, end_time, status, idempotency_key, created_at, updated_at)
- providers(id, name, created_at)
- customers(id, name, email unique, created_at)

Indexes

- unique(provider_id, idempotency_key) where idempotency_key is not null
- index(provider_id, start_time)
- index(customer_id, start_time)

Tasks

- Add Drizzle config, schema, migration generation.
- Add DB module and simple repository scaffolding.

Gate
✅ `pnpm nx <db:migrate target>` (or equivalent) succeeds against compose Postgres
✅ `pnpm nx test booking-backend` includes at least one DB connectivity or migration smoke test
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend`

Output: migration commands + how to inspect tables.

Stage 3 — Auth: Passport JWT + Roles (STOP when done)
JWT payload

- sub (userId)
- role: customer | provider
- customerId?
- providerId?

Tasks

- Implement JwtStrategy (Bearer token from Authorization header).
- Implement JwtAuthGuard.
- Implement RolesGuard + @Roles() decorator.
- Add dev-only endpoint to mint tokens (ONLY in development) OR provide sample tokens in README (choose one; document clearly).

Gate
✅ Unit tests for guards/strategy or at least one e2e test hitting a protected route
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: how to authenticate locally.

Stage 4 — Validation: Zod pipeline + schemas (STOP when done)
Tasks

- Implement ZodValidationPipe (or equivalent) and use it consistently.
- Create Zod schemas for:
  - POST /bookings body
  - GET /bookings query
  - GET /bookings/:id params
- Ensure errors are clean (400 with helpful message).
- Swagger: docs may use DTOs; runtime validation must remain Zod.

Gate
✅ Tests covering invalid payloads returning 400
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: validation approach explanation in README.

Stage 5 — Core REST: Bookings CRUD (minimal) (STOP when done)
Endpoints

- POST /bookings → 201 { bookingId }
- GET /bookings/:id → 200 { booking }
- GET /bookings?type=upcoming|past&cursor&limit → 200 { items, nextCursor }

Rules

- Customer can create only for own customerId.
- Provider can create only for own providerId.
- Idempotency: if idempotencyKey provided, dedupe per provider.
  Choose: return existing booking id OR 409 conflict (pick one and document).
- Cursor pagination: order by (start_time, id) and encode cursor.
- Rate limiting: @nestjs/throttler 60 rpm per user/ip for REST routes.

Gate
✅ Unit tests for service logic
✅ At least one e2e test: create booking → read booking
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: endpoint examples (curl) in README.

Stage 6 — BullMQ reminders (STOP when done)
Tasks

- Add BullMQ queue reminders.
- On booking create: compute runAt = start_time - 10m
- Enqueue delayed job with deterministic jobId = reminder:{bookingId}
- Worker: logs booking.reminder.due (no external integrations).

Gate
✅ Test: enqueuing uses deterministic jobId
✅ Optional integration test: fast-forward by scheduling a short delay job in test env
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: how to run worker (same process or separate) and how to observe jobs.

Stage 7 — WebSockets notifications + Redis adapter (STOP when done)
Tasks

- WS gateway: JWT auth at connection (reuse JWT verification).
- Identify client as customer/provider and store mapping.
- Emit events:
  - booking.created after commit
  - booking.reminder.due from worker
- Add Redis adapter/pubsub so multiple instances broadcast.

Gate
✅ Basic WS test or manual script in scripts/ to connect and receive events
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: example client snippet / steps in README.

Stage 8 — gRPC entrypoint (STOP when done)
Tasks

- Define bookings.proto with CreateBooking, GetBooking, ListBookings.
- Implement Nest gRPC controller mapping to the same service layer.
- Add simple internal auth (header x-internal-token) as placeholder; document “replace with mTLS”.

Gate
✅ Minimal test: gRPC server starts and handles at least GetBooking in test
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: how to call gRPC locally.

Stage 9 — Final polish (STOP when done)
Tasks

- Ensure README is complete and accurate.
- Ensure compose brings up everything.
- Ensure logs have requestId.
- Remove dev-only token minting if added (or keep behind env flag clearly).

Final Gate
✅ `docker compose up -d`
✅ `pnpm nx <db:migrate target>`
✅ `pnpm nx lint booking-backend && pnpm nx build booking-backend && pnpm nx test booking-backend`

Output: final “What I built” + commands + directory structure + key files.

Agent operating rules

- Don’t implement extra features not requested.
- Keep modules small and boundaries clean.
- After each stage: print what changed, commands run, gate results.
- If any gate fails: fix immediately before proceeding.
