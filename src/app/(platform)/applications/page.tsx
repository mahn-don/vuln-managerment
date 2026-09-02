"use client";

import { useState } from "react";
import Link from "next/link";
import { useApplications } from "@/lib/queries/applications";
import { useTranslation } from "@/lib/i18n";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar, type FilterDef, type SavedView } from "@/components/filters/filter-bar";
import { StatusBadge } from "@/components/data-display/status-badge";
import { EvaluationYearTag } from "@/components/features/applications/periodic-cadence-card";
import { TablePagination } from "@/components/data-display/table-pagination";
import { BulkActionBar } from "@/components/data-display/bulk-action-bar";
import { SEVERITIES, severity, type Severity } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

/**
 * The inventory. Same shape as the vulnerabilities queue: URL-backed filters,
 * saved views, selection with bulk verbs,
 * and cells that are plain selectable text so the table copies out cleanly.
 */

const APP_STATUSES = ["ACTIVE", "PLANNING", "DECOMMISSIONED", "ARCHIVED"];

const SORTABLE: Record<string, string> = {
  name: "name",
  applicationId: "applicationId",
  level: "level",
  status: "status",
};

type App = Record<string, unknown>;

export default function ApplicationsPage() {
  const { t } = useTranslation();
  const { params, setParam, setParams } = useFilterParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: FilterDef[] = [
    {
      key: "status", label: t("common.status").toLowerCase(), multi: true,
      options: APP_STATUSES.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase() })),
    },
    {
      key: "evaluatedIn", label: t("evaluation.filterLabel"), multi: true,
      options: [
        { value: "THIS_YEAR", label: t("evaluation.THIS_YEAR") },
        { value: "LAST_YEAR", label: t("evaluation.LAST_YEAR") },
        { value: "TWO_YEARS_AGO", label: t("evaluation.TWO_YEARS_AGO") },
        { value: "OLDER", label: t("evaluation.OLDER") },
        { value: "NEVER", label: t("evaluation.NEVER") },
      ],
    },
    {
      key: "level", label: t("applications.level").toLowerCase(), multi: true,
      options: SEVERITIES.filter((s) => s !== "INFORMATIONAL").map((s) => ({ value: s, label: severity[s].label })),
    },
  ];

  const savedViews: SavedView[] = [
    { id: "crit", label: t("applications.levelOneActive"), query: "level=1&status=ACTIVE" },
    { id: "never", label: t("dashboard.neverAssessedApps"), query: "neverAssessed=true" },
    { id: "overdue", label: t("periodic.overdueView"), query: "assessmentOverdue=true", tone: "critical" },
    { id: "duesoon", label: t("periodic.dueSoonView"), query: "periodicDueSoon=true" },
    { id: "thisyear", label: t("evaluation.viewThisYear"), query: "evaluatedIn=THIS_YEAR" },
    { id: "notthisyear", label: t("evaluation.viewNotThisYear"), query: "evaluatedIn=LAST_YEAR,TWO_YEARS_AGO,OLDER,NEVER" },
    { id: "all", label: t("common.all"), query: "" },
  ];

  const page = Number(params.page ?? 1);
  const limit = Number(params.limit ?? 25);
  const sort = params.sort ?? "name";
  const order = params.order ?? "asc";

  const { data, isLoading, error } = useApplications({
    page,
    limit,
    sort,
    order,
    search: params.search || undefined,
    status: params.status || undefined,
    level: params.level || undefined,
    neverAssessed: params.neverAssessed || undefined,
    assessmentOverdue: params.assessmentOverdue || undefined,
  });

  const rows = (data?.data ?? []) as App[];
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

  async function copySelection() {
    const picked = rows.filter((r) => selected.has(String(r.id)));
    const tsv = picked
      .map((r) =>
        [
          String(r.applicationId ?? ""),
          String(r.name ?? ""),
          String(r.level ?? ""),
          String((r.businessUnit as Record<string, unknown>)?.name ?? ""),
          String(r.status ?? ""),
          String(r.openVulnerabilityCount ?? 0),
        ].join("\t"),
      )
      .join("\n");
    await navigator.clipboard.writeText(tsv);
  }

  function sortBy(colKey: string) {
    const field = SORTABLE[colKey];
    if (!field) return;
    setParams({ sort: field, order: sort === field && order === "asc" ? "desc" : "asc" });
  }

  const columns = [
    { key: "name", label: t("applications.application") },
    { key: "applicationId", label: t("applications.applicationId") },
    { key: "businessUnit", label: t("applications.businessUnit") },
    { key: "level", label: t("applications.level") },
    { key: "evaluated", label: t("evaluation.column") },
    { key: "status", label: t("common.status") },
    { key: "openVulns", label: t("applications.openVulns"), align: "right" as const },
    { key: "critical", label: t("severity.critical"), align: "right" as const },
  ];

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col">
      <header className="border-b bg-card px-6 pt-4">
        <div className="flex items-end justify-between gap-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t("applications.title")}</h1>
            <span className="tnum font-mono text-[13px] text-muted-foreground">
              {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Link
              href="/applications/new"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Plus className="size-3.5" />
              {t("applications.addApplication")}
            </Link>
          </div>
        </div>
        <nav className="mt-3 flex items-center gap-0.5">
          {savedViews.map((v) => (
            <Link
              key={v.id}
              href={v.query ? "?" + v.query : "/applications"}
              className="border-b-2 border-transparent px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground"
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </header>

      <FilterBar filters={filters} />

      {/*
        Copy only. An application has owners rather than an assignee, and there
        is no status-transition endpoint for it — see the handover notes.
      */}
      {selected.size > 0 && (
        <BulkActionBar
          selected={[...selected]}
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
                      c.align === "right" ? "text-right last:pr-6" : "text-left",
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
                <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-risk-critical">
                  {t("common.failedToLoad")}: {(error as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                  {t("applications.noApplications")}
                </td>
              </tr>
            )}
            {rows.map((app) => {
              const id = String(app.id);
              const openCritical = Number(app.openCriticalCount ?? 0);
              return (
                <tr
                  key={id}
                  className="border-b"
                >
                  <td className="py-2 pl-6">
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      aria-label={`${t("common.select")} ${String(app.name ?? id)}`}
                      className="size-3.5 accent-[var(--brand)]"
                    />
                  </td>
                  <td className="px-2.5 py-2">
                    <Link href={`/applications/${id}`} className="font-medium text-primary hover:underline">
                      {String(app.name ?? "—")}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[12.5px] text-muted-foreground">
                    {String(app.applicationId ?? "—")}
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {String((app.businessUnit as Record<string, unknown>)?.name ?? "—")}
                  </td>
                  <td className="px-2.5 py-2 tnum text-muted-foreground">
                    {t("applications.levelValue", { level: String(app.level ?? "—") })}
                  </td>
                  <td className="px-2.5 py-2">
                    <EvaluationYearTag
                      recency={(app.periodic as Record<string, unknown> | undefined)?.recency as string | undefined}
                      year={(app.periodic as Record<string, unknown> | undefined)?.lastAssessmentYear as number | undefined}
                    />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge value={String(app.status ?? "")} />
                  </td>
                  <td className="tnum px-2.5 py-2 text-right font-mono text-xs text-muted-foreground">
                    {Number(app.openVulnerabilityCount ?? 0)}
                  </td>
                  <td className="tnum px-2.5 py-2 pr-6 text-right font-mono text-xs">
                    {openCritical > 0 ? (
                      <span className="font-semibold text-risk-critical">{openCritical}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
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
