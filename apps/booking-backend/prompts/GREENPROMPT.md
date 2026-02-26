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
  - auth_identities(user_id, oauth_provider, provider_user_id)
  - primary key (oauth_provider, provider_user_id)
  - unique(user_id, oauth_provider)
- Google OAuth via Passport:
  - GET /auth/google
  - GET /auth/google/callback
  - Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL
  - Scopes: profile, email
  - If identity exists → login
  - Else → create user + identity link + assign default role customer + ensure customer_profile exists
  - Token payload must include roles[] and activeRole consistent with Stage 3B (persisted active_role)
- Admin role management (admin-only):
  - POST /admin/users/:id/roles/grant { role, businessName? }
    - if granting provider and profile missing → require businessName and create provider_profile
    - if granting customer and profile missing → create customer_profile
  - POST /admin/users/:id/roles/revoke { role }
    - if revoking current active_role → reset to next available non-admin role or Customer which will be our default role
- Impersonation (admin-only):
  - POST /admin/impersonation/start { subjectUserId } → returns { accessToken } with actorUserId + subjectUserId
  - POST /admin/impersonation/stop → returns non-impersonated token
- Invariant: normal endpoints evaluate roles/identity as subject; admin-only endpoints authorize via actor
  - Guard rule: admin checks must use actorUserId when present; all other role checks use subjectUserId when present
- /me must reflect impersonation context accurately (actorUserId + subjectUserId)
- (3C must include tests)
  - non-admin cannot grant roles
  - granting provider role requires/creates provider_profile (businessName required if creating)
  - impersonation start requires admin
  - while impersonating: /me shows actor+subject
  - while impersonating: no privilege leakage on non-admin endpoints (subject permissions apply)
  - add at least one role-gated non-admin endpoint for validation

Provide local dev tokens (applies across Stage 3)

- Choose ONE approach (document clearly):
  - mint endpoint behind env flag, OR
  - documented sample tokens + steps in README

Stage 4: Zod validation (STOP when done)

Note: Stage 4 and Stage 5 must be implemented together in one development pass to keep handlers and validation in sync. You still must run gates and stop after Stage 4, then continue to Stage 5 and run gates again.

Stage 4 goals (define and wire validation used by Stage 5):

- Add a ZodValidationPipe (or equivalent helper) and apply it to bookings endpoints in Stage 5.
- Define Zod schemas for all bookings request shapes used in Stage 5 (create + list/query + params).
- Add tests that confirm invalid booking payloads return 400 with a stable error shape/message (explicit per-rule messages).

Validation error messages (Stage 4/5):

- startTime/endTime must be ISO 8601 with timezone: "startTime must be a valid ISO 8601 timestamp with timezone" and "endTime must be a valid ISO 8601 timestamp with timezone"
- endTime <= startTime: "endTime must be after startTime"
- startTime not in future: "startTime must be in the future"
- startTime beyond 6 months: "startTime must be within 6 months"
- startTime less than 5 minutes: "startTime must be at least 5 minutes from now"
- duration > 8 hours: "duration must be no more than 8 hours"
- idempotencyKey empty/too long: "idempotencyKey must be a non-empty string" and "idempotencyKey must be at most 255 characters"
- malformed cursor: "cursor must be a valid base64 token"
- invalid status: "status must be one of: pending, confirmed, cancelled, completed"
- invalid status transition: "status transition not allowed"
- all invalid transition 400s must use: "status transition not allowed"
- PATCH status with same current status uses: "status transition not allowed"
- non-admin cancelled -> pending uses: "status transition not allowed"
- invalid providerUserId/customerUserId: "providerUserId must be a valid UUID" and "customerUserId must be a valid UUID"

Validation error response shape (Stage 4/5):

- { code: "VALIDATION_ERROR", message: "Validation failed", errors: [{ field, message }] }
- field uses dotted path notation (e.g., startTime, query.cursor, params.id, body.providerUserId)

Stage 5: REST Bookings (UPDATED: no self-booking) (STOP when done)

Stage 5 goals (build the bookings REST surface using Stage 4 validation):

- Define request/response shapes for:
  - POST /bookings (create)
  - PATCH /bookings/:id/status (update status)
  - GET /bookings/:id (read)
  - GET /bookings (list with cursor pagination and optional admin filters)
- Ensure the Zod schemas from Stage 4 cover all request bodies, params, and query inputs above.
- Apply REST rate limiting via Nest Throttler to bookings endpoints.
- Swagger docs enabled for bookings, auth (including Google OAuth), /me, and admin endpoints; curated Postman collection for golden-path flows (including impersonation flows).

List query shape (Stage 5):

- Query params: cursor?, limit?, providerUserId?, customerUserId?, status?
- Non-admins: ignore/override filters and scope strictly to subject (by activeRole).
- Admins (not impersonating): can filter by providerUserId, customerUserId, status.
- Admins (impersonating): subject-scoped only; filters cannot widen scope.

Pagination (Stage 5):

- Order by start_time ASC, tie-breaker id ASC.
- Cursor encodes last start_time + id.
- limit default 20, max 100.

List response shape (Stage 5):

- { data: Booking[], nextCursor: string | null, hasMore: boolean }

Booking response shape (Stage 5):

- Fields: id, providerUserId, customerUserId, startTime, endTime, status, createdAt, updatedAt
- Optionally include idempotencyKey only in create responses (omit in list/get)
- Status values: pending | confirmed | cancelled | completed

Response envelopes (Stage 5):

- Create/Get: { data: Booking }
- List: { data: Booking[], nextCursor: string | null, hasMore: boolean }

Status behavior (Stage 5):

