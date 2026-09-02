# Apply the ABBank SecPlatform front-end redesign

Paste everything below into Claude Code, from the repo root, with the patch folder unzipped
somewhere it can read (or its files already copied to `patch/` at the repo root).

---

## Prompt

You are working in the ABBank SecPlatform repo: Next.js App Router, TypeScript, Tailwind v4,
shadcn with the `base-nova` style, Prisma, TanStack Query, NextAuth.

I have a reviewed redesign to apply. The new source lives in `patch/` and mirrors the repo
layout. Apply it carefully, in the order below, verifying the build after each stage. Do not
redesign anything I have not listed, and do not "improve" screens beyond these instructions.

### Stage 0 — orient

Read these before changing anything: `src/app/globals.css`, `src/app/layout.tsx`,
`src/components/layout/sidebar.tsx`, `src/components/data-display/*`,
`src/components/charts/*`, `src/app/(platform)/vulnerabilities/page.tsx`, and
`src/lib/queries/vulnerabilities.ts`. Also read `patch/README.md`.

Note: if the unzipped patch has a folder named `-platform-`, rename it to `(platform)`.

### Stage 1 — theme and the font bug

1. Replace `src/app/globals.css` with `patch/src/app/globals.css`.
   It keeps every existing token name and adds: ABBank brand tokens (teal `--brand`,
   orange `--brand-orange`), a five-step risk ramp (`--risk-critical` … `--risk-info`),
   warm neutrals, and `--chart-1..5` now aliased to the risk ramp instead of greyscale.
2. Real bug to confirm fixed: the old `@theme inline` had `--font-sans: var(--font-sans)`,
   a variable nothing defines, so the Geist font the root layout loads never applied and
   every screen rendered in the browser default. The new file maps it to
   `var(--font-geist-sans)`. Check `src/app/layout.tsx` still puts `geistSans.variable` and
   `geistMono.variable` on `<body>`.
3. Run the dev server. Expected: teal primary, warm-white background, text in Geist.

### Stage 2 — the risk vocabulary

1. Add `src/lib/risk.ts` from the patch.
2. Replace `severity-badge.tsx`, `status-badge.tsx` and `sla-indicator.tsx` in
   `src/components/data-display/` with the patch versions, and add `provenance.tsx`.
3. `SeverityBadge` gains an optional `compact` prop; its other props are unchanged.
   `SlaIndicator` now takes `dueDate` and optional `state` — update call sites that passed
   only a status string. `StatusBadge` is unchanged in signature.
4. Then remove the now-dead colour maps: grep for hard-coded severity/SLA colours
   (`bg-red-600`, `#dc2626`, `#ef4444`, `#f97316`, `#eab308`, `#3b82f6`, `text-green-600`,
   and the `bg-*-100` status tints) across `src/components` and `src/app`. Every one should
   be replaced by a token class from `risk.ts` or deleted. Report anything you cannot map.
5. Update the three chart components in `src/components/charts/` to take their colours from
   `severityChartColors` / `severity[s].chart` instead of literal hex.

### Stage 3 — filters on every page

1. Add `src/lib/use-filter-params.ts` and `src/components/filters/filter-bar.tsx`.
2. Convert every list screen from `useState` filters to `useFilterParams`:
   `applications`, `assessments`, `vulnerabilities`, `mappings`. Query-string keys become the
   source of truth, so a filtered queue is bookmarkable and survives the back button.
   `src/app/(platform)/vulnerabilities/page.tsx` in the patch is the worked reference —
   apply it as-is, then follow the same shape for the other three.
3. Add `<FilterBar>` directly under the page header on every screen that lists or aggregates:
   - list screens: pass `filters` and `savedViews`, no date range;
   - dashboards, analytics and application detail: pass `showDateRange` so the strip carries
     Today / 7d / 30d / 90d and the flexible from–to popover.
4. Wire the date range through to the queries: `range.from` and `range.to` from
   `useFilterParams()` become request params on the dashboard and analytics hooks.
   Add the server-side filtering in the matching API routes under `src/app/api/v1/` and the
   Prisma `where` clauses. Every figure and chart on a dashboard must respect the range.

### Stage 4 — tables that can be worked and copied

In the vulnerabilities, applications and assessments tables:

1. Remove `<tr onClick={...}>` navigation. The key cell becomes a real `<Link>`; every other
   cell is plain selectable text. Selecting a cell must never navigate — this is the reason
   the data was not copyable.
2. Add a checkbox column with a bulk action bar (assign, set status, copy as TSV).
3. Make column headers sort controls writing `?sort=`, and replace Previous/Next with
   numbered pagination plus a page-size control. `src/components/ui/pagination.tsx` already
   exists and is unused.
4. Add a left severity rail (`border-l-[3px]` + `severity[s].rail`) and tint breached rows.

### Stage 5 — charts that answer a question

1. Add `src/components/charts/chart-frame.tsx`.
2. Wrap every chart in `<ChartFrame>`, supplying: `finding` (a sentence stating what the
   chart shows, not the axis name), `units`, and `rows`/`columns` — the same data the chart
   is drawn from, which powers the table view and the copy button.
3. Add axis labels with units, and a reference line for the target or SLA where one exists
   (the vulnerability trend and SLA compliance charts both need one).
4. Stop stacking assessments onto vulnerabilities in the operations workload chart; they do
   not sum to anything meaningful. Show them as two series.

### Stage 6 — navigation and provenance

1. Add `src/config/navigation.ts` and replace `src/components/layout/sidebar.tsx` with the
   patch version. Navigation is now declared config, grouped by when in the day it is used:
   My work / Inventory / Insight. My Workspace moves out of the avatar dropdown.
2. The sidebar reads counts from `/api/v1/nav-counts`. Create that route: it returns
   `{ myOpen, unmapped, breached, applications, assessments, openVulns }` scoped to the
   session user.
3. Change the `/dashboard` redirect to use `landingByRole` instead of sending everyone to
   Executive.
4. Add `<Provenance>` under every KPI, chart and record header: source system, last sync
   time, what a figure was computed from, and who last changed a field. Pull these from the
   existing provenance and sync fields in the Prisma schema; if a field does not exist yet,
   list it for me rather than inventing a value.

### Constraints

- Keep all existing routes, API contracts and Prisma models unless a stage says otherwise.
- No new npm dependencies.
- Colour only ever means risk or time. Workflow status is typographic and neutral.
- Brand orange is for brand moments only — never as a severity or warning colour.
- Every number a user might report on must be selectable and copyable.
- Keep `tnum` on any figure that sits in a column with other figures.
- Preserve the dark token set; do not add a theme switcher yet.

### When done

Run `npm run build` and `npx tsc --noEmit`. Then give me:

1. A list of files added, replaced and modified.
2. Any call sites you had to change because of the `SlaIndicator` signature.
3. Anything in stages 3–6 you could not complete because the API or schema does not support
   it yet — as a short list of what is missing, not a workaround.
