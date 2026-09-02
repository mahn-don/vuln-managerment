import { z } from "zod/v4";
import { prisma } from "@/lib/db/prisma";
import { auditService } from "./audit.service";
import { createChildLogger } from "@/lib/logger";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/secret-box";
import { ValidationError } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma";

const logger = createChildLogger("ai-settings");

/**
 * AI provider configuration, held in the database and editable by an
 * administrator.
 *
 * It previously lived only in environment variables, which meant a redeploy to
 * change the model or rotate a token, no record of who changed it, and no way to
 * point the platform at an internal LLM gateway. The environment is still read
 * as a fallback so existing deployments keep working untouched.
 */

export const SETTING_KEY = "ai.provider";

/**
 * Hosts the provider endpoint may never point at.
 *
 * The endpoint is administrator-supplied and the platform then makes a server
 * side request to it and reports the outcome — which is a request-forgery
 * primitive if left unbounded. Pointing at an internal LLM gateway is the whole
 * reason the field exists, so private ranges stay allowed; what is refused is
 * the cloud metadata service and loopback, where the only thing to reach is the
 * platform's own credentials or itself.
 */
const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

/** Link-local, which is where metadata services live on every cloud. */
const LINK_LOCAL = /^(169\.254\.|fe80:)/i;
const LOOPBACK = /^(127\.|::1$|0\.0\.0\.0$)/;

export function assertUsableEndpoint(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError("The endpoint must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ValidationError("The endpoint must use http or https.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(host) || LINK_LOCAL.test(host)) {
    throw new ValidationError("That address is not a permitted provider endpoint.");
  }

  const isLocal = LOOPBACK.test(host) || host === "localhost";

  // Plain http and loopback are development conveniences. In production an
  // internal gateway is still expected to present TLS, and an endpoint pointing
  // at the platform's own host has no legitimate use.
  if (process.env.NODE_ENV === "production") {
    if (isLocal) {
      throw new ValidationError("The endpoint may not point at the platform itself.");
    }
    if (url.protocol !== "https:") {
      throw new ValidationError("The endpoint must use https.");
    }
  }
}

/** Field rules, declared once so save and test cannot drift apart. */
const fields = {
  enabled: z.boolean(),
  /** Full messages endpoint, so an internal gateway or proxy can be used. */
  baseUrl: z.url().max(500),
  model: z.string().min(1).max(100),
  apiVersion: z.string().min(1).max(40),
  maxTokens: z.number().int().min(64).max(200_000),
  temperature: z.number().min(0).max(1),
  timeoutMs: z.number().int().min(1_000).max(120_000),
};

/** Kept deliberately small: what actually has to be configurable per deployment. */
export const aiSettingsSchema = z.object({
  enabled: fields.enabled.default(false),
  baseUrl: fields.baseUrl.default("https://api.anthropic.com/v1/messages"),
  model: fields.model.default("claude-sonnet-4-6"),
  apiVersion: fields.apiVersion.default("2023-06-01"),
  maxTokens: fields.maxTokens.default(1024),
  temperature: fields.temperature.default(0.2),
  timeoutMs: fields.timeoutMs.default(15_000),
  /** Omitted on save means "keep the stored token"; empty string clears it. */
  apiToken: z.string().max(500).optional(),
});

/**
 * What the Test button may override — the same fields, but with no defaults.
 *
 * Deriving this with .partial() looked equivalent and was not: Zod still applies
 * a field's default when the key is absent, so testing a saved configuration
 * with an empty body silently swapped the stored endpoint for the public one and
 * reported on a provider the deployment does not use.
 */
