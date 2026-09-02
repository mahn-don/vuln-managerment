import { JiraClient } from "./jira.client";
import { createChildLogger } from "@/lib/logger";
import type { IntegrationAdapter, ExternalIssueDTO, ConnectionStatus, FetchOptions } from "../adapter.interface";
import type { JiraConfig, JiraIssue } from "./jira.types";

const logger = createChildLogger("jira-adapter");

export class JiraAdapter implements IntegrationAdapter {
  readonly source = "JIRA";
  readonly name = "Jira Cloud";

  private client: JiraClient;
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    this.client = new JiraClient(config);
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      const info = await this.client.testConnection();
      return {
        connected: true,
        message: "Connected successfully",
        serverInfo: info.serverTitle,
      };
    } catch (error) {
      return {
        connected: false,
        message: (error as Error).message,
      };
    }
  }

  async *fetchIssues(options?: FetchOptions): AsyncGenerator<ExternalIssueDTO[]> {
    const maxResults = options?.maxResults || this.config.maxResultsPerPage || 50;
    let jql = options?.jql || "";

    // Add date filter for incremental sync
    if (options?.since) {
      const sinceStr = options.since.toISOString().slice(0, 19).replace("T", " ");
      const dateFilter = `updated >= "${sinceStr}"`;
      jql = jql ? `(${jql}) AND ${dateFilter}` : dateFilter;
    }

    jql += " ORDER BY updated ASC";

    let startAt = 0;
    let total = 0;

    do {
      logger.info({ startAt, jql: jql.substring(0, 100) }, "Fetching Jira issues page");

      const response = await this.client.searchIssues(jql, startAt, maxResults);
      total = response.total;

      const batch = response.issues.map((issue) => this.mapToDTO(issue));
      if (batch.length > 0) {
        yield batch;
      }

      startAt += response.issues.length;
    } while (startAt < total);

    logger.info({ total }, "Jira fetch complete");
  }

  async fetchIssueById(issueKey: string): Promise<ExternalIssueDTO | null> {
    try {
      const issue = await this.client.getIssue(issueKey);
      return this.mapToDTO(issue);
    } catch {
      return null;
    }
  }

  private mapToDTO(issue: JiraIssue): ExternalIssueDTO {
    return {
      sourceId: issue.key,
      source: "JIRA",
      sourceProject: issue.fields.project?.key,
      issueType: issue.fields.issuetype?.name,
      title: issue.fields.summary || "",
      description: issue.fields.description ? String(issue.fields.description) : undefined,
      status: issue.fields.status?.name,
      priority: issue.fields.priority?.name,
      assigneeEmail: issue.fields.assignee?.emailAddress,
      reporterEmail: issue.fields.reporter?.emailAddress,
      labels: issue.fields.labels || [],
      components: (issue.fields.components || []).map((c) => c.name),
      createdDate: issue.fields.created ? new Date(issue.fields.created) : undefined,
      updatedDate: issue.fields.updated ? new Date(issue.fields.updated) : undefined,
      resolvedDate: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : undefined,
      rawData: issue as unknown as Record<string, unknown>,
    };
  }
}
