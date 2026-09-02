"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/data-display/status-badge";
import { ScopeBadge } from "@/components/data-display/scope-badge";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SlaIndicator } from "@/components/data-display/sla-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, Bug, Clock } from "lucide-react";
import type { ApiResponse } from "@/types/api";

function fetchJson<T>(url: string) {
  return async (): Promise<T> => {
    const res = await fetch(url);
    const json: ApiResponse<T> = await res.json();
    if (!json.success) throw new Error(json.error?.message);
    return json.data!;
  };
}

interface AppDetailTabsProps {
  appId: string;
}

export function AppDetailTabs({ appId }: AppDetailTabsProps) {
  const { data: assessments, isLoading: loadingAssessments } = useQuery({
    queryKey: ["app-assessments", appId],
    queryFn: fetchJson<Record<string, unknown>[]>(`/api/v1/applications/${appId}/assessments`),
  });

  const { data: vulnerabilities, isLoading: loadingVulns } = useQuery({
    queryKey: ["app-vulnerabilities", appId],
    queryFn: fetchJson<Record<string, unknown>[]>(`/api/v1/applications/${appId}/vulnerabilities`),
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ["app-timeline", appId],
    queryFn: fetchJson<Record<string, unknown>[]>(`/api/v1/applications/${appId}/timeline`),
  });

  return (
    <Tabs defaultValue="assessments">
      <TabsList>
        <TabsTrigger value="assessments">
          Assessments ({assessments?.length ?? 0})
        </TabsTrigger>
        <TabsTrigger value="vulnerabilities">
          Vulnerabilities ({vulnerabilities?.length ?? 0})
        </TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>

      {/* Assessments Tab */}
      <TabsContent value="assessments" className="mt-4">
        {loadingAssessments ? (
          <Skeleton className="h-48 w-full" />
        ) : !assessments || assessments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-8 w-8 mb-2 opacity-50" />
              <p>No assessments found for this application</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Key</th>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Scope</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Assignee</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-center font-medium">Findings</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => {
                  const type = a.assessmentType as Record<string, unknown> | undefined;
                  const assignee = a.assignee as Record<string, unknown> | undefined;
                  const count = a._count as Record<string, number> | undefined;
                  return (
                    <tr key={String(a.id)} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/assessments/${a.id}`} className="font-mono text-primary hover:underline">
                          {String(a.internalKey)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 max-w-[200px] truncate">{String(a.title)}</td>
                      <td className="px-4 py-2"><ScopeBadge value={a.scope as string | null} compact /></td>
                      <td className="px-4 py-2 text-muted-foreground">{String(type?.code || "--")}</td>
                      <td className="px-4 py-2">{String(assignee?.displayName || "--")}</td>
                      <td className="px-4 py-2"><StatusBadge value={String(a.status)} /></td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {a.createdDate ? new Date(String(a.createdDate)).toLocaleDateString() : "--"}
                      </td>
                      <td className="px-4 py-2 text-center">{String(count?.vulnerabilities ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* Vulnerabilities Tab */}
      <TabsContent value="vulnerabilities" className="mt-4">
        {loadingVulns ? (
          <Skeleton className="h-48 w-full" />
        ) : !vulnerabilities || vulnerabilities.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bug className="h-8 w-8 mb-2 opacity-50" />
              <p>No vulnerabilities found for this application</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Key</th>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Severity</th>
                  <th className="px-4 py-2 text-left font-medium">Scope</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Fix Owner</th>
                  <th className="px-4 py-2 text-left font-medium">Due Date</th>
                  <th className="px-4 py-2 text-left font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {vulnerabilities.map((v) => {
                  const fixOwner = v.fixOwner as Record<string, unknown> | undefined;
                  return (
                    <tr key={String(v.id)} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/vulnerabilities/${v.id}`} className="font-mono text-primary hover:underline">
                          {String(v.internalKey)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 max-w-[200px] truncate">{String(v.title)}</td>
                      <td className="px-4 py-2"><SeverityBadge value={String(v.severity)} /></td>
                      <td className="px-4 py-2"><ScopeBadge value={v.scope as string | null} compact /></td>
                      <td className="px-4 py-2"><StatusBadge value={String(v.status)} /></td>
                      <td className="px-4 py-2">{String(fixOwner?.displayName || "--")}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {v.dueDate ? new Date(String(v.dueDate)).toLocaleDateString() : "--"}
                      </td>
                      <td className="px-4 py-2">
                        <SlaIndicator
                          dueDate={v.dueDate as string | null | undefined}
                          state={v.slaStatus as string | null | undefined}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* Timeline Tab */}
      <TabsContent value="timeline" className="mt-4">
        {loadingTimeline ? (
          <Skeleton className="h-48 w-full" />
        ) : !timeline || timeline.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-50" />
              <p>No activity recorded yet</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-4">
              <div className="space-y-4">
                {timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{String(event.title)}</p>
                      {Boolean(event.details) && (
                        <p className="text-muted-foreground">{String(event.details)}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(String(event.timestamp)).toLocaleString()}</span>
                        {Boolean(event.user) && <span>by {String(event.user)}</span>}
                        {Boolean(event.entityKey) && (
                          <Link
                            href={`/${event.entityType}s/${event.entityId}`}
                            className="text-primary hover:underline"
                          >
                            {String(event.entityKey)}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
