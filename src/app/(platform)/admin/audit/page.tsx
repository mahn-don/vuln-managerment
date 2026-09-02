"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, FileText } from "lucide-react";

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  source: string;
  ipAddress: string;
}

interface AuditMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [user, setUser] = useState("");

  const fetchAuditLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const sp = new URLSearchParams();
      sp.set("page", String(page));
      sp.set("limit", "25");
      if (dateFrom) sp.set("dateFrom", dateFrom);
      if (dateTo) sp.set("dateTo", dateTo);
      if (action) sp.set("action", action);
      if (entityType) sp.set("entityType", entityType);
      if (user) sp.set("user", user);

      const res = await fetch(`/api/v1/audit?${sp.toString()}`);
      if (!res.ok) {
        setEntries([]);
        setMeta(null);
        return;
      }
      const json = await res.json();
      setEntries(json.data || []);
      setMeta(json.meta || null);
    } catch {
      setEntries([]);
      setMeta(null);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, [page, dateFrom, dateTo, action, entityType, user]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.audit.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.audit.reviewActivity")}
          {Boolean(meta) && ` (${meta!.total} ${t("common.total")})`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            {t("admin.audit.from")}
          </label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-[160px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            {t("admin.audit.to")}
          </label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-[160px]"
          />
        </div>
        <div className="relative min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("admin.audit.actionPlaceholder")}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={entityType || "all"}
          onValueChange={(v) => {
            setEntityType(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("admin.audit.entityType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.audit.allEntityTypes")}</SelectItem>
            <SelectItem value="application">{t("admin.audit.application")}</SelectItem>
            <SelectItem value="assessment">{t("admin.audit.assessment")}</SelectItem>
            <SelectItem value="vulnerability">{t("admin.audit.vulnerability")}</SelectItem>
            <SelectItem value="import">{t("admin.audit.import")}</SelectItem>
            <SelectItem value="integration">{t("admin.audit.integration")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("admin.audit.userPlaceholder")}
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : Boolean(error) ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {t("admin.audit.failedToLoad")}: {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t("admin.audit.noEntries")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {dateFrom || dateTo || action || entityType || user
              ? t("admin.audit.tryAdjustingFilters")
              : t("admin.audit.noActivityYet")}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.audit.timestamp")}</TableHead>
                  <TableHead>{t("admin.audit.user")}</TableHead>
                  <TableHead>{t("admin.audit.action")}</TableHead>
                  <TableHead>{t("admin.audit.entityType")}</TableHead>
                  <TableHead>{t("admin.audit.entityId")}</TableHead>
                  <TableHead>{t("admin.audit.source")}</TableHead>
                  <TableHead>{t("admin.audit.ipAddress")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {String(entry.user)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(entry.action)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {String(entry.entityType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {String(entry.entityId)}
                    </TableCell>
                    <TableCell>{String(entry.source)}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {String(entry.ipAddress)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {Boolean(meta) && meta!.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(meta!.page - 1) * meta!.limit + 1}
                {"\u2013"}
                {Math.min(meta!.page * meta!.limit, meta!.total)} of{" "}
                {meta!.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t("common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta!.pages}
                  onClick={() => setPage(page + 1)}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
