import { Queue } from "bullmq";
import { redis } from "@/lib/redis/client";

export const slaCheckQueue = new Queue("sla-check", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 24, // Keep last 24 runs
    removeOnFail: 48,
    attempts: 2,
    backoff: { type: "exponential", delay: 10000 },
  },
});

export const notificationQueue = new Queue("notifications", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
  },
});

export const snapshotQueue = new Queue("daily-snapshot", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 7,
    removeOnFail: 14,
    attempts: 2,
  },
});
