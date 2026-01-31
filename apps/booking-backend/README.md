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

Optional for docker-compose:

- `POSTGRES_PORT` (default 5432)

## Run (dev)

```bash
pnpm nx serve booking-backend
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
