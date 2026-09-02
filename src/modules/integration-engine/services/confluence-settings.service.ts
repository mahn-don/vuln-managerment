import { z } from "zod/v4";
import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/secret-box";
import { ConfluenceClient, type ConfluenceConfig } from "../adapters/confluence/confluence.client";
import type { Prisma } from "@/generated/prisma";

/**
 * Confluence credentials, held in the database like the AI provider settings.
 *
 * Kept separate from the Jira configuration even though both are usually the
 * same Atlassian tenant: the token may differ, and a deployment can perfectly
 * well sync Jira without ever reading Confluence.
 */

export const SETTING_KEY = "integration.confluence";

const fields = {
  enabled: z.boolean(),
  baseUrl: z.url().max(500),
  email: z.email().max(255),
  /** How many linked pages one ticket may pull, to bound cost and latency. */
  maxPages: z.number().int().min(1).max(5),
  maxCharsPerPage: z.number().int().min(500).max(20_000),
};

export const confluenceSettingsSchema = z.object({
  enabled: fields.enabled.default(false),
  baseUrl: fields.baseUrl.default("https://your-tenant.atlassian.net"),
  email: fields.email.default("service-account@bank.example"),
  maxPages: fields.maxPages.default(3),
  maxCharsPerPage: fields.maxCharsPerPage.default(6000),
  /** Omitted means keep the stored token; empty string clears it. */
  apiToken: z.string().max(500).optional(),
});

/** No defaults, so testing saved settings cannot silently substitute them. */
export const confluenceTestSchema = z.object({
  enabled: fields.enabled.optional(),
  baseUrl: fields.baseUrl.optional(),
  email: fields.email.optional(),
  maxPages: fields.maxPages.optional(),
  maxCharsPerPage: fields.maxCharsPerPage.optional(),
  apiToken: z.string().max(500).optional(),
});

export type ConfluenceSettingsInput = z.infer<typeof confluenceSettingsSchema>;

export interface ConfluenceSettings extends Omit<ConfluenceSettingsInput, "apiToken"> {
  apiToken: string | null;
  source: "database" | "environment" | "default";
}

export interface RedactedConfluenceSettings extends Omit<ConfluenceSettings, "apiToken"> {
  tokenSet: boolean;
  tokenHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULTS: Omit<ConfluenceSettingsInput, "apiToken"> = {
  enabled: false,
  baseUrl: "https://your-tenant.atlassian.net",
  email: "service-account@bank.example",
  maxPages: 3,
  maxCharsPerPage: 6000,
};

const CACHE_MS = 30_000;
let cache: { value: ConfluenceSettings; at: number } | null = null;

class ConfluenceSettingsService {
  async get(): Promise<ConfluenceSettings> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const value = row ? this.fromRow(row.value) : this.fromEnvironment();

    cache = { value, at: Date.now() };
    return value;
  }

  invalidate() {
    cache = null;
  }

  async getRedacted(): Promise<RedactedConfluenceSettings> {
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

  async save(input: ConfluenceSettingsInput, userId: string): Promise<RedactedConfluenceSettings> {
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
      email: input.email,
      maxPages: input.maxPages,
      maxCharsPerPage: input.maxCharsPerPage,
      apiToken: token ? encryptSecret(token) : null,
    };

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: stored as Prisma.InputJsonValue, updatedById: userId },
      create: {
        key: SETTING_KEY,
        value: stored as Prisma.InputJsonValue,
        description: "Confluence base URL and credentials for reading linked specifications",
        updatedById: userId,
      },
    });

    this.invalidate();

    await auditService.log({
      userId,
      action: "settings.confluence_update",
      entityType: "setting",
      details: {
        key: SETTING_KEY,
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        tokenChanged: input.apiToken !== undefined,
        tokenSet: Boolean(token),
      },
    });

    return this.getRedacted();
  }

  /** A ready client, or null when Confluence is off or not fully configured. */
  async client(): Promise<{ client: ConfluenceClient; settings: ConfluenceSettings } | null> {
    const settings = await this.get();
    if (!settings.enabled || !settings.apiToken || !settings.baseUrl || !settings.email) return null;

    const config: ConfluenceConfig = {
      baseUrl: settings.baseUrl,
      email: settings.email,
      apiToken: settings.apiToken,
    };
    return { client: new ConfluenceClient(config), settings };
  }

  async test(override?: Partial<ConfluenceSettingsInput>) {
    const stored = await this.get();
    const baseUrl = override?.baseUrl ?? stored.baseUrl;
    const email = override?.email ?? stored.email;
    const token =
      override?.apiToken && override.apiToken.trim() !== "" ? override.apiToken.trim() : stored.apiToken;

    if (!token) return { ok: false, message: "No API token is configured." };
    if (!baseUrl) return { ok: false, message: "No Confluence URL is configured." };

    const client = new ConfluenceClient({ baseUrl, email, apiToken: token });
    return client.testConnection();
  }

  private fromEnvironment(): ConfluenceSettings {
    // Falls back to the Jira credentials, which in practice are the same
    // Atlassian account, so an existing deployment needs no new secrets.
    const token = process.env.CONFLUENCE_API_TOKEN ?? process.env.JIRA_API_TOKEN ?? null;
    const baseUrl = process.env.CONFLUENCE_BASE_URL || process.env.JIRA_BASE_URL || DEFAULTS.baseUrl;
    const email = process.env.CONFLUENCE_EMAIL || process.env.JIRA_EMAIL || DEFAULTS.email;

    return {
      ...DEFAULTS,
      enabled: process.env.CONFLUENCE_ENABLED === "true" && Boolean(token),
      baseUrl,
      email,
      apiToken: token,
      source: token ? "environment" : "default",
    };
  }

  private fromRow(value: unknown): ConfluenceSettings {
    const row = (value ?? {}) as Record<string, unknown>;
    const num = (key: string, fallback: number) =>
      typeof row[key] === "number" ? (row[key] as number) : fallback;

    return {
      enabled: Boolean(row.enabled),
      baseUrl: typeof row.baseUrl === "string" ? row.baseUrl : DEFAULTS.baseUrl,
      email: typeof row.email === "string" ? row.email : DEFAULTS.email,
      maxPages: num("maxPages", DEFAULTS.maxPages),
      maxCharsPerPage: num("maxCharsPerPage", DEFAULTS.maxCharsPerPage),
      apiToken: decryptSecret(row.apiToken as string | null),
      source: "database",
    };
  }
}

export const confluenceSettingsService = new ConfluenceSettingsService();
