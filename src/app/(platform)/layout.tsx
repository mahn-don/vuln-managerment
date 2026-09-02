import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { auth } from "@/lib/auth/options";
import { RoleProvider } from "@/components/providers/role-provider";
import type { Role } from "@/config/navigation";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const identity = {
    role: session?.user?.role as Role | undefined,
    name: session?.user?.name,
    email: session?.user?.email,
    id: session?.user?.id,
  };
  return (
    <RoleProvider identity={identity}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={identity.role} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
        {/*
          main is a flex column so full-bleed screens (the list queues) can claim
          the height with flex-1 and run their own internal scroll; padded screens
          size to content and let main scroll, as before.

          The Suspense boundary is required because useFilterParams calls
          useSearchParams, which bails out of static prerendering without one.
        */}
          <main className="flex flex-1 flex-col overflow-y-auto bg-muted/30 p-6">
            <Suspense fallback={null}>{children}</Suspense>
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
