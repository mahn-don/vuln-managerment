"use client";

import { useIdentity } from "@/components/providers/role-provider";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { KPICard } from "@/components/data-display/kpi-card";
import { StatusBadge } from "@/components/data-display/status-badge";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck, Bug, AlertTriangle, Clock, Inbox,
} from "lucide-react";
import type { ApiResponse } from "@/types/api";
import { useTranslation } from "@/lib/i18n";

export default function WorkspacePage() {
  const identity = useIdentity();
  const { t } = useTranslation();
  const userId = identity.id;

  const { data: assessments, isLoading: loadingA } = useQuery({
    queryKey: ["workspace-assessments", userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assessments?assigneeId=${userId}&status=ASSIGNED,IN_PROGRESS,WAITING_INFO&limit=10&sort=dueDate&order=asc`);
      const json: ApiResponse<Record<string, unknown>[]> = await res.json();
      return json.success ? json.data! : [];
    },
    enabled: !!userId,
  });

  const { data: vulns, isLoading: loadingV } = useQuery({
    queryKey: ["workspace-vulns", userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/vulnerabilities?assigneeId=${userId}&status=NEW,TRIAGED,ASSIGNED,IN_PROGRESS,PENDING_FIX,READY_FOR_VERIFICATION&limit=15&sort=dueDate&order=asc`);
      const json: ApiResponse<Record<string, unknown>[]> = await res.json();
      return json.success ? json.data! : [];
    },
    enabled: !!userId,
  });

  const myAssessments = assessments || [];
  const myVulns = vulns || [];
  const overdueItems = [
    ...myAssessments.filter((a) => a.dueDate && new Date(String(a.dueDate)) < new Date()),
    ...myVulns.filter((v) => v.slaStatus === "BREACHED"),
  ];
  const dueSoon = myVulns.filter((v) => v.slaStatus === "AT_RISK");

  const isLoading = loadingA || loadingV;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("workspace.title")}</h1>
        <p className="text-muted-foreground">
          {t("common.welcomeBack")}, {identity.name || t("common.user")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard
          title={t("dashboard.activeAssessments")}
          value={isLoading ? "--" : myAssessments.length}
          icon={ClipboardCheck}
        />
        <KPICard
          title={t("dashboard.openVulnerabilities")}
          value={isLoading ? "--" : myVulns.length}
          icon={Bug}
        />
        <KPICard
          title={t("vulnerabilities.overdue")}
          value={isLoading ? "--" : overdueItems.length}
          icon={AlertTriangle}
        />
        <KPICard
          title={t("workspace.dueSoon")}
          value={isLoading ? "--" : dueSoon.length}
          subtitle={t("dashboard.approachingSla")}
          icon={Clock}
        />
      </div>

      {overdueItems.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-risk-critical/25 bg-risk-critical-surface p-4">
          <AlertTriangle className="h-5 w-5 text-risk-critical shrink-0" />
          <p className="text-sm font-medium text-risk-critical">
            {t("workspace.overdueItems", { count: String(overdueItems.length) })}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" />
              {t("workspace.myAssessments")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : myAssessments.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{t("workspace.noActiveAssessments")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myAssessments.map((a) => {
                  const type = a.assessmentType as Record<string, unknown> | undefined;
                  const apps = a.assessmentApplications as Record<string, unknown>[] | undefined;
                  const primaryApp = apps?.[0]?.application as Record<string, unknown> | undefined;
                  const isOverdue = a.dueDate && new Date(String(a.dueDate)) < new Date();

                  return (
                    <Link
                      key={String(a.id)}
                      href={`/assessments/${a.id}`}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{String(a.internalKey)}</span>
                          <StatusBadge value={String(a.status)} />
                        </div>
                        <p className="font-medium truncate mt-0.5">{String(a.title)}</p>
                        <p className="text-xs text-muted-foreground">
                          {String(type?.code || "")} {primaryApp ? `· ${String(primaryApp.name)}` : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        {a.dueDate ? (
                          <span className={isOverdue ? "font-semibold text-risk-critical" : "text-muted-foreground"}>
                            {isOverdue ? t("vulnerabilities.overdue").toUpperCase() : `${t("common.due")} ${new Date(String(a.dueDate)).toLocaleDateString()}`}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="h-4 w-4" />
              {t("workspace.myVulnerabilities")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : myVulns.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{t("workspace.noOpenVulnerabilities")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myVulns.slice(0, 10).map((v) => (
                  <Link
                    key={String(v.id)}
                    href={`/vulnerabilities/${v.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{String(v.internalKey)}</span>
                        <SeverityBadge value={String(v.severity)} />
                        <StatusBadge value={String(v.status)} />
                      </div>
                      <p className="font-medium truncate mt-0.5">{String(v.title)}</p>
                    </div>
                    <div className="shrink-0">
                      <SlaIndicator
                        dueDate={v.dueDate as string | null | undefined}
                        state={v.slaStatus as string | null | undefined}
                      />
                    </div>
                  </Link>
                ))}
                {myVulns.length > 10 && (
                  <p className="text-center text-sm text-muted-foreground pt-2">
                    + {myVulns.length - 10} {t("common.more")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