export const aiSettingsTestSchema = z.object({
  enabled: fields.enabled.optional(),
  baseUrl: fields.baseUrl.optional(),
  model: fields.model.optional(),
  apiVersion: fields.apiVersion.optional(),
  maxTokens: fields.maxTokens.optional(),
  temperature: fields.temperature.optional(),
  timeoutMs: fields.timeoutMs.optional(),
  apiToken: z.string().max(500).optional(),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export interface AiSettings extends Omit<AiSettingsInput, "apiToken"> {
  apiToken: string | null;
  source: "database" | "environment" | "default";
}

/** What the settings screen is allowed to see — never the token itself. */
export interface RedactedAiSettings extends Omit<AiSettings, "apiToken"> {
  tokenSet: boolean;
  tokenHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULTS: Omit<AiSettingsInput, "apiToken"> = {
  enabled: false,
  baseUrl: "https://api.anthropic.com/v1/messages",
  model: "claude-sonnet-4-6",
  apiVersion: "2023-06-01",
  maxTokens: 1024,
  temperature: 0.2,
  timeoutMs: 15_000,
};

/**
 * Briefly cached: triage reads this once per ticket, and a settings row that
 * changes a few times a year should not become a query per AI call.
 */
const CACHE_MS = 30_000;
let cache: { value: AiSettings; at: number } | null = null;

class AiSettingsService {
  /** Full settings including the decrypted token. Server-side callers only. */
  async get(): Promise<AiSettings> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const value = row ? await this.fromRow(row.value) : this.fromEnvironment();

    cache = { value, at: Date.now() };
    return value;
  }

  /** Drop the cache so a save takes effect on the next call rather than in 30s. */
  invalidate() {
    cache = null;
  }

  /** The view the settings screen receives. */
  async getRedacted(): Promise<RedactedAiSettings> {
    const [settings, row] = await Promise.all([
      this.get(),
      prisma.systemSetting.findUnique({
        where: { key: SETTING_KEY },
        include: { updatedBy: { select: { displayName: true } } },
      }),
    ]);

    const { apiToken, ...rest } = settings;
    return {
      ...rest,
      tokenSet: Boolean(apiToken),
      tokenHint: maskSecret(apiToken),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy?.displayName ?? null,
    };
  }

  /**
   * Save the configuration.
   *
   * The token is only rewritten when one is supplied: the screen never receives
   * the stored value, so it cannot send it back, and an absent field must mean
   * "leave it alone" rather than "clear it". An explicit empty string clears it.
   */
  async save(input: AiSettingsInput, userId: string): Promise<RedactedAiSettings> {
    assertUsableEndpoint(input.baseUrl);
    const current = await this.get();

    const token =
      input.apiToken === undefined
        ? current.apiToken
        : input.apiToken.trim() === ""
          ? null
          : input.apiToken.trim();

    const stored = {
      enabled: input.enabled,
      baseUrl: input.baseUrl,
      model: input.model,
      apiVersion: input.apiVersion,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      timeoutMs: input.timeoutMs,
      apiToken: token ? encryptSecret(token) : null,
    };

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: stored as Prisma.InputJsonValue, updatedById: userId },
      create: {
        key: SETTING_KEY,
        value: stored as Prisma.InputJsonValue,
        description: "AI provider endpoint, model and credentials",
        updatedById: userId,
      },
    });

    this.invalidate();

    // The token itself is never audited — only whether it changed.
    // entityId is a uuid column, so the settings key travels in the details.
    await auditService.log({
      userId,
      action: "settings.ai_update",
      entityType: "setting",
      details: {
        key: SETTING_KEY,
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        model: input.model,
        tokenChanged: input.apiToken !== undefined,
        tokenSet: Boolean(token),
      },
    });

    logger.info({ enabled: input.enabled, model: input.model }, "AI settings updated");
    return this.getRedacted();
  }

  /**
   * Send one minimal request to the configured provider and report what came
   * back. Used by the Test button, and callable with unsaved form values so a
   * configuration can be proven before it is committed.
   */
  async test(override?: Partial<AiSettingsInput>): Promise<TestResult> {
    const stored = await this.get();
    const config = { ...stored, ...stripUndefined(override ?? {}) };
    const token =
      override?.apiToken && override.apiToken.trim() !== ""
        ? override.apiToken.trim()
        : stored.apiToken;

    if (!token) {
      return { ok: false, stage: "configuration", message: "No API token is configured." };
    }
    if (!config.baseUrl) {
      return { ok: false, stage: "configuration", message: "No endpoint URL is configured." };
    }
    try {
      assertUsableEndpoint(config.baseUrl);
    } catch (error) {
      return { ok: false, stage: "configuration", message: (error as Error).message };
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": token,
          "anthropic-version": config.apiVersion,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with the single word: ready" }],
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      const latencyMs = Date.now() - startedAt;
      const body = await response.text();

      if (!response.ok) {
        return {
          ok: false,
          stage: "provider",
          status: response.status,
          latencyMs,
          // Provider errors name the problem (bad key, unknown model, rate
          // limit); passing it through is what makes the test useful. Truncated
          // so a large HTML error page cannot fill the screen.
          message: summarise(body, response.status),
        };
      }

      const parsed = JSON.parse(body) as {
        model?: string;
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      return {
        ok: true,
        stage: "provider",
        status: response.status,
        latencyMs,
        model: parsed.model ?? config.model,
        reply: parsed.content?.find((b) => b.type === "text")?.text?.trim().slice(0, 120) ?? null,
        tokensUsed: (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0),
        message: "The provider responded successfully.",
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const err = error as Error;
      const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
      return {
        ok: false,
        stage: "network",
        latencyMs,
        message: timedOut
          ? `No response within ${config.timeoutMs} ms.`
          : `Could not reach the endpoint: ${err.message}`,
      };
    }
  }

  /** Environment fallback, so deployments configured the old way keep working. */
  private fromEnvironment(): AiSettings {
    const token = process.env.ANTHROPIC_API_KEY ?? null;
    return {
      ...DEFAULTS,
      enabled: process.env.AI_EXTERNAL_PROCESSING_ENABLED === "true" && Boolean(token),
      baseUrl: process.env.ANTHROPIC_BASE_URL || DEFAULTS.baseUrl,
      model: process.env.ANTHROPIC_MODEL || DEFAULTS.model,
      apiToken: token,
      source: token ? "environment" : "default",
    };
  }

  private async fromRow(value: unknown): Promise<AiSettings> {
    const row = (value ?? {}) as Record<string, unknown>;
    const num = (key: string, fallback: number) =>
      typeof row[key] === "number" ? (row[key] as number) : fallback;

    return {
      enabled: Boolean(row.enabled),
      baseUrl: typeof row.baseUrl === "string" ? row.baseUrl : DEFAULTS.baseUrl,
      model: typeof row.model === "string" ? row.model : DEFAULTS.model,
      apiVersion: typeof row.apiVersion === "string" ? row.apiVersion : DEFAULTS.apiVersion,
      maxTokens: num("maxTokens", DEFAULTS.maxTokens),
      temperature: num("temperature", DEFAULTS.temperature),
      timeoutMs: num("timeoutMs", DEFAULTS.timeoutMs),
      apiToken: decryptSecret(row.apiToken as string | null),
      source: "database",
    };
  }
}

export interface TestResult {
  ok: boolean;
  /** Where it got to: bad configuration, unreachable endpoint, or a provider reply. */
  stage: "configuration" | "network" | "provider";
  status?: number;
  latencyMs?: number;
  model?: string;
  reply?: string | null;
  tokensUsed?: number;
  message: string;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Report what the provider said, without turning the Test button into a way to
 * read arbitrary internal HTTP responses.
 *
 * A well-formed provider error is quoted because that is what makes the test
 * useful — "invalid x-api-key", "model not found". Anything else (an HTML error
 * page, a login form, some unrelated internal service) is reduced to its status
 * so the response body of a non-provider host is never echoed back.
 */
function summarise(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message.slice(0, 300);
    }
  } catch {
    // Not JSON, so not a provider error shape.
  }
  return `The endpoint returned HTTP ${status} and did not look like a provider response.`;
}

export const aiSettingsService = new AiSettingsService();
