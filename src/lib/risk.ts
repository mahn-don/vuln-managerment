/**
 * The single risk vocabulary.
 *
 * Before this file, severity lived in severity-badge.tsx, SLA state lived in
 * sla-indicator.tsx, and the charts carried their own hex. Changing one colour
 * meant editing four files. Everything now reads from here, and here reads from
 * the CSS tokens, so a colour change is one line in globals.css.
 */

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SLA_STATES = ["BREACHED", "AT_RISK", "ON_TRACK", "MET", "PAUSED"] as const;
export type SlaState = (typeof SLA_STATES)[number];

type RiskToken = {
  /** Full label for prose and filter menus */
  label: string;
  /** Four-character label for dense table cells */
  short: string;
  /** Tailwind text colour */
  fg: string;
  /** Tailwind background for chips and row tints */
  surface: string;
  /** Left rail on a table row */
  rail: string;
  /** Raw value for Recharts / SVG fills */
  chart: string;
  /** Sort weight, highest risk first */
  weight: number;
};

export const severity: Record<Severity, RiskToken> = {
  CRITICAL: {
    label: "Critical", short: "CRIT", weight: 5,
    fg: "text-risk-critical", surface: "bg-risk-critical-surface",
    rail: "border-l-risk-critical", chart: "var(--risk-critical)",
  },
  HIGH: {
    label: "High", short: "HIGH", weight: 4,
    fg: "text-risk-high", surface: "bg-risk-high-surface",
    rail: "border-l-risk-high", chart: "var(--risk-high)",
  },
  MEDIUM: {
    label: "Medium", short: "MED", weight: 3,
    fg: "text-risk-medium", surface: "bg-risk-medium-surface",
    rail: "border-l-risk-medium", chart: "var(--risk-medium)",
  },
  LOW: {
    label: "Low", short: "LOW", weight: 2,
    fg: "text-risk-low", surface: "bg-risk-low-surface",
    rail: "border-l-risk-low", chart: "var(--risk-low)",
  },
  INFORMATIONAL: {
    label: "Informational", short: "INFO", weight: 1,
    fg: "text-risk-info", surface: "bg-risk-info-surface",
    rail: "border-l-risk-info", chart: "var(--risk-info)",
  },
};

export const sla: Record<SlaState, Omit<RiskToken, "short">> = {
  BREACHED: {
    label: "Breached", weight: 5,
    fg: "text-risk-critical", surface: "bg-risk-critical-surface",
    rail: "border-l-risk-critical", chart: "var(--risk-critical)",
  },
  AT_RISK: {
    label: "At risk", weight: 4,
    fg: "text-risk-high", surface: "bg-risk-high-surface",
    rail: "border-l-risk-high", chart: "var(--risk-high)",
  },
  ON_TRACK: {
    label: "On track", weight: 2,
    fg: "text-muted-foreground", surface: "bg-muted",
    rail: "border-l-risk-ok", chart: "var(--risk-ok)",
  },
  MET: {
    label: "Met", weight: 1,
    fg: "text-muted-foreground", surface: "bg-muted",
    rail: "border-l-transparent", chart: "var(--risk-ok)",
  },
  PAUSED: {
    label: "Paused", weight: 0,
    fg: "text-muted-foreground", surface: "bg-muted",
    rail: "border-l-transparent", chart: "var(--risk-info)",
  },
};

/** Colours for a chart series keyed by severity, in ramp order. */
export const severityChartColors = SEVERITIES.map((s) => severity[s].chart);

/**
 * Days remaining against the due date. Negative means overdue.
 * Returns null when there is no due date, so callers can render an em dash
 * rather than a misleading zero.
 */
export function daysRemaining(due: string | Date | null | undefined): number | null {
  if (!due) return null;
  const d = typeof due === "string" ? new Date(due) : due;
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** Derive SLA state from the due date when the API has not supplied one. */
export function deriveSlaState(due: string | Date | null | undefined, atRiskWithin = 14): SlaState | null {
  const days = daysRemaining(due);
  if (days === null) return null;
  if (days < 0) return "BREACHED";
  if (days <= atRiskWithin) return "AT_RISK";
  return "ON_TRACK";
}

export function compareBySeverity(a: Severity, b: Severity) {
  return severity[b].weight - severity[a].weight;
}
