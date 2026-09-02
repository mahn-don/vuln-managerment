"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Provenance } from "@/components/data-display/provenance";

/**
 * The wrapper every chart goes in.
 *
 * Three things the charts were missing. A title that states the finding rather
 * than naming the axis ("New findings have outpaced fixes for three months"
 * beats "Vulnerability Trend"). A units line, so the reader knows what is being
 * counted. And the numbers themselves — a table view and a copy button, because
 * a figure trapped in a tooltip cannot go into a board pack.
 */

export type ChartRow = Record<string, string | number>;

export function ChartFrame({
  finding,
  units,
  rows,
  columns,
  source,
  syncedAt,
  className,
  children,
}: {
  /** The sentence the chart is evidence for */
  finding: string;
  /** e.g. "Findings per month · count" */
  units: string;
  /** The same data the chart is drawn from, for the table view and clipboard */
  rows: ChartRow[];
  columns: { key: string; label: string; align?: "left" | "right" }[];
  source?: string;
  syncedAt?: string | Date;
  className?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [copied, setCopied] = useState(false);

  async function copyTsv() {
    const head = columns.map((c) => c.label).join("\t");
    const body = rows.map((r) => columns.map((c) => String(r[c.key] ?? "")).join("\t")).join("\n");
    await navigator.clipboard.writeText(head + "\n" + body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className={cn("rounded-xl bg-card p-5 ring-1 ring-foreground/10", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="max-w-[30ch] text-[14.5px] font-semibold leading-snug text-pretty">{finding}</h3>
          <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">{units}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11.5px] capitalize",
                view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            onClick={copyTsv}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {view === "chart" ? (
          children
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-muted/50">
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "border-b px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground",
                        c.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn("px-3 py-1.5", c.align === "right" ? "tnum text-right font-mono" : "text-left")}
                      >
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(source || syncedAt) && <Provenance className="mt-4" source={source} syncedAt={syncedAt} />}
    </section>
  );
}
