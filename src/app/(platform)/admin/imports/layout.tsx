import { requirePermission } from "@/lib/auth/guard";
import { Permission } from "@/modules/platform-services/types/roles";

/** Inventory import is open to whoever may load the asset inventory. */
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(Permission.IMPORT_EXCEL);
  return <>{children}</>;
}
