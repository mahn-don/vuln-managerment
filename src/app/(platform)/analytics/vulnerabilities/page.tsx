"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/data-display/kpi-card";
import { TrendLine } from "@/components/charts/trend-line";
import { SeverityDonut } from "@/components/charts/severity-donut";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bug, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import type { ExecutiveDashboardData } from "@/lib/queries/dashboard";
import { useTranslation } from "@/lib/i18n";
import { severity } from "@/lib/risk";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";
import { ChartFrame } from "@/components/charts/chart-frame";
import { Provenance } from "@/components/data-display/provenance";

export default function VulnerabilityAnalyticsPage() {
  const { t } = useTranslation();
  const { range } = useFilterParams();
  const { data, isLoading } = useQuery<ExecutiveDashboardData>({
    queryKey: ["analytics-vulnerabilities", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/v1/dashboard/executive?from=${range.from}&to=${range.to}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("analytics.vulnTrends")}
          </h1>
          <p className="text-muted-foreground">
            {t("analytics.vulnMetricsSubtitle")}
          </p>
        </div>
        {/* Stays mounted while the window reloads. */}
        <FilterBar showDateRange className="-mx-6 border-t" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;
  const charts = data?.charts;

  const totalOpen = kpis?.openVulnerabilities ?? 0;
  const critical = kpis?.criticalOpen ?? 0;
  const high = kpis?.highOpen ?? 0;
  const medium = kpis?.mediumOpen ?? 0;
  const low = kpis?.lowOpen ?? 0;
  const syncedAt = data?.provenance?.lastSyncedAt ?? undefined;

  // The chart data, restated as the rows the table view and copy button use.
  const trend = charts?.vulnTrend ?? [];
  const trendRows = trend.map((p) => ({ month: p.month, count: p.count }));
  const trendAverage = trend.length
    ? Math.round(trend.reduce((sum, p) => sum + p.count, 0) / trend.length)
    : undefined;

  const trendFinding = (() => {
    if (trend.length < 2) return t("charts.trendInsufficient");
    const first = trend[0].count;
    const last = trend[trend.length - 1].count;
    if (last > first) return t("charts.trendRising", { count: String(last) });
    if (last < first) return t("charts.trendFalling", { count: String(last) });
    return t("charts.trendFlat", { count: String(last) });
  })();

  const severityEntries = Object.entries(charts?.vulnBySeverity ?? {});
  const severityTotal = severityEntries.reduce((sum, [, n]) => sum + n, 0);
  const severityRows = severityEntries.map(([key, count]) => ({
    severity: key,
    count,
    share: severityTotal > 0 ? `${Math.round((count / severityTotal) * 100)}%` : "0%",
  }));

  const severityFinding =
    critical + high > 0
      ? t("charts.severityConcentrated", { count: String(critical + high) })
      : t("charts.severityNoHigh");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("analytics.vulnTrends")}
        </h1>
        <p className="text-muted-foreground">
          {t("analytics.vulnMetricsSubtitle")}
        </p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title={t("applications.totalOpen")}
          value={totalOpen}
          subtitle={t("analytics.allOpenVulns")}
          icon={Bug}
        />
        <KPICard
          title={t("severity.critical")}
          value={critical}
          subtitle={t("analytics.immediateActionRequired")}
          icon={AlertTriangle}
          className={critical > 0 ? "border-risk-critical/30" : ""}
        />
        <KPICard
          title={t("severity.high")}
          value={high}
          subtitle={t("analytics.highSeverity")}
          icon={ArrowUp}
        />
        <KPICard
          title={t("severity.medium")}
          value={medium}
          subtitle={t("analytics.mediumSeverity")}
          icon={ArrowDown}
        />
        <KPICard
          title={t("severity.low")}
          value={low}
          subtitle={t("analytics.lowSeverity")}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartFrame
          finding={trendFinding}
          units={t("charts.findingsPerMonth")}
          rows={trendRows}
          columns={[
            { key: "month", label: t("charts.month") },
            { key: "count", label: t("dashboard.newVulnerabilities"), align: "right" },
          ]}
          syncedAt={syncedAt}
        >
          <TrendLine
            data={charts?.vulnTrend ?? []}
            color={severity.CRITICAL.chart}
            label={t("dashboard.newVulnerabilities")}
            xLabel={t("charts.month")}
            yLabel={t("charts.findingsCount")}
            reference={trendAverage}
            referenceLabel={t("charts.periodAverage")}
            emptyLabel={t("common.noData")}
          />
        </ChartFrame>

        <ChartFrame
          finding={severityFinding}
          units={t("charts.openFindingsBySeverity")}
          rows={severityRows}
          columns={[
            { key: "severity", label: t("assessments.severity") },
            { key: "count", label: t("dashboard.openVulnerabilities"), align: "right" },
            { key: "share", label: t("charts.share"), align: "right" },
          ]}
          syncedAt={syncedAt}
        >
          <SeverityDonut data={charts?.vulnBySeverity ?? {}} emptyLabel={t("common.noData")} />
        </ChartFrame>
      </div>

      <Provenance
        source={t("provenance.platformInventory")}
        computedFrom={t("provenance.findingsAndApps", {
          findings: String(data?.provenance?.vulnerabilitiesCounted ?? 0),
          apps: String(data?.provenance?.applicationsCounted ?? 0),
        })}
        syncedAt={syncedAt}
      />
    </div>
  );
}
