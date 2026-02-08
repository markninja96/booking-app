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

Stage plan (agent must follow)

Gates (after every stage)

Run and pass:

- `pnpm nx lint booking-backend`
- `pnpm nx build booking-backend`
- `pnpm nx test booking-backend`

If any fails, fix before proceeding.
STOP after finishing the current stage and output the required diff discipline summary.

Diff discipline (after every stage)

Output:

- Summary (3–7 bullets)
- Pseudo-commit message (conventional commits)
- Files changed (added/modified/deleted) + 1-line per file
- Commands executed + results

Stage 0: Scaffold (STOP when done)

- Create Nest project, strict TS
- eslint/prettier
- README skeleton
- .env.example
- placeholder docker-compose.yml

Stage 1: Infra (STOP when done)

- docker-compose: postgres + redis
- ConfigModule env wiring
- GET /health

Stage 2: DB (UPDATED: unified users + profiles) (STOP when done)

Note: Due to Stage 3 changes, Stage 2 must be re-executed before starting Stage 3.

- Drizzle schema + migrations
- DB module
- migration command
- DB smoke test
- Schema must include:
  - users (id, fname, lname, email unique, password_hash nullable, created_at, updated_at)
  - provider_profiles (user_id pk/fk->users.id, business_name, created_at, updated_at)
  - customer_profiles (user_id pk/fk->users.id, created_at, updated_at)
  - bookings with:
    - provider_user_id FK -> provider_profiles.user_id
    - customer_user_id FK -> customer_profiles.user_id
    - start_time, end_time, status, idempotency_key, created_at, updated_at
- Indexes must include:
  - unique(provider_user_id, idempotency_key) where idempotency_key is not null
  - index(provider_user_id, start_time)
  - index(customer_user_id, start_time)

Stage 3: Auth (Passport JWT) — SPLIT (3A/3B/3C)

Stage 3A: Identity + Email/Password + JWT + /me (STOP when done)

- Implement email/password auth:
  - POST /auth/register → creates user, returns { accessToken }
  - POST /auth/login → returns { accessToken }
- JwtStrategy + JwtAuthGuard (Bearer token)
- Add protected diagnostic endpoint:
  - GET /me returns { userId, roles, activeRole, actorUserId, subjectUserId }
- (3A must include tests)
  - /me returns 401 without token
  - /me returns 200 with valid token and correct userId
  - register/login roundtrip works

Stage 3B: Roles + Active Role Switching + Admin Bootstrap (STOP when done)

- Add role model:
  - user_roles(user_id, role) with unique(user_id, role)
  - roles: admin | provider | customer
- Update registration to assign role + create matching profile row:
  - POST /auth/register accepts { fname, lname, email, password, role: 'customer'|'provider', businessName?: string }
  - If role=provider → require businessName and ensure provider_profile exists
  - If role=provider → also ensure customer_profile exists so providers can switch to customer
  - If role=customer → ensure customer_profile exists
- JWT must include roles[] and initialize activeRole to the registered role
- Add active role switching:
  - POST /auth/active-role (guarded) body { activeRole: 'customer'|'provider' }
  - validates caller has role + matching profile exists
  - returns re-issued { accessToken } with updated activeRole
- Add self-serve provider upgrade:
  - POST /auth/upgrade/provider (guarded) body { businessName: string }
  - grants provider role and creates provider_profile if missing
- Deterministic admin bootstrap (choose one; document):
  - BOOTSTRAP_ADMIN_EMAIL ensures admin role for an existing user (no implicit user creation), OR
  - seed/migration-based bootstrap
- Add a tiny admin-only probe endpoint for wiring:
  - GET /admin/ping guarded by @Roles('admin')
- (3B must include tests)
  - provider registration requires businessName (400 otherwise)
  - registration creates correct profile row
  - active-role switch rejects role not owned
  - admin ping denies non-admin and allows admin

Stage 3C: Admin Role Mgmt + Impersonation + Google OAuth (STOP when done)

- Add OAuth identity linking:
  - auth_identities(user_id, provider, provider_user_id) unique(provider, provider_user_id)
- Google OAuth via Passport:
  - GET /auth/google
  - GET /auth/google/callback
  - If identity exists → login
  - Else → create user + identity link + assign default role customer + ensure customer_profile exists
- Admin role management (admin-only):
  - POST /admin/users/:id/roles/grant { role, businessName? }
    - if granting provider and profile missing → require businessName and create provider_profile
    - if granting customer and profile missing → create customer_profile
  - POST /admin/users/:id/roles/revoke { role }
- Impersonation (admin-only):
  - POST /admin/impersonation/start { subjectUserId } → returns { accessToken } with actorUserId + subjectUserId
  - POST /admin/impersonation/stop → returns non-impersonated token
- Invariant: normal endpoints evaluate roles/identity as subject; admin-only endpoints authorize via actor
- /me must reflect impersonation context accurately (actorUserId + subjectUserId)
- (3C must include tests)
  - non-admin cannot grant roles
  - granting provider role requires/creates provider_profile (businessName required if creating)
  - impersonation start requires admin
  - while impersonating: /me shows actor+subject
  - while impersonating: no privilege leakage on non-admin endpoints (subject permissions apply)

Provide local dev tokens (applies across Stage 3)

- Choose ONE approach (document clearly):
  - mint endpoint behind env flag, OR
  - documented sample tokens + steps in README

Stage 4: Zod validation (STOP when done)

- ZodValidationPipe/helper
- Zod schemas for bookings endpoints
- tests for 400 invalid payloads

Stage 5: REST Bookings (UPDATED: no self-booking) (STOP when done)

- POST /bookings (idempotency + auth rules)
- customer creates booking as themselves (customer_user_id derived from JWT subject)
- provider_user_id must exist in provider_profiles
- disallow self-booking: reject if provider_user_id === customer_user_id (400)
- GET /bookings/:id
- GET /bookings list (cursor pagination)
- REST rate limiting via Nest Throttler
- e2e test create->read
- Add test: self-booking rejected (400)

Stage 6: BullMQ reminders (STOP when done)

- reminders queue
- delayed job at start_time - 10m, deterministic jobId
- worker logs + emits placeholder hook
- tests for deterministic jobId

Stage 7: WebSockets (STOP when done)

- Gateway with JWT auth at connect
- rooms: customer:{id}, provider:{id}
- emit booking.created, booking.reminder.due
- redis adapter/pubsub for broadcast
- ws smoke test (script acceptable)

Stage 8: gRPC (STOP when done)

- bookings.proto Create/Get/List
- grpc controller calls service layer
- internal auth placeholder header
- grpc smoke test

Stage 9: Final polish (STOP when done)

- finalize README with exact commands
- requestId middleware and structured logging
- verify compose + migrate + gates

Agent operating rules

- Don’t implement extra features not requested.
- Keep modules small and boundaries clean.
- After each stage: print what changed, commands run, gate results.
- If any gate fails: fix immediately before proceeding.
