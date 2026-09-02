"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";
import { KPICard } from "@/components/data-display/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bug,
  AlertTriangle,
  Clock,
  UserCheck,
  CheckCircle,
  Brain,
  ShieldAlert,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface DailyBrief {
  date: string;
  metrics: {
    newVulnerabilities: number;
    newCritical: number;
    newHigh: number;
    overdueFindings: number;
    slaBreaches: number;
    approachingSLA: number;
    waitingAssignment: number;
    completedYesterday: number;
    totalOpenVulns: number;
    assessmentBacklog: number;
  };
  topRiskApps: {
    name: string;
    criticalCount: number;
    highCount: number;
    totalOpen: number;
  }[];
  aiInsights: string[];
  generatedAt: string;
}

async function fetchBrief(): Promise<DailyBrief> {
  const res = await fetch("/api/v1/ai/brief");
  const data: ApiResponse<DailyBrief> = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Request failed");
  return data.data!;
}

export default function DailyBriefPage() {
  const { t } = useTranslation();
  const { data: brief, isLoading } = useQuery({
    queryKey: ["ai-brief"],
    queryFn: fetchBrief,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("ai.dailySecurityBrief")}</h1>
          <p className="text-muted-foreground">{t("ai.briefSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const m = brief?.metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("ai.dailySecurityBrief")}</h1>
        <p className="text-muted-foreground">
          {Boolean(brief?.date) ? String(brief?.date) : t("ai.briefSubtitle")}
        </p>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KPICard
          title={t("ai.newVulns24h")}
          value={m?.newVulnerabilities ?? "--"}
          subtitle={t("ai.criticalHighCount", { critical: String(m?.newCritical ?? 0), high: String(m?.newHigh ?? 0) })}
          icon={Bug}
        />
        <KPICard
          title={t("ai.slaBreaches")}
          value={m?.slaBreaches ?? "--"}
          icon={AlertTriangle}
        />
        <KPICard
          title={t("ai.approachingSla")}
          value={m?.approachingSLA ?? "--"}
          icon={Clock}
        />
        <KPICard
          title={t("ai.waitingAssignment")}
          value={m?.waitingAssignment ?? "--"}
          icon={UserCheck}
        />
        <KPICard
          title={t("ai.completedYesterday")}
          value={m?.completedYesterday ?? "--"}
          icon={CheckCircle}
        />
      </div>

      {/* AI Insights + Top Risk Applications */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* AI Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {t("ai.aiInsights")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Boolean(brief?.aiInsights?.length) ? (
              <ul className="space-y-3">
                {brief?.aiInsights.map((insight, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("ai.noInsights")}</p>
            )}
          </CardContent>
        </Card>

        {/* Top Risk Applications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {t("ai.topRiskApps")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Boolean(brief?.topRiskApps?.length) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">{t("ai.name")}</th>
                      <th className="pb-2 text-right font-medium">{t("ai.critical")}</th>
                      <th className="pb-2 text-right font-medium">{t("ai.high")}</th>
                      <th className="pb-2 text-right font-medium">{t("ai.totalOpen")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief?.topRiskApps.map((app) => (
                      <tr key={app.name} className="border-b last:border-0">
                        <td className="py-2 font-medium">{app.name}</td>
                        <td className="py-2 text-right">
                          <span className="tnum text-risk-critical">{String(app.criticalCount)}</span>
                        </td>
                        <td className="py-2 text-right">
                          <span className="tnum text-risk-high">{String(app.highCount)}</span>
                        </td>
                        <td className="py-2 text-right">{String(app.totalOpen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("ai.noDataAvailable")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title={t("ai.totalOpenVulnerabilities")}
          value={m?.totalOpenVulns ?? "--"}
          icon={AlertCircle}
        />
        <KPICard
          title={t("ai.assessmentBacklog")}
          value={m?.assessmentBacklog ?? "--"}
          icon={ClipboardList}
        />
        <KPICard
          title={t("ai.overdueFindings")}
          value={m?.overdueFindings ?? "--"}
          icon={AlertTriangle}
        />
      </div>

      {/* Footer */}
      {Boolean(brief?.generatedAt) && (
        <p className="text-xs text-muted-foreground">
          {t("ai.generatedAt")}: {String(brief?.generatedAt)}
        </p>
      )}
    </div>
  );
}
