"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter state in the URL.
 *
 * Every list screen kept its filters in useState, so a filtered queue could not
 * be bookmarked, shared, or recovered with the back button after opening a
 * finding. This hook is a drop-in replacement: same shape, but the query string
 * is the source of truth.
 */

export const DATE_PRESETS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
] as const;

export type DatePresetId = (typeof DATE_PRESETS)[number]["id"] | "custom";

export type DateRange = { from: string; to: string; preset: DatePresetId; label: string };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function resolveRange(preset: string | null, from?: string | null, to?: string | null): DateRange {
  if (preset === "custom" && from && to) {
    return { from, to, preset: "custom", label: from + " to " + to };
  }
  const match = DATE_PRESETS.find((p) => p.id === preset) ?? DATE_PRESETS[2];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (match.days - 1));
  return { from: iso(start), to: iso(end), preset: match.id, label: "Last " + match.label };
}

export function useFilterParams<T extends Record<string, string>>(defaults?: Partial<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => {
    const out: Record<string, string> = { ...(defaults as Record<string, string>) };
    searchParams.forEach((v, k) => { out[k] = v; });
    return out as T & Record<string, string>;
    // defaults is treated as a literal; callers pass a stable object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const push = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? pathname + "?" + qs : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** Set one key. Passing an empty string or null removes it. Resets page. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "ALL") next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.delete("page");
      push(next);
    },
    [searchParams, push],
  );

  /** Set several keys at once — avoids one history entry per filter. */
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      push(next);
    },
    [searchParams, push],
  );

  const clear = useCallback(() => push(new URLSearchParams()), [push]);

  const range = useMemo(
    () => resolveRange(params.preset ?? null, params.from, params.to),
    [params.preset, params.from, params.to],
  );

  const setRange = useCallback(
    (preset: DatePresetId, from?: string, to?: string) => {
      if (preset === "custom") setParams({ preset: "custom", from: from ?? null, to: to ?? null });
      else setParams({ preset, from: null, to: null });
    },
    [setParams],
  );

  /** Absolute URL for the Copy link button. */
  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    const qs = searchParams.toString();
    return window.location.origin + pathname + (qs ? "?" + qs : "");
  }, [searchParams, pathname]);

  return { params, setParam, setParams, clear, range, setRange, shareUrl, searchParams };
}