- New bookings default to status: pending
- Transitions in Stage 5:
  - pending -> cancelled
  - pending -> confirmed
  - confirmed -> completed
- Admin (impersonating) override: cancelled -> pending only
- Status update allowed for booking owner (customer or provider)
- Admins can update status only when impersonating the booking owner (subject-scoped)
- Cancellation allowed for booking owner (customer or provider) at any time
- Cancellation allowed for confirmed bookings by owner as well
- Cancellation not allowed for completed bookings
- Cancelled and completed are terminal for everyone else

Idempotency behavior (Stage 5):

- Compare normalized payload (providerUserId, startTime, endTime) for idempotency conflicts
- Normalize times to canonical ISO strings before comparison
- If same idempotency key and normalized payload matches: return existing booking (200)
- If same idempotency key and payload differs: 409 conflict
- idempotencyKey is nullable; uniqueness applies only when provided

Create booking request shape (Stage 5):

- Required: providerUserId, startTime, endTime
- Optional: idempotencyKey
- Rules:
  - startTime/endTime are ISO 8601 strings
  - startTime/endTime must include timezone (offset or Z)
  - endTime must be after startTime
  - startTime must be in the future
  - startTime must be no more than 6 months in the future
  - startTime must be at least 5 minutes from now
  - duration must be no more than 8 hours
  - idempotencyKey is a non-empty string, max length 255

Update status request shape (Stage 5):

- PATCH /bookings/:id/status body: { status: "pending" | "cancelled" | "confirmed" | "completed" }
- pending is only valid for admin impersonation override (cancelled -> pending)
- Response: { data: Booking }

List query validation (Stage 5):

- limit integer 1-100 (default 20)
- cursor must be a valid encoded token (base64 of startTime|id)
- malformed cursor returns 400 with a stable error message
- providerUserId/customerUserId must be UUIDs if present
- status must be one of pending | confirmed | cancelled | completed

Status codes (Stage 5):

- Create booking: 201 on first create; 200 on idempotent retry with same payload; 409 on same idempotency key with different payload.
- Update status: 200 on success.
- Self-booking rejected: 400.
- ActiveRole != customer on create: 403.
- Provider cannot create bookings: 403.
- GET /bookings/:id not owned by subject: 403.
- GET /bookings list returns 403 if a non-admin requests an admin-wide list (any request that omits required subject scoping).
- Invalid status transition: 400.
- PATCH status with same current status: 400.
- Unauthorized status update (not owner, or admin without impersonation): 403.

Auth/forbidden error codes (Stage 5):

- 401 responses use code: "UNAUTHENTICATED"
- 403 responses use code: "FORBIDDEN"

Auth/forbidden error shape (Stage 5):

- 401: { code: "UNAUTHENTICATED", message: "Authentication required" }
- 403: { code: "FORBIDDEN", message: "Forbidden" }

Not found/conflict error shape (Stage 5):

- 404: { code: "NOT_FOUND", message: "Booking not found" }
- 409: { code: "CONFLICT", message: "Idempotency key conflict" }

Bad request error shape (Stage 5):

- 400 (non-validation business rules, e.g., self-booking): { code: "BAD_REQUEST", message: "Bad request" }

- POST /bookings (idempotency + auth rules)
- customer creates booking as themselves (customer_user_id derived from JWT subject)
- provider_user_id must exist in provider_profiles
- disallow self-booking: reject if provider_user_id === customer_user_id (400)
- bookings endpoints require auth
- customers can only read bookings where they are the customer
- providers can only read bookings where they are the provider
- admins can read any booking but cannot create bookings
- PATCH /bookings/:id/status (status transitions)
- admin authorization uses actorUserId when impersonating; booking ownership checks use subjectUserId
- for non-admins, authorization and ownership checks use subjectUserId
- create booking requires activeRole=customer (deny otherwise)
- when impersonating, bookings list is subject-scoped (no admin-wide list)
- when impersonating, GET /bookings/:id is subject-scoped (deny if booking not owned by subject)
- GET /bookings/:id
- GET /bookings list (cursor pagination)
- REST rate limiting via Nest Throttler
- e2e test create->read
- Add tests:
  - self-booking rejected (400)
  - create booking rejects when activeRole != customer
  - provider cannot create bookings
  - GET /bookings/:id denied when booking not owned by subject (403)
  - GET /bookings list returns only subject-owned bookings
  - admin (non-impersonating) can read any booking by id and list all
  - admin (impersonating) is subject-scoped for GET /bookings/:id and GET /bookings
  - booking owner can cancel; non-owner cannot cancel
  - cancelling a non-pending booking returns 400
  - only provider (or admin impersonating provider) can confirm/complete
  - customer attempting confirm/complete returns 403
  - provider attempting confirmed -> completed from pending returns 400
  - provider attempting confirmed -> completed from pending uses "status transition not allowed"
  - provider attempting confirm on cancelled booking returns 400
  - provider attempting confirm on cancelled booking uses "status transition not allowed"
  - provider can confirm pending booking
  - provider can complete confirmed booking
  - PATCH status response returns updated status in payload
  - admin (impersonating) can move cancelled -> pending
  - admin (non-impersonating) cannot override terminal states (403)
  - non-admin cannot move cancelled -> pending (400)
  - non-admin cancelled -> pending uses "status transition not allowed"
  - PATCH status to same current status returns 400 and uses "status transition not allowed"
  - owner can cancel confirmed booking
  - cancelling a completed booking returns 400
  - cancelling a completed booking uses "status transition not allowed"
  - idempotency key behavior is enforced
  - cursor pagination yields stable ordering and next cursor

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
