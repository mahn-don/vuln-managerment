"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/data-display/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, AlertTriangle, Clock } from "lucide-react";
import type { ExecutiveDashboardData } from "@/lib/queries/dashboard";
import type { OperationsDashboardData } from "@/lib/queries/dashboard";
import { useTranslation } from "@/lib/i18n";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";
import { Provenance } from "@/components/data-display/provenance";

/**
 * The compliance target the rate is judged against. Hard-coded because there is
 * no per-org target field in the schema yet — see the handover notes.
 */
const SLA_TARGET = 95;

export default function SLACompliancePage() {
  const { t } = useTranslation();
  const { range } = useFilterParams();
  const rangeQs = `from=${range.from}&to=${range.to}`;

  const { data: execData, isLoading: execLoading } =
    useQuery<ExecutiveDashboardData>({
      queryKey: ["analytics-sla-executive", range.from, range.to],
      queryFn: async () => {
        const res = await fetch(`/api/v1/dashboard/executive?${rangeQs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message);
        return json.data;
      },
    });

  const { data: opsData, isLoading: opsLoading } =
    useQuery<OperationsDashboardData>({
      queryKey: ["analytics-sla-operations", range.from, range.to],
      queryFn: async () => {
        const res = await fetch(`/api/v1/dashboard/operations?${rangeQs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message);
        return json.data;
      },
    });

  const isLoading = execLoading || opsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.slaCompliance")}</h1>
          <p className="text-muted-foreground">
            {t("analytics.slaSubtitle")}
          </p>
        </div>
        {/* Stays mounted while the window reloads. */}
        <FilterBar showDateRange className="-mx-6 border-t" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const slaCompliance = execData?.kpis.slaCompliance ?? 0;
  const slaBreaches = opsData?.kpis.slaBreaches ?? 0;
  const approachingSLA = opsData?.kpis.approachingSLA ?? 0;
  const totalOpen = execData?.kpis.openVulnerabilities ?? 0;

  // Estimate met/missed counts from compliance %
  const metSLA =
    totalOpen > 0 ? Math.round((slaCompliance / 100) * totalOpen) : 0;
  const missedSLA = totalOpen > 0 ? totalOpen - metSLA : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.slaCompliance")}</h1>
        <p className="text-muted-foreground">
          {t("analytics.slaSubtitle")}
        </p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title={t("dashboard.slaCompliance")}
          value={`${String(slaCompliance)}%`}
          subtitle={t("analytics.vulnsResolvedWithinSla")}
          icon={ShieldAlert}
        />
        <KPICard
          title={t("dashboard.slaBreaches")}
          value={slaBreaches}
          subtitle={t("analytics.vulnsPastSlaDeadline")}
          icon={AlertTriangle}
          className={slaBreaches > 0 ? "border-risk-critical/30" : ""}
        />
        <KPICard
          title={t("dashboard.approachingSla")}
          value={approachingSLA}
          subtitle={t("analytics.dueWithinNext7Days")}
          icon={Clock}
          className={approachingSLA > 0 ? "border-risk-high/30" : ""}
        />
      </div>

      {/* Compliance Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("analytics.overallSlaCompliance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <span className="text-5xl font-bold tracking-tight">
              {String(slaCompliance)}%
            </span>
            <span className="mb-1 text-sm text-muted-foreground">
              {t("analytics.complianceRate")}
            </span>
          </div>

          {/* The target is the reference this figure is read against. */}
          <div className="relative">
            <Progress value={slaCompliance}>
              <span className="sr-only">
                {String(slaCompliance)}% {t("dashboard.slaCompliance")}
              </span>
            </Progress>
            <span
              className="pointer-events-none absolute -top-1 bottom-[-4px] w-px bg-risk-medium"
              style={{ left: `${SLA_TARGET}%` }}
              aria-hidden
            />
          </div>
          <p className="tnum font-mono text-[10.5px] text-muted-foreground">
            {t("analytics.slaTarget", { target: String(SLA_TARGET) })}
            {" · "}
            {slaCompliance >= SLA_TARGET
              ? t("analytics.slaTargetMet")
              : t("analytics.slaTargetShort", { gap: String(SLA_TARGET - slaCompliance) })}
          </p>

          <p className="text-sm text-muted-foreground">
            {t("analytics.vulnsMetSla", { met: String(metSLA), missed: String(missedSLA) })}
          </p>

          {slaBreaches > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-risk-critical/25 bg-risk-critical-surface p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-risk-critical" />
              <p className="text-sm text-risk-critical">
                {t("analytics.vulnsBreachedSla", { count: String(slaBreaches) })}
              </p>
            </div>
          )}

          {Boolean(approachingSLA) && approachingSLA > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-risk-high/25 bg-risk-high-surface p-3">
              <Clock className="h-4 w-4 shrink-0 text-risk-high" />
              <p className="text-sm text-risk-high">
                {t("analytics.vulnsApproachingSla", { count: String(approachingSLA) })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Provenance
        source={t("provenance.platformInventory")}
        computedFrom={t("analytics.vulnsMetSla", { met: String(metSLA), missed: String(missedSLA) })}
        syncedAt={execData?.provenance?.lastSyncedAt ?? undefined}
      />
    </div>
  );
}
