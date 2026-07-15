# Unified Service Scheduler

## Overview

This repository implements the first milestone of a vehicle-service scheduler: create an appointment while the server derives its duration and safely assigns an available bay and qualified technician. It includes validation, problem details, structured logs, health checks, OpenAPI, deterministic seed data, PostgreSQL-backed tests, containers, and CI.

## Architecture

The application is a NestJS modular monolith with one PostgreSQL database. The appointment capability has explicit boundaries:

- HTTP validates and documents transport data, invokes the use case, and maps the response. It does not import Prisma types.
- Application code coordinates reference checks, interval construction, and the booking gateway.
- Domain code owns pure half-open interval rules and has no NestJS or Prisma dependency.
- Infrastructure owns Prisma, PostgreSQL transactions, stable row-lock ordering, overlap checks, and persistence.
- Common modules provide configuration validation, problem details, logging, and request IDs.

## Prerequisites

- Node.js 22.x
- Corepack and pnpm 10.x (`corepack enable` activates the pinned version)
- Docker with Docker Compose v2
- `curl` for the HTTP examples

Copy `.env.example` to `.env` only when you need to override the safe local defaults. Never commit `.env` files.

## Quick start: local development

Run PostgreSQL in Docker and the API directly on the host for fast reload:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

The API listens on `http://localhost:3000`. Stop the database with `pnpm db:down`.

## Quick start: interviewer/full stack

The `app` profile builds the production image, starts PostgreSQL, applies migrations, seeds deterministic review data, and waits for both services to become healthy:

```bash
docker compose --profile app up --build -d --wait
curl --fail http://localhost:3000/api/v1/health/live
curl --fail http://localhost:3000/api/v1/health/ready
curl --fail http://localhost:3000/docs-json
```

The entrypoint applies migrations and runs the idempotent seed; appointments remain in the retained PostgreSQL volume. In production, migrations and demo seed data would be handled outside application startup.

Open `http://localhost:3000/docs` for Swagger UI. When finished:

```bash
docker compose --profile app down --remove-orphans
```

## Database migrations and seed data

For host development, apply committed migrations and load the idempotent seed:

```bash
pnpm db:up
pnpm exec prisma migrate deploy
pnpm db:seed
```

`prisma migrate deploy` applies committed migrations; `pnpm db:migrate` is only for authoring new ones. The seed is safe to rerun and creates the fixed review data used below.

## API and OpenAPI

- `POST /api/v1/appointments` creates a confirmed appointment and returns a `Location` header pointing at the new record.
- `GET /api/v1/appointments/{id}` reads a confirmed appointment; returns `404` problem details when the id is unknown and `400` when it is not a UUID.
- `GET /api/v1/health/live` reports process liveness without querying PostgreSQL.
- `GET /api/v1/health/ready` verifies database reachability.
- `GET /docs` serves Swagger UI; `GET /docs-json` serves the OpenAPI document.

The client supplies reference IDs and an ISO 8601 start time. The server selects resources and derives `endTime` from the stored service duration. Invalid requests return problem details without exposing internal errors.

## Example booking request

The example uses deterministic seed IDs and a UTC time safely in the future for assessment demonstrations:

```bash
curl --fail-with-body \
  -H 'content-type: application/json' \
  -d '{
    "customerId": "10000000-0000-4000-8000-000000000001",
    "vehicleId": "20000000-0000-4000-8000-000000000001",
    "dealershipId": "30000000-0000-4000-8000-000000000001",
    "serviceTypeId": "40000000-0000-4000-8000-000000000001",
    "startTime": "2030-01-15T10:00:00.000Z"
  }' \
  http://localhost:3000/api/v1/appointments
```

The `201 Created` response includes a `Location` header such as `/api/v1/appointments/{id}`. Read the record back with:

```bash
curl --fail http://localhost:3000/api/v1/appointments/{id}
```

An identical overlapping request always returns `409 Conflict`: the same vehicle cannot be serviced by two appointments at once, even when a second complete bay/technician pair is free. A request for a different vehicle may use that second pair. The provided seed has two bays but only one qualified technician, so it has capacity for one appointment at that instant.

To repeat the exact assessment request while retaining the PostgreSQL volume, explicitly rerun only the assessment seed with reset enabled. This deletes appointments for the deterministic seed vehicle and leaves unrelated appointments untouched:

