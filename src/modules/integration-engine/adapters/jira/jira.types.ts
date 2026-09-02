/**
 * Jira REST API v3 types (subset)
 */

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: { name: string; id: string };
    priority?: { name: string; id: string };
    issuetype?: { name: string; id: string };
    assignee?: { emailAddress: string; displayName: string } | null;
    reporter?: { emailAddress: string; displayName: string } | null;
    created?: string;
    updated?: string;
    resolutiondate?: string | null;
    labels?: string[];
    components?: { name: string }[];
    project?: { key: string; name: string };
    [key: string]: unknown;
  };
}

export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  assessmentProject?: string;
  vulnerabilityProject?: string;
  assessmentJql?: string;
  vulnerabilityJql?: string;
  syncIntervalMinutes: number;
  maxResultsPerPage: number;
}
