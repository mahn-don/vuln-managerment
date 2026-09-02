"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The application's standing against its periodic assessment obligation.
 *
 * Every application must be assessed end to end on a cadence set by its risk
 * level — annually for the higher-risk ones, every two years for the rest. That
 * obligation was invisible: the record showed two dates and left the reader to
 * work out whether the application was compliant. This states the rule, the
 * position against it, and how much time is left, in that order.
 *
 * Time is one of the two things allowed to carry colour on this platform, so the
 * overdue and due-soon states use the risk ramp; a current application stays
 * neutral.
 */

export type PeriodicState = "NEVER_ASSESSED" | "OVERDUE" | "DUE_SOON" | "CURRENT";

const STATE_STYLES: Record<PeriodicState, string> = {
  NEVER_ASSESSED: "bg-risk-high-surface text-risk-high",
  OVERDUE: "bg-risk-critical-surface text-risk-critical",
  DUE_SOON: "bg-risk-medium-surface text-risk-medium",
  CURRENT: "bg-muted text-muted-foreground",
};

function daysUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

export function PeriodicCadenceCard({
  cadence,
  intervalMonths,
  state,
  lastAssessmentDate,
  nextAssessmentDue,
  goLiveCount,
  periodicCount,
  recency,
  lastAssessmentYear,
  className,
}: {
  cadence: "ANNUAL" | "BIENNIAL" | "CUSTOM";
  intervalMonths: number;
  state: PeriodicState;
  lastAssessmentDate?: string | null;
  nextAssessmentDue?: string | null;
  /** Open findings by the scope they were discovered under. */
  goLiveCount?: number;
  periodicCount?: number;
  recency?: string | null;
  lastAssessmentYear?: number | null;
  className?: string;
}) {
  const { t } = useTranslation();

  const due = nextAssessmentDue ? new Date(nextAssessmentDue) : null;
  const remaining = due ? daysUntil(due) : null;

  const cadenceText =
    cadence === "CUSTOM"
      ? t("periodic.cadenceCustom", { months: String(intervalMonths) })
      : t(`periodic.cadence.${cadence}`);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          {t("periodic.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase",
              STATE_STYLES[state],
            )}
          >
            {t(`periodic.state.${state}`)}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("periodic.requirement", { cadence: cadenceText })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("evaluation.column")}:</span>
          <EvaluationYearTag recency={recency} year={lastAssessmentYear} />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("periodic.lastFull")}</dt>
            <dd className="font-medium">
              {lastAssessmentDate
                ? new Date(lastAssessmentDate).toLocaleDateString()
                : t("periodic.never")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("periodic.nextDue")}</dt>
            <dd
              className={cn(
                "font-medium tnum",
                state === "OVERDUE" && "text-risk-critical",
                state === "DUE_SOON" && "text-risk-medium",
              )}
            >
              {due ? due.toLocaleDateString() : "—"}
              {remaining !== null && (
                <span className="ml-1.5 text-xs font-normal">
                  {remaining < 0
                    ? t("periodic.overdueBy", { days: String(Math.abs(remaining)) })
                    : t("periodic.inDays", { days: String(remaining) })}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {(goLiveCount !== undefined || periodicCount !== undefined) && (
          <div className="border-t pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("periodic.openByScope")}
            </p>
            <div className="flex gap-5 text-sm">
              <span>
                <span className="tnum font-semibold">{periodicCount ?? 0}</span>{" "}
                <span className="text-muted-foreground">{t("scope.PERIODIC.label")}</span>
              </span>
              <span>
                <span className="tnum font-semibold">{goLiveCount ?? 0}</span>{" "}
                <span className="text-muted-foreground">{t("scope.GOLIVE.label")}</span>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The same standing, compressed to one cell for the inventory list.
 *
 * Cadence and state together, because "annual" alone doesn't say whether the
 * application is keeping to it and "overdue" alone doesn't say overdue against
 * what.
 */
export function PeriodicPill({ periodic }: { periodic?: Record<string, unknown> }) {
  const { t } = useTranslation();
  if (!periodic) return <span className="text-muted-foreground">—</span>;

  const state = (periodic.state as PeriodicState) ?? "NEVER_ASSESSED";
  const cadence = periodic.cadence as "ANNUAL" | "BIENNIAL" | "CUSTOM";
  const months = periodic.intervalMonths as number;

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide uppercase",
          STATE_STYLES[state],
        )}
      >
        {t(`periodic.stateShort.${state}`)}
      </span>
      <span className="text-[12px] text-muted-foreground">
        {cadence === "CUSTOM" ? t("periodic.cadenceCustom", { months: String(months) }) : t(`periodic.cadence.${cadence}`)}
      </span>
    </span>
  );
}

export type EvaluationRecency = "THIS_YEAR" | "LAST_YEAR" | "TWO_YEARS_AGO" | "OLDER" | "NEVER";

/**
 * When the application was last fully assessed, by calendar year.
 *
 * Colour here encodes elapsed time, which is one of the two things this platform
 * lets colour mean. The ramp runs green (done this year) → blue (last year) →
 * orange (two years) → red (longer ago, or never), so a list can be scanned for
 * neglected applications without reading a single date.
 */
const RECENCY_STYLES: Record<EvaluationRecency, string> = {
  THIS_YEAR: "bg-risk-fresh-surface text-risk-fresh",
  LAST_YEAR: "bg-risk-low-surface text-risk-low",
  TWO_YEARS_AGO: "bg-risk-high-surface text-risk-high",
  OLDER: "bg-risk-critical-surface text-risk-critical",
  NEVER: "bg-risk-critical-surface text-risk-critical",
};

export function EvaluationYearTag({
  recency,
  year,
  showYear = true,
  className,
}: {
  recency?: EvaluationRecency | string | null;
  /** The calendar year itself, shown alongside the label so the tag is checkable. */
  year?: number | null;
  showYear?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const bucket = (recency ?? "NEVER") as EvaluationRecency;
  const style = RECENCY_STYLES[bucket] ?? RECENCY_STYLES.NEVER;

  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
          style,
        )}
      >
        {t(`evaluation.${bucket}`)}
      </span>
      {showYear && year ? (
        <span className="tnum text-[12px] text-muted-foreground">{year}</span>
      ) : null}
    </span>
  );
}
