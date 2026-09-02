/**
 * Kept as the module server code imports permissions from. The table itself
 * lives in @/lib/auth/permissions so client components can share it without
 * pulling in Prisma.
 */
export {
  Permission,
  hasPermission,
  getPermissions,
  type Role,
} from "@/lib/auth/permissions";
