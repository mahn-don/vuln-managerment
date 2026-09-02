"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Go-live vs periodic, on assessments and on findings.
 *
 * The two are read side by side in the same queue for the same application, so
 * they have to be told apart at a glance without colour — colour on this
 * platform means risk or time, and scope is neither. The distinction is carried
 * by shape instead: periodic (whole application) is filled, go-live (this change
 * only) is outlined.
 */

export type Scope = "GOLIVE" | "PERIODIC";

export function ScopeBadge({
  value,
  compact = false,
  className,
}: {
  value?: Scope | string | null;
  /** Abbreviated form for dense table rows. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (value !== "GOLIVE" && value !== "PERIODIC") return null;

  const isPeriodic = value === "PERIODIC";
  const label = compact
    ? t(`scope.${value}.short`)
    : t(`scope.${value}.label`);

  return (
    <Badge
      variant="outline"
      title={t(`scope.${value}.help`)}
      className={cn(
        "font-mono text-[10.5px] tracking-wide uppercase",
        isPeriodic
          ? "border-transparent bg-muted-foreground/15 text-foreground"
          : "border-dashed border-muted-foreground/50 text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
