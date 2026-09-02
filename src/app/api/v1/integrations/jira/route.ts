import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

export const GET = createHandler(
  async () => {
    const configured = !!(
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN
    );

    return successResponse({
      configured,
      baseUrl: process.env.JIRA_BASE_URL || null,
      assessmentProject: process.env.JIRA_PROJECT_ASSESSMENT || null,
      vulnerabilityProject: process.env.JIRA_PROJECT_VULNERABILITY || null,
      syncIntervalMinutes: parseInt(process.env.JIRA_SYNC_INTERVAL || "15"),
    });
  },
  { permission: Permission.MANAGE_INTEGRATIONS }
);
