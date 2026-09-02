import { prisma } from "@/lib/db/prisma";
import { createHandler, successResponse } from "@/lib/api";
import {
  getApplicationScopeFilter,
  scopeApplicationWhere,
  scopeAssessmentWhere,
  scopeVulnerabilityWhere,
} from "@/modules/platform-services/middleware/abac.middleware";
import { hasPermission, Permission } from "@/modules/platform-services/types/roles";

const TERMINAL_VULN_STATUSES = ["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "WONT_FIX"];
const TERMINAL_ASSESSMENT_STATUSES = ["DONE", "CANCELLED"];

/**
 * The figures beside each sidebar destination.
 *
 * `myOpen` is scoped to the signed-in user — it is the count behind "My queue",
 * so it must never be the global backlog. The rest are inventory totals every
 * authenticated user already sees on the screens they link to.
 *
 * Authentication only: these are counts of records the user can reach anyway,
 * and gating them behind a permission would blank the sidebar for roles that
 * can still open the pages.
 */
export const GET = createHandler(async (_req, context) => {
  const userId = context.user.id;
  const applicationScope = getApplicationScopeFilter(context.user);

  const [myOpenVulns, myOpenAssessments, unmapped, breached, applications, assessments, openVulns] =
    await Promise.all([
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(context.user, {
          assigneeId: userId,
          status: { notIn: TERMINAL_VULN_STATUSES },
        }),
      }),
      prisma.assessment.count({
        where: scopeAssessmentWhere(context.user, {
          assigneeId: userId,
          status: { notIn: TERMINAL_ASSESSMENT_STATUSES },
        }),
      }),
      // Must match app-resolution.service.getReviewQueue, or the badge and the
      // page it links to disagree.
      hasPermission(context.user.role, Permission.CONFIRM_MAPPINGS)
        ? prisma.applicationMapping.count({
            where: {
              status: "UNRESOLVED",
              ...(applicationScope
                ? { OR: [{ applicationId: null }, { application: applicationScope }] }
                : {}),
            },
          })
        : Promise.resolve(0),
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(context.user, {
          slaStatus: "BREACHED",
          status: { notIn: TERMINAL_VULN_STATUSES },
        }),
      }),
      prisma.application.count({ where: scopeApplicationWhere(context.user, { status: "ACTIVE" }) }),
      prisma.assessment.count({
        where: scopeAssessmentWhere(context.user, { status: { notIn: TERMINAL_ASSESSMENT_STATUSES } }),
      }),
      prisma.vulnerability.count({
        where: scopeVulnerabilityWhere(context.user, { status: { notIn: TERMINAL_VULN_STATUSES } }),
      }),
    ]);

  return successResponse({
    myOpen: myOpenVulns + myOpenAssessments,
    unmapped,
    breached,
    applications,
    assessments,
    openVulns,
  });
});
