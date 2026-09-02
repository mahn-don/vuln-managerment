"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, PlugZap, KeyRound, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Confluence connection.
 *
 * A go-live pentest ticket is often two lines and a link; the linked page is
 * where the change is actually described. With this configured, triage reads
 * those pages to work out which application the ticket concerns, how large the
 * change is, and what is changing.
 *
 * The token is write-only, like the AI provider credential.
 */

interface Settings {
  enabled: boolean;
  baseUrl: string;
  email: string;
  maxPages: number;
  maxCharsPerPage: number;
  source: "database" | "environment" | "default";
  tokenSet: boolean;
  tokenHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  status?: number;
}

export default function ConfluenceSettingsPage() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/settings/confluence");
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setSettings(json.data);
      setForm(json.data);
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.confluence.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  function tokenPayload() {
    if (clearToken) return { apiToken: "" };
    if (token.trim()) return { apiToken: token.trim() };
    return {};
  }

  async function save() {
    if (!form) return;
    try {
      setSaving(true);
      const res = await fetch("/api/v1/settings/confluence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          baseUrl: form.baseUrl,
          email: form.email,
          maxPages: Number(form.maxPages),
          maxCharsPerPage: Number(form.maxCharsPerPage),
          ...tokenPayload(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setSettings(json.data);
      setForm(json.data);
      setToken("");
      setClearToken(false);
      toast.success(t("admin.confluence.saved"));
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.confluence.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!form) return;
    try {
      setTesting(true);
      setResult(null);
      const res = await fetch("/api/v1/settings/confluence/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: form.baseUrl,
          email: form.email,
          ...(token.trim() ? { apiToken: token.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setResult(json.data);
    } catch (error) {
      setResult({ ok: false, message: String((error as Error).message) });
    } finally {
      setTesting(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dirty =
    settings !== null &&
    (form.enabled !== settings.enabled ||
      form.baseUrl !== settings.baseUrl ||
      form.email !== settings.email ||
      Number(form.maxPages) !== settings.maxPages ||
      Number(form.maxCharsPerPage) !== settings.maxCharsPerPage ||
      token.trim() !== "" ||
      clearToken);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.confluence.title")}</h1>
          <p className="text-muted-foreground">{t("admin.confluence.description")}</p>
        </div>
        <Badge variant={form.enabled ? "default" : "outline"}>
          {form.enabled ? t("admin.ai.enabled") : t("admin.ai.disabled")}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" />
            {t("admin.confluence.connection")}
          </CardTitle>
          <CardDescription>{t("admin.confluence.connectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="mt-1 size-4 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-sm font-medium">{t("admin.confluence.enableLabel")}</span>
              <span className="block text-sm text-muted-foreground">
                {t("admin.confluence.enableHelp")}
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">{t("admin.confluence.baseUrl")}</Label>
            <Input
              id="baseUrl"
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://your-tenant.atlassian.net"
              className="font-mono text-[13px]"
            />
            <p className="text-xs text-muted-foreground">{t("admin.confluence.baseUrlHelp")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{t("admin.confluence.email")}</Label>
            <Input
              id="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="font-mono text-[13px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("admin.ai.credential")}
          </CardTitle>
          <CardDescription>{t("admin.confluence.credentialDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("admin.ai.currentToken")}:</span>
            {settings?.tokenSet ? (
              <span className="font-mono">{settings.tokenHint}</span>
            ) : (
              <span className="text-muted-foreground">{t("admin.ai.noToken")}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="token">
              {settings?.tokenSet ? t("admin.ai.replaceToken") : t("admin.ai.setToken")}
            </Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              value={token}
              disabled={clearToken}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("admin.ai.tokenPlaceholder")}
              className="font-mono text-[13px]"
            />
            <p className="text-xs text-muted-foreground">{t("admin.ai.tokenHelp")}</p>
          </div>

          {settings?.tokenSet && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clearToken}
                onChange={(e) => {
                  setClearToken(e.target.checked);
                  if (e.target.checked) setToken("");
                }}
                className="size-4 accent-[var(--brand)]"
              />
              {t("admin.ai.removeToken")}
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("admin.confluence.limits")}
          </CardTitle>
          <CardDescription>{t("admin.confluence.limitsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="maxPages">{t("admin.confluence.maxPages")}</Label>
            <Input
              id="maxPages"
              type="number"
              min={1}
              max={5}
              value={form.maxPages}
              onChange={(e) => set("maxPages", Number(e.target.value))}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxChars">{t("admin.confluence.maxChars")}</Label>
            <Input
              id="maxChars"
              type="number"
              min={500}
              max={20000}
              step={500}
              value={form.maxCharsPerPage}
              onChange={(e) => set("maxCharsPerPage", Number(e.target.value))}
              className="tnum"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.ai.testTitle")}</CardTitle>
          <CardDescription>{t("admin.confluence.testDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="mr-2 h-4 w-4" />
            )}
            {t("admin.ai.runTest")}
          </Button>

          {result && (
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                result.ok
                  ? "border-risk-fresh/40 bg-risk-fresh-surface"
                  : "border-risk-critical/40 bg-risk-critical-surface",
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-risk-fresh" />
                ) : (
                  <XCircle className="h-4 w-4 text-risk-critical" />
                )}
                {result.ok ? t("admin.ai.testPassed") : t("admin.ai.testFailed")}
              </div>
              <p className="mt-2 break-words text-muted-foreground">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="font-mono text-[10.5px] text-muted-foreground">
          {t(`admin.ai.source.${form.source}`)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setForm(settings);
              setToken("");
              setClearToken(false);
            }}
            disabled={!dirty || saving}
          >
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
