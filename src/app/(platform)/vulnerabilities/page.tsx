"use client";

import { useState } from "react";
import Link from "next/link";
import { useVulnerabilities } from "@/lib/queries/vulnerabilities";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar, type FilterDef, type SavedView } from "@/components/filters/filter-bar";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { TablePagination } from "@/components/data-display/table-pagination";
import { BulkActionBar } from "@/components/data-display/bulk-action-bar";
import { SEVERITIES, severity, type Severity } from "@/lib/risk";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

/**
 * The queue an engineer lives in.
 *
 * Changed from the previous version: filters read from the URL so a queue is a
 * shareable link; saved views replace re-picking three selects; rows carry a
 * severity rail and selection with bulk verbs; the key is a real <Link> and
 * every other cell is plain selectable text, so the table copies into a
 * spreadsheet instead of navigating away mid-drag.
 *
 * URL keys match the API query schema (slaStatus, limit, sort/order) so the
 * query string is passed straight through rather than translated.
 */

const STATUSES = [
  "NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS",
  "PENDING_FIX", "READY_FOR_VERIFICATION", "VERIFIED", "CLOSED",
];

/** Columns the service can actually order by, mapped to their sort field. */
const SORTABLE: Record<string, string> = {
  key: "internalKey",
  title: "title",
  severity: "severity",
  scope: "scope",
  sla: "slaStatus",
  status: "status",
  due: "dueDate",
  age: "createdDate",
};

type Vuln = Record<string, unknown>;

export default function VulnerabilitiesPage() {
  const { t } = useTranslation();
  const { params, setParam, setParams } = useFilterParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: FilterDef[] = [
    {
      key: "severity", label: t("assessments.severity").toLowerCase(), multi: true,
      options: SEVERITIES.map((s) => ({ value: s, label: severity[s].label })),
    },
    {
      key: "scope", label: t("scope.filterLabel"), multi: true,
      options: [
        { value: "PERIODIC", label: t("scope.PERIODIC.label") },
        { value: "GOLIVE", label: t("scope.GOLIVE.label") },
      ],
    },
    {
      key: "status", label: t("common.status").toLowerCase(), multi: true,
      options: STATUSES.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase() })),
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
    { id: "breached", label: t("vulnerabilities.breached"), query: "slaStatus=BREACHED&sort=dueDate&order=asc", tone: "critical" },
    { id: "crit-open", label: `${t("severity.critical")} ${t("status.new")}`, query: "severity=CRITICAL&status=NEW" },
    { id: "periodic", label: t("scope.PERIODIC.label"), query: "scope=PERIODIC" },
    { id: "golive", label: t("scope.GOLIVE.label"), query: "scope=GOLIVE" },
    { id: "verify", label: t("dashboard.awaitingVerification"), query: "status=READY_FOR_VERIFICATION" },
    { id: "all", label: t("common.all"), query: "" },
  ];

  const page = Number(params.page ?? 1);
  const limit = Number(params.limit ?? 25);
  const sort = params.sort ?? "createdDate";
  const order = params.order ?? "desc";

  const { data, isLoading, error } = useVulnerabilities({
    page,
    limit,
    sort,
    order,
    search: params.search || undefined,
    severity: params.severity || undefined,
    status: params.status || undefined,
    slaStatus: params.slaStatus || undefined,
  });

  const rows = (data?.data ?? []) as Vuln[];
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

  function appName(v: Vuln) {
    const links = v.vulnerabilityApplications as Record<string, unknown>[] | undefined;
    const app = links?.[0]?.application as Record<string, unknown> | undefined;
    return app?.name ? String(app.name) : null;
  }

  function ownerName(v: Vuln) {
    const owner = v.fixOwner as Record<string, unknown> | undefined;
    return owner?.displayName ? String(owner.displayName) : (v.fixOwnerEmail ? String(v.fixOwnerEmail) : null);
  }

  // No bulk endpoint exists; these fan out to the per-record routes and the
  // action bar reports how many succeeded.
  async function assignOne(id: string, userId: string) {
    const res = await fetch(`/api/v1/vulnerabilities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: userId }),
    });
    return res.ok;
  }

  async function setStatusOne(id: string, status: string) {
    const res = await fetch(`/api/v1/vulnerabilities/${id}/status`, {
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
          String(r.severity ?? ""),
          String(r.scope ?? ""),
          appName(r) ?? "",
          String(r.status ?? ""),
        ].join("\t"),
      )
      .join("\n");
    await navigator.clipboard.writeText(tsv);
  }

  /** Toggle asc/desc when re-clicking the active column. */
  function sortBy(colKey: string) {
    const field = SORTABLE[colKey];
    if (!field) return;
    setParams({
      sort: field,
      order: sort === field && order === "desc" ? "asc" : "desc",
    });
  }

  const columns = [
    { key: "key", label: t("assessments.key") },
    // Severity gets its own column purely so it has a header to sort by; the
    // row rail still carries the colour.
    { key: "severity", label: t("assessments.severity") },
    { key: "title", label: t("vulnerabilities.finding") },
    { key: "application", label: t("common.application") },
    { key: "scope", label: t("scope.column") },
    { key: "status", label: t("common.status") },
    { key: "owner", label: t("vulnerabilities.fixOwner") },
    { key: "due", label: "SLA" },
    { key: "age", label: t("vulnerabilities.age"), align: "right" as const },
  ];

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col">
      <header className="border-b bg-card px-6 pt-4">
        <div className="flex items-end justify-between gap-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t("vulnerabilities.title")}</h1>
            <span className="tnum font-mono text-[13px] text-muted-foreground">
              {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Link
              href="/vulnerabilities/new"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Plus className="size-3.5" />
              {t("vulnerabilities.newVulnerability")}
            </Link>
          </div>
        </div>
        <nav className="mt-3 flex items-center gap-0.5">
          {savedViews.map((v) => (
            <Link
              key={v.id}
              href={v.query ? "?" + v.query : "/vulnerabilities"}
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
          statuses={STATUSES}
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
                  {t("vulnerabilities.failedToLoad")}: {(error as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-center text-muted-foreground">
                  {t("vulnerabilities.noVulnerabilities")}
                </td>
              </tr>
            )}
            {rows.map((v) => {
              const id = String(v.id);
              const sev = String(v.severity ?? "") as Severity;
              const token = severity[sev];
              const breached = v.slaStatus === "BREACHED";
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
                      aria-label={`${t("common.select")} ${String(v.internalKey ?? id)}`}
                      className="size-3.5 accent-[var(--brand)]"
                    />
                  </td>
                  <td className="px-2.5 py-2">
                    <Link href={`/vulnerabilities/${id}`} className="font-mono text-[12.5px] text-primary hover:underline">
                      {String(v.internalKey ?? "—")}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2">
                    <SeverityBadge value={sev} compact />
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-medium">{String(v.title ?? "—")}</span>
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">{appName(v) ?? "—"}</td>
                  <td className="px-2.5 py-2">
                    <ScopeBadge value={v.scope as string | null} compact />
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge value={String(v.status ?? "")} />
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {ownerName(v) ?? t("vulnerabilities.unassigned")}
                  </td>
                  <td className="px-2.5 py-2">
                    <SlaIndicator
                      dueDate={v.dueDate as string | null | undefined}
                      state={v.slaStatus as string | null | undefined}
                    />
                  </td>
                  <td className="tnum px-2.5 py-2 pr-6 text-right font-mono text-xs text-muted-foreground">
                    {v.createdDate
                      ? `${Math.max(0, Math.round((Date.now() - new Date(String(v.createdDate)).getTime()) / 86_400_000))}d`
                      : "—"}
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
