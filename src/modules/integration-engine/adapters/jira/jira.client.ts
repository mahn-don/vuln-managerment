import { createChildLogger } from "@/lib/logger";
import type { JiraSearchResponse, JiraIssue, JiraConfig } from "./jira.types";

const logger = createChildLogger("jira-client");

/**
 * Low-level Jira REST API client with rate limiting and retry.
 */
export class JiraClient {
  private baseUrl: string;
  private authHeader: string;
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 600; // ms between requests (~100/min)

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  }

  async searchIssues(jql: string, startAt = 0, maxResults = 50, fields?: string[]): Promise<JiraSearchResponse> {
    const body: Record<string, unknown> = {
      jql,
      startAt,
      maxResults: Math.min(maxResults, 100),
    };
    if (fields) body.fields = fields;

    return this.request<JiraSearchResponse>("POST", "/rest/api/3/search", body);
  }

  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssue> {
    const params = fields ? `?fields=${fields.join(",")}` : "";
    return this.request<JiraIssue>("GET", `/rest/api/3/issue/${issueKey}${params}`);
  }

  async testConnection(): Promise<{ serverTitle: string; baseUrl: string }> {
    const info = await this.request<{ serverTitle: string; baseUrl: string }>(
      "GET",
      "/rest/api/3/serverInfo"
    );
    return info;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.rateLimit();

    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20_000),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "10");
          logger.warn({ retryAfter, attempt }, "Jira rate limited, waiting...");
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Handle auth errors
        if (response.status === 401) {
          throw new Error("Jira authentication failed. Check email and API token.");
        }

        // Handle server errors with retry
        if (response.status >= 500) {
          const backoff = Math.pow(2, attempt) * 1000;
          logger.warn({ status: response.status, attempt, backoff }, "Jira server error, retrying...");
          await this.sleep(backoff);
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Jira API error ${response.status}: ${errorBody.substring(0, 200)}`);
        }

        this.requestCount++;
        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
        if (attempt < 3 && (error as Error).message?.includes("fetch")) {
          // Network error — retry with backoff
          const backoff = Math.pow(2, attempt) * 1000;
          logger.warn({ error: (error as Error).message, attempt, backoff }, "Network error, retrying...");
          await this.sleep(backoff);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
