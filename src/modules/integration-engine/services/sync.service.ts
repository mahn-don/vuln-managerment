import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { createChildLogger } from "@/lib/logger";
import { JiraAdapter } from "../adapters/jira/jira.adapter";
import type { ExternalIssueDTO } from "../adapters/adapter.interface";
import type { JiraConfig } from "../adapters/jira/jira.types";
import type { Prisma } from "@/generated/prisma";

const logger = createChildLogger("sync-service");

/** Order-insensitive comparison for Jira's label and component arrays. */
export function sameStrings(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

export type SyncType = "ASSESSMENT" | "VULNERABILITY" | "FULL";
export type SyncTrigger = "SCHEDULED" | "MANUAL" | "WEBHOOK";

class SyncService {
  /**
   * Run a Jira sync for assessments, vulnerabilities, or both.
   */
  async runSync(
    syncType: SyncType,
    trigger: SyncTrigger,
    userId?: string
  ): Promise<{ fetched: number; created: number; updated: number; errors: number; triagePending: number }> {
    const config = this.getJiraConfig();
    if (!config) throw new Error("Jira integration is not configured");

    const adapter = new JiraAdapter(config);

    // Create sync history record
    const syncRecord = await prisma.jiraSyncHistory.create({
      data: {
        syncType,
        status: "STARTED",
        trigger: trigger,
        startedAt: new Date(),
      },
    });

    let triagePending = 0;
    let totalFetched = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const syncErrors: { issueKey: string; error: string }[] = [];

    try {
      // Get the last sync watermark
      const lastSync = await prisma.jiraSyncHistory.findFirst({
        where: {
          syncType,
          status: "COMPLETED",
          id: { not: syncRecord.id },
        },
        orderBy: { completedAt: "desc" },
      });

      const since = lastSync?.lastIssueUpdatedAt || lastSync?.completedAt || undefined;

      // Determine JQL based on sync type
      let jql: string;
      if (syncType === "ASSESSMENT") {
        jql = config.assessmentJql || `project = "${config.assessmentProject}"`;
      } else if (syncType === "VULNERABILITY") {
        jql = config.vulnerabilityJql || `project = "${config.vulnerabilityProject}"`;
      } else {
        // Full sync
        const projects = [config.assessmentProject, config.vulnerabilityProject].filter(Boolean);
        jql = `project IN (${projects.map((p) => `"${p}"`).join(", ")})`;
      }

      // Fetch and process issues
      let latestUpdatedAt: Date | undefined;

      for await (const batch of adapter.fetchIssues({ since, jql })) {
        totalFetched += batch.length;

        try {
          // Batch lookup: find all existing issues for this batch
          const sourceIds = batch.map((dto) => dto.sourceId);
          const existingIssues = await prisma.externalIssue.findMany({
            where: { source: "JIRA", sourceId: { in: sourceIds } },
          });
          const existingMap = new Map(existingIssues.map((e) => [e.sourceId, e]));

          const toCreate: typeof batch = [];
          const toUpdate: { dto: ExternalIssueDTO; existingId: string; retriage: boolean }[] = [];

          for (const dto of batch) {
            if (dto.updatedDate && (!latestUpdatedAt || dto.updatedDate > latestUpdatedAt)) {
              latestUpdatedAt = dto.updatedDate;
            }

            const existing = existingMap.get(dto.sourceId);
            if (!existing) {
              toCreate.push(dto);
            } else {
              const hasChanges =
                existing.updatedDate?.getTime() !== dto.updatedDate?.getTime() ||
                existing.status !== dto.status ||
                existing.title !== dto.title ||
                existing.assigneeEmail !== dto.assigneeEmail ||
                existing.priority !== dto.priority;
              if (hasChanges) {
                // Only text a reader would triage on sends the ticket back for
                // analysis. A status or assignee change must not spend an AI call.
                const contentChanged =
                  existing.title !== dto.title ||
                  existing.description !== dto.description ||
                  !sameStrings(existing.labels, dto.labels) ||
                  !sameStrings(existing.components, dto.components);
                toUpdate.push({ dto, existingId: existing.id, retriage: contentChanged });
              }
            }
          }

          // Bulk create new issues
          if (toCreate.length > 0) {
            await prisma.externalIssue.createMany({
              data: toCreate.map((dto) => ({
                source: "JIRA" as const,
                sourceId: dto.sourceId,
                sourceProject: dto.sourceProject,
                issueType: dto.issueType,
                title: dto.title,
                description: dto.description,
                status: dto.status,
                priority: dto.priority,
                assigneeEmail: dto.assigneeEmail,
                reporterEmail: dto.reporterEmail,
                labels: dto.labels,
                components: dto.components,
                customFields: (dto.customFields as Prisma.InputJsonValue) ?? undefined,
                createdDate: dto.createdDate,
                updatedDate: dto.updatedDate,
                resolvedDate: dto.resolvedDate,
                rawData: dto.rawData as Prisma.InputJsonValue,
                syncStatus: "SYNCED",
                lastSyncedAt: new Date(),
              })),
            });
            totalCreated += toCreate.length;
          }

          // Batch updates in a transaction
          if (toUpdate.length > 0) {
            await prisma.$transaction(
              toUpdate.map(({ dto, existingId, retriage }) =>
                prisma.externalIssue.update({
                  where: { id: existingId },
                  data: {
                    ...(retriage ? { triageStatus: "PENDING" as const, triageError: null } : {}),
                    title: dto.title,
                    description: dto.description,
                    status: dto.status,
                    priority: dto.priority,
                    assigneeEmail: dto.assigneeEmail,
                    reporterEmail: dto.reporterEmail,
                    labels: dto.labels,
                    components: dto.components,
                    customFields: (dto.customFields as Prisma.InputJsonValue) ?? undefined,
                    updatedDate: dto.updatedDate,
                    resolvedDate: dto.resolvedDate,
                    rawData: dto.rawData as Prisma.InputJsonValue,
                    syncStatus: "SYNCED",
                    lastSyncedAt: new Date(),
                  },
                })
              )
            );
            totalUpdated += toUpdate.length;
          }
        } catch (error) {
          totalErrors += batch.length;
          for (const dto of batch) {
            syncErrors.push({
              issueKey: dto.sourceId,
              error: (error as Error).message,
            });
          }
          logger.error({ error, batchSize: batch.length }, "Failed to process batch");
        }

        await prisma.jiraSyncHistory.update({
          where: { id: syncRecord.id },
          data: {
            status: "IN_PROGRESS",
            issuesFetched: totalFetched,
            issuesCreated: totalCreated,
            issuesUpdated: totalUpdated,
          },
        });
      }

      // Complete sync
      await prisma.jiraSyncHistory.update({
        where: { id: syncRecord.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          issuesFetched: totalFetched,
          issuesCreated: totalCreated,
          issuesUpdated: totalUpdated,
          errors: syncErrors.length > 0 ? (syncErrors as unknown as Prisma.InputJsonValue) : undefined,
          lastIssueUpdatedAt: latestUpdatedAt,
        },
      });

      // Newly created issues default to PENDING triage, and changed ones were
      // reset above. Ask the triage worker to drain whatever is now waiting.
      triagePending = await this.requestTriage();

      await auditService.log({
        userId,
        action: "jira.sync_completed",
        entityType: "integration",
        source: "SYSTEM",
        details: { syncType, trigger, fetched: totalFetched, created: totalCreated, updated: totalUpdated, errors: totalErrors, triagePending },
      });

      logger.info(
        { syncType, fetched: totalFetched, created: totalCreated, updated: totalUpdated, errors: totalErrors },
        "Jira sync completed"
      );
    } catch (error) {
      await prisma.jiraSyncHistory.update({
        where: { id: syncRecord.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errors: { fatal: (error as Error).message } as unknown as Prisma.InputJsonValue,
        },
      });

      logger.error({ error, syncType }, "Jira sync failed");
      throw error;
    }

    return { fetched: totalFetched, created: totalCreated, updated: totalUpdated, errors: totalErrors, triagePending };
  }

  /**
   * Get sync history
   */
  async getSyncHistory(page: number, limit: number, syncType?: SyncType) {
    const where: Prisma.JiraSyncHistoryWhereInput = {};
    if (syncType) where.syncType = syncType;

    const [items, total] = await Promise.all([
      prisma.jiraSyncHistory.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jiraSyncHistory.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Test Jira connection
   */
  async testConnection() {
    const config = this.getJiraConfig();
    if (!config) throw new Error("Jira integration is not configured");

    const adapter = new JiraAdapter(config);
    return adapter.testConnection();
  }

  /**
   * Hand the triage backlog to the worker.
   *
   * Best effort by design: the backlog is a column on external_issues, not a
   * queue entry, so a Redis outage delays analysis rather than losing it. The
   * repeatable triage schedule picks the same rows up on its next pass.
   */
  private async requestTriage(): Promise<number> {
    const pending = await prisma.externalIssue.count({ where: { triageStatus: "PENDING" } });
    if (pending === 0) return 0;

    try {
      // Imported here, not at module scope: constructing the queue opens a
      // Redis connection, and this service is reachable from the web process
      // where a sync may never run.
      const { ticketTriageQueue } = await import("../workers/queues");
      await ticketTriageQueue.add("drain", { reason: "post-sync" });
    } catch (error) {
      logger.warn(
        { error: (error as Error).message, pending },
        "Could not enqueue triage — the scheduled pass will pick up the backlog"
      );
    }

    return pending;
  }

  /**
   * Get Jira configuration from environment
   */
  private getJiraConfig(): JiraConfig | null {
    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (!baseUrl || !email || !apiToken) return null;

    return {
      baseUrl,
      email,
      apiToken,
      assessmentProject: process.env.JIRA_PROJECT_ASSESSMENT || "",
      vulnerabilityProject: process.env.JIRA_PROJECT_VULNERABILITY || "",
      assessmentJql: process.env.JIRA_ASSESSMENT_JQL || "",
      vulnerabilityJql: process.env.JIRA_VULNERABILITY_JQL || "",
      syncIntervalMinutes: parseInt(process.env.JIRA_SYNC_INTERVAL || "15"),
      maxResultsPerPage: 50,
    };
  }
}

export const syncService = new SyncService();
