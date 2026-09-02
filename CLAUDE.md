@AGENTS.md

# SecPlatform

An internal Security Asset Inventory & Vulnerability Management platform for ABBank. It holds the
application inventory, drives security assessments (penetration tests) through their lifecycle,
tracks vulnerabilities against SLAs, and pulls tickets in from Jira — using AI to work out which
inventory application a loosely-worded ticket actually concerns.

Single Next.js process for UI + REST API, a separate BullMQ worker process, PostgreSQL, Redis.

## Read these before changing anything

| Document | What it holds |
|---|---|
| `docs/DOMAIN.md` | **Start here.** The security vocabulary and business rules the code encodes |
| `docs/ARCHITECTURE.md` | Runtime topology, module map, request flow, how to add a feature |
| `docs/API.md` | Every `/api/v1` endpoint, response envelope, error codes |
| `docs/DEVELOPMENT.md` | Environment variables, native and Docker setup, troubleshooting |
| `docs/USER_GUIDE.md` | What each screen does, from the user's side |
| `SOLUTION_ARCHITECTURE.md` | The original proposal. Aspirational — includes unbuilt features (SSO). Do not treat as a description of the code |

## Running it

```bash
docker compose up -d postgres redis     # postgres 5432, redis 6379 (override via POSTGRES_PORT/REDIS_PORT)
cp .env.example .env                    # then set AUTH_SECRET to 32+ random bytes
npm install
npm run db:generate                     # prisma generate — required, the client is gitignored
npx prisma migrate deploy               # or npm run db:migrate when authoring a migration
npm run db:seed
npm run dev                             # http://localhost:3000
npm run workers                         # separate terminal: Jira sync, SLA, snapshots
```

Seeded development logins (`prisma/seed.ts`, weak passwords only when `NODE_ENV !== "production"`):
`admin@secplatform.local` / `admin123`, `manager@secplatform.local` / `manager123`,
`engineer@secplatform.local` / `engineer123`.

**Check the ports before trusting `.env`.** `compose.yaml` defaults to 5432/6379 but honours
`POSTGRES_PORT`/`REDIS_PORT`, so a container may be published somewhere else — on this machine
`secplatform-postgres-1` is on **55432** while `.env` still says 5432, and a `tsx` script that reads
`.env` will connect to a different project's database and report the tables as missing. Confirm with
`docker ps` and export `DATABASE_URL` explicitly for one-off scripts:

```bash
export DATABASE_URL="postgresql://secplatform:secplatform-local@localhost:55432/secplatform?schema=public"
```

Keep one `AUTH_SECRET` across every process. A mismatch does not raise an error — it silently makes
stored integration tokens unreadable (see *Secrets at rest* below).

## This stack differs from the common defaults — verify, don't assume

Read `node_modules/next/dist/docs/` for Next.js specifics (see `AGENTS.md`). Beyond that:

- **Middleware lives in `src/proxy.ts`**, not `middleware.ts`, and exports `proxy()` plus `config`.
  It does role-based gating on `/admin/*` and returns JSON 401s for `/api/*`.
- **shadcn/ui here is built on `@base-ui/react`, not Radix.** There is no `asChild`. Most
  importantly, **`SelectValue` renders the raw stored value unless you give it explicit children** —
  every select that shows a label needs `<SelectValue>{labelFor(value)}</SelectValue>`. This has
  shipped a visible bug repeatedly — check it on every new select.
- **Prisma 7** with the `PrismaPg` adapter. The generated client is at `src/generated/prisma`
  (gitignored) — run `npm run db:generate` after any pull or schema edit.
- **Zod v4** (`zod/v4`). `.partial()` **still applies `.default()` values**, so a "test these
  unsaved values" endpoint built from `schema.partial()` silently substitutes defaults for omitted
  fields. Where that matters, declare a separate schema with no defaults — see
  `confluenceTestSchema` next to `confluenceSettingsSchema`.
- **Tailwind v4** with `@theme inline` and oklch tokens in `src/app/globals.css`. Dark mode is the
  **`.dark` class** (`@custom-variant dark (&:is(.dark *))`), not `data-theme`.
- **Custom i18n**, not next-intl. `useTranslation()` → `t("a.b.c")` does a dot-path lookup and
  **echoes the key back on a miss** rather than throwing, so a typo ships as visible gibberish.
  `src/lib/i18n/locales/{en,vi}.json` must stay key-symmetric.

## Conventions

