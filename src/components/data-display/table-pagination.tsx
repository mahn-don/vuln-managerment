"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Numbered pagination plus a page-size control, replacing the Previous/Next
 * pairs on every list screen. Page and pageSize live in the query string, so a
 * position in a long queue survives the back button like every other filter.
 */

const PAGE_SIZES = [25, 50, 100];

/** Page numbers around the current one, with gaps collapsed to an ellipsis. */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("gap");
  out.push(total);
  return out;
}

export function TablePagination({
  page,
  pages,
  total,
  limit,
  onPage,
  onLimit,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-6 py-3", className)}>
      <p className="tnum text-xs text-muted-foreground">
        {t("common.showing")} {first}&ndash;{last} {t("common.of")} {total.toLocaleString()}
      </p>

      {pages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text={t("common.previous")}
                href="#"
                aria-disabled={page <= 1}
                className={cn(page <= 1 && "pointer-events-none opacity-40")}
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 1) onPage(page - 1);
                }}
              />
            </PaginationItem>

            {pageWindow(page, pages).map((p, i) =>
              p === "gap" ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === page}
                    className="tnum"
                    onClick={(e) => {
                      e.preventDefault();
                      onPage(p);
                    }}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                text={t("common.next")}
                href="#"
                aria-disabled={page >= pages}
                className={cn(page >= pages && "pointer-events-none opacity-40")}
                onClick={(e) => {
                  e.preventDefault();
                  if (page < pages) onPage(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {t("common.rowsPerPage")}
        <select
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          className="tnum h-7 rounded-md border bg-card px-1.5 font-mono text-xs"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
