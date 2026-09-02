"use client";

import { cn } from "@/lib/utils";
import { severity, type Severity } from "@/lib/risk";
import { useTranslation } from "@/lib/i18n";

/**
 * Was: solid bg-red-600 with white text, its own colour map.
 * Now: a tinted chip reading the shared ramp, so severity looks identical
 * in a table, a chart legend, a detail header and a suggestion card.
 *
 * `short` stays untranslated — CRIT/HIGH/MED/LOW/INFO are fixed-width codes
 * for dense cells, and localising them would break the column.
 */

const severityKeys: Record<Severity, string> = {
  CRITICAL: "severity.critical",
  HIGH: "severity.high",
  MEDIUM: "severity.medium",
  LOW: "severity.low",
  INFORMATIONAL: "severity.info",
};

export function SeverityBadge({
  value,
  compact = false,
  className,
}: {
  value: Severity | string;
  /** Four-character form for dense table cells */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const token = severity[value as Severity];
  if (!token) {
    return <span className={cn("text-xs text-muted-foreground", className)}>{value}</span>;
  }
  const label = t(severityKeys[value as Severity]);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide",
        token.surface,
        token.fg,
        className,
      )}
      title={label}
    >
      {compact ? token.short : label}
    </span>
  );
}
