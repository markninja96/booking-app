# Conventions

## Project layout (preferred)

src/
auth/
jwt.strategy.ts
jwt-auth.guard.ts
roles.guard.ts
roles.decorator.ts
bookings/
bookings.module.ts
bookings.controller.ts # REST
bookings.grpc.controller.ts # gRPC handlers
bookings.service.ts
bookings.repository.ts
bookings.schemas.ts # Zod schemas
db/
db.module.ts
drizzle.ts
schema.ts
jobs/
bullmq.module.ts
reminders.processor.ts
reminders.queue.ts
ws/
bookings.gateway.ts
ws-auth.ts
common/
zod-validation.pipe.ts
errors.ts
request-id.middleware.ts
health/
health.controller.ts

## Validation (strict)

- Runtime validation is **Zod only**.
- Do not use `class-validator` or `class-transformer` anywhere.
- Use a shared Zod parsing helper/pipe:
  - parse body/query/params
  - throw 400 with useful details

## Error shape

All errors return JSON:

- `statusCode` number
- `message` string
- `error` string
- `details` optional (for Zod issues)

Examples:

- 400 invalid input (Zod)
- 401 missing/invalid JWT
- 403 role/ownership violation
- 404 booking not found
- 409 idempotency conflict (if using conflict mode)

## Auth & authorization

JWT payload:

- sub (userId)
- role: "customer" | "provider"
- customerId? (required for customer role)
- providerId? (required for provider role)

Rules:

- Customer: can create only for token.customerId, and read only their bookings.
- Provider: can create only for token.providerId, and read only their bookings.

No auth logic inside controllers beyond guards + extracting claims.

## Idempotency policy (pick one and keep consistent)

Preferred for this repo:

- If (providerId, idempotencyKey) already exists, return **200** with existing `{ bookingId }` (no new insert).
  Alternative allowed:
- Return 409 with existing id in payload (document clearly).
  Whichever is implemented must be used consistently and documented in README.

## Cursor pagination

- Ordering: (start_time ASC, id ASC)
- Cursor encodes last seen (start_time, id)
- Query uses `(start_time, id) > (cursorStartTime, cursorId)` semantics
- `limit` default 20, max 100
- Response: `{ items, nextCursor }` (nextCursor null when no more)

## BullMQ job conventions

- Queue name: `reminders`
- Job name: `sendReminder`
- Deterministic jobId: `reminder:{bookingId}`
- Delayed job delay computed from `start_time - 10m`
- If computed delay < 0, either:
  - enqueue immediately, OR
  - skip enqueue and log (choose one; document)

## WebSocket conventions

- Authenticate at connect using JWT.
- Client rooms:
  - `customer:{customerId}`
  - `provider:{providerId}`
- Emitting events:
  - `server.to(room).emit(eventName, payload)`
- For multi-instance: use Redis adapter/pubsub.

## gRPC conventions

- Keep gRPC handlers thin; call same service layer.
- Internal auth placeholder header: `x-internal-token`.
- Document “replace with mTLS” in README.

## Testing minimums

- Unit tests for BookingsService core logic.
- One e2e/integration test:
  - create booking -> fetch booking from REST
- Keep tests deterministic; no real time sleeps (prefer short delays in test env if needed).
