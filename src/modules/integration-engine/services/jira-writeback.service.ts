import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { createChildLogger } from "@/lib/logger";
import { JiraClient } from "../adapters/jira/jira.client";
import type { Prisma } from "@/generated/prisma";

const logger = createChildLogger("jira-writeback");

type WritebackAction = "assign" | "comment" | "status_change";

interface WritebackPayload {
  assign?: { accountId?: string; email?: string };
  comment?: { body: string };
  statusChange?: { targetStatus: string; transitionId?: string };
}

class JiraWritebackService {
  /**
   * Queue a write-back action for approval.
   */
  async queueAction(
    externalIssueId: string,
    action: WritebackAction,
    payload: WritebackPayload,
    requestedById: string
  ) {
    const entry = await prisma.jiraWritebackQueue.create({
      data: {
        externalIssueId,
        action,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
        requestedById,
      },
    });

    await auditService.log({
      userId: requestedById,
      action: `jira.writeback.queued`,
      entityType: "writeback",
      entityId: entry.id,
      details: { externalIssueId, action },
    });

    return entry;
  }

  /**
   * Approve a queued write-back action.
   */
  async approve(writebackId: string, approvedById: string) {
    const entry = await prisma.jiraWritebackQueue.findUnique({ where: { id: writebackId } });
    if (!entry) throw new Error("Writeback entry not found");
    if (entry.status !== "PENDING") throw new Error(`Cannot approve entry in '${entry.status}' status`);

    await prisma.jiraWritebackQueue.update({
      where: { id: writebackId },
      data: { status: "APPROVED", approvedById, approvedAt: new Date() },
    });

    // Execute immediately after approval
    await this.execute(writebackId);

    await auditService.log({
      userId: approvedById,
      action: "jira.writeback.approved",
      entityType: "writeback",
      entityId: writebackId,
    });
  }

  /**
   * Reject a queued write-back action.
   */
  async reject(writebackId: string, rejectedById: string) {
    await prisma.jiraWritebackQueue.update({
      where: { id: writebackId },
      data: { status: "REJECTED" },
    });

    await auditService.log({
      userId: rejectedById,
      action: "jira.writeback.rejected",
      entityType: "writeback",
      entityId: writebackId,
    });
  }

  /**
   * Execute an approved write-back action against Jira.
   */
  private async execute(writebackId: string) {
    const entry = await prisma.jiraWritebackQueue.findUnique({
      where: { id: writebackId },
    });

    if (!entry) return;

    // Look up the external issue to get the Jira key
    const externalIssue = await prisma.externalIssue.findUnique({
      where: { id: entry.externalIssueId },
      select: { sourceId: true },
    });

    if (!externalIssue) {
      await prisma.jiraWritebackQueue.update({
        where: { id: writebackId },
        data: { status: "FAILED", error: "External issue not found" },
      });
      return;
    }

    const config = this.getJiraConfig();
    if (!config) {
      await prisma.jiraWritebackQueue.update({
        where: { id: writebackId },
        data: { status: "FAILED", error: "Jira not configured" },
      });
      return;
    }

    await prisma.jiraWritebackQueue.update({
      where: { id: writebackId },
      data: { status: "EXECUTING" },
    });

    try {
      const client = new JiraClient(config);
      const issueKey = externalIssue.sourceId;
      const payload = entry.payload as WritebackPayload;

      if (entry.action === "comment" && payload.comment) {
        await this.addJiraComment(client, issueKey, payload.comment.body);
      } else if (entry.action === "assign" && payload.assign) {
        await this.assignJiraIssue(client, issueKey, payload.assign);
      }
      // status_change would require Jira transition API — more complex

      await prisma.jiraWritebackQueue.update({
        where: { id: writebackId },
        data: { status: "COMPLETED", executedAt: new Date() },
      });

      logger.info({ writebackId, action: entry.action, issueKey }, "Writeback executed");
    } catch (error) {
      const retryCount = entry.retryCount + 1;
      await prisma.jiraWritebackQueue.update({
        where: { id: writebackId },
        data: {
          status: retryCount >= 3 ? "FAILED" : "APPROVED",
          error: (error as Error).message,
          retryCount,
        },
      });
      logger.error({ writebackId, error: (error as Error).message }, "Writeback failed");
    }
  }

  private async addJiraComment(client: JiraClient, issueKey: string, body: string) {
    const config = this.getJiraConfig()!;
    const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Failed to add comment: ${res.status}`);
  }

  private async assignJiraIssue(client: JiraClient, issueKey: string, assign: { accountId?: string; email?: string }) {
    const config = this.getJiraConfig()!;
    const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}/assignee`;
    const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountId: assign.accountId }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Failed to assign: ${res.status}`);
  }

  async getPendingActions(page: number, limit: number) {
    const [items, total] = await Promise.all([
      prisma.jiraWritebackQueue.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jiraWritebackQueue.count({ where: { status: "PENDING" } }),
    ]);
    return { items, total };
  }

  private getJiraConfig() {
    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    if (!baseUrl || !email || !apiToken) return null;
    return { baseUrl, email, apiToken, assessmentProject: "", vulnerabilityProject: "", assessmentJql: "", vulnerabilityJql: "", syncIntervalMinutes: 15, maxResultsPerPage: 50 };
  }
}

export const jiraWritebackService = new JiraWritebackService();
