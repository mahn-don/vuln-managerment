"use client";

import { use } from "react";
import Link from "next/link";
import { useApplication, useApplicationSecuritySummary } from "@/lib/queries/applications";
import { useTranslation } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import {
  PeriodicCadenceCard,
  type PeriodicState,
} from "@/components/features/applications/periodic-cadence-card";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { AppDetailTabs } from "@/components/features/applications/app-detail-tabs";
import { Provenance } from "@/components/data-display/provenance";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  ArrowLeft,
  Pencil,
  Globe,
  Shield,
  AlertTriangle,
  CalendarCheck,
  ExternalLink,
} from "lucide-react";

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: app, isLoading, error } = useApplication(id);
  const { data: summary } = useApplicationSecuritySummary(id);
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        {t("applications.notFoundOrFailed")}
      </div>
    );
  }

  const vulnSummary = (summary as Record<string, unknown>)?.vulnerabilities as Record<string, unknown> | undefined;
  const assessmentSummary = (summary as Record<string, unknown>)?.assessments as Record<string, unknown> | undefined;
  const bySeverity = (vulnSummary?.bySeverity || {}) as Record<string, number>;

  // Periodic standing is computed server-side from policy, so the card and the
  // list can never disagree about whether an application is compliant.
  const periodic = app.periodic as Record<string, unknown> | undefined;

  const isOverdue = periodic?.state === "OVERDUE" || periodic?.state === "NEVER_ASSESSED";

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/applications" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{app.name as string}</h1>
            <p className="text-sm text-muted-foreground">{app.applicationId as string}</p>
          </div>
          <StatusBadge value={app.status as string} />
          {(app.internetFacing as boolean) && (
            // Internet exposure is an attack-surface fact, so it reads on the risk ramp.
            <Badge variant="outline" className="gap-1 border-risk-high/40 text-risk-high">
              <Globe className="h-3 w-3" />
              {t("applications.internetFacing")}
            </Badge>
          )}
        </div>
        <Link href={`/applications/${id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("common.edit")}
        </Link>
      </div>

      <Provenance
        source={t("provenance.platformInventory")}
        changedBy={
          (app.updatedBy as Record<string, unknown> | undefined)?.displayName
            ? String((app.updatedBy as Record<string, unknown>).displayName)
            : undefined
        }
        syncedAt={app.updatedAt ? String(app.updatedAt) : undefined}
      />

      <FilterBar showDateRange className="-mx-6 border-t" />

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Application Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("applications.applicationDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("applications.level")}</span>
              <span className="tnum font-medium">
                {t("applications.levelValue", { level: String(app.level ?? "—") })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("applications.businessUnit")}</span>
              <span>{String((app.businessUnit as Record<string, unknown>)?.name || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("applications.department")}</span>
              <span>{String(app.department || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("applications.dataClassification")}</span>
              <span>{String(app.dataClassification || "--")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.status")}</span>
              <StatusBadge value={app.status as string} />
            </div>
            {(app.goLiveDate as string | null) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("applications.goLiveDate")}</span>
                <span>{new Date(String(app.goLiveDate)).toLocaleDateString()}</span>
              </div>
            )}
            {(app.repositoryUrl as string | null) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("applications.repository")}</span>
                <a
                  href={String(app.repositoryUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  {t("applications.link")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vulnerability Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="h-4 w-4" />
              {t("vulnerabilities.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("severity.critical")}</span>
                <span className="font-semibold text-risk-critical">{bySeverity.CRITICAL || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("severity.high")}</span>
                <span className="tnum font-semibold text-risk-high">{bySeverity.HIGH || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("severity.medium")}</span>
                <span className="tnum font-semibold text-risk-medium">{bySeverity.MEDIUM || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("severity.low")}</span>
                <span className="font-semibold text-risk-low">{bySeverity.LOW || 0}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("applications.totalOpen")}</span>
                <span className="font-bold">
                  {(app.openVulnerabilityCount as number) || 0}
                </span>
              </div>
              {vulnSummary && (vulnSummary.slaBreached as number) > 0 && (
                <div className="flex items-center gap-2 rounded bg-risk-critical-surface p-2 text-sm text-risk-critical">
                  <AlertTriangle className="h-4 w-4" />
                  {vulnSummary.slaBreached as number} {t("applications.slaBreachCount")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Assessment Status */}
        <PeriodicCadenceCard
          cadence={(periodic?.cadence as "ANNUAL" | "BIENNIAL" | "CUSTOM") ?? "BIENNIAL"}
          intervalMonths={(periodic?.intervalMonths as number) ?? 24}
          state={(periodic?.state as PeriodicState) ?? "NEVER_ASSESSED"}
          lastAssessmentDate={app.lastAssessmentDate as string | null}
          nextAssessmentDue={app.nextAssessmentDue as string | null}
          goLiveCount={periodic?.goLiveOpen as number | undefined}
          periodicCount={periodic?.periodicOpen as number | undefined}
          recency={periodic?.recency as string | undefined}
          lastAssessmentYear={periodic?.lastAssessmentYear as number | undefined}
        />
      </div>

      {/* Owners */}
      {(app.owners as Record<string, unknown>[])?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("applications.owners")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {(app.owners as Record<string, unknown>[]).map((owner) => (
                <div key={owner.id as string} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {(owner.ownerType as string).replace(/_/g, " ")}
                  </p>
                  <p className="font-medium">
                    {(owner.user as Record<string, unknown>)?.displayName as string ||
                      (owner.ownerName as string) ||
                      "--"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(owner.user as Record<string, unknown>)?.email as string ||
                      (owner.ownerEmail as string) ||
                      ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aliases */}
      {(app.aliases as Record<string, unknown>[])?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("applications.knownAliases")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(app.aliases as Record<string, unknown>[]).map((alias) => (
                <Badge key={alias.id as string} variant="secondary">
                  {alias.alias as string}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for detailed views */}
      <AppDetailTabs appId={id} />
    </div>
  );
}
