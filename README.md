# SecPlatform

SecPlatform is an internal security operations application for managing application inventory, security assessments, vulnerabilities, SLA compliance, Jira synchronization, imports, reporting, and audited AI-assisted workflows.

The current implementation is a modular Next.js monolith backed by PostgreSQL and Redis. It uses credentials authentication today; the SSO design in `SOLUTION_ARCHITECTURE.md` is aspirational and is not implemented.

## Capabilities

- Application inventory, aliases, owners, assessment history, vulnerability history, and CSV export
- Assessment intake, assignment, status workflows, history, and engineer recommendations
- Vulnerability lifecycle, SLA calculation, remediation ownership, and risk acceptance
- Excel inventory preview, confirmation, history, and 24-hour rollback
- Jira polling, webhook ingestion, mapping review, and approved write-back actions
- Executive, operations, analytics, and daily-brief reporting
- Role and business-unit scoped access, audit logs, notifications, and rate limiting
- Optional Anthropic integration with explicit external-processing opt-in

## Technology

- Next.js 16.3, React 19, TypeScript
- Prisma ORM 7 with the PostgreSQL driver adapter
- PostgreSQL 16 with `pg_trgm` and `vector`
- Redis 7 and BullMQ
- NextAuth 5 credentials authentication
- Tailwind CSS, Base UI, shadcn components, Recharts

## Quick Start With Docker

Prerequisites: Docker Engine with Docker Compose v2.

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The local Compose bootstrap creates these development users:

| Role | Email | Password |
|---|---|---|
| System administrator | `admin@secplatform.local` | `admin123` |
| Security manager | `manager@secplatform.local` | `manager123` |
| Security engineer | `engineer@secplatform.local` | `engineer123` |

Start scheduled workers as well:

```bash
docker compose --profile workers up --build
```

The Compose defaults are for local development only. Change `AUTH_SECRET`, database credentials, and seed passwords before adapting the configuration for a shared environment.

## Quick Start Without Docker

Prerequisites: Node.js 22, PostgreSQL 16 with pgvector, and Redis 7.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Create `.env` from `.env.example` and start PostgreSQL and Redis before running the database commands. The application is available at `http://localhost:3000`.

For scheduled Jira sync, SLA recalculation, and daily snapshots, run this separately:

```bash
npm run workers
```

## Documentation

- [Development and deployment](docs/DEVELOPMENT.md)
- [Current codebase architecture](docs/ARCHITECTURE.md)
- [Application user guide](docs/USER_GUIDE.md)
- [API reference](docs/API.md)
- [Original solution proposal](SOLUTION_ARCHITECTURE.md)

## Common Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Run TypeScript validation |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create/apply development migrations |
| `npx prisma migrate deploy` | Apply committed migrations in deployment |
| `npm run db:seed` | Seed reference data and development users |
| `npm run workers` | Start BullMQ workers and schedules |

## Security Notes

- Never commit `.env`; only `.env.example` is intended for source control.
- External AI calls require both `ANTHROPIC_API_KEY` and `AI_EXTERNAL_PROCESSING_ENABLED=true`.
- API authorization is enforced server-side. Hiding navigation items is not an authorization control.
- The included Compose file publishes PostgreSQL and Redis ports for local development. Do not expose them publicly.
- Email delivery is currently a logging stub. SMTP variables are reserved but do not send mail.
