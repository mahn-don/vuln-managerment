"use client";

import { cn } from "@/lib/utils";
import { daysRemaining, deriveSlaState, sla, type SlaState } from "@/lib/risk";
import { useTranslation } from "@/lib/i18n";

/**
 * Was: a 16px icon and the word "Breached" in the eighth column, as calm as
 * everything around it. Now the number is the message — days remaining, negative
 * when overdue — with a bar that fills as time runs out. Escalation is a property
 * of the component, not two hard-coded banners.
 */

const slaKeys: Record<SlaState, string> = {
  BREACHED: "vulnerabilities.breached",
  AT_RISK: "vulnerabilities.atRisk",
  ON_TRACK: "vulnerabilities.onTrack",
  MET: "status.completed",
  PAUSED: "status.pending",
};

export function SlaIndicator({
  dueDate,
  state,
  totalDays = 30,
  showBar = true,
  className,
}: {
  dueDate?: string | Date | null;
  state?: SlaState | string | null;
  /** SLA window for this severity, used to scale the bar */
  totalDays?: number;
  showBar?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // The Prisma SLAStatus enum also carries EXEMPT and MISSED, which this
  // vocabulary does not model. Fall back to deriving from the due date rather
  // than rendering nothing for them.
  const known = state && (state as string) in sla ? (state as SlaState) : null;
  const resolved = known ?? deriveSlaState(dueDate);
  const days = daysRemaining(dueDate);

  if (!resolved || !sla[resolved]) {
    return <span className={cn("text-muted-foreground", className)}>&mdash;</span>;
  }

  const token = sla[resolved];
  const label = t(slaKeys[resolved]);
  const breached = resolved === "BREACHED";
  const pct = days === null ? 100 : breached ? 100 : Math.max(4, Math.min(100, ((totalDays - days) / totalDays) * 100));

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showBar && (
        <span className="block h-[5px] w-11 shrink-0 bg-muted" aria-hidden>
          <span
            className="block h-[5px]"
            style={{ width: pct + "%", background: token.chart }}
          />
        </span>
      )}
      <span
        className={cn("tnum font-mono text-xs", token.fg, breached && "font-semibold")}
        title={
          label +
          (days === null
            ? ""
            : " — " +
              Math.abs(days) +
              " " +
              t(days < 0 ? "vulnerabilities.daysOverdueLabel" : "vulnerabilities.daysRemainingLabel"))
        }
      >
        {days === null ? label : (days < 0 ? "−" : "") + Math.abs(days) + "d"}
      </span>
    </span>
  );
}
