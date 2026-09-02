import type { Prisma } from "@/generated/prisma";
import type { UserRole } from "@/types/enums";

/**
 * ABAC (Attribute-Based Access Control) Scope Filtering
 *
 * Generates Prisma WHERE clauses that restrict data visibility
 * based on user role, business unit, and ownership.
 */

export interface UserContext {
  id: string;
  role: UserRole;
  businessUnitId?: string | null;
}

/**
 * Get application scope filter for a user.
 * - System Admin, Security Admin, Auditor, Executive: see all
 * - Security Manager: scoped to their BU (if BU assigned)
 * - Security Engineer: see all (needs visibility for assignments)
 * - Application Owner: only owned applications
 * - Developer: only applications they have vulnerability assignments for
 * - Read Only: see all (read-only)
 */
export function getApplicationScopeFilter(user: UserContext): Prisma.ApplicationWhereInput | undefined {
  switch (user.role) {
    case "SYSTEM_ADMIN":
    case "SECURITY_ADMIN":
    case "SECURITY_ENGINEER":
    case "AUDITOR":
    case "EXECUTIVE":
    case "READ_ONLY":
      return undefined; // No filter = see all

    case "SECURITY_MANAGER":
      if (user.businessUnitId) {
        return { businessUnitId: user.businessUnitId };
      }
      return { id: "NONE" };

    case "APPLICATION_OWNER":
      return {
        owners: { some: { userId: user.id } },
      };

    case "DEVELOPER":
      return {
        vulnerabilityApplications: {
          some: {
            vulnerability: { fixOwnerId: user.id },
          },
        },
      };

    default:
      return { id: "NONE" }; // Block all access
  }
}

/**
 * Get vulnerability scope filter for a user.
 */
export function getVulnerabilityScopeFilter(user: UserContext): Prisma.VulnerabilityWhereInput | undefined {
  switch (user.role) {
    case "SYSTEM_ADMIN":
    case "SECURITY_ADMIN":
    case "SECURITY_ENGINEER":
    case "SECURITY_MANAGER":
    case "AUDITOR":
    case "EXECUTIVE":
    case "READ_ONLY":
      if (user.role === "SECURITY_MANAGER") {
        return user.businessUnitId
          ? {
              vulnerabilityApplications: {
                some: { application: { businessUnitId: user.businessUnitId } },
              },
            }
          : { id: "NONE" };
      }
      return undefined;

    case "APPLICATION_OWNER":
      return {
        vulnerabilityApplications: {
          some: { application: { owners: { some: { userId: user.id } } } },
        },
      };

    case "DEVELOPER":
      return { fixOwnerId: user.id };

    default:
      return { id: "NONE" };
  }
}

/**
 * Get assessment scope filter for a user.
 */
export function getAssessmentScopeFilter(user: UserContext): Prisma.AssessmentWhereInput | undefined {
  switch (user.role) {
    case "SYSTEM_ADMIN":
    case "SECURITY_ADMIN":
    case "SECURITY_ENGINEER":
    case "AUDITOR":
    case "EXECUTIVE":
    case "READ_ONLY":
      return undefined;

    case "SECURITY_MANAGER":
      if (user.businessUnitId) {
        return {
          assessmentApplications: {
            some: { application: { businessUnitId: user.businessUnitId } },
          },
        };
      }
      return { id: "NONE" };

    case "APPLICATION_OWNER":
      return {
        assessmentApplications: {
          some: { application: { owners: { some: { userId: user.id } } } },
        },
      };

    default:
      return { id: "NONE" };
  }
}

export function scopeApplicationWhere(
  user: UserContext,
  where: Prisma.ApplicationWhereInput = {}
): Prisma.ApplicationWhereInput {
  const scope = getApplicationScopeFilter(user);
  return scope ? { AND: [scope, where] } : where;
}

export function scopeVulnerabilityWhere(
  user: UserContext,
  where: Prisma.VulnerabilityWhereInput = {}
): Prisma.VulnerabilityWhereInput {
  const scope = getVulnerabilityScopeFilter(user);
  return scope ? { AND: [scope, where] } : where;
}

export function scopeAssessmentWhere(
  user: UserContext,
  where: Prisma.AssessmentWhereInput = {}
): Prisma.AssessmentWhereInput {
  const scope = getAssessmentScopeFilter(user);
  return scope ? { AND: [scope, where] } : where;
}
