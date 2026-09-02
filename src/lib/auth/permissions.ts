/**
 * Role and permission definitions.
 *
 * Deliberately free of Prisma imports: the sidebar and record controls decide
 * what to render from these, and pulling @/types/enums (which re-exports the
 * generated client) into a client component drags Prisma into the browser
 * bundle and breaks the build on `node:module`. Roles are plain string keys,
 * which is what the enum compiles to anyway.
 */
export type Role =
  | "SYSTEM_ADMIN"
  | "SECURITY_ADMIN"
  | "SECURITY_MANAGER"
  | "SECURITY_ENGINEER"
  | "APPLICATION_OWNER"
  | "DEVELOPER"
  | "AUDITOR"
  | "EXECUTIVE"
  | "READ_ONLY";


// Permission definitions
export const Permission = {
  // User management
  MANAGE_USERS: "manage_users",
  // System configuration
  CONFIGURE_SYSTEM: "configure_system",
  // Asset management
  IMPORT_EXCEL: "import_excel",
  MANAGE_INTEGRATIONS: "manage_integrations",
  VIEW_ALL_APPLICATIONS: "view_all_applications",
  EDIT_APPLICATIONS: "edit_applications",
  // Assessments
  VIEW_ASSESSMENTS: "view_assessments",
  ASSIGN_ASSESSMENTS: "assign_assessments",
  UPDATE_ASSESSMENT_STATUS: "update_assessment_status",
  // Vulnerabilities
  VIEW_VULNERABILITIES: "view_vulnerabilities",
  UPDATE_VULNERABILITY_STATUS: "update_vulnerability_status",
  ACCEPT_RISK: "accept_risk",
  // AI
  APPROVE_AI_ACTIONS: "approve_ai_actions",
  USE_AI_QUERY: "use_ai_query",
  // Audit
  VIEW_AUDIT_LOGS: "view_audit_logs",
  // Dashboards
  VIEW_DASHBOARDS: "view_dashboards",
  // Mappings
  CONFIRM_MAPPINGS: "confirm_mappings",
  // SLA
  CONFIGURE_SLA: "configure_sla",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

// Role-to-permission mapping
const rolePermissions: Record<Role, Set<Permission>> = {
  ["SYSTEM_ADMIN"]: new Set(Object.values(Permission)),

  ["SECURITY_ADMIN"]: new Set([
    Permission.CONFIGURE_SYSTEM,
    Permission.IMPORT_EXCEL,
    Permission.MANAGE_INTEGRATIONS,
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.EDIT_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.VIEW_VULNERABILITIES,
    Permission.USE_AI_QUERY,
    Permission.VIEW_AUDIT_LOGS,
    Permission.VIEW_DASHBOARDS,
    Permission.CONFIRM_MAPPINGS,
    Permission.CONFIGURE_SLA,
  ]),

  ["SECURITY_MANAGER"]: new Set([
    Permission.IMPORT_EXCEL,
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.EDIT_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.ASSIGN_ASSESSMENTS,
    Permission.UPDATE_ASSESSMENT_STATUS,
    Permission.VIEW_VULNERABILITIES,
    Permission.UPDATE_VULNERABILITY_STATUS,
    Permission.ACCEPT_RISK,
    Permission.APPROVE_AI_ACTIONS,
    Permission.USE_AI_QUERY,
    Permission.VIEW_DASHBOARDS,
    Permission.CONFIRM_MAPPINGS,
    Permission.CONFIGURE_SLA,
  ]),

  ["SECURITY_ENGINEER"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.UPDATE_ASSESSMENT_STATUS,
    Permission.VIEW_VULNERABILITIES,
    Permission.UPDATE_VULNERABILITY_STATUS,
    Permission.APPROVE_AI_ACTIONS,
    Permission.USE_AI_QUERY,
    Permission.VIEW_DASHBOARDS,
    Permission.CONFIRM_MAPPINGS,
  ]),

  ["APPLICATION_OWNER"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.VIEW_VULNERABILITIES,
    Permission.USE_AI_QUERY,
    Permission.VIEW_DASHBOARDS,
  ]),

  ["DEVELOPER"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_VULNERABILITIES,
  ]),

  ["AUDITOR"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.VIEW_VULNERABILITIES,
    Permission.USE_AI_QUERY,
    Permission.VIEW_AUDIT_LOGS,
    Permission.VIEW_DASHBOARDS,
  ]),

  ["EXECUTIVE"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.VIEW_VULNERABILITIES,
    Permission.USE_AI_QUERY,
    Permission.VIEW_DASHBOARDS,
  ]),

  ["READ_ONLY"]: new Set([
    Permission.VIEW_ALL_APPLICATIONS,
    Permission.VIEW_ASSESSMENTS,
    Permission.VIEW_VULNERABILITIES,
    Permission.VIEW_DASHBOARDS,
  ]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
}

export function getPermissions(role: Role): Permission[] {
  return Array.from(rolePermissions[role] || []);
}
