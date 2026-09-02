# Development and Deployment

## Prerequisites

For a native build:

- Node.js 22 LTS and npm
- PostgreSQL 16
- PostgreSQL extensions `vector` and `pg_trgm`
- Redis 7

For a container build:

- Docker Engine
- Docker Compose v2 (`docker compose`)

## Environment Configuration

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

On Bash-compatible shells:

```bash
cp .env.example .env
```

Generate an authentication secret with a platform secret manager or a cryptographically secure tool. Do not use the placeholder outside an isolated local environment.

### Core Variables

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `REDIS_URL` | Yes for distributed behavior | Redis connection URL for cache, rate limits, and BullMQ |
| `AUTH_SECRET` | Yes in production | NextAuth signing secret; use at least 32 random bytes |
| `AUTH_URL` | Recommended | Public base URL, such as `http://localhost:3000` |
| `LOG_LEVEL` | No | Pino level; defaults to `info` |
| `NEXT_PUBLIC_SHOW_DEV_CREDENTIALS` | No | Shows the admin development login when set to `true` at build time |

### AI Variables

| Variable | Required | Description |
|---|---:|---|
| `AI_EXTERNAL_PROCESSING_ENABLED` | Yes for external AI | Must be exactly `true` to permit vendor calls |
| `ANTHROPIC_API_KEY` | Yes for external AI | Anthropic API credential |

Both AI values are required. With either missing, deterministic fallbacks remain available and no data is sent to Anthropic.

### Jira Variables

| Variable | Required | Description |
|---|---:|---|
| `JIRA_BASE_URL` | Yes for Jira | Jira Cloud site URL, without a trailing slash |
| `JIRA_EMAIL` | Yes for Jira | Account email associated with the API token |
| `JIRA_API_TOKEN` | Yes for Jira | Jira API token |
| `JIRA_PROJECT_ASSESSMENT` | Usually | Assessment project key |
| `JIRA_PROJECT_VULNERABILITY` | Usually | Vulnerability project key |
| `JIRA_ASSESSMENT_JQL` | No | Custom assessment query; overrides the project query |
| `JIRA_VULNERABILITY_JQL` | No | Custom vulnerability query; overrides the project query |
| `JIRA_SYNC_INTERVAL` | No | Displayed configuration value; defaults to 15 minutes |
| `JIRA_WEBHOOK_SECRET` | Yes for webhooks | Shared secret expected in `X-Webhook-Secret` |

### Seed and Email Variables

`SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, and `SEED_ENGINEER_PASSWORD` are required when deliberately seeding production-like environments. If omitted under `NODE_ENV=production`, random passwords are generated and only the admin omission is logged.

`DOCKER_AUTH_SECRET` is the Compose-specific signing secret. It is separate from `AUTH_SECRET` so an existing native-development value cannot silently change the container runtime.

SMTP variables are currently placeholders. The email service logs redacted metadata but does not deliver email.

## Native Setup Without Docker

### 1. Prepare PostgreSQL

Create a database and application user using your normal PostgreSQL administration process. As an administrator, enable the required extensions in the target database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Set `DATABASE_URL` in `.env` to that database. The migration user must be able to create tables, types, indexes, and sequences.

### 2. Start Redis

Start Redis locally and set `REDIS_URL`, normally `redis://localhost:6379`.

### 3. Install and Initialize

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` runs `prisma migrate dev` and applies the managed migrations under `prisma/migrations`. Do not use `prisma db push` for shared or production databases because it bypasses migration history.

### 4. Run the Application

```bash
npm run dev
```

In a second terminal, start background workers when testing Jira polling, SLA changes, or snapshots:

```bash
npm run workers
```

The application listens on `http://localhost:3000`.

## Native Production Build

Build and run against already-migrated PostgreSQL and Redis services:

```bash
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build
npm start
```

Run `npm run workers` as a separately supervised process. The worker should use the same application version and environment configuration as the web process.

Before deployment, run:

```bash
npx tsc --noEmit
npm run lint
npx prisma validate
npm audit --omit=dev
npm run build
```

## Docker Build

### Complete Local Stack

The Compose stack includes PostgreSQL, Redis, a one-shot migration/seed service, and the production Next.js image:

```bash
docker compose up --build
```

Open `http://localhost:3000`. Compose stores database and Redis data in named volumes.

Include the worker profile:

```bash
docker compose --profile workers up --build
```

Run in the background:

```bash
docker compose --profile workers up --build -d
docker compose ps
docker compose logs -f app worker
```

Stop containers while retaining data:

```bash
docker compose down
```

Delete the local database and Redis volumes:

```bash
docker compose down -v
```

The last command is destructive.

### Build Only

Build the production application image without starting dependencies:

```bash
docker build --target runner -t secplatform:local .
```

The image expects `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, and `AUTH_URL` at runtime and listens on port 3000.

### Compose Scope

`compose.yaml` is a local/reference deployment:

- It publishes PostgreSQL and Redis to the host.
- It uses local default credentials unless overridden.
- It seeds development accounts on startup.
- It does not configure TLS, ingress, secret storage, backups, or centralized logs.

For production, use managed secrets, private database networking, TLS termination, persistent backups, a non-superuser migration identity, and an orchestrator-supported one-shot migration job.

## Database Changes

1. Edit `prisma/schema.prisma`.
2. Generate a migration locally with `npx prisma migrate dev --name <change_name>`.
3. Review the generated SQL, especially destructive operations and indexes.
4. Run `npm run db:generate`.
5. Commit the schema, generated migration, and affected code together. Generated Prisma Client output remains ignored.
6. Deploy with `npx prisma migrate deploy`; never run `migrate dev` in production.

The first migration is the complete schema baseline. The second adds sequence-backed display keys and performance indexes.

## Troubleshooting

### Authentication Fails Immediately

- Confirm `AUTH_SECRET` is set in production.
- Confirm the seeded or administered user is active and has a password hash.
- Wait for the 15-minute login rate-limit window or clear the local Redis keyspace when testing repeated failures.

### Security Manager Sees No Data

Security-manager scope fails closed without `businessUnitId`. Assign a business unit to the user. The development seed assigns the manager to Technology.

### Redis Is Unavailable

The web process can fall back to in-process rate limiting and uncached database reads, but behavior will not be consistent across multiple instances. Workers require Redis and will not operate correctly without it.

### Prisma Cannot Create Extensions

Create `vector` and `pg_trgm` as a PostgreSQL administrator, then rerun `prisma migrate deploy` with the application migration identity.

### Docker Migration Service Exits

Inspect the one-shot service:

```bash
docker compose logs migrate
docker compose ps -a
```

The app intentionally waits for a successful migration before starting.

### Jira Sync Does Not Run

- Start the worker process.
- Configure all three base credentials.
- Configure project keys or explicit JQL.
- Use Administration > Jira Integration to test the connection before starting a sync.
