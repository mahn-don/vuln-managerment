"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/data-display/kpi-card";
import {
  HorizontalBarChart,
  StackedBarChart,
} from "@/components/charts/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck,
  Clock,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import type { OperationsDashboardData } from "@/lib/queries/dashboard";
import { useTranslation } from "@/lib/i18n";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";
import { ChartFrame } from "@/components/charts/chart-frame";
import { Provenance } from "@/components/data-display/provenance";

export default function AssessmentAnalyticsPage() {
  const { t } = useTranslation();
  const { range } = useFilterParams();
  const { data, isLoading } = useQuery<OperationsDashboardData>({
    queryKey: ["analytics-assessments", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/v1/dashboard/operations?from=${range.from}&to=${range.to}`);
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
            {t("analytics.assessmentMetrics")}
          </h1>
          <p className="text-muted-foreground">
            {t("analytics.assessmentPipelineSubtitle")}
          </p>
        </div>
        {/* Stays mounted while the window reloads. */}
        <FilterBar showDateRange className="-mx-6 border-t" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  // Transform assessmentsByStatus into HorizontalBarChart data
  const statusData = Object.entries(charts?.assessmentsByStatus ?? {}).map(
    ([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    })
  );

  // Transform workloadByEngineer into StackedBarChart data
  const workloadData = (charts?.workloadByEngineer ?? []).map((entry) => ({
    name: entry.name,
    assessments: entry.assessments,
    vulnerabilities: entry.vulnerabilities,
  }));

  const workloadBars = [
    { dataKey: "assessments", color: "var(--brand)", label: t("assessments.title") },
    { dataKey: "vulnerabilities", color: "var(--risk-high)", label: t("vulnerabilities.title") },
  ];

  // Compute completed as total minus in-flight items
  const backlog = kpis?.assessmentBacklog ?? 0;
  const waiting = kpis?.waitingAssignment ?? 0;
  const inProgress = kpis?.inProgress ?? 0;
  const completed =
    statusData.find(
      (s) => s.name.toLowerCase() === "completed" || s.name.toLowerCase() === "done"
    )?.value ?? 0;

  const assessmentsInFlight = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("analytics.assessmentMetrics")}
        </h1>
        <p className="text-muted-foreground">
          {t("analytics.assessmentPipelineSubtitle")}
        </p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title={t("analytics.backlog")}
          value={backlog}
          subtitle={t("analytics.assessmentsPending")}
          icon={ClipboardCheck}
        />
        <KPICard
          title={t("dashboard.waitingAssignment")}
          value={waiting}
          subtitle={t("analytics.awaitingEngineerAssignment")}
          icon={Clock}
        />
        <KPICard
          title={t("status.inProgress")}
          value={inProgress}
          subtitle={t("analytics.currentlyBeingAssessed")}
          icon={PlayCircle}
        />
        <KPICard
          title={t("status.completed")}
          value={completed}
          subtitle={t("analytics.assessmentsFinished")}
          icon={CheckCircle2}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartFrame
          finding={t("charts.assessmentStatusFinding", { count: String(assessmentsInFlight) })}
          units={t("charts.assessmentStatusUnits")}
          rows={statusData.map((s) => ({ stage: s.name, count: s.value }))}
          columns={[
            { key: "stage", label: t("charts.stage") },
            { key: "count", label: t("charts.count"), align: "right" },
          ]}
        >
          <HorizontalBarChart
            data={statusData}
            height={260}
            xLabel={t("charts.count")}
            emptyLabel={t("common.noData")}
          />
        </ChartFrame>

        <ChartFrame
          finding={t("charts.workloadFinding", { count: String(workloadData.length) })}
          units={t("charts.workloadByEngineer")}
          rows={workloadData.map((w) => ({
            engineer: w.name,
            assessments: w.assessments,
            vulnerabilities: w.vulnerabilities,
          }))}
          columns={[
            { key: "engineer", label: t("charts.engineer") },
            { key: "assessments", label: t("assessments.title"), align: "right" },
            { key: "vulnerabilities", label: t("vulnerabilities.title"), align: "right" },
          ]}
        >
          {/* Two series, not a stack — assessments and findings do not sum. */}
          <StackedBarChart
            data={workloadData}
            stacked={false}
            bars={workloadBars}
            height={260}
            xLabel={t("charts.engineer")}
            yLabel={t("charts.count")}
            emptyLabel={t("common.noData")}
          />
        </ChartFrame>
      </div>

      <Provenance
        source={t("provenance.assessmentQueue")}
        computedFrom={t("charts.assessmentStatusFinding", { count: String(assessmentsInFlight) })}
      />
    </div>
  );
}
