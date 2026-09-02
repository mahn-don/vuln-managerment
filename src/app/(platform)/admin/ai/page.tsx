"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Sparkles, KeyRound, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * AI provider settings.
 *
 * The endpoint is configurable rather than fixed so the platform can be pointed
 * at an internal LLM gateway instead of the public API — which is how a bank is
 * likely to run it. The token is write-only: the screen is told whether one is
 * set and shown a masked hint, never the value, so opening this page cannot
 * disclose the credential.
 */

interface Settings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiVersion: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  source: "database" | "environment" | "default";
  tokenSet: boolean;
  tokenHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface TestResult {
  ok: boolean;
  stage: "configuration" | "network" | "provider";
  status?: number;
  latencyMs?: number;
  model?: string;
  reply?: string | null;
  tokensUsed?: number;
  message: string;
}

export default function AiSettingsPage() {
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
      const res = await fetch("/api/v1/settings/ai");
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setSettings(json.data);
      setForm(json.data);
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.ai.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  /** Only send a token when one was typed, or when clearing was asked for. */
  function tokenPayload() {
    if (clearToken) return { apiToken: "" };
    if (token.trim()) return { apiToken: token.trim() };
    return {};
  }

  async function save() {
    if (!form) return;
    try {
      setSaving(true);
      const res = await fetch("/api/v1/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          baseUrl: form.baseUrl,
          model: form.model,
          apiVersion: form.apiVersion,
          maxTokens: Number(form.maxTokens),
          temperature: Number(form.temperature),
          timeoutMs: Number(form.timeoutMs),
          ...tokenPayload(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setSettings(json.data);
      setForm(json.data);
      setToken("");
      setClearToken(false);
      toast.success(t("admin.ai.saved"));
    } catch (error) {
      toast.error(String((error as Error).message || t("admin.ai.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  /** Tests what is on screen, so a configuration can be proven before saving. */
  async function test() {
    if (!form) return;
    try {
      setTesting(true);
      setResult(null);
      const res = await fetch("/api/v1/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: form.baseUrl,
          model: form.model,
          apiVersion: form.apiVersion,
          timeoutMs: Number(form.timeoutMs),
          ...(token.trim() ? { apiToken: token.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      setResult(json.data);
    } catch (error) {
      setResult({ ok: false, stage: "network", message: String((error as Error).message) });
    } finally {
      setTesting(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const dirty =
    settings !== null &&
    (form.enabled !== settings.enabled ||
      form.baseUrl !== settings.baseUrl ||
      form.model !== settings.model ||
      form.apiVersion !== settings.apiVersion ||
      Number(form.maxTokens) !== settings.maxTokens ||
      Number(form.temperature) !== settings.temperature ||
      Number(form.timeoutMs) !== settings.timeoutMs ||
      token.trim() !== "" ||
      clearToken);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.ai.title")}</h1>
          <p className="text-muted-foreground">{t("admin.ai.description")}</p>
        </div>
        <Badge variant={form.enabled ? "default" : "outline"}>
          {form.enabled ? t("admin.ai.enabled") : t("admin.ai.disabled")}
        </Badge>
      </div>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" />
            {t("admin.ai.connection")}
          </CardTitle>
          <CardDescription>{t("admin.ai.connectionDesc")}</CardDescription>
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
              <span className="block text-sm font-medium">{t("admin.ai.enableLabel")}</span>
              <span className="block text-sm text-muted-foreground">{t("admin.ai.enableHelp")}</span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">{t("admin.ai.endpoint")}</Label>
            <Input
              id="baseUrl"
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://api.anthropic.com/v1/messages"
              className="font-mono text-[13px]"
            />
            <p className="text-xs text-muted-foreground">{t("admin.ai.endpointHelp")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="model">{t("admin.ai.model")}</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                className="font-mono text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiVersion">{t("admin.ai.apiVersion")}</Label>
              <Input
                id="apiVersion"
                value={form.apiVersion}
                onChange={(e) => set("apiVersion", e.target.value)}
                className="font-mono text-[13px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credential */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("admin.ai.credential")}
          </CardTitle>
          <CardDescription>{t("admin.ai.credentialDesc")}</CardDescription>
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

      {/* Request limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("admin.ai.limits")}
          </CardTitle>
          <CardDescription>{t("admin.ai.limitsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="maxTokens">{t("admin.ai.maxTokens")}</Label>
            <Input
              id="maxTokens"
              type="number"
              min={64}
              max={200000}
              value={form.maxTokens}
              onChange={(e) => set("maxTokens", Number(e.target.value))}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="temperature">{t("admin.ai.temperature")}</Label>
            <Input
              id="temperature"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeoutMs">{t("admin.ai.timeout")}</Label>
            <Input
              id="timeoutMs"
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={form.timeoutMs}
              onChange={(e) => set("timeoutMs", Number(e.target.value))}
              className="tnum"
            />
          </div>
        </CardContent>
      </Card>

      {/* Test */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.ai.testTitle")}</CardTitle>
          <CardDescription>{t("admin.ai.testDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
            {t("admin.ai.runTest")}
          </Button>

          {result && (
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                result.ok
                  ? "border-risk-ok/40 bg-risk-ok/8"
                  : "border-risk-critical/40 bg-risk-critical-surface"
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-risk-ok" />
                ) : (
                  <XCircle className="h-4 w-4 text-risk-critical" />
                )}
                {result.ok ? t("admin.ai.testPassed") : t("admin.ai.testFailed")}
                <Badge variant="outline" className="ml-1 text-[10px] uppercase">
                  {t(`admin.ai.stage.${result.stage}`)}
                </Badge>
              </div>

              <p className="mt-2 break-words text-muted-foreground">{result.message}</p>

              <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                {result.status !== undefined && (
                  <Row label={t("admin.ai.httpStatus")} value={String(result.status)} />
                )}
                {result.latencyMs !== undefined && (
                  <Row label={t("admin.ai.latency")} value={`${result.latencyMs} ms`} />
                )}
                {result.model && <Row label={t("admin.ai.modelUsed")} value={result.model} />}
                {result.tokensUsed !== undefined && (
                  <Row label={t("admin.ai.tokensUsed")} value={String(result.tokensUsed)} />
                )}
                {result.reply && <Row label={t("admin.ai.reply")} value={result.reply} />}
              </dl>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="font-mono text-[10.5px] text-muted-foreground">
          {t(`admin.ai.source.${form.source}`)}
          {settings?.updatedAt
            ? ` · ${t("admin.ai.updated", {
                when: new Date(settings.updatedAt).toLocaleString(),
                who: settings.updatedBy ?? "—",
              })}`
            : ""}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words font-mono">{value}</dd>
    </div>
  );
}
