/**
 * Integration Adapter Interface
 *
 * Each external system (Jira, ServiceNow, etc.) implements this interface
 * to normalize data into the internal domain model.
 */

export interface ExternalIssueDTO {
  sourceId: string;
  source: string;
  sourceProject?: string;
  issueType?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeEmail?: string;
  reporterEmail?: string;
  labels: string[];
  components: string[];
  customFields?: Record<string, unknown>;
  createdDate?: Date;
  updatedDate?: Date;
  resolvedDate?: Date;
  rawData: Record<string, unknown>;
}

export interface ConnectionStatus {
  connected: boolean;
  message: string;
  serverInfo?: string;
}

export interface FetchOptions {
  since?: Date;
  maxResults?: number;
  jql?: string;
}

export interface IntegrationAdapter {
  readonly source: string;
  readonly name: string;

  testConnection(): Promise<ConnectionStatus>;
  fetchIssues(options?: FetchOptions): AsyncGenerator<ExternalIssueDTO[]>;
  fetchIssueById(externalId: string): Promise<ExternalIssueDTO | null>;
}
