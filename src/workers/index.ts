/**
 * SecPlatform Background Workers
 *
 * This file bootstraps all BullMQ workers.
 * Run separately from the Next.js server: `tsx src/workers/index.ts`
 *
 * Workers:
 * 1. Jira Sync — Scheduled sync every 15 minutes
 * 2. Ticket Triage — AI analysis of newly synced tickets
 * 3. SLA Check — Hourly SLA status recalculation
 * 4. Daily Snapshot — Nightly metrics capture
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { redis } from "@/lib/redis/client";
import { syncService } from "@/modules/integration-engine/services/sync.service";
import { ticketTriageService } from "@/modules/intelligence-engine/services/ticket-triage.service";
import { slaService } from "@/modules/vulnerability-management/services/sla.service";
import { dashboardService } from "@/modules/operations-console/services/dashboard.service";
import { prisma } from "@/lib/db/prisma";
import { createChildLogger } from "@/lib/logger";
import { UserRole } from "@/types/enums";

// Import queues to set up repeatable jobs
import { jiraSyncQueue, ticketTriageQueue } from "@/modules/integration-engine/workers/queues";
import { slaCheckQueue, snapshotQueue } from "@/modules/operations-console/workers/queues";

const logger = createChildLogger("workers");

// ============================================================================
// Worker 1: Jira Sync
// ============================================================================
const jiraSyncWorker = new Worker(
  "jira-sync",
  async (job) => {
    logger.info({ jobId: job.id, type: job.data.syncType }, "Starting Jira sync job");

    const result = await syncService.runSync(
      job.data.syncType || "FULL",
      job.data.trigger || "SCHEDULED"
    );

    logger.info({ jobId: job.id, ...result }, "Jira sync job complete");
    return result;
  },
  {
    connection: redis,
    concurrency: 1, // Only one sync at a time
  }
);

jiraSyncWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "Jira sync job failed");
});

// ============================================================================
// Worker 2: Ticket Triage
// ============================================================================
// Requesters do not use the inventory's standardized application names, so every
// synced ticket is analyzed before it reaches a reviewer: which application it
// concerns, what the work covers, and what needs assessing. The job drains the
// PENDING backlog in batches and re-queues itself while work remains, which
// keeps one job short and bounds AI spend per pass.
const ticketTriageWorker = new Worker(
  "ticket-triage",
  async (job) => {
    const batchSize = job.data?.batchSize ?? 25;
    logger.info({ jobId: job.id, batchSize }, "Starting ticket triage pass");

    const result = await ticketTriageService.triagePending(batchSize);

    if (result.remaining > 0 && result.analyzed > 0) {
      await ticketTriageQueue.add("drain", { reason: "backlog", batchSize });
    }

    logger.info({ jobId: job.id, ...result }, "Ticket triage pass complete");
    return result;
  },
  {
    connection: redis,
    concurrency: 1, // Serial: one AI call at a time keeps the provider rate limit clear.
  }
);

ticketTriageWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "Ticket triage job failed");
});

// ============================================================================
// Worker 3: SLA Check
// ============================================================================
const slaCheckWorker = new Worker(
  "sla-check",
  async (job) => {
    logger.info({ jobId: job.id }, "Starting SLA check");

    const result = await slaService.recalculateAll();

    logger.info({ jobId: job.id, ...result }, "SLA check complete");
    return result;
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

slaCheckWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "SLA check job failed");
});

// ============================================================================
// Worker 4: Daily Snapshot
// ============================================================================
const snapshotWorker = new Worker(
  "daily-snapshot",
  async (job) => {
    logger.info({ jobId: job.id }, "Capturing daily snapshot");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get executive dashboard data for snapshot
    const dashData = await dashboardService.getExecutiveDashboard({
      id: "system-worker",
      role: UserRole.SYSTEM_ADMIN,
    });
    const kpis = dashData.kpis;

    // Store snapshot metrics
    const metrics = [
      { metricType: "open_vulnerabilities", value: kpis.openVulnerabilities },
      { metricType: "open_critical", value: kpis.criticalOpen },
      { metricType: "open_high", value: kpis.highOpen },
      { metricType: "open_medium", value: kpis.mediumOpen },
      { metricType: "open_low", value: kpis.lowOpen },
      { metricType: "sla_compliance_pct", value: kpis.slaCompliance },
      { metricType: "assessment_coverage_pct", value: kpis.assessmentCoverage },
      { metricType: "total_applications", value: kpis.totalApplications },
      { metricType: "overdue_assessments", value: kpis.overdueAssessments },
      { metricType: "never_assessed", value: kpis.applicationsNeverAssessed },
    ];

    await prisma.$transaction(
      metrics.map((m) =>
        prisma.dailySnapshot.upsert({
          where: {
            snapshotDate_metricType_dimension: {
              snapshotDate: today,
              metricType: m.metricType,
              dimension: "global",
            },
          },
          update: { value: m.value },
          create: {
            snapshotDate: today,
            metricType: m.metricType,
            dimension: "global",
            value: m.value,
          },
        })
      )
    );

    logger.info({ jobId: job.id, metricsStored: metrics.length }, "Daily snapshot complete");
    return { metricsStored: metrics.length };
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

snapshotWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "Snapshot job failed");
});

// ============================================================================
// Schedule repeatable jobs
// ============================================================================
async function setupSchedules() {
  // Jira sync every 15 minutes
  await jiraSyncQueue.upsertJobScheduler(
    "jira-sync-scheduled",
    { every: 15 * 60 * 1000 },
    { data: { syncType: "FULL", trigger: "SCHEDULED" } }
  );

  // Triage sweep every 5 minutes. The sync enqueues a pass of its own; this is
  // the safety net for anything that was queued while Redis was unavailable.
  await ticketTriageQueue.upsertJobScheduler(
    "ticket-triage-sweep",
    { every: 5 * 60 * 1000 },
    { data: { batchSize: 25 } }
  );

  // SLA check every hour
  await slaCheckQueue.upsertJobScheduler(
    "sla-check-hourly",
    { every: 60 * 60 * 1000 },
    { data: {} }
  );

  // Daily snapshot at midnight
  await snapshotQueue.upsertJobScheduler(
    "daily-snapshot",
    { pattern: "0 0 * * *" }, // Midnight daily
    { data: {} }
  );

  logger.info("Repeatable job schedules configured");
}

// ============================================================================
// Startup
// ============================================================================
async function start() {
  logger.info("Starting SecPlatform workers...");

  await setupSchedules();

  logger.info("Workers ready and processing jobs");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down workers...");
    await jiraSyncWorker.close();
    await ticketTriageWorker.close();
    await slaCheckWorker.close();
    await snapshotWorker.close();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((err) => {
  logger.error({ error: err }, "Worker startup failed");
  process.exit(1);
});
