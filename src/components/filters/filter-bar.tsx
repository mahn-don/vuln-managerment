"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, useFilterParams, type DatePresetId } from "@/lib/use-filter-params";

/**
 * The one filter strip, used on every page.
 *
 * Sits directly under the page header. Left: the date range (dashboards) or
 * saved views (lists). Middle: active filters as removable chips. Right: Copy
 * link — because the filters live in the URL, a filtered screen is a shareable
 * artefact rather than a state someone has to reproduce by hand.
 */

export type FilterOption = { value: string; label: string };

export type FilterDef = {
  /** Query-string key */
  key: string;
  label: string;
  options: FilterOption[];
  /** Allow several values, comma separated in the URL */
  multi?: boolean;
};

export type SavedView = { id: string; label: string; query: string; count?: number; tone?: "critical" };

export function FilterBar({
  filters = [],
  showDateRange = false,
  savedViews,
  className,
}: {
  filters?: FilterDef[];
  /** Dashboards and detail screens turn this on; list screens use savedViews */
  showDateRange?: boolean;
  savedViews?: SavedView[];
  className?: string;
}) {
  const { params, setParam, clear, range, setRange, shareUrl } = useFilterParams();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const active = filters.filter((f) => params[f.key]);
  const inactive = filters.filter((f) => !params[f.key]);

  async function copy() {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      ref={ref}
      className={cn("relative flex flex-wrap items-center gap-2.5 border-b bg-card/60 px-6 py-2.5", className)}
    >
      {showDateRange && (
        <div className="flex shrink-0 overflow-hidden rounded-md border bg-card">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setRange(p.id)}
              className={cn(
                "border-r px-2.5 py-1 text-xs last:border-r-0",
                range.preset === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpenKey(openKey === "__date" ? null : "__date")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs font-medium",
              range.preset === "custom" ? "bg-foreground text-background" : "text-primary hover:bg-muted",
            )}
          >
            Custom <ChevronDown className="size-3" />
          </button>
        </div>
      )}

      {savedViews?.map((v) => (
        <a
          key={v.id}
          href={"?" + v.query}
          className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted"
        >
          {v.label}
          {v.count !== undefined && (
            <span className={cn("tnum font-mono text-[11px]", v.tone === "critical" ? "text-risk-critical" : "text-muted-foreground")}>
              {v.count}
            </span>
          )}
        </a>
      ))}

      {active.map((f) => {
        const selected = (params[f.key] ?? "").split(",").filter(Boolean);
        const labels = selected.map((s) => f.options.find((o) => o.value === s)?.label ?? s);
        return (
          <span key={f.key} className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs">
            <button type="button" onClick={() => setOpenKey(openKey === f.key ? null : f.key)} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-semibold">{labels.join(", ")}</span>
            </button>
            <button type="button" onClick={() => setParam(f.key, null)} aria-label={"Clear " + f.label}>
              <X className="size-3 text-muted-foreground hover:text-foreground" />
            </button>
          </span>
        );
      })}

      {inactive.length > 0 && (
        <button
          type="button"
          onClick={() => setOpenKey(openKey === "__add" ? null : "__add")}
          className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" /> filter
        </button>
      )}

      {(active.length > 0 || range.preset === "custom") && (
        <button type="button" onClick={clear} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Reset
        </button>
      )}

      <button
        type="button"
        onClick={copy}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs text-primary"
      >
        {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}
        {copied ? "Copied" : "Copy link"}
      </button>

      {openKey === "__date" && (
        <DateRangePopover
          draft={draft}
          setDraft={setDraft}
          onApply={() => { setRange("custom", draft.from, draft.to); setOpenKey(null); }}
          onPreset={(id) => { setRange(id); setOpenKey(null); }}
          onCancel={() => setOpenKey(null)}
        />
      )}

      {openKey === "__add" && (
        <Menu>
          {inactive.map((f) => (
            <button key={f.key} type="button" onClick={() => setOpenKey(f.key)} className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted">
              {f.label}
            </button>
          ))}
        </Menu>
      )}

      {filters.map((f) =>
        openKey === f.key ? (
          <Menu key={f.key}>
            {f.options.map((o) => {
              const selected = (params[f.key] ?? "").split(",").filter(Boolean);
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (!f.multi) { setParam(f.key, on ? null : o.value); setOpenKey(null); return; }
                    const next = on ? selected.filter((s) => s !== o.value) : [...selected, o.value];
                    setParam(f.key, next.join(","));
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                >
                  {o.label}
                  {on && <Check className="size-3.5 text-primary" />}
                </button>
              );
            })}
          </Menu>
        ) : null,
      )}
    </div>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-6 top-full z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border bg-popover py-1 shadow-lg">
      {children}
    </div>
  );
}

function DateRangePopover({
  draft, setDraft, onApply, onPreset, onCancel,
}: {
  draft: { from: string; to: string };
  setDraft: (d: { from: string; to: string }) => void;
  onApply: () => void;
  onPreset: (id: DatePresetId) => void;
  onCancel: () => void;
}) {
  const quick: { id: DatePresetId; label: string }[] = [
    { id: "today", label: "Yesterday" },
    { id: "7d", label: "This week" },
    { id: "30d", label: "This month" },
    { id: "90d", label: "This quarter" },
  ];
  return (
    <div className="absolute left-6 top-full z-20 mt-1 w-[330px] rounded-md border bg-popover p-4 shadow-lg">
      <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground">Flexible range</p>
      <div className="mt-3 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11.5px] text-muted-foreground">From</span>
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="h-8 rounded-md border bg-card px-2 font-mono text-xs"
          />
        </label>
        <span className="pb-2 text-xs text-muted-foreground">&rarr;</span>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11.5px] text-muted-foreground">To</span>
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="h-8 rounded-md border bg-card px-2 font-mono text-xs"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button key={q.label} type="button" onClick={() => onPreset(q.id)} className="rounded-full border px-2.5 py-1 text-[11.5px] hover:bg-muted">
            {q.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1 text-xs">Cancel</button>
        <button type="button" onClick={onApply} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Apply</button>
      </div>
    </div>
  );
}
