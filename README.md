# Unified Service Scheduler

The System Design Document for this submission lives at [`docs/system-design.html`](docs/system-design.html) (open it in any browser).

## Overview

This repository is a production-shaped first milestone for a vehicle-service scheduler. It exposes one thin but complete vertical slice: create an appointment while the server derives its duration and transactionally assigns an available service bay and qualified technician.

The milestone favors a small, reviewable foundation over feature breadth. It includes validation, RFC 9457-style failures, request correlation, structured logs, health checks, OpenAPI, deterministic seed data, PostgreSQL-backed concurrency tests, containerized execution, and CI.

## Architecture

The application is a NestJS modular monolith with one PostgreSQL database. The appointment capability has explicit boundaries:

- HTTP validates and documents transport data, invokes the use case, and maps the response. It does not import Prisma types.
- Application code coordinates reference checks, interval construction, and the booking gateway.
- Domain code owns pure half-open interval rules and has no NestJS or Prisma dependency.
- Infrastructure owns Prisma, PostgreSQL transactions, stable row-lock ordering, overlap checks, and persistence.
- Common modules provide configuration validation, problem details, logging, and request IDs.

This separation keeps allocation strategy and future concurrency hardening behind the existing public use case without introducing a repository abstraction for every table.

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

The container entrypoint applies migrations and reruns the idempotent seed on every start. This is an assessment convenience for one-command review, not a production pattern: a production deployment would run migrations as a separate release step and would not seed demo data.

Open `http://localhost:3000/docs` for Swagger UI. When finished:

```bash
docker compose --profile app down --remove-orphans
```

If the environment cannot pull the required `node:22-alpine` and `postgres:17-alpine` images from Docker Hub, image startup cannot proceed until registry access is restored or the images are already cached. This is an external registry prerequisite, not an application fallback.

## Database migrations and seed data

For host development, apply committed migrations and load the idempotent seed:

```bash
pnpm db:up
pnpm exec prisma migrate deploy
pnpm db:seed
```

`prisma migrate deploy` is the reproducible setup path. `pnpm db:migrate` uses the interactive development workflow for authoring a new migration. The seed can be rerun safely and creates one customer and vehicle, one UTC dealership, a 60-minute oil change, two bays, and one qualified technician. Stable identifiers live in `prisma/seed.ts` and are used below.

## API and OpenAPI

- `POST /api/v1/appointments` creates a confirmed appointment and returns a `Location` header pointing at the new record.
- `GET /api/v1/appointments/{id}` reads a confirmed appointment; returns `404` problem details when the id is unknown and `400` when it is not a UUID.
- `GET /api/v1/health/live` reports process liveness without querying PostgreSQL.
- `GET /api/v1/health/ready` verifies database reachability.
- `GET /docs` serves Swagger UI; `GET /docs-json` serves the OpenAPI document.

The client supplies reference IDs and an ISO 8601 start instant. The server selects resources and derives `endTime` from the authoritative service duration. The start instant must be in the future; a past `startTime` is rejected with `400 INVALID_APPOINTMENT_TIME`. Unknown request properties are rejected. Failures use a stable problem-details contract and do not expose stack traces, Prisma messages, SQL, or environment values.

An upper booking horizon (for example, "no more than 90 days ahead") is a deliberate business rule for a later milestone and is intentionally not enforced yet, so the example below can use a far-future instant.

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

An identical overlapping request can succeed only when a second complete compatible pair—another free bay and another qualified technician—is available. A conflict is expected after all compatible pairs are occupied. The provided seed has two bays but only one qualified technician, so it has capacity for one appointment at that instant and a second identical request returns `409 Conflict`.

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

Appointment intervals are UTC half-open intervals `[start, end)`, so back-to-back appointments do not overlap. In one database transaction, the gateway validates relationships, locks compatible bays and technicians in stable ID order, rechecks committed overlaps for the complete interval, chooses the first complete pair deterministically, persists the appointment, and returns only after commit. PostgreSQL-backed tests verify that competing overlapping requests cannot commit the same selected resource.

Two layers protect the central invariant. The row-locking allocation path above provides deliberate allocation behavior (a waiting request rechecks committed truth and can fall through to another free pair). Underneath it, PostgreSQL GiST **exclusion constraints** on `(service_bay_id, [start,end))` and `(technician_id, [start,end))` for `CONFIRMED` rows are the final authority: they reject overlapping reservations even against manual writes or bypass paths, independent of the application guard. Integration tests prove the database refuses conflicting direct inserts for both resource types, and that the gateway's conflict translation recognizes the real driver error shape.

