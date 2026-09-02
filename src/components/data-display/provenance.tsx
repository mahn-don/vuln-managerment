import { cn } from "@/lib/utils";

/**
 * The platform claims to be the authoritative source of truth and the data model
 * tracks provenance to back it up, but no screen surfaced any of it. One line,
 * used under every figure, table and record: where this came from, when it last
 * synced, who last touched it.
 */
export function Provenance({
  source,
  syncedAt,
  computedFrom,
  changedBy,
  className,
  children,
}: {
  source?: string;
  syncedAt?: string | Date;
  /** e.g. "1,284 findings" — what a KPI was calculated over */
  computedFrom?: string;
  changedBy?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const parts: string[] = [];
  if (source) parts.push("Source: " + source);
  if (computedFrom) parts.push("from " + computedFrom);
  if (syncedAt) {
    const d = typeof syncedAt === "string" ? new Date(syncedAt) : syncedAt;
    parts.push("synced " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }
  if (changedBy) parts.push("last changed by " + changedBy);

  return (
    <p className={cn("border-t pt-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground", className)}>
      {parts.join(" · ")}
      {children}
    </p>
  );
}
