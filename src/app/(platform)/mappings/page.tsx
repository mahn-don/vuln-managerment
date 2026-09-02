"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";
import { TablePagination } from "@/components/data-display/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/data-display/empty-state";
import { GitCompareArrows, Check, X, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ApiResponse } from "@/types/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TriagePanel, type TicketTriageView } from "@/components/features/mappings/triage-panel";

interface MappingItem {
  id: string;
  confidenceScore: number | null;
  matchMethod: string | null;
  evidence: string[] | null;
  candidates: Array<{
    applicationId: string;
    applicationName: string;
    score: number;
    evidence: string[];
    matchMethod: string;
  }> | null;
  aiExplanation: string | null;
  application: { id: string; name: string; applicationId: string } | null;
  externalIssue: {
    sourceId: string;
    title: string;
    description: string | null;
    labels: string[];
    components: string[];
    reporterEmail: string | null;
    triage: TicketTriageView | null;
    triageStatus: string;
    triagedAt: string | null;
  };
}

export default function MappingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { params, setParam, setParams } = useFilterParams();
  const page = Number(params.page ?? 1);
  const limit = Number(params.limit ?? 25);

  const { data, isLoading } = useQuery({
    queryKey: ["mappings", page, limit],
    queryFn: async () => {
      const res = await fetch(`/api/v1/mappings?page=${page}&limit=${limit}`);
      const json: ApiResponse<MappingItem[]> = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return { items: json.data!, meta: json.meta! };
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/mappings/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      toast.success(t("mappings.confirmed"));
    },
    onError: (e) => toast.error(String(e.message)),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/mappings/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      toast.success(t("mappings.rejected"));
    },
    onError: (e) => toast.error(String(e.message)),
  });

  /**
   * Re-run triage for one ticket. A reviewer who has just added an alias or
   * imported the missing application wants the suggestion recomputed here,
   * rather than waiting for the next scheduled sweep.
   */
  const reanalyzeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/mappings/${id}/reanalyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
      toast.success(t("mappings.reanalyzed"));
    },
    onError: (e) => toast.error(String(e.message)),
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("mappings.reviewQueue")}</h1>
        <p className="text-muted-foreground">
          {t("mappings.reviewDescription")}
          {meta ? ` (${meta.total} ${t("mappings.pending")})` : ""}
        </p>
      </div>

      {/*
        No filter definitions: the mappings API accepts only page and limit, so
        there is nothing to filter on server-side yet. The strip still carries
        Copy link, which is what makes a queue position shareable.
      */}
      <FilterBar className="-mx-6 border-t" />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title={t("mappings.noMappings")}
          description={t("mappings.allResolved")}
        />
      ) : (
        <div className="space-y-4">
          {items.map((mapping) => (
            <Card key={mapping.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {mapping.externalIssue.sourceId}
                      </Badge>
                      <CardTitle className="text-base">{mapping.externalIssue.title}</CardTitle>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      {mapping.externalIssue.reporterEmail && (
                        <span>{t("mappings.reporter")}: {mapping.externalIssue.reporterEmail}</span>
                      )}
                      {mapping.externalIssue.labels.length > 0 && (
                        <span>{t("mappings.labels")}: {mapping.externalIssue.labels.join(", ")}</span>
                      )}
                    </div>
                  </div>
                  {mapping.confidenceScore !== null && (
                    <Badge
                      className={cn(
                        "tnum",
                        // Low confidence is the risk here — it is what needs a human.
                        mapping.confidenceScore >= 80
                          ? "bg-muted text-muted-foreground"
                          : mapping.confidenceScore >= 60
                            ? "bg-risk-medium-surface text-risk-medium"
                            : "bg-risk-critical-surface text-risk-critical"
                      )}
                    >
                      {t("mappings.confidencePercent", { score: String(Math.round(mapping.confidenceScore)) })}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* What triage read out of the ticket */}
                {mapping.externalIssue.triage && <TriagePanel triage={mapping.externalIssue.triage} />}

                {/* AI Suggestion */}
                {mapping.application && (
                  <div className="mb-4 rounded-lg border bg-brand-surface p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                      <ArrowRight className="h-4 w-4" />
                      {t("mappings.suggested")}: {mapping.application.name}
                      <span className="text-muted-foreground font-mono text-xs">
                        ({mapping.application.applicationId})
                      </span>
                    </div>
                    {mapping.evidence && (
                      <ul className="mt-2 space-y-1 text-sm text-accent-foreground">
                        {(mapping.evidence as string[]).map((e, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                            {e}
                          </li>
                        ))}
                      </ul>
                    )}
                    {mapping.aiExplanation && (
                      <p className="mt-2 text-sm text-accent-foreground">{mapping.aiExplanation}</p>
                    )}
                  </div>
                )}

                {!mapping.application && mapping.aiExplanation && (
                  <p className="mb-4 text-sm text-muted-foreground">{mapping.aiExplanation}</p>
                )}

                {/* Alternative candidates */}
                {mapping.candidates && (mapping.candidates as MappingItem["candidates"])!.length > 1 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">{t("mappings.alternatives")}:</p>
                    <div className="flex flex-wrap gap-2">
                      {(mapping.candidates as NonNullable<MappingItem["candidates"]>)
                        .slice(1, 4)
                        .map((c) => (
                          <Badge key={c.applicationId} variant="secondary" className="text-xs">
                            {c.applicationName} ({c.score}%)
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {mapping.application && (
                    <Button
                      size="sm"
                      onClick={() => confirmMutation.mutate(mapping.id)}
                      disabled={confirmMutation.isPending}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      {t("common.confirm")}: {mapping.application.name}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rejectMutation.mutate(mapping.id)}
                    disabled={rejectMutation.isPending}
                  >
                    <X className="mr-1 h-4 w-4" />
                    {t("mappings.noMatch")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reanalyzeMutation.mutate(mapping.id)}
                    disabled={reanalyzeMutation.isPending}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    {t("mappings.reanalyze")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {meta && (
            <TablePagination
              className="rounded-lg border bg-card"
              page={meta.page}
              pages={meta.pages}
              total={meta.total}
              limit={meta.limit}
              onPage={(p) => setParam("page", String(p))}
              onLimit={(l) => setParams({ limit: String(l), page: null })}
            />
          )}
        </div>
      )}
    </div>
  );
}