```bash
docker compose --profile app run --rm --no-deps \
  -e RESET_DEMO_APPOINTMENTS=true \
  --entrypoint pnpm app db:seed
```

## Testing and verification

The full clean-check command is:

```bash
pnpm install --frozen-lockfile
pnpm verify
docker build .
docker compose config
git diff --check
```

`pnpm verify` runs formatting checks, lint, strict type checking, unit tests, PostgreSQL integration tests, end-to-end tests, and the production build. Integration and end-to-end suites use Testcontainers and therefore require a working Docker daemon; CI uses the hosted runner's Docker daemon rather than a duplicate PostgreSQL service.

Test boundaries are intentional:

- Unit tests cover interval rules, application decisions, controllers, health behavior, and safe failure translation.
- Integration tests use real PostgreSQL for allocation, locking, rollback, overlap, and competing-request claims.
- End-to-end tests exercise the public HTTP contract against a real application and PostgreSQL.

## Concurrency guarantees and milestone boundaries

Booking uses UTC half-open intervals `[start, end)`. Allocation runs in one PostgreSQL transaction and protects the rule that a confirmed appointment cannot overlap the same vehicle, bay, or technician.

- The gateway locks resources in a stable order and rechecks availability before saving.
- PostgreSQL exclusion constraints provide a final database-level safeguard.
- Business conflicts return `409`; known temporary database failures return `503`.
- Locking all compatible resources keeps this milestone simple but can serialize bookings within one dealership.

Idempotency keys, internal retries, and lost-response recovery are deferred.

## Assumptions and deliberately deferred work

- The seeded dealership uses UTC, and allocation uses deterministic first-fit.
- The database is authoritative for duration, ownership, qualification, resource state, and appointments.
- Authentication, authorization, notifications, cancellation, rescheduling, frontend UI, production secrets, and multi-region writes are outside this milestone.

## AI collaboration narrative

During design, I used AI to explore requirements, architecture, and concurrency options. During implementation, AI helped with planning, coding, and review; I remained responsible for architecture, correctness, and scope.

### From setup to delivery

I built the service in small stages: project setup, database, domain rules, use case, PostgreSQL adapter, HTTP API, tests, containers, and CI. For each stage, I clarified the requirement, discussed trade-offs with AI, and approved a small plan before implementation.

Each task followed the same small review loop:

1. **Clarify:** confirm the requirement, assumptions, and acceptance criteria.
2. **Plan:** compare options and split the work into a small task.
3. **Implement with TDD:** write a failing test, make the smallest change, and rerun the test.
4. **Review and verify:** inspect the diff, check edge cases, run wider checks, and refresh the context before the next task.

Small tasks kept the context focused. I reviewed every result against the original acceptance criteria to catch inconsistent code, weakened requirements, and missed edge cases.

### Evidence from review loops

- The initial transaction (`75f854c`) filtered availability inside the locking query, so a request that waited on a lock could act on stale availability. In review I split locking from selection — lock all active candidates first, then re-check overlaps after any wait — and proved it with [`allocates a single pair to exactly one competing transaction`](test/integration/booking.gateway.int-spec.ts) (`4a04686`).
- A test hook became a required runtime dependency. I made it optional and added [`constructs without registering test transaction hooks`](src/modules/appointments/infrastructure/prisma-appointment-booking.gateway.spec.ts) (`fb2d32f`).

The final gate runs formatting, lint, type checking, unit, integration and end-to-end tests, and the production build. AI helped me move faster through this loop; I reviewed and approved the final result.

## Project structure

```text
src/app/                         application composition and bootstrap configuration
src/common/                      configuration, errors, validation, observability
src/database/                    Prisma lifecycle
src/health/                      liveness and readiness
src/modules/appointments/domain  pure interval rules
src/modules/appointments/application  booking use case and ports
src/modules/appointments/infrastructure  PostgreSQL allocation adapter
src/modules/appointments/http    DTOs, controller, and response contract
prisma/                          schema, committed migration, deterministic seed
test/integration/                real-PostgreSQL allocation tests
test/e2e/                        public API tests
.github/workflows/ci.yml         clean-checkout CI
```
