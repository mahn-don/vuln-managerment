"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Shield } from "lucide-react";

interface SlaRule {
  id: string;
  name: string;
  entityType: string;
  severity: string;
  appLevel: number | null;
  internetFacing: boolean;
  slaDays: number;
  warningDays: number;
  priority: number;
  status: string;
}

export default function SlaRulesPage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/v1/sla/rules");
      if (!res.ok) {
        setRules([]);
        return;
      }
      const json = await res.json();
      const data: SlaRule[] = json.data || [];
      data.sort((a, b) => b.priority - a.priority);
      setRules(data);
    } catch {
      setRules([]);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.sla.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.sla.defineAndManage")}
          </p>
        </div>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.sla.createRule")}
        </Button>
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
          {t("admin.sla.failedToLoad")}: {error}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t("admin.sla.noRulesFound")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.sla.createFirstRule")}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.sla.name")}</TableHead>
                <TableHead>{t("admin.sla.entityType")}</TableHead>
                <TableHead>{t("admin.sla.severity")}</TableHead>
                <TableHead>{t("admin.sla.appLevel")}</TableHead>
                <TableHead>{t("admin.sla.internetFacing")}</TableHead>
                <TableHead>{t("admin.sla.slaDays")}</TableHead>
                <TableHead>{t("admin.sla.warningDays")}</TableHead>
                <TableHead>{t("admin.sla.priority")}</TableHead>
                <TableHead>{t("admin.sla.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">
                    {String(rule.name)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{String(rule.entityType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge value={String(rule.severity)} />
                  </TableCell>
                  <TableCell>
                    <span className="tnum text-muted-foreground">
                      {rule.appLevel ? t("applications.levelValue", { level: String(rule.appLevel) }) : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {rule.internetFacing ? (
                      <Badge variant="destructive">{t("common.yes")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("common.no")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {String(rule.slaDays)}
                  </TableCell>
                  <TableCell className="text-center">
                    {String(rule.warningDays)}
                  </TableCell>
                  <TableCell className="text-center font-mono">
                    {String(rule.priority)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        rule.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {rule.status === "ACTIVE" ? t("admin.sla.active") : t("admin.sla.inactive")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
