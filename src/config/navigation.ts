import type { LucideIcon } from "lucide-react";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import {
  Inbox, GitCompareArrows, AlarmClock, LayoutGrid, ClipboardCheck, Bug,
  Activity, LineChart, Sparkles, ShieldCheck, Settings, Upload, FileText,
} from "lucide-react";

/**
 * Navigation as data.
 *
 * Two problems this closes. The sidebar listed entities in data-model order while
 * My Workspace — the screen an engineer opens first every morning — sat inside the
 * avatar dropdown. And the tree was a literal array inside sidebar.tsx, so every
 * CISO reshuffle was a pull request in a component.
 *
 * Groups are ordered by when in the day they are used, not by table name.
 * `badge` names a count the sidebar reads from the nav-counts endpoint;
 * `roles` gates a destination without branching inside the component.
 *
 * `label` is a translation key, resolved by the sidebar, so the tree stays
 * declarative without giving up Vietnamese.
 */

/** Mirrors the Prisma UserRole enum. */
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

const ADMIN_ROLES: Role[] = ["SYSTEM_ADMIN", "SECURITY_ADMIN"];
const MAPPING_ROLES: Role[] = ["SYSTEM_ADMIN", "SECURITY_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER"];
const WORK_QUEUE_ROLES: Role[] = ["SYSTEM_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER"];
const ASSESSMENT_ROLES: Role[] = [
  "SYSTEM_ADMIN", "SECURITY_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER",
  "APPLICATION_OWNER", "AUDITOR", "EXECUTIVE", "READ_ONLY",
];
const DASHBOARD_ROLES: Role[] = [
  "SYSTEM_ADMIN", "SECURITY_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER",
  "APPLICATION_OWNER", "AUDITOR", "EXECUTIVE", "READ_ONLY",
];
const AI_ROLES: Role[] = [
  "SYSTEM_ADMIN", "SECURITY_ADMIN", "SECURITY_MANAGER", "SECURITY_ENGINEER",
  "APPLICATION_OWNER", "AUDITOR", "EXECUTIVE",
];

export type NavItem = {
  /** i18n key, not literal text */
  label: string;
  href: string;
  icon: LucideIcon;
  /** Key into the counts payload; renders as a right-aligned figure */
  badge?: string;
  /** Render the count in the critical colour when non-zero */
  badgeTone?: "default" | "critical";
  roles?: Role[];
  /**
   * Gate on a capability rather than a role list. A security manager owns SLA
   * policy and inventory imports without being an administrator, so those
   * destinations follow the permission and stay reachable for whoever holds it.
   */
  permission?: Permission;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    id: "work",
    label: "nav.groupMyWork",
    items: [
      { label: "nav.myQueue", href: "/workspace", icon: Inbox, badge: "myOpen", roles: WORK_QUEUE_ROLES },
      { label: "nav.mappingReview", href: "/mappings", icon: GitCompareArrows, badge: "unmapped", roles: MAPPING_ROLES },
      {
        label: "nav.breachedSla",
        href: "/vulnerabilities?slaStatus=BREACHED&sort=dueDate&order=asc",
        icon: AlarmClock,
        badge: "breached",
        badgeTone: "critical",
      },
    ],
  },
  {
    id: "inventory",
    label: "nav.groupInventory",
    items: [
      { label: "nav.applications", href: "/applications", icon: LayoutGrid, badge: "applications" },
      { label: "nav.assessments", href: "/assessments", icon: ClipboardCheck, badge: "assessments", roles: ASSESSMENT_ROLES },
      { label: "nav.vulnerabilities", href: "/vulnerabilities", icon: Bug, badge: "openVulns" },
    ],
  },
  {
    id: "insight",
    label: "nav.groupInsight",
    items: [
      { label: "nav.posture", href: "/dashboard/executive", icon: ShieldCheck, roles: DASHBOARD_ROLES },
      { label: "nav.operations", href: "/dashboard/operations", icon: Activity, roles: DASHBOARD_ROLES },
      { label: "nav.analytics", href: "/analytics", icon: LineChart, roles: DASHBOARD_ROLES },
      { label: "nav.askTheData", href: "/ai", icon: Sparkles, roles: AI_ROLES },
    ],
  },
  {
    id: "admin",
    label: "",
    items: [
      { label: "nav.administration", href: "/admin", icon: Settings, roles: ADMIN_ROLES },
      { label: "nav.aiSettings", href: "/admin/ai", icon: Sparkles, permission: Permission.CONFIGURE_SYSTEM },
      { label: "nav.closureChecks", href: "/admin/closure-checks", icon: ClipboardCheck, permission: Permission.CONFIGURE_SYSTEM },
      { label: "nav.confluence", href: "/admin/integrations/confluence", icon: FileText, permission: Permission.MANAGE_INTEGRATIONS },
      { label: "nav.slaPolicy", href: "/admin/sla", icon: AlarmClock, permission: Permission.CONFIGURE_SLA },
      { label: "nav.importInventory", href: "/admin/imports", icon: Upload, permission: Permission.IMPORT_EXCEL },
    ],
  },
];

/** Where each role lands after login, instead of everyone getting Executive. */
export const landingByRole: Record<Role, string> = {
  SYSTEM_ADMIN: "/admin",
  SECURITY_ADMIN: "/admin",
  SECURITY_MANAGER: "/dashboard/operations",
  SECURITY_ENGINEER: "/workspace",
  APPLICATION_OWNER: "/applications",
  DEVELOPER: "/vulnerabilities",
  AUDITOR: "/dashboard/executive",
  EXECUTIVE: "/dashboard/executive",
  READ_ONLY: "/dashboard/executive",
};

/** Fallback for an unknown or missing role. */
export const DEFAULT_LANDING = "/dashboard/executive";

export function landingFor(role: string | undefined): string {
  if (!role) return DEFAULT_LANDING;
  return landingByRole[role as Role] ?? DEFAULT_LANDING;
}

export function navigationFor(role: Role | undefined): NavGroup[] {
  const allowed = (item: NavItem) => {
    if (item.roles && !(role && item.roles.includes(role))) return false;
    if (item.permission && !(role && hasPermission(role, item.permission))) return false;
    return true;
  };

  return navigation
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
}
