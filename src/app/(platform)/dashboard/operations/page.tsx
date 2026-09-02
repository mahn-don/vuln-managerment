"use client";

import { useOperationsDashboard } from "@/lib/queries/dashboard";
import { useTranslation } from "@/lib/i18n";
import { KPICard } from "@/components/data-display/kpi-card";
import { HorizontalBarChart, StackedBarChart } from "@/components/charts/bar-chart";
import { ChartFrame } from "@/components/charts/chart-frame";
import { Provenance } from "@/components/data-display/provenance";
import { FilterBar } from "@/components/filters/filter-bar";
import { useFilterParams } from "@/lib/use-filter-params";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList, UserCheck, AlertTriangle, Clock, Bug, CheckCircle, ShieldCheck,
} from "lucide-react";

export default function OperationsDashboardPage() {
  const { t } = useTranslation();
  const { range } = useFilterParams();
  const { data, isLoading } = useOperationsDashboard({ from: range.from, to: range.to });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.operationsDashboard")}</h1>
          <p className="text-muted-foreground">{t("dashboard.operationalMetrics")}</p>
        </div>
        {/* Stays mounted while the window reloads. */}
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

  const statusData = Object.entries(charts?.assessmentsByStatus ?? {}).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
  }));

  const workloadData = (charts?.workloadByEngineer ?? []).map((e) => ({
    name: e.name,
    assessments: e.assessments,
    vulnerabilities: e.vulnerabilities,
  }));

  const assessmentsInFlight = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.operationsDashboard")}</h1>
        <p className="text-muted-foreground">{t("dashboard.operationalMetrics")}</p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title={t("dashboard.assessmentBacklog")}
          value={kpis?.assessmentBacklog ?? "--"}
          subtitle={t("dashboard.activeAssessments")}
          icon={ClipboardList}
        />
        <KPICard
          title={t("dashboard.waitingAssignment")}
          value={kpis?.waitingAssignment ?? "--"}
          subtitle={t("dashboard.queuedForAssignment")}
          icon={UserCheck}
        />
        <KPICard
          title={t("dashboard.slaBreaches")}
          value={kpis?.slaBreaches ?? "--"}
          subtitle={t("dashboard.activeBreaches")}
          icon={AlertTriangle}
        />
        <KPICard
          title={t("dashboard.approachingSla")}
          value={kpis?.approachingSLA ?? "--"}
          subtitle={t("dashboard.dueWithin7Days")}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title={t("dashboard.newThisWeek")}
          value={kpis?.newVulnsThisWeek ?? 0}
          subtitle={t("dashboard.vulnerabilitiesCreated")}
          icon={Bug}
        />
        <KPICard
          title={t("status.inProgress")}
          value={kpis?.inProgress ?? 0}
          subtitle={t("dashboard.activeAssessments")}
          icon={CheckCircle}
        />
        <KPICard
          title={t("dashboard.awaitingVerification")}
          value={kpis?.verificationBacklog ?? 0}
          subtitle={t("dashboard.fixesPendingVerification")}
          icon={ShieldCheck}
        />
      </div>

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
            height={250}
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
          {/*
            Not stacked: an assessment and a vulnerability are different units of
            work, so their sum is not a number anyone can act on. Two series.
          */}
          <StackedBarChart
            data={workloadData}
            stacked={false}
            bars={[
              { dataKey: "assessments", color: "var(--brand)", label: t("assessments.title") },
              { dataKey: "vulnerabilities", color: "var(--risk-high)", label: t("vulnerabilities.title") },
            ]}
            height={250}
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
