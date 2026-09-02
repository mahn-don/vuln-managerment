import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createChildLogger } from "@/lib/logger";
import { createHmac, timingSafeEqual } from "crypto";
import type { Prisma } from "@/generated/prisma";

const logger = createChildLogger("jira-webhook");

/** Compare two strings without leaking their contents through timing. */
function constantTimeEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Accepts `sha256=<hex>` or a bare hex digest, as different senders format it. */
function verifySignature(body: string, header: string, secret: string): boolean {
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return constantTimeEquals(provided.toLowerCase(), expected);
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 1024 * 1024) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    // Read the body once, as text, so the signature can be computed over
    // exactly the bytes that were sent.
    const rawBody = await req.text();

    // Preferred: an HMAC over the payload, which a replayed or altered body
    // cannot satisfy. The shared-secret header remains accepted so existing
    // Jira configurations keep working until they are migrated.
    const signature = req.headers.get("x-hub-signature-256") || req.headers.get("x-webhook-signature");
    const providedSecret = req.headers.get("x-webhook-secret") || "";

    const authorised = signature
      ? verifySignature(rawBody, signature, webhookSecret)
      : constantTimeEquals(providedSecret, webhookSecret);

    if (!authorised) {
      logger.warn({ signed: Boolean(signature) }, "Rejected Jira webhook with bad credentials");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { webhookEvent?: string; issue?: { key?: string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const event = body.webhookEvent as string;
    const issue = body.issue;

    if (!event || !issue?.key) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    logger.info({ event, issueKey: issue.key }, "Received Jira webhook");

    // Process based on event type
    if (event === "jira:issue_created" || event === "jira:issue_updated") {
      await upsertFromWebhook(issue);
    } else if (event === "jira:issue_deleted") {
      await markDeleted(issue.key);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Webhook processing failed");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function upsertFromWebhook(issue: Record<string, unknown>) {
  const key = String(issue.key);
  const fields = issue.fields as Record<string, unknown> | undefined;
  if (!fields) return;

  const data = {
    title: String(fields.summary || ""),
    description: fields.description ? String(fields.description).substring(0, 5000) : null,
    status: (fields.status as Record<string, unknown>)?.name ? String((fields.status as Record<string, unknown>).name) : null,
    priority: (fields.priority as Record<string, unknown>)?.name ? String((fields.priority as Record<string, unknown>).name) : null,
    issueType: (fields.issuetype as Record<string, unknown>)?.name ? String((fields.issuetype as Record<string, unknown>).name) : null,
    assigneeEmail: (fields.assignee as Record<string, unknown>)?.emailAddress ? String((fields.assignee as Record<string, unknown>).emailAddress) : null,
    reporterEmail: (fields.reporter as Record<string, unknown>)?.emailAddress ? String((fields.reporter as Record<string, unknown>).emailAddress) : null,
    labels: Array.isArray(fields.labels) ? fields.labels.map(String) : [],
    components: Array.isArray(fields.components) ? (fields.components as Record<string, unknown>[]).map((c) => String(c.name || "")) : [],
    sourceProject: (fields.project as Record<string, unknown>)?.key ? String((fields.project as Record<string, unknown>).key) : null,
    updatedDate: fields.updated ? new Date(String(fields.updated)) : new Date(),
    rawData: issue as Prisma.InputJsonValue,
    syncStatus: "SYNCED" as const,
    lastSyncedAt: new Date(),
  };

  await prisma.externalIssue.upsert({
    where: { source_sourceId: { source: "JIRA", sourceId: key } },
    update: data,
    create: {
      source: "JIRA",
      sourceId: key,
      createdDate: fields.created ? new Date(String(fields.created)) : new Date(),
      ...data,
    },
  });

  logger.info({ issueKey: key }, "Webhook: issue upserted");
}

async function markDeleted(issueKey: string) {
  await prisma.externalIssue.updateMany({
    where: { source: "JIRA", sourceId: issueKey },
    data: { syncStatus: "DELETED", lastSyncedAt: new Date() },
  });

  logger.info({ issueKey }, "Webhook: issue marked as deleted");
}
