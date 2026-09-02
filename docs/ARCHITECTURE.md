# Current Codebase Architecture

This document describes the application as implemented. `SOLUTION_ARCHITECTURE.md` is the original product proposal and includes features, such as corporate SSO, that are not yet present.

## Runtime Topology

```text
Browser
  |
  v
Next.js application (UI + /api/v1 REST routes)
  |                       |
  v                       v
PostgreSQL             Redis
domain data            cache, rate limits, BullMQ
                          ^
                          |
                    worker process
                 Jira sync / SLA / snapshots

Optional outbound services: Jira Cloud and Anthropic
```

The web UI and REST API deploy as one Next.js process. Background jobs run from the same codebase as a separate `npm run workers` process.

## Repository Layout

```text
src/app/(auth)                 Login UI
src/app/(platform)             Authenticated application pages
src/app/api/auth               NextAuth handlers
src/app/api/v1                 Versioned REST route handlers
src/components                 Shared UI and feature components
src/config                     Navigation and presentation configuration
src/lib/api                    Auth, permissions, validation, rate limits, responses
src/lib/auth                   NextAuth configuration
src/lib/db                     Prisma client singleton
src/lib/queries                Browser-side API clients
src/lib/redis                  Redis client and cache helpers
src/modules                    Domain modules and services
src/workers                    BullMQ worker bootstrap and schedules
prisma/schema.prisma           Database source of truth
prisma/seed.ts                 Reference data and development users
prisma/migrations              Managed database migration history
```

## Request Flow

1. A route under `src/app/api/v1` is wrapped by `createHandler`.
2. `createHandler` resolves the NextAuth session and builds an authenticated user context.
3. Mutating routes enforce an allowed content type; multipart upload additionally requires `X-Requested-With: XMLHttpRequest`.
4. Redis-backed rate limits and role permissions are applied where configured.
5. Zod validates request input before the route calls a domain service.
6. The domain service applies attribute-based scope filters and executes Prisma queries.
7. Responses use the common `{ success, data, meta, error }` envelope.
8. Significant mutations write an append-only audit event.

Keep business logic in services, not route handlers. Route handlers own HTTP concerns: authentication, parsing, validation, status codes, and response formatting.

## Domain Modules

| Module | Responsibilities |
|---|---|
| `asset-management` | Applications, aliases, owners, security summary |
| `assessment-management` | Assessment CRUD, assignment, lifecycle, status history |
| `vulnerability-management` | Findings, SLA calculation, risk acceptance, application counters |
| `integration-engine` | Excel import, Jira adapter, synchronization, write-back queues |
| `intelligence-engine` | Deterministic metrics, AI gateway, ticket analysis, mapping and assignment recommendations |
| `operations-console` | Search, dashboards, analytics, notifications, email facade |
| `platform-services` | RBAC, ABAC scope filters, workflows, audit logging |

Modules expose public APIs through their `index.ts` files. Cross-module dependencies should target these public exports or a clearly named service.

## Data Model

The primary entities are:

- `Application`: inventory record and anchor for security posture.
- `Assessment`: security work performed against one or more applications.
- `Vulnerability`: finding affecting one or more applications, optionally created by an assessment.
- `ExternalIssue`: normalized copy of an external Jira issue.
- `ApplicationMapping`: reviewed relationship between an external issue and an application.
- `StatusHistory` and `AuditLog`: lifecycle and accountability records.

`AssessmentApplication` and `VulnerabilityApplication` implement the many-to-many application relationships. Application vulnerability counters are denormalized for dashboard and list performance and are recalculated after vulnerability changes.

Human-readable keys use PostgreSQL sequences:

- Assessments: `ASM-00001`
- Vulnerabilities: `VUL-00001`

The sequence and reverse junction indexes are created by the second managed Prisma migration.

## Authentication and Authorization

Authentication currently uses NextAuth credentials with an eight-hour JWT session. Password hashes use bcrypt. Login attempts and protected AI routes use Redis-backed rate limits with an in-process fallback.

Authorization has two layers:

- RBAC in `src/modules/platform-services/types/roles.ts` decides whether a role can perform an operation.
- ABAC in `src/modules/platform-services/middleware/abac.middleware.ts` limits which application, assessment, and vulnerability rows the user can access.

Important scope behavior:

- System/security administrators, security engineers, auditors, executives, and read-only reporting users have global scopes where their permission allows access.
- Security managers are limited to their assigned business unit and fail closed without one.
- Application owners see records related to owned applications.
- Developers see vulnerabilities assigned to them for remediation.
- Object lookups return not found when the object is outside the caller's scope.

Never query a scoped entity directly from a new route without using `scopeApplicationWhere`, `scopeAssessmentWhere`, or `scopeVulnerabilityWhere`.

## Background Processing

`src/workers/index.ts` registers three schedules:

| Job | Schedule | Purpose |
|---|---|---|
| Jira sync | Every 15 minutes | Incrementally synchronize configured Jira projects |
| SLA check | Every hour | Recalculate SLA state and overdue days |
| Daily snapshot | Midnight, worker timezone | Store dashboard metrics for trend reporting |

The worker requires PostgreSQL and Redis. Run exactly one scheduler instance unless BullMQ leader behavior and workload concurrency have been reviewed for the deployment topology.

## Caching

- Dashboard data is cached for 60 seconds.
- Daily briefs are cached for five minutes per effective user scope and day.
- Cache misses are coalesced in-process to avoid duplicate work.
- Redis failures are non-fatal for cache reads and writes; database queries remain the source of truth.

Do not cache scoped data under a global cache key. Include the business unit or user identity when the result varies by authorization scope.

## External Integrations

### Jira

The Jira adapter uses Jira Cloud REST API v3, incremental watermarks, bounded page sizes, retries, and request timeouts. Webhooks authenticate with `X-Webhook-Secret`. Jira write-back is queued and requires an authorized approval action.

### AI

The AI gateway currently supports Anthropic. It is disabled unless both the API key and the explicit external-processing flag are set. Common sensitive patterns are redacted, raw prompts and model output are not retained by the gateway, and arbitrary AI-generated SQL is not executed.

### Email

The email service currently logs redacted delivery metadata and returns success. It does not connect to SMTP despite accepting SMTP environment variables.

## Adding a Feature

1. Add or update a Zod schema in the owning module.
2. Put business logic in a module service and keep Prisma access there.
3. Apply RBAC permission and ABAC row scope at the service boundary.
4. Add a thin route under `/api/v1` using `createHandler` and shared response helpers.
5. Add the browser query wrapper and UI.
6. Update audit behavior, indexes, and cache invalidation when relevant.
7. Run TypeScript, ESLint, Prisma validation, and a production build.
