"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Plug,
  Loader2,
  History,
  Sparkles,
} from "lucide-react";

interface JiraConfig {
  baseUrl: string;
  assessmentProject: string;
  vulnerabilityProject: string;
  syncInterval: string;
  connected: boolean;
}

interface SyncResult {
  id: string;
  type: string;
  status: string;
  trigger: string;
  startedAt: string;
  completedAt: string | null;
  issuesFetched: number;
  issuesCreated: number;
  issuesUpdated: number;
  errors: number;
}

export default function JiraIntegrationPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [triagePending, setTriagePending] = useState<number | null>(null);
  const [isTriaging, setIsTriaging] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [configRes, historyRes, triageRes] = await Promise.all([
        fetch("/api/v1/integrations/jira").then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/v1/integrations/jira/sync-history").then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/v1/integrations/jira/triage").then((r) =>
          r.ok ? r.json() : null
        ),
      ]);

      if (configRes?.data) {
        setConfig(configRes.data);
      }

      setTriagePending(
        typeof triageRes?.data?.pending === "number" ? triageRes.data.pending : null
      );

      const historyData: SyncResult[] = historyRes?.data || [];
      setSyncHistory(historyData);
      if (historyData.length > 0) {
        setLastSync(historyData[0]);
      }
    } catch {
      // APIs may not exist yet
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      const res = await fetch("/api/v1/integrations/jira/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(t("admin.integrations.testSuccess"));
      } else {
        toast.error(
          String(json.error?.message || t("admin.integrations.testFailed"))
        );
      }
    } catch {
      toast.error(t("admin.integrations.testFailedServer"));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch("/api/v1/integrations/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncType: "FULL" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(t("admin.integrations.syncStarted"));
        fetchData();
      } else {
        toast.error(String(json.error?.message || t("admin.integrations.syncFailed")));
      }
    } catch {
      toast.error(t("admin.integrations.syncFailedServer"));
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Drain part of the triage backlog now.
   *
   * The worker does this on a schedule; the button exists because an operator
   * running without the worker fleet still needs synced tickets analyzed, and
   * because a batch that failed on a provider outage should be retriable here.
   */
  const handleTriageNow = async () => {
    try {
      setIsTriaging(true);
      const res = await fetch("/api/v1/integrations/jira/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 25 }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(
          t("admin.integrations.triageDone", {
            analyzed: String(json.data.analyzed),
            remaining: String(json.data.remaining),
          })
        );
        fetchData();
      } else {
        toast.error(String(json.error?.message || t("admin.integrations.triageFailed")));
      }
    } catch {
      toast.error(t("admin.integrations.triageFailed"));
    } finally {
      setIsTriaging(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      // Sync outcome is workflow, not risk — neutral unless it failed.
      case "SUCCESS":
      case "COMPLETED":
        return <Badge variant="secondary">{status}</Badge>;
      case "RUNNING":
      case "IN_PROGRESS":
        return <Badge variant="secondary">{status}</Badge>;
      case "FAILED":
      case "ERROR":
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("admin.integrations.jiraIntegration")}
          </h1>
          <p className="text-muted-foreground">
            {t("admin.integrations.configureJira")}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.integrations.jiraIntegration")}</h1>
        <p className="text-muted-foreground">
          {t("admin.integrations.configureJira")}
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              {t("admin.integrations.connectionStatus")}
            </CardTitle>
            <CardDescription>
              {Boolean(config) ? (
                <span className="flex items-center gap-1.5">
                  {config!.connected ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-risk-ok" />
                      {t("admin.integrations.connected")}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      {t("admin.integrations.disconnected")}
                    </>
                  )}
                </span>
              ) : (
                t("admin.integrations.notConfigured")
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Boolean(config) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                  <span className="text-muted-foreground">{t("admin.integrations.baseUrl")}</span>
                  <span className="font-mono">{String(config!.baseUrl)}</span>
                  <span className="text-muted-foreground">
                    {t("admin.integrations.assessmentProject")}
                  </span>
                  <span>{String(config!.assessmentProject)}</span>
                  <span className="text-muted-foreground">
                    {t("admin.integrations.vulnerabilityProject")}
                  </span>
                  <span>{String(config!.vulnerabilityProject)}</span>
                  <span className="text-muted-foreground">{t("admin.integrations.syncInterval")}</span>
                  <span>{String(config!.syncInterval)}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plug className="mr-2 h-4 w-4" />
                    )}
                    {t("admin.integrations.testConnection")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {t("admin.integrations.syncNow")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("admin.integrations.noJiraConfig")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Last Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("admin.integrations.lastSync")}
            </CardTitle>
            <CardDescription>
              {Boolean(lastSync)
                ? t("admin.integrations.lastSynced", { time: new Date(lastSync!.startedAt).toLocaleString() })
                : t("admin.integrations.noSyncHistoryAvailable")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Boolean(lastSync) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                  <span className="text-muted-foreground">{t("admin.integrations.status")}</span>
                  <span>{statusBadge(lastSync!.status)}</span>
                  <span className="text-muted-foreground">{t("admin.integrations.startedAt")}</span>
                  <span>
                    {new Date(lastSync!.startedAt).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">{t("admin.integrations.completedAt")}</span>
                  <span>
                    {lastSync!.completedAt
                      ? new Date(lastSync!.completedAt).toLocaleString()
                      : "--"}
                  </span>
                  <span className="text-muted-foreground">{t("admin.integrations.issuesFetched")}</span>
                  <span>{String(lastSync!.issuesFetched)}</span>
                  <span className="text-muted-foreground">{t("admin.integrations.issuesCreated")}</span>
                  <span>{String(lastSync!.issuesCreated)}</span>
                  <span className="text-muted-foreground">{t("admin.integrations.issuesUpdated")}</span>
                  <span>{String(lastSync!.issuesUpdated)}</span>
                  <span className="text-muted-foreground">{t("admin.integrations.errors")}</span>
                  <span>
                    {lastSync!.errors > 0 ? (
                      <Badge variant="destructive">
                        {String(lastSync!.errors)}
                      </Badge>
                    ) : (
                      String(lastSync!.errors)
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("admin.integrations.noSyncPerformed")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/*
        Triage sits between the sync and the review queue: synced tickets are
        analyzed for which inventory application they concern, what the work
        covers, and what needs assessing. This card is the operator's view of
        that backlog.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("admin.integrations.triage")}
          </CardTitle>
          <CardDescription>{t("admin.integrations.triageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="tnum text-3xl font-bold">
              {triagePending === null ? "--" : triagePending}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("admin.integrations.triagePending")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleTriageNow}
            disabled={isTriaging || triagePending === 0}
          >
            {isTriaging ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {t("admin.integrations.runTriage")}
          </Button>
        </CardContent>
      </Card>

      {/* Sync History Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.integrations.syncHistory")}</CardTitle>
          <CardDescription>
            {t("admin.integrations.syncHistoryDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <RefreshCw className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">{t("admin.integrations.noSyncHistory")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.integrations.syncHistoryEmpty")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.integrations.type")}</TableHead>
                    <TableHead>{t("admin.integrations.status")}</TableHead>
                    <TableHead>{t("admin.integrations.trigger")}</TableHead>
                    <TableHead>{t("admin.integrations.started")}</TableHead>
                    <TableHead>{t("admin.integrations.completed")}</TableHead>
                    <TableHead>{t("admin.integrations.fetched")}</TableHead>
                    <TableHead>{t("admin.integrations.created")}</TableHead>
                    <TableHead>{t("admin.integrations.updated")}</TableHead>
                    <TableHead>{t("admin.integrations.errors")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncHistory.map((sync) => (
                    <TableRow key={sync.id}>
                      <TableCell>
                        <Badge variant="outline">{String(sync.type)}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(sync.status)}</TableCell>
                      <TableCell>{String(sync.trigger)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sync.startedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sync.completedAt
                          ? new Date(sync.completedAt).toLocaleString()
                          : "--"}
                      </TableCell>
                      <TableCell className="text-center">
                        {String(sync.issuesFetched)}
                      </TableCell>
                      <TableCell className="text-center">
                        {String(sync.issuesCreated)}
                      </TableCell>
                      <TableCell className="text-center">
                        {String(sync.issuesUpdated)}
                      </TableCell>
                      <TableCell className="text-center">
                        {sync.errors > 0 ? (
                          <Badge variant="destructive">
                            {String(sync.errors)}
                          </Badge>
                        ) : (
                          String(sync.errors)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
