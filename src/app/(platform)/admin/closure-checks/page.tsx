"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * What a ticket must contain before it can be closed.
 *
 * Closing a pentest with no owner, no scope and no findings recorded leaves a
 * record that cannot afterwards be told apart from work that never happened.
 * This is where the security team states what the ticket must carry; the
 * platform then checks it at the closing transition rather than trusting memory.
 *
 * Two enforcement levels, because not everything is worth blocking on: a
 * required check refuses the close, an advisory one is shown and lets it
 * through.
 */

interface Rule {
  check: string;
  enforcement: "BLOCK" | "WARN";
  appliesToType: string;
  appliesToScope: "ALL" | "GOLIVE" | "PERIODIC";
  enabled: boolean;
}

interface Payload {
  rules: Rule[];
  availableChecks: string[];
  assessmentTypes: { code: string; name: string }[];
}

export default function ClosureChecksPage() {
  const { t } = useTranslation();

  const [data, setData] = useState<Payload | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/settings/closure-checks");
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setData(json.data);
      setRules(json.data.rules);
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.closure.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  function update(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function addRule() {
    const used = new Set(rules.map((rule) => `${rule.check}:${rule.appliesToType}:${rule.appliesToScope}`));
    const nextCheck =
      data?.availableChecks.find((check) => !used.has(`${check}:PENTEST:ALL`)) ??
      data?.availableChecks[0] ??
      "description";
    setRules((current) => [
      ...current,
      { check: nextCheck, enforcement: "BLOCK", appliesToType: "PENTEST", appliesToScope: "ALL", enabled: true },
    ]);
  }

  async function save() {
    try {
      setSaving(true);
      const res = await fetch("/api/v1/settings/closure-checks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setData((current) => (current ? { ...current, rules: json.data.rules } : current));
      setRules(json.data.rules);
      toast.success(t("admin.closure.saved"));
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.closure.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const blockingCount = rules.filter((rule) => rule.enabled && rule.enforcement === "BLOCK").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.closure.title")}</h1>
          <p className="text-muted-foreground">{t("admin.closure.description")}</p>
        </div>
        <Badge variant="outline" className="whitespace-nowrap">
          {t("admin.closure.blockingCount", { count: String(blockingCount) })}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            {t("admin.closure.rulesTitle")}
          </CardTitle>
          <CardDescription>{t("admin.closure.rulesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("admin.closure.empty")}
            </p>
          )}

          {rules.map((rule, index) => (
            <div
              key={`${rule.check}-${index}`}
              className={cn(
                "grid items-center gap-3 rounded-lg border p-3",
                "sm:grid-cols-[1fr_9rem_9rem_8rem_2rem]",
                !rule.enabled && "opacity-55",
              )}
            >
              <div className="min-w-0">
                <Select value={rule.check} onValueChange={(v) => v && update(index, { check: v })}>
                  <SelectTrigger className="h-9 text-[13px]">
                    {/* Base UI renders the raw value unless given explicit children. */}
                    <SelectValue>{t(`admin.closure.check.${rule.check}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableChecks.map((check) => (
                      <SelectItem key={check} value={check}>
                        {t(`admin.closure.check.${check}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`admin.closure.checkHelp.${rule.check}`)}
                </p>
              </div>

              <Select
                value={rule.appliesToType}
                onValueChange={(v) => v && update(index, { appliesToType: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue>
                    {rule.appliesToType === "ALL"
                      ? t("admin.closure.allTypes")
                      : (data.assessmentTypes.find((type) => type.code === rule.appliesToType)?.name ??
                        rule.appliesToType)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("admin.closure.allTypes")}</SelectItem>
                  {data.assessmentTypes.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.appliesToScope}
                onValueChange={(v) => v && update(index, { appliesToScope: v as Rule["appliesToScope"] })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue>
                    {rule.appliesToScope === "ALL"
                      ? t("admin.closure.allScopes")
                      : t(`scope.${rule.appliesToScope}.label`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("admin.closure.allScopes")}</SelectItem>
                  <SelectItem value="PERIODIC">{t("scope.PERIODIC.label")}</SelectItem>
                  <SelectItem value="GOLIVE">{t("scope.GOLIVE.label")}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={rule.enforcement}
                onValueChange={(v) => v && update(index, { enforcement: v as Rule["enforcement"] })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue>
                    {rule.enforcement === "BLOCK" ? t("admin.closure.block") : t("admin.closure.warn")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK">{t("admin.closure.block")}</SelectItem>
                  <SelectItem value="WARN">{t("admin.closure.warn")}</SelectItem>
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                aria-label={t("admin.closure.removeRule")}
                className="justify-self-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("admin.closure.addRule")}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t("admin.closure.footnote")}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRules(data.rules)} disabled={!dirty || saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
