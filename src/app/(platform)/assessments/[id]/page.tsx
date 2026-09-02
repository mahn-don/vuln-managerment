"use client";

import { use } from "react";
import Link from "next/link";
import { useAssessment, useAssessmentHistory } from "@/lib/queries/assessments";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import { RecordActions } from "@/components/features/records/record-actions";
import { ClosureReadiness } from "@/components/features/assessments/closure-readiness";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { ArrowLeft, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: assessment, isLoading, error } = useAssessment(id);
  const { data: history } = useAssessmentHistory(id);
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        {t("assessments.notFound")}
      </div>
    );
  }

  const a = assessment;
  const type = a.assessmentType as Record<string, unknown> | undefined;
  const requester = a.requester as Record<string, unknown> | undefined;
  const assignee = a.assignee as Record<string, unknown> | undefined;
  const extIssue = a.externalIssue as Record<string, unknown> | undefined;
  const apps = (a.assessmentApplications || []) as Record<string, unknown>[];
  const vulns = (a.vulnerabilities || []) as Record<string, unknown>[];
  const historyItems = (history || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/assessments" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{String(a.title)}</h1>
            <StatusBadge value={String(a.status)} />
            <ScopeBadge value={a.scope as string | null} />
            <div className="ml-auto">
              <RecordActions
                entity="assessment"
                id={id}
                status={String(a.status ?? "")}
                queryKey={["assessment", id]}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{String(a.internalKey)}</span>
            {type && <span>{String(type.name)}</span>}
            {extIssue && (
              <Badge variant="outline" className="gap-1">
                <ExternalLink className="h-3 w-3" />
                {String(extIssue.sourceId)}
              </Badge>
            )}
          </div>
        </div>
        {a.priority ? <SeverityBadge value={String(a.priority)} /> : null}
      </div>

      <ClosureReadiness assessmentId={id} status={String(a.status ?? "")} />

      {/* Detail Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("assessments.assessmentInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.type")}</span>
              <span>{String(type?.name || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.priority")}</span>
              {String(a.priority) !== "undefined" && a.priority !== null ? <SeverityBadge value={String(a.priority)} /> : <span>--</span>}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.complexity")}</span>
              <span>{String(a.complexity || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.findings")}</span>
              <span className="font-semibold">{String(a.findingCount || 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" /> {t("assessments.timeline")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.created")}</span>
              <span>{a.createdDate ? new Date(String(a.createdDate)).toLocaleDateString() : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.dueDate")}</span>
              <span>{a.dueDate ? new Date(String(a.dueDate)).toLocaleDateString() : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.started")}</span>
              <span>{a.startedDate ? new Date(String(a.startedDate)).toLocaleDateString() : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.completed")}</span>
              <span>{a.completedDate ? new Date(String(a.completedDate)).toLocaleDateString() : "--"}</span>
            </div>
            {Boolean(a.slaStatus) && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">SLA</span>
                  <SlaIndicator
                    dueDate={a.dueDate as string | null | undefined}
                    state={a.slaStatus as string | null | undefined}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("assessments.people")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.requester")}</span>
              <span>{String(requester?.displayName || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("assessments.assignee")}</span>
              <span className="font-medium">{String(assignee?.displayName || t("assessments.unassigned"))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {apps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("applications.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {apps.map((aa) => {
                const app = aa.application as Record<string, unknown>;
                return (
                  <Link
                    key={String(app.id)}
                    href={`/applications/${app.id}`}
                    className="rounded-lg border p-3 hover:bg-muted transition-colors"
                  >
                    <p className="font-medium">{String(app.name)}</p>
                    <p className="text-xs text-muted-foreground">{String(app.applicationId)}</p>
                    {Boolean(app.level) && (
                      <span className="tnum text-xs text-muted-foreground">
                        {t("applications.levelValue", { level: String(app.level) })}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {Boolean(a.description) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("applications.description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{String(a.description)}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings">{t("assessments.findings")} ({vulns.length})</TabsTrigger>
          <TabsTrigger value="history">{t("assessments.statusHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="mt-4">
          {vulns.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
                {t("assessments.noFindings")}
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">{t("assessments.key")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("applications.name")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("assessments.severity")}</th>
                    <th className="px-4 py-2 text-left font-medium">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vulns.map((v) => (
                    <tr key={String(v.id)} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/vulnerabilities/${v.id}`} className="font-mono text-primary hover:underline">
                          {String(v.internalKey)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{String(v.title)}</td>
                      <td className="px-4 py-2"><SeverityBadge value={String(v.severity)} /></td>
                      <td className="px-4 py-2"><StatusBadge value={String(v.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="py-4">
              {historyItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">{t("assessments.noHistory")}</p>
              ) : (
                <div className="space-y-4">
                  {historyItems.map((h) => {
                    const changedBy = h.changedBy as Record<string, unknown> | undefined;
                    return (
                      <div key={String(h.id)} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div>
                          <p>
                            {h.fromStatus ? (
                              <>{String(h.fromStatus)} &rarr; <strong>{String(h.toStatus)}</strong></>
                            ) : (
                              <>{t("assessments.createdAs")} <strong>{String(h.toStatus)}</strong></>
                            )}
                          </p>
                          <p className="text-muted-foreground">
                            {String(changedBy?.displayName || "System")} &middot;{" "}
                            {new Date(String(h.changedAt)).toLocaleString()}
                          </p>
                          {Boolean(h.reason) && <p className="text-muted-foreground mt-0.5">{String(h.reason)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
