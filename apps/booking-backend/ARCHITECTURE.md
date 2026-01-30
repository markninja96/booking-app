# Architecture (Bookings Service)

## Goal

Minimal backend for solo service providers:

- REST API (external)
- gRPC (internal)
- PostgreSQL (source of truth)
- Redis + BullMQ (async reminders)
- WebSocket notifications (customer + provider)

## Component map

External path:
Client -> REST (HTTP) -> Bookings Service -> Postgres
|-> BullMQ (Redis) -> Worker
|-> WebSocket Gateway -> Clients

Internal path:
Internal Service -> gRPC -> Bookings Service -> Postgres

Scale-out for WS:
Bookings Service instances broadcast WS events via Redis adapter/pubsub.

## Trust boundaries

- REST: authenticated via Passport JWT (Bearer token).
- WebSockets: authenticated via JWT at connection (same verification).
- gRPC: internal auth placeholder (x-internal-token). Document mTLS as production approach.

## Source of truth

- Postgres is authoritative.
- Redis is best-effort for reminders and broadcast.

## Booking creation flow (invariants)

1. Validate request (Zod).
2. Authorize (JWT role + ownership).
3. In DB transaction:
   - Insert booking (enforce end_time > start_time).
   - Apply idempotency (unique provider_id + idempotency_key when provided).
4. After commit (best-effort):
   - Enqueue BullMQ delayed reminder job for start_time - 10m with jobId `reminder:{bookingId}`.
   - Emit WS event `booking.created` to customer and provider.

## Reminder flow (invariants)

- Worker consumes BullMQ `reminders` queue.
- Reminder job emits WS event `booking.reminder.due` (best-effort) and logs.
- Reminder job must be idempotent via deterministic jobId.

## Events

- `booking.created` payload:
  - bookingId, providerId, customerId, startTime, endTime, status
- `booking.reminder.due` payload:
  - bookingId, providerId, customerId, startTime

## Rate limiting

- REST endpoints: 60 rpm per user/IP (Nest Throttler).
- WebSockets: basic connection/message throttling (lightweight; minimal implementation).

## Observability

- Structured logs including requestId.
- `GET /health` for liveness (optionally checks DB).

## Non-goals

- Payments, calendars, provider availability, multi-provider orgs.
- Email/SMS integrations (leave as placeholders).
