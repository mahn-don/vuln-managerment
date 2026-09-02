"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/data-display/empty-state";
import { Upload, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiResponse } from "@/types/api";

interface ImportRecord {
  id: string;
  fileName: string;
  fileSize: number | null;
  status: string;
  totalRows: number | null;
  newCount: number | null;
  updatedCount: number | null;
  unchangedCount: number | null;
  invalidCount: number | null;
  importedBy: { displayName: string } | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Import state is workflow, not risk — it stays neutral and typographic.
 * Only outright failure earns a colour.
 */
const statusColors: Record<string, string> = {
  COMPLETED: "bg-muted text-muted-foreground",
  FAILED: "bg-risk-critical-surface text-risk-critical",
  IMPORTING: "bg-muted text-muted-foreground",
  PREVIEWING: "bg-muted text-muted-foreground",
  UPLOADED: "bg-muted text-muted-foreground",
  ROLLED_BACK: "bg-risk-medium-surface text-risk-medium",
};

export default function ImportHistoryPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["import-history", page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/imports?page=${page}&limit=20`);
      const json: ApiResponse<ImportRecord[]> = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return { items: json.data!, meta: json.meta! };
    },
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.imports.importHistory")}</h1>
          <p className="text-muted-foreground">
            {t("admin.imports.trackAndReview")}
            {meta ? ` (${meta.total} ${t("common.total")})` : ""}
          </p>
        </div>
        <Link href="/admin/imports/upload" className={cn(buttonVariants({ size: "sm" }))}>
          <Upload className="mr-2 h-4 w-4" />
          {t("admin.imports.newImport")}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={t("admin.imports.noImports")}
          description={t("admin.imports.uploadFirstFile")}
          action={
            <Link href="/admin/imports/upload" className={cn(buttonVariants())}>
              <Upload className="mr-2 h-4 w-4" />
              {t("admin.imports.uploadFile")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.imports.file")}</TableHead>
                  <TableHead>{t("admin.imports.status")}</TableHead>
                  <TableHead className="text-center">{t("admin.imports.rows")}</TableHead>
                  <TableHead className="text-center">{t("admin.imports.new")}</TableHead>
                  <TableHead className="text-center">{t("admin.imports.updated")}</TableHead>
                  <TableHead className="text-center">{t("admin.imports.invalid")}</TableHead>
                  <TableHead>{t("admin.imports.importedBy")}</TableHead>
                  <TableHead>{t("admin.imports.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{imp.fileName}</span>
                      </div>
                      {imp.fileSize && (
                        <span className="text-xs text-muted-foreground">
                          {(imp.fileSize / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[imp.status] || "bg-muted text-muted-foreground"}>
                        {imp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{imp.totalRows ?? "--"}</TableCell>
                    <TableCell className="tnum text-center font-medium text-risk-ok">
                      {imp.newCount ?? "--"}
                    </TableCell>
                    <TableCell className="tnum text-center font-medium text-risk-low">
                      {imp.updatedCount ?? "--"}
                    </TableCell>
                    <TableCell className="text-center">
                      {(imp.invalidCount ?? 0) > 0 ? (
                        <span className="tnum font-medium text-risk-critical">{imp.invalidCount}</span>
                      ) : (
                        String(imp.invalidCount ?? "--")
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {imp.importedBy?.displayName || "--"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(imp.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.pages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
