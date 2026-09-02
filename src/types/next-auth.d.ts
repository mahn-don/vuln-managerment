import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role?: string;
    businessUnitId?: string | null;
  }

  interface Session {
    user: User & {
      id: string;
      role: string;
      businessUnitId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    /** Optional: absent on a freshly issued token before the callback fills it. */
    role?: string;
    businessUnitId?: string | null;
  }
}
