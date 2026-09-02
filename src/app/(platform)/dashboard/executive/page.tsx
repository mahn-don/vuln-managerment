"use client";

import { useExecutiveDashboard } from "@/lib/queries/dashboard";
import { useTranslation } from "@/lib/i18n";
import { severity } from "@/lib/risk";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";
import { Provenance } from "@/components/data-display/provenance";
import { ChartFrame } from "@/components/charts/chart-frame";
import { KPICard } from "@/components/data-display/kpi-card";
import { SeverityDonut } from "@/components/charts/severity-donut";
import { TrendLine } from "@/components/charts/trend-line";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, ClipboardCheck, Bug, ShieldAlert, AlertTriangle, TrendingDown, Globe } from "lucide-react";
import Link from "next/link";

export default function ExecutiveDashboardPage() {
  const { t } = useTranslation();
  const { range } = useFilterParams();
  const { data, isLoading } = useExecutiveDashboard({ from: range.from, to: range.to });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.executiveDashboard")}</h1>
          <p className="text-muted-foreground">{t("dashboard.securityPosture")}</p>
        </div>
        {/* Stays mounted while the window reloads — changing the range must not
            unmount the control the reader just used. */}
        <FilterBar showDateRange className="-mx-6 border-t" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
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
  const syncedAt = data?.provenance?.lastSyncedAt ?? undefined;

  // The chart data, restated as the rows the table view and copy button use.
  const trend = charts?.vulnTrend ?? [];
  const trendRows = trend.map((p) => ({ month: p.month, count: p.count }));
  const trendAverage = trend.length
    ? Math.round(trend.reduce((sum, p) => sum + p.count, 0) / trend.length)
    : undefined;

  // A finding states what the chart shows, not what the axis is called.
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
    (kpis?.criticalOpen ?? 0) + (kpis?.highOpen ?? 0) > 0
      ? t("charts.severityConcentrated", {
          count: String((kpis?.criticalOpen ?? 0) + (kpis?.highOpen ?? 0)),
        })
      : t("charts.severityNoHigh");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.executiveDashboard")}</h1>
        <p className="text-muted-foreground">{t("dashboard.securityPosture")}</p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title={t("dashboard.totalApplications")}
          value={kpis?.totalApplications ?? "--"}
          subtitle={t("dashboard.inInventory")}
          icon={Server}
        />
        <KPICard
          title={t("dashboard.internetFacing")}
          value={kpis?.internetFacingApplications ?? "--"}
          subtitle={t("dashboard.internetFacingSubtitle", {
            internal: String(kpis?.internalOnlyApplications ?? 0),
          })}
          icon={Globe}
        />
        <KPICard
          title={t("dashboard.assessmentCoverage")}
          value={`${kpis?.assessmentCoverage ?? "--"}%`}
          subtitle={`${kpis?.applicationsNeverAssessed ?? 0} ${t("dashboard.neverAssessed")}`}
          icon={ClipboardCheck}
        />
        <KPICard
          title={t("dashboard.openVulnerabilities")}
          value={kpis?.openVulnerabilities ?? "--"}
          subtitle={`${kpis?.criticalOpen ?? 0} ${t("severity.critical")}, ${kpis?.highOpen ?? 0} ${t("severity.high")}`}
          icon={Bug}
        />
        <KPICard
          title={t("dashboard.slaCompliance")}
          value={`${kpis?.slaCompliance ?? "--"}%`}
          subtitle={t("dashboard.resolvedWithinSla")}
          icon={ShieldAlert}
        />
      </div>

      <Provenance
        source={t("provenance.platformInventory")}
        computedFrom={t("provenance.findingsAndApps", {
          findings: String(data?.provenance?.vulnerabilitiesCounted ?? 0),
          apps: String(data?.provenance?.applicationsCounted ?? 0),
        })}
        syncedAt={syncedAt}
      />

      {/* Alert: Critical items */}
      {(kpis?.criticalOpen ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-risk-critical/25 bg-risk-critical-surface p-4">
          <AlertTriangle className="h-5 w-5 text-risk-critical shrink-0" />
          <div>
            <p className="font-medium text-risk-critical">
              {kpis!.criticalOpen} {t("dashboard.criticalOpen")}
            </p>
            <p className="text-sm text-risk-critical">
              {kpis!.overdueAssessments > 0 && `${kpis!.overdueAssessments} ${t("dashboard.assessmentsOverdue")} `}
              {t("common.immediateAttention")}
            </p>
          </div>
          <Link href="/vulnerabilities?severity=CRITICAL&status=NEW,TRIAGED,ASSIGNED,IN_PROGRESS" className="ml-auto text-sm font-medium text-risk-critical hover:underline">
            {t("dashboard.viewCriticalVulns")}
          </Link>
        </div>
      )}

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

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title={t("dashboard.overdueAssessments")}
          value={kpis?.overdueAssessments ?? 0}
          subtitle={t("dashboard.pastAssessmentDue")}
          icon={AlertTriangle}
        />
        <KPICard
          title={t("dashboard.neverAssessedApps")}
          value={kpis?.applicationsNeverAssessed ?? 0}
          subtitle={t("dashboard.noAssessmentHistory")}
          icon={TrendingDown}
        />
        <KPICard
          title={t("dashboard.mediumLowOpen")}
          value={(kpis?.mediumOpen ?? 0) + (kpis?.lowOpen ?? 0)}
          subtitle={`${kpis?.mediumOpen ?? 0} ${t("severity.medium")}, ${kpis?.lowOpen ?? 0} ${t("severity.low")}`}
          icon={Bug}
        />
      </div>
    </div>
  );
}
