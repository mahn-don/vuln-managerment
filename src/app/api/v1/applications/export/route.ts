import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createHandler } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { scopeApplicationWhere } from "@/modules/platform-services/middleware/abac.middleware";

const BATCH_SIZE = 500;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const GET = createHandler(
  async (_req, context) => {
    const headers = [
      "Application ID", "Name", "Business Unit", "Department", "Criticality",
      "Internet Facing", "Data Classification", "Status", "Risk Rating",
      "Open Vulnerabilities", "Open Critical", "Open High",
      "Last Assessment", "Next Assessment Due",
      "Application Owner", "Technical Owner", "Security Owner",
      "Repository URL", "Production URL", "Go-Live Date",
    ];
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`${headers.map(csvCell).join(",")}\n`));
          let cursor: string | undefined;

          do {
            const applications = await prisma.application.findMany({
              where: scopeApplicationWhere(context.user, { status: { not: "ARCHIVED" } }),
              include: {
                businessUnit: { select: { name: true } },
                owners: {
                  where: { isPrimary: true },
                  select: {
                    ownerName: true,
                    ownerType: true,
                    user: { select: { displayName: true } },
                  },
                },
              },
              orderBy: { id: "asc" },
              take: BATCH_SIZE,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });

            for (const app of applications) {
              const getOwner = (type: string) => {
                const owner = app.owners.find((candidate) => candidate.ownerType === type);
                return owner?.user?.displayName || owner?.ownerName || "";
              };
              const row = [
                app.applicationId,
                app.name,
                app.businessUnit?.name || "",
                app.department || "",
                app.level,
                app.internetFacing ? "Yes" : "No",
                app.dataClassification || "",
                app.status,
                app.riskRating || "",
                app.openVulnerabilityCount,
                app.openCriticalCount,
                app.openHighCount,
                app.lastAssessmentDate?.toISOString().split("T")[0] || "",
                app.nextAssessmentDue?.toISOString().split("T")[0] || "",
                getOwner("APPLICATION_OWNER"),
                getOwner("TECHNICAL_OWNER"),
                getOwner("SECURITY_OWNER"),
                app.repositoryUrl || "",
                app.productionUrl || "",
                app.goLiveDate?.toISOString().split("T")[0] || "",
              ];
              controller.enqueue(encoder.encode(`${row.map(csvCell).join(",")}\n`));
            }

            cursor = applications.length === BATCH_SIZE
              ? applications[applications.length - 1].id
              : undefined;
          } while (cursor);

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications_${new Date().toISOString().split("T")[0]}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  { permission: Permission.VIEW_ALL_APPLICATIONS }
);
