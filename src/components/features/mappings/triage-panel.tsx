"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * What AI triage found in one synced ticket.
 *
 * The reviewer's job on this queue is to confirm an application, so the panel
 * leads with the reasoning behind the suggestion and then gives them the two
 * things they would otherwise open Jira to read: what the work covers, and what
 * about it needs assessing.
 *
 * Colour follows the platform rule — only risk carries it. Focus-point priority
 * is a risk signal and takes the risk ramp; relevance is workflow and stays
 * typographic.
 */

export interface TicketTriageView {
  relevance: string;
  relevanceReason?: string;
  summary?: string;
  scope?: {
    changeType?: string | null;
    components?: string[];
    environments?: string[];
    dataTypes?: string[];
    integrations?: string[];
    exposure?: string;
  } | null;
  securityFocus?: { area: string; why: string; priority: string }[];
  missingInformation?: string[];
  suggestedAssessmentType?: string | null;
  inferredScope?: "GOLIVE" | "PERIODIC" | string | null;
  size?: "SMALL" | "MEDIUM" | "LARGE" | string | null;
  sizeRationale?: string;
  featureCount?: number | null;
  changeSummary?: string;
  references?: { url: string; title: string | null; fetched: boolean }[];
  application?: {
    name: string;
    key: string;
    confidence: number;
    reasoning: string;
  } | null;
  analyzedBy?: string;
  model?: string | null;
  analyzedAt?: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-risk-high-surface text-risk-high",
  MEDIUM: "bg-risk-medium-surface text-risk-medium",
  LOW: "bg-risk-low-surface text-risk-low",
};

export function TriagePanel({ triage }: { triage: TicketTriageView }) {
  const { t } = useTranslation();

  const scope = triage.scope ?? {};
  const focus = triage.securityFocus ?? [];
  const missing = triage.missingInformation ?? [];

  const scopeRows: [string, string][] = [];
  if (scope.changeType)
    scopeRows.push([t("mappings.triage.changeType"), scope.changeType]);
  if (scope.environments?.length)
    scopeRows.push([
      t("mappings.triage.environments"),
      scope.environments.join(", "),
    ]);
  if (scope.exposure && scope.exposure !== "UNKNOWN") {
    scopeRows.push([
      t("mappings.triage.exposure"),
      t(`mappings.triage.exposureValue.${scope.exposure}`),
    ]);
  }
  if (scope.dataTypes?.length)
    scopeRows.push([
      t("mappings.triage.dataTypes"),
      scope.dataTypes.join(", "),
    ]);
  if (scope.integrations?.length)
    scopeRows.push([
      t("mappings.triage.integrations"),
      scope.integrations.join(", "),
    ]);
  if (scope.components?.length)
    scopeRows.push([
      t("mappings.triage.components"),
      scope.components.join(", "),
    ]);

  return (
    <div className="mb-4 space-y-4 rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("mappings.triage.title")}
        </span>
        <Badge variant="outline" className="text-xs">
          {t(`mappings.triage.relevance.${triage.relevance}`)}
        </Badge>
        {/* The suggested assessment type and the inferred scope agree on
            go-live and periodic work, and two badges saying the same word read
            as two different facts. Only show the type when it adds one. */}
        {triage.suggestedAssessmentType &&
          triage.suggestedAssessmentType !== triage.inferredScope && (
            <Badge variant="secondary" className="text-xs">
              {triage.suggestedAssessmentType}
            </Badge>
          )}
        {triage.inferredScope === "GOLIVE" ||
        triage.inferredScope === "PERIODIC" ? (
          <Badge
            variant="outline"
            className="font-mono text-[10.5px] uppercase"
          >
            {t(`scope.${triage.inferredScope}.label`)}
          </Badge>
        ) : null}
        {/* Sizing is a workload judgement, not a risk one, so it stays neutral. */}
        {triage.size ? (
          <Badge
            variant="outline"
            title={t(`size.help.${triage.size}`)}
            className="border-transparent bg-muted-foreground/15 text-[10.5px] font-semibold tracking-wide uppercase"
          >
            {t("size.label")}: {t(`size.${triage.size}`)}
            {typeof triage.featureCount === "number" && triage.featureCount > 0
              ? ` · ${t("size.features", { count: String(triage.featureCount) })}`
              : ""}
          </Badge>
        ) : null}
      </div>

      {triage.summary && <p className="text-sm">{triage.summary}</p>}

      {triage.relevanceReason && (
        <p className="text-sm text-muted-foreground">
          {triage.relevanceReason}
        </p>
      )}

      {triage.sizeRationale ? (
        <p className="text-sm text-muted-foreground">{triage.sizeRationale}</p>
      ) : null}

      {triage.changeSummary ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("size.changeSummary")}
          </p>
          <p className="text-sm">{triage.changeSummary}</p>
        </div>
      ) : null}

      {scopeRows.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("mappings.triage.scope")}
          </p>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {scopeRows.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {focus.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("mappings.triage.securityFocus")}
          </p>
          <ul className="space-y-1.5">
            {focus.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge
                  className={cn(
                    "mt-0.5 shrink-0 text-[10px]",
                    PRIORITY_STYLES[point.priority] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`mappings.triage.priority.${point.priority}`)}
                </Badge>
                <span className="min-w-0">
                  <span className="font-medium">{point.area}</span>
                  {point.why && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {point.why}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("mappings.triage.missingInformation")}
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {missing.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {triage.references && triage.references.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("size.sources")}
          </p>
          <ul className="space-y-0.5">
            {triage.references.map((reference) => (
              <li key={reference.url} className="truncate text-sm">
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {reference.title || reference.url}
                </a>
                {/* A link that could not be opened is worth saying out loud:
                    otherwise a thin summary looks like a thin specification. */}
                {reference.fetched ? null : (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({t("size.unread")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {triage.analyzedBy === "AI"
          ? t("mappings.triage.byAi", { model: triage.model || "unknown" })
          : t("mappings.triage.byHeuristic")}
        {triage.analyzedAt
          ? ` · ${new Date(triage.analyzedAt).toLocaleString()}`
          : ""}
      </p>
    </div>
  );
}
