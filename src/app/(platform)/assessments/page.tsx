"use client";

import { useState } from "react";
import Link from "next/link";
import { useAssessments } from "@/lib/queries/assessments";
import { useTranslation } from "@/lib/i18n";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar, type FilterDef, type SavedView } from "@/components/filters/filter-bar";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { TablePagination } from "@/components/data-display/table-pagination";
import { BulkActionBar } from "@/components/data-display/bulk-action-bar";
import { SEVERITIES, severity, type Severity } from "@/lib/risk";
import { cn } from "@/lib/utils";

/**
 * The assessment queue. Same shape as the vulnerabilities queue: URL-backed
 * filters, saved views, a priority rail, selection with bulk verbs, and cells
 * that stay selectable so the table copies out.
 */

const ASSESSMENT_STATUSES = [
  "REQUESTED", "TRIAGE", "QUEUED", "ASSIGNED", "IN_PROGRESS",
  "WAITING_INFO", "REVIEW_COMPLETE", "DONE", "CANCELLED",
];

const SORTABLE: Record<string, string> = {
  key: "internalKey",
  title: "title",
  scope: "scope",
  status: "status",
  due: "dueDate",
};

type Assessment = Record<string, unknown>;

export default function AssessmentsPage() {
  const { t } = useTranslation();
  const { params, setParam, setParams } = useFilterParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: FilterDef[] = [
    {
      key: "status", label: t("common.status").toLowerCase(), multi: true,
      options: ASSESSMENT_STATUSES.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase() })),
    },
    {
      key: "scope", label: t("scope.filterLabel"), multi: true,
      options: [
        { value: "PERIODIC", label: t("scope.PERIODIC.label") },
        { value: "GOLIVE", label: t("scope.GOLIVE.label") },
      ],
    },
    {
      key: "priority", label: t("assessments.priority").toLowerCase(), multi: true,
      options: SEVERITIES.filter((s) => s !== "INFORMATIONAL").map((s) => ({ value: s, label: severity[s].label })),
    },
    {
      key: "slaStatus", label: "sla",
      options: [
        { value: "BREACHED", label: t("vulnerabilities.breached") },
        { value: "AT_RISK", label: t("vulnerabilities.atRisk") },
        { value: "ON_TRACK", label: t("vulnerabilities.onTrack") },
      ],
    },
  ];

  const savedViews: SavedView[] = [
    { id: "overdue", label: t("dashboard.overdueAssessments"), query: "overdue=true&sort=dueDate&order=asc", tone: "critical" },
    { id: "periodic", label: t("scope.PERIODIC.label"), query: "scope=PERIODIC" },
    { id: "golive", label: t("scope.GOLIVE.label"), query: "scope=GOLIVE" },
    { id: "active", label: t("dashboard.activeAssessments"), query: "status=IN_PROGRESS" },
    { id: "review", label: t("dashboard.pendingReview"), query: "status=REVIEW_COMPLETE" },
    { id: "all", label: t("common.all"), query: "" },
  ];

  const page = Number(params.page ?? 1);
  const limit = Number(params.limit ?? 25);
  const sort = params.sort ?? "createdDate";
  const order = params.order ?? "desc";

  const { data, isLoading, error } = useAssessments({
    page,
    limit,
    sort,
    order,
    search: params.search || undefined,
    status: params.status || undefined,
    priority: params.priority || undefined,
    slaStatus: params.slaStatus || undefined,
    overdue: params.overdue || undefined,
  });

  const rows = (data?.data ?? []) as Assessment[];
  const meta = data?.meta;
  const total = meta?.total ?? 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function appName(a: Assessment) {
    const apps = a.assessmentApplications as Record<string, unknown>[] | undefined;
    const app = apps?.[0]?.application as Record<string, unknown> | undefined;
    return app?.name ? String(app.name) : null;
  }

  // No bulk endpoint exists; these fan out to the per-record routes and the
  // action bar reports how many succeeded.
  async function assignOne(id: string, userId: string) {
    const res = await fetch(`/api/v1/assessments/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: userId }),
    });
    return res.ok;
  }

  async function setStatusOne(id: string, status: string) {
    const res = await fetch(`/api/v1/assessments/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  }

  async function copySelection() {
    const picked = rows.filter((r) => selected.has(String(r.id)));
    const tsv = picked
      .map((r) =>
        [
          String(r.internalKey ?? ""),
          String(r.title ?? ""),
          String(r.scope ?? ""),
          String((r.assessmentType as Record<string, unknown>)?.code ?? ""),
          appName(r) ?? "",
          String((r.assignee as Record<string, unknown>)?.displayName ?? ""),
          String(r.status ?? ""),
        ].join("\t"),
      )
      .join("\n");
    await navigator.clipboard.writeText(tsv);
  }

  function sortBy(colKey: string) {
    const field = SORTABLE[colKey];
    if (!field) return;
    setParams({ sort: field, order: sort === field && order === "desc" ? "asc" : "desc" });
  }

  const columns = [
    { key: "key", label: t("assessments.key") },
    { key: "title", label: t("common.title") },
    { key: "scope", label: t("scope.column") },
    { key: "type", label: t("assessments.type") },
    { key: "application", label: t("common.application") },
    { key: "assignee", label: t("assessments.assignee") },
    { key: "status", label: t("common.status") },
    { key: "due", label: "SLA" },
    { key: "findings", label: t("assessments.findings"), align: "right" as const },
  ];

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col">
      <header className="border-b bg-card px-6 pt-4">
        <div className="flex items-end justify-between gap-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t("assessments.title")}</h1>
            <span className="tnum font-mono text-[13px] text-muted-foreground">
              {total.toLocaleString()}
            </span>
          </div>
        </div>
        <nav className="mt-3 flex items-center gap-0.5">
          {savedViews.map((v) => (
            <Link
              key={v.id}
              href={v.query ? "?" + v.query : "/assessments"}
              className="border-b-2 border-transparent px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground"
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </header>

      <FilterBar filters={filters} />

      {selected.size > 0 && (
        <BulkActionBar
          selected={[...selected]}
          statuses={ASSESSMENT_STATUSES}
          onAssign={assignOne}
          onSetStatus={setStatusOne}
          onCopy={copySelection}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="flex-1 overflow-auto bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-muted/50">
            <tr className="border-b">
              <th className="w-9 py-2 pl-6" />
              {columns.map((c) => {
                const field = SORTABLE[c.key];
                const active = field && sort === field;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "px-2.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.09em]",
                      c.align === "right" ? "pr-6 text-right" : "text-left",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {field ? (
                      <button type="button" onClick={() => sortBy(c.key)}>
                        {c.label}
                        {active ? (order === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-center text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-center text-risk-critical">
                  {t("common.failedToLoad")}: {(error as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-center text-muted-foreground">
                  {t("assessments.noAssessments")}
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const id = String(a.id);
              const prio = String(a.priority ?? "") as Severity;
              const token = severity[prio];
              const breached = a.slaStatus === "BREACHED";
              const count = a._count as Record<string, number> | undefined;
              return (
                <tr
                  key={id}
                  className={cn(
                    "border-b border-l-[3px]",
                    token?.rail ?? "border-l-transparent",
                    breached && "bg-risk-critical-surface/45",
                  )}
                >
                  <td className="py-2 pl-6">
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      aria-label={`${t("common.select")} ${String(a.internalKey ?? id)}`}
                      className="size-3.5 accent-[var(--brand)]"
                    />
                  </td>
                  <td className="px-2.5 py-2">
                    <Link href={`/assessments/${id}`} className="font-mono text-[12.5px] text-primary hover:underline">
                      {String(a.internalKey ?? "—")}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="flex items-center gap-2.5">
                      {token ? <SeverityBadge value={prio} compact /> : null}
                      <span className="font-medium">{String(a.title ?? "—")}</span>
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <ScopeBadge value={a.scope as string | null} compact />
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {String((a.assessmentType as Record<string, unknown>)?.code ?? "—")}
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">{appName(a) ?? "—"}</td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {String((a.assignee as Record<string, unknown>)?.displayName ?? t("assessments.unassigned"))}
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge value={String(a.status ?? "")} />
                  </td>
                  <td className="px-2.5 py-2">
                    <SlaIndicator
                      dueDate={a.dueDate as string | null | undefined}
                      state={a.slaStatus as string | null | undefined}
                    />
                  </td>
                  <td className="tnum px-2.5 py-2 pr-6 text-right font-mono text-xs text-muted-foreground">
                    {count?.vulnerabilities ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {meta && (
        <div className="border-t bg-card">
          <TablePagination
            page={meta.page}
            pages={meta.pages}
            total={meta.total}
            limit={meta.limit}
            onPage={(p) => setParam("page", String(p))}
            onLimit={(l) => setParams({ limit: String(l), page: null })}
          />
        </div>
      )}
    </div>
  );
}
