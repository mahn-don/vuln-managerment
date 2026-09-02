import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** The audit trail is readable only by roles cleared to review it. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.VIEW_AUDIT_LOGS);
  return <>{children}</>;
}
