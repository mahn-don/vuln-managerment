import { prisma } from "@/lib/db/prisma";
import { createHandler, validateBody, successResponse } from "@/lib/api";
import { z } from "zod/v4";

const updatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    eventType: z.string(),
    inApp: z.boolean(),
    email: z.boolean(),
    enabled: z.boolean(),
  })),
});

export const GET = createHandler(
  async (req, context) => {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: context.user.id },
      orderBy: { eventType: "asc" },
    });

    // Return defaults for event types not yet configured
    const eventTypes = [
      "sla_breach", "sla_approaching", "assessment_overdue", "mapping_review",
      "sync_failure", "import_complete", "new_critical_vuln", "assignment", "risk_acceptance_expiring",
    ];

    const existing = new Map(prefs.map((p) => [p.eventType, p]));
    const result = eventTypes.map((et) => existing.get(et) || {
      eventType: et, inApp: true, email: et === "sla_breach" || et === "new_critical_vuln", enabled: true,
    });

    return successResponse(result);
  }
);

export const PUT = createHandler(
  async (req, context) => {
    const { preferences } = await validateBody(req, updatePreferencesSchema);

    await prisma.$transaction(
      preferences.map((pref) => prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: context.user.id, eventType: pref.eventType } },
        update: { inApp: pref.inApp, email: pref.email, enabled: pref.enabled },
        create: { userId: context.user.id, ...pref },
      }))
    );

    return successResponse({ updated: preferences.length });
  }
);
