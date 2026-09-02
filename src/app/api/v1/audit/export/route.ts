import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createHandler } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";

function sanitizeCsv(val: string): string {
  if (/^[=+\-@\t\r]/.test(val)) return `'${val}`;
  return val;
}

export const GET = createHandler(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.timestamp = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { timestamp: "desc" },
      take: 10000,
    });

    const headers = ["Timestamp", "User", "Email", "Action", "Entity Type", "Entity ID", "Source", "IP Address", "Details"];
    const rows = logs.map((l) => [
      sanitizeCsv(l.timestamp.toISOString()),
      sanitizeCsv(l.user?.displayName || "System"),
      sanitizeCsv(l.user?.email || ""),
      sanitizeCsv(l.action),
      sanitizeCsv(l.entityType || ""),
      sanitizeCsv(l.entityId || ""),
      sanitizeCsv(l.source),
      sanitizeCsv(l.ipAddress || ""),
      sanitizeCsv(l.details ? JSON.stringify(l.details) : ""),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit_log_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  },
  { permission: Permission.VIEW_AUDIT_LOGS }
);
