import { createChildLogger } from "@/lib/logger";

const logger = createChildLogger("confluence-client");

/**
 * Reads the specification pages a Jira ticket links to.
 *
 * A go-live pentest ticket is usually two lines and a Confluence link; the link
 * is where the actual change is described. Without it the platform is sizing and
 * scoping work from a title, which is the whole reason ticket triage was
 * unreliable to begin with.
 */

export interface ConfluenceConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  url: string;
  /** Body converted to plain text, truncated to keep prompts bounded. */
  text: string;
}

/** Confluence Cloud page URLs come in several shapes; all carry the id. */
const PAGE_ID_PATTERNS = [
  /\/pages\/(\d+)/, //           /wiki/spaces/KEY/pages/12345/Title
  /pageId=(\d+)/, //             /wiki/pages/viewpage.action?pageId=12345
  /\/content\/(\d+)/, //         REST-style links pasted by hand
];

/** Recognises a Confluence link without needing the tenant to be configured. */
export function extractConfluenceLinks(text: string | null | undefined): string[] {
  if (!text) return [];

  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  const seen = new Set<string>();

  for (const raw of urls) {
    // Trailing punctuation from prose: "see https://…/pages/123." or "(…)"
    const url = raw.replace(/[.,;:]+$/, "");
    const looksConfluence = /\/wiki\/|confluence|\/pages\/\d+|pageId=\d+/i.test(url);
    if (looksConfluence) seen.add(url);
  }

  return [...seen];
}

export function pageIdFromUrl(url: string): string | null {
  for (const pattern of PAGE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Confluence storage format is XHTML. Only the prose matters for triage, so
 * tags are stripped rather than parsed — a dependency-free conversion that is
 * good enough for a model to read and cheap enough to run per ticket.
 */
export function storageToText(storage: string): string {
  return storage
    .replace(/<ac:structured-macro[^>]*ac:name="code"[\s\S]*?<\/ac:structured-macro>/gi, " [code block] ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|h4|li|tr|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class ConfluenceClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: ConfluenceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  }

  /**
   * Fetch one page by its link. Returns null rather than throwing: a broken or
   * permission-denied link should degrade triage, never fail the sync.
   */
  async fetchPage(url: string, maxChars = 6000, timeoutMs = 12_000): Promise<ConfluencePage | null> {
    const pageId = pageIdFromUrl(url);
    if (!pageId) {
      logger.debug({ url }, "No Confluence page id in link");
      return null;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`,
        {
          headers: { Authorization: this.authHeader, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        }
      );

      if (!response.ok) {
        logger.warn({ pageId, status: response.status }, "Confluence page fetch failed");
        return null;
      }

      const page = (await response.json()) as {
        id: string;
        title: string;
        body?: { storage?: { value?: string } };
      };

      const text = storageToText(page.body?.storage?.value ?? "");
      return {
        id: page.id,
        title: page.title,
        url,
        text: text.slice(0, maxChars),
      };
    } catch (error) {
      logger.warn({ url, error: (error as Error).message }, "Confluence page fetch errored");
      return null;
    }
  }

  async testConnection(timeoutMs = 12_000): Promise<{ ok: boolean; message: string; status?: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/wiki/api/v2/spaces?limit=1`, {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          status: response.status,
          message:
            response.status === 401 || response.status === 403
              ? "Confluence rejected the credentials."
              : `Confluence returned HTTP ${response.status}. ${body.slice(0, 160)}`,
        };
      }

      return { ok: true, status: response.status, message: "Connected to Confluence." };
    } catch (error) {
      const err = error as Error;
      return {
        ok: false,
        message:
          err.name === "TimeoutError"
            ? `No response within ${timeoutMs} ms.`
            : `Could not reach Confluence: ${err.message}`,
      };
    }
  }
}