**Layering.** API routes are thin: validate → authorize → delegate to a service in `src/modules/*`
→ format. Business rules live in services, never in route handlers or components.

**API routes** use the helpers in `src/lib/api/`: `withAuth`, `withPermission`, `validateBody`,
`successResponse`, `errorResponse`, `parsePaginationParams`. The response envelope is
`{ success, data, meta }` / `{ success, error }` — see `docs/API.md`.

**Authorization is enforced three times, deliberately:** in `src/proxy.ts` (so a forbidden admin
page 307s before rendering), in the section `layout.tsx` via `requirePermission`, and in the API
route. Hiding a nav link is not authorization. Roles and permissions are in
`src/lib/auth/permissions.ts` — kept **free of Prisma imports on purpose**, because client
components import it and pulling in the Prisma client breaks the browser bundle on `node:module`.
The same applies to `src/types/workflow-status.ts`. Do not "tidy" these back into `src/types/enums.ts`.

**Audit.** `auditService.log()` is fail-closed for the actions listed in `MUST_BE_RECORDED` — those
throw if the audit row cannot be written. Note `AuditLog.entityId` is a **uuid column**: passing a
settings key or other non-uuid string makes the insert fail, and before the fail-closed change that
failure was silent.

**Secrets at rest.** Provider tokens in `SystemSetting` are AES-256-GCM encrypted by
`src/lib/crypto/secret-box.ts`, with the key derived from `AUTH_SECRET`. `decryptSecret` returns
`null` rather than throwing when the value is unreadable, so **a changed `AUTH_SECRET` presents as
"no token configured", not as an error.** If an integration mysteriously reports itself
unconfigured, suspect the secret before the code.

**Migrations are immutable once applied.** Never append to a migration that has run — it breaks
Prisma's checksum. Write a new one.

**Design.** Colour only ever means risk or time (`--risk-*` tokens: critical/high/medium/low/info,
plus `--risk-fresh` for "assessed recently"). Brand teal and brand orange are for brand furniture
only — never to encode a status, a level, or a category.

## Schema traps

Real field names that differ from the obvious guess (all cost a failed query at least once):

- `ExternalIssue` keys on **`sourceId`** (e.g. `"SEC-301"`), not `externalKey`, unique on
  `[source, sourceId]`. `lastSyncedAt` is **required** on create.
- `Application` has **no `deletedAt`** — archival is `status`. Importance is `level Int @default(2)`
  (1–3); the `Criticality` enum still exists but belongs to `Assessment.priority`, not here.
- `AssessmentApplication` is a join table with a **composite primary key and no `id` column**.
- `User` has `displayName`, not `name` or `fullName`. Roles are the 9 values in `enum UserRole`
  (`SYSTEM_ADMIN`, `SECURITY_ADMIN`, `SECURITY_MANAGER`, …), not `ADMIN`.

28 models, 22 enums, 8 migrations. `prisma/schema.prisma` is the reference — read it rather than
guessing.

## Verifying work before you call it done

```bash
npx tsc --noEmit          # must be silent
npx eslint <changed files>
npx next build            # must reach "Compiled successfully"
```

Plus, for anything that touches the UI: check EN/VI key parity, because a missing key renders as
the raw dot-path instead of failing.

```bash
node -e '
const flat = (o, p = "") =>
  typeof o === "object" && o !== null
    ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
    : [p];
const en = new Set(flat(require("./src/lib/i18n/locales/en.json")));
const vi = new Set(flat(require("./src/lib/i18n/locales/vi.json")));
console.log(en.size, vi.size);
console.log("missing in vi:", [...en].filter((k) => !vi.has(k)));
console.log("missing in en:", [...vi].filter((k) => !en.has(k)));'
```

There is no test suite. Behaviour is verified by running the code — a short `tsx` script against
the dev database is the normal way to exercise a service directly:

```bash
export DATABASE_URL=...                  # the real port, per the note above
npx tsx --env-file=.env ./script.mts     # place it in the repo root; `@/` aliases resolve there,
                                         # but NOT from a temp directory
```

## Editing files from the shell

Python heredocs mangle escape sequences in this codebase's TypeScript. A regex word boundary written
into a patch script arrives as a backspace byte, a newline escape as a real newline, and a unicode
escape as a literal combining character — all of which typecheck and then misbehave at runtime. When
patching with a script, build backslashes with `chr(92)` explicitly and scan the result with
`cat -v` afterwards. Prefer the Edit tool for anything containing escapes.
