# Booking Backend

Minimal bookings backend for solo service providers.

## Requirements

- Node.js (per repo tooling)
- pnpm

## Install

```bash
pnpm install
```

## Environment

Copy `.env.example` to `.env` and adjust if needed.

Do not commit real secrets. Provide production values via CI/host env or Docker secrets.

Required variables:

- `DATABASE_URL`
- `REDIS_URL`
- `PORT`
- `JWT_SECRET`

Optional for docker-compose:

- `POSTGRES_PORT` (default 5432)
- `BOOTSTRAP_ADMIN_EMAIL`

## Run (dev)

```bash
pnpm nx serve booking-backend
```

If Nx warns that the daemon is not running (no auto-restart on changes), run:

```bash
pnpm nx daemon --start
```

## Local dependencies

```bash
docker compose -f apps/booking-backend/docker-compose.yml up -d postgres redis
```

## Database

Generate migrations from the schema:

```bash
pnpm nx run booking-backend:db-generate
```

Apply migrations:

```bash
pnpm nx run booking-backend:db-migrate
```

Open Drizzle Studio:

```bash
pnpm nx run booking-backend:db-studio
```

Inspect tables:

```bash
docker compose -f apps/booking-backend/docker-compose.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Auth (Email/Password)

Password rules: min 12 chars, at least one lowercase, one uppercase, one number, and one symbol. Common passwords are rejected based on `apps/booking-backend/src/auth/password-denylist.txt`.

Admin bootstrap: set `BOOTSTRAP_ADMIN_EMAIL` to an existing user email to grant the `admin` role (no implicit user creation).

Register:

```bash
curl -sS -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fname":"Ada","lname":"Lovelace","email":"ada@example.com","password":"StrongPass123!","role":"customer"}'
```

Response:

```json
{
  "accessToken": "<jwt>"
}
```

Login:

```bash
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"StrongPass123!"}'
```

Response:

```json
{
  "accessToken": "<jwt>"
}
```

/me:

```bash
curl -sS http://localhost:3000/api/me \
  -H 'Authorization: Bearer <accessToken>'
```

Response:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "roles": ["customer"],
  "activeRole": "customer",
  "actorUserId": null,
  "subjectUserId": null
}
```

Active role switch:

```bash
curl -sS -X POST http://localhost:3000/api/auth/active-role \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"activeRole":"provider"}'
```

Response:

```json
{
  "accessToken": "<jwt>"
}
```

Upgrade to provider:

```bash
curl -sS -X POST http://localhost:3000/api/auth/upgrade/provider \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"businessName":"Ada Consulting"}'
```

Response:

```json
{
  "accessToken": "<jwt>"
}
```

Admin ping:

```bash
curl -sS http://localhost:3000/api/admin/ping \
  -H 'Authorization: Bearer <accessToken>'
```

Dev token (local only, requires `AUTH_DEV_TOKENS=true` and non-production):

```bash
curl -sS -X POST http://localhost:3000/api/auth/dev-token \
  -H 'Content-Type: application/json' \
  -d '{"userId":"00000000-0000-0000-0000-000000000000"}'
```

## Build

```bash
pnpm nx build booking-backend
```

## Lint

```bash
pnpm nx lint booking-backend
```

## Test

```bash
pnpm nx test booking-backend
```

## E2E (placeholder)

```bash
pnpm nx run booking-backend-e2e:e2e
```
