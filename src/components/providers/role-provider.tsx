"use client";

import { createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@/lib/auth/permissions";

/**
 * The signed-in role, resolved on the server and available to client components
 * on their very first render.
 *
 * useSession() only knows the role after hydration, which made permission-gated
 * controls decide "no" before deciding "yes" — the sidebar painted an anonymous
 * menu and the record actions were missing until the session arrived. The server
 * already has the role in the layout, so it is handed down instead of guessed.
 */
export interface SessionIdentity {
  role?: Role;
  name?: string | null;
  email?: string | null;
  id?: string;
}

const IdentityContext = createContext<SessionIdentity | undefined>(undefined);

export function RoleProvider({
  identity,
  children,
}: {
  identity?: SessionIdentity;
  children: React.ReactNode;
}) {
  return <IdentityContext.Provider value={identity}>{children}</IdentityContext.Provider>;
}

/** The signed-in identity, known on the first render. */
export function useIdentity(): SessionIdentity {
  const fromServer = useContext(IdentityContext);
  const { data: session } = useSession();
  const fromClient = session?.user as SessionIdentity | undefined;

  // Context wins; the session fills in for trees rendered outside the provider.
  return {
    role: fromServer?.role ?? fromClient?.role,
    name: fromServer?.name ?? fromClient?.name,
    email: fromServer?.email ?? fromClient?.email,
    id: fromServer?.id ?? fromClient?.id,
  };
}

export function useRole(): Role | undefined {
  return useIdentity().role;
}
