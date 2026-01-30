# Stage Plan (Agent Must Follow)

## Gates (after every stage)

Run and pass:

- pnpm nx lint booking-backend
- pnpm nx build booking-backend
- pnpm nx test booking-backend
  If any fails, fix before proceeding.

## Diff discipline (after every stage)

Output:

- Summary (3–7 bullets)
- Pseudo-commit message (conventional commits)
- Files changed (added/modified/deleted) + 1-line per file
- Commands executed + results

---

## Stage 0: Scaffold

- Create Nest project, strict TS
- eslint/prettier
- README skeleton
- .env.example
- placeholder docker-compose.yml

## Stage 1: Infra

- docker-compose: postgres + redis
- ConfigModule env wiring
- GET /health

## Stage 2: DB

- Drizzle schema + migrations
- DB module
- migration command
- DB smoke test

## Stage 3: Auth (Passport JWT)

- JwtStrategy + JwtAuthGuard
- RolesGuard + @Roles
- Provide local dev tokens (mint endpoint behind env flag OR documented sample tokens)

## Stage 4: Zod validation

- ZodValidationPipe/helper
- Zod schemas for bookings endpoints
- tests for 400 invalid payloads

## Stage 5: REST Bookings

- POST /bookings (idempotency + auth rules)
- GET /bookings/:id
- GET /bookings list (cursor pagination)
- REST rate limiting via Nest Throttler
- e2e test create->read

## Stage 6: BullMQ reminders

- reminders queue
- delayed job at start_time - 10m, deterministic jobId
- worker logs + emits placeholder hook
- tests for deterministic jobId

## Stage 7: WebSockets

- Gateway with JWT auth at connect
- rooms: customer:{id}, provider:{id}
- emit booking.created, booking.reminder.due
- redis adapter/pubsub for broadcast
- ws smoke test (script acceptable)

## Stage 8: gRPC

- bookings.proto Create/Get/List
- grpc controller calls service layer
- internal auth placeholder header
- grpc smoke test

## Stage 9: Final polish

- finalize README with exact commands
- requestId middleware and structured logging
- verify compose + migrate + gates
