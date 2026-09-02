"use client";

import { use } from "react";
import Link from "next/link";
import { useVulnerability, useVulnerabilityHistory } from "@/lib/queries/vulnerabilities";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import { RecordActions } from "@/components/features/records/record-actions";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { Provenance } from "@/components/data-display/provenance";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Shield,
  User,
  AppWindow,
  History,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

function formatDate(value: unknown): string {
  if (!value) return "--";
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? "--" : d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: unknown): string {
  if (!value) return "--";
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? "--" : d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{children}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-72" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

export default function VulnerabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: vuln, isLoading, error } = useVulnerability(id);
  const { data: history } = useVulnerabilityHistory(id);
  const { t } = useTranslation();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/vulnerabilities"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("vulnerabilities.backToList")}
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {t("vulnerabilities.failedToLoad")}: {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!vuln) {
    return (
      <div className="space-y-4">
        <Link
          href="/vulnerabilities"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("vulnerabilities.backToList")}
        </Link>
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("vulnerabilities.notFound")}
        </div>
      </div>
    );
  }

  const vulnerabilityApplications = (vuln.vulnerabilityApplications || []) as Record<
    string,
    unknown
  >[];
  const riskAcceptances = (vuln.riskAcceptances || []) as Record<string, unknown>[];
  const historyItems = (history || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/vulnerabilities"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("vulnerabilities.backToList")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {String(vuln.title || "Untitled Vulnerability")}
          </h1>
          {Boolean(vuln.severity) && (
            <SeverityBadge value={String(vuln.severity)} />
          )}
          {Boolean(vuln.status) && <StatusBadge value={String(vuln.status)} />}
          <ScopeBadge value={vuln.scope as string | null} />
          <div className="ml-auto">
            <RecordActions
              entity="vulnerability"
              id={id}
              status={String(vuln.status ?? "")}
              queryKey={["vulnerability", id]}
            />
          </div>
        </div>
        {Boolean(vuln.internalKey) && (
          <p className="font-mono text-sm text-muted-foreground">
            {String(vuln.internalKey)}
          </p>
        )}
        <Provenance
          className="mt-3"
          source={vuln.source ? String(vuln.source) : undefined}
          syncedAt={vuln.lastSyncedAt ? String(vuln.lastSyncedAt) : undefined}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t("vulnerabilities.details")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label={t("vulnerabilities.type")}>
              {String(vuln.vulnerabilityType || "--")}
            </DetailRow>
            <Separator />
            <DetailRow label="CWE">
              {vuln.cweId ? String(vuln.cweId) : "--"}
            </DetailRow>
            <Separator />
            <DetailRow label="CVE">
              {vuln.cveId ? String(vuln.cveId) : "--"}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.cvssScore")}>
              {vuln.cvssScore != null ? String(vuln.cvssScore) : "--"}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.source")}>
              {String(vuln.source || "--")}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.environment")}>
              {String(vuln.environment || "--")}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.affectedComponent")}>
              {String(vuln.affectedComponent || "--")}
            </DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("vulnerabilities.slaTimeline")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label={t("assessments.created")}>
              {formatDate(vuln.createdAt)}
            </DetailRow>
            <Separator />
            <DetailRow label={t("assessments.dueDate")}>
              {formatDate(vuln.dueDate)}
            </DetailRow>
            <Separator />
            <div className="flex items-start justify-between py-2">
              <span className="text-sm text-muted-foreground">{t("vulnerabilities.slaStatus")}</span>
              <SlaIndicator
                dueDate={vuln.dueDate as string | null | undefined}
                state={vuln.slaStatus as string | null | undefined}
              />
            </div>
            <Separator />
            <DetailRow label={t("vulnerabilities.fixedDate")}>
              {formatDate(vuln.fixedAt)}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.verifiedDate")}>
              {formatDate(vuln.verifiedAt)}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.closedDate")}>
              {formatDate(vuln.closedAt)}
            </DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("vulnerabilities.assignment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label={t("assessments.assignee")}>
              {String(
                (vuln.assignee as Record<string, unknown>)?.name ||
                  vuln.assigneeEmail ||
                  "--"
              )}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.fixOwner")}>
              {String(
                (vuln.fixOwner as Record<string, unknown>)?.name ||
                  vuln.fixOwnerEmail ||
                  "--"
              )}
            </DetailRow>
            <Separator />
            <DetailRow label={t("vulnerabilities.remediationEffort")}>
              {String(vuln.remediationEffort || "--")}
            </DetailRow>
          </CardContent>
        </Card>
      </div>

      {vulnerabilityApplications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AppWindow className="h-4 w-4" />
              {t("applications.title")} ({vulnerabilityApplications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {vulnerabilityApplications.map((va, i) => {
                const app = va.application as Record<string, unknown> | undefined;
                return (
                  <Link
                    key={i}
                    href={`/applications/${String(app?.id || "")}`}
                    className="inline-flex"
                  >
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                      {String(app?.name || app?.applicationId || `App ${i + 1}`)}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {Boolean((vuln.description || vuln.recommendation || vuln.evidence)) && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {Boolean(vuln.description) && (
              <div>
                <h3 className="text-sm font-semibold mb-1">{t("applications.description")}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {String(vuln.description)}
                </p>
              </div>
            )}
            {Boolean((vuln.description && (vuln.recommendation || vuln.evidence))) && (
              <Separator />
            )}
            {Boolean(vuln.recommendation) && (
              <div>
                <h3 className="text-sm font-semibold mb-1">{t("vulnerabilities.recommendation")}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {String(vuln.recommendation)}
                </p>
              </div>
            )}
            {Boolean((vuln.recommendation && vuln.evidence)) && <Separator />}
            {Boolean(vuln.evidence) && (
              <div>
                <h3 className="text-sm font-semibold mb-1">{t("vulnerabilities.evidence")}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {String(vuln.evidence)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">
            <History className="mr-1.5 h-4 w-4" />
            {t("vulnerabilities.history")}
          </TabsTrigger>
          <TabsTrigger value="risk-acceptance">
            <ShieldAlert className="mr-1.5 h-4 w-4" />
            {t("vulnerabilities.riskAcceptance")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          {historyItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("vulnerabilities.noHistory")}
            </div>
          ) : (
            <div className="relative space-y-0 pl-6">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
              {historyItems.map((entry, i) => (
                <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  <div className="absolute left-[-15px] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {Boolean(entry.fromStatus) && (
                        <StatusBadge value={String(entry.fromStatus)} />
                      )}
                      {Boolean((entry.fromStatus && entry.toStatus)) && (
                        <span className="text-xs text-muted-foreground">&rarr;</span>
                      )}
                      {Boolean(entry.toStatus) && (
                        <StatusBadge value={String(entry.toStatus)} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDateTime(entry.changedAt || entry.createdAt)}</span>
                      {Boolean(entry.changedBy) && (
                        <>
                          <span>{t("vulnerabilities.by")}</span>
                          <span className="font-medium text-foreground">
                            {String(
                              (entry.changedBy as Record<string, unknown>)?.name ||
                                entry.changedByEmail ||
                                "System"
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {Boolean(entry.reason) && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {String(entry.reason)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="risk-acceptance" className="mt-4">
          {riskAcceptances.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("vulnerabilities.noRiskAcceptances")}
            </div>
          ) : (
            <div className="space-y-4">
              {riskAcceptances.map((ra, i) => (
                <Card key={i}>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t("vulnerabilities.riskAcceptanceNum")} #{i + 1}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <DetailRow label={t("common.status")}>
                      <Badge variant="outline">
                        {String(ra.status || "--")}
                      </Badge>
                    </DetailRow>
                    <Separator />
                    <DetailRow label={t("vulnerabilities.acceptedBy")}>
                      {String(
                        (ra.acceptedBy as Record<string, unknown>)?.name ||
                          ra.acceptedByEmail ||
                          "--"
                      )}
                    </DetailRow>
                    <Separator />
                    <DetailRow label={t("vulnerabilities.expires")}>
                      {formatDate(ra.expiresAt)}
                    </DetailRow>
                    <Separator />
                    <DetailRow label={t("vulnerabilities.justification")}>
                      {String(ra.justification || "--")}
                    </DetailRow>
                    {Boolean(ra.conditions) && (
                      <>
                        <Separator />
                        <DetailRow label={t("vulnerabilities.conditions")}>
                          {String(ra.conditions)}
                        </DetailRow>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