The allocation query also locks the technician **qualification rows**, not just the technicians: a concurrent qualification revocation must wait for the booking to commit, so a confirmed appointment can never reference a technician whose qualification was already removed at commit time. Reference rows (customer, vehicle, dealership, service type) are read with `FOR SHARE`, so concurrent bookings do not block each other but a competing vehicle reassignment or service-type change must wait for the booking to commit — the validated ownership and duration still hold at commit time. Integration tests hold the locks and prove that competing revocations and reference mutations block. The booking transaction is bounded by explicit `maxWait` and `timeout` limits.

Failure semantics under contention are explicit: deadlocks, lock timeouts, and transaction timeouts are classified as `503 TRANSIENT_FAILURE` with a `Retry-After` hint, distinct from business conflicts (`409`) and unexpected faults (`500`). Internal bounded retry of the booking transaction after a deadlock would be safe (the aborted attempt committed nothing) and is deferred to keep this milestone small — a responsible retry policy needs a budget, backoff, and observability that do not exist yet. That is a separate concern from **idempotency-key replay**, which addresses client retries and lost responses and is also deferred. Every booking command that reaches the application layer emits a structured outcome event (`booking_confirmed` / `booking_rejected` with the rejection code and duration); transport-level DTO rejections are covered by the HTTP request log instead.

A deliberate trade-off: locking every compatible bay and technician of the dealership serializes concurrent bookings within one dealership even when their intervals do not overlap. This is acceptable for the current milestone; refining the lock to the requested interval (or relying on the exclusion constraints plus bounded retry) is the next step if measured contention justifies it.

This is a credible first-milestone guarantee, not the final distributed concurrency contract. Idempotency-key replay, bounded retries for retryable transaction failures (`40P01`), and lost-response recovery are deliberately deferred. No in-memory test is used to claim transaction or concurrency safety.

## Assumptions and deliberately deferred work

- Seeded dealership time is UTC and callers submit absolute ISO 8601 instants.
- The future-start check runs before the transaction waits for locks, so a booking that queues past its own start instant can still commit with a just-elapsed start time. Re-checking against database time at insert is deliberately left to the next milestone.
- Allocation is deterministic first-fit, not an optimization or load-balancing policy.
- Authentication, authorization, notifications, cancellation, rescheduling, frontend UI, production secret management, and multi-region writes are outside this milestone.
- Temporal exclusion constraints are implemented as the database-level authority; idempotency-key replay is not yet implemented and must not be inferred from the locking approach.
- The database is the authoritative source for duration, ownership, qualification, resource activity, and appointment state.

## AI collaboration narrative

I used AI as a reviewed collaborator, not an authority. I set the direction — the central invariant (no two confirmed appointments share a bay or technician for overlapping intervals) and the milestone boundaries — and treated every AI proposal as a draft to interrogate before accepting. Three concrete examples of that loop:

- **Concurrency.** An early AI draft checked availability with a `SELECT` and then `INSERT`ed, which leaves a race window between the check and the write. I rejected it, specified `SELECT ... FOR UPDATE` on candidate rows in a stable ID order (to avoid the bay/technician deadlock cycle) with a post-lock overlap recheck, and then asked for the design to be proven rather than asserted. That produced the Testcontainers barrier test where two competing transactions race for a single pair and exactly one commits ([test/integration/booking.gateway.int-spec.ts](test/integration/booking.gateway.int-spec.ts)). I also insisted the database keep its own authority, which is why GiST exclusion constraints exist alongside the locks.

- **Scope discipline.** AI was happy to describe the service as "production-ready" and to fold in idempotency, retries, and metrics as if built. I pushed back on any claim without executable evidence: idempotency-key replay and retry policy are documented as deferred, not implemented, and the README and design doc now separate what runs from what is designed for the next milestone.

- **Correctness gaps I caught in review.** The generated slice accepted a `startTime` in the past and created no way to read an appointment back. I added future-time validation (with an injected clock so tests stay deterministic) and a `GET /appointments/{id}` endpoint with a `Location` header, each with tests.

Every accepted change went through focused unit tests, PostgreSQL-backed integration and e2e suites, a clean typecheck/lint/build, and a read of the primary docs for the tools involved. I own every line and the final system behavior; AI accelerated the drafting, not the judgement.

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
