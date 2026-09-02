import { Queue } from "bullmq";
import { redis } from "@/lib/redis/client";

export const jiraSyncQueue = new Queue("jira-sync", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const importQueue = new Queue("excel-import", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  },
});

/**
 * AI triage of synced tickets: application resolution, scope, security focus.
 *
 * Jobs carry no ticket ids — the backlog is the PENDING rows on external_issues,
 * so a dropped job costs a delay, not an unanalyzed ticket.
 */
export const ticketTriageQueue = new Queue("ticket-triage", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
  },
});
