"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { navigationFor, type Role } from "@/config/navigation";

/**
 * Renders whatever config/navigation.ts declares. Reordering the sidebar, adding
 * a destination or gating one by role is now a data change in one file.
 */
export function Sidebar({ role: serverRole }: { role?: Role }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { data: session } = useSession();
  // The server knows the role at render time; useSession only catches up after
  // hydration. Reading the client session first made the sidebar paint the
  // anonymous menu and then swap in the real one on every page load.
  const role = serverRole ?? (session?.user as { role?: Role } | undefined)?.role;
  const groups = navigationFor(role);

  const { data: counts } = useQuery<Record<string, number>>({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const res = await fetch("/api/v1/nav-counts");
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    staleTime: 60_000,
  });

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r bg-sidebar">
      <Link href="/" className="flex h-15 items-center gap-2.5 border-b px-5 py-4">
        <span className="text-[19px] font-bold tracking-tight">
          <span className="text-brand-orange">AB</span>
          <span className="text-brand">Bank</span>
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          SecOps
        </span>
      </Link>

      <nav className="flex flex-col gap-5 overflow-y-auto p-3 pt-4">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-px">
            {group.label && (
              <p className="px-2.5 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground">
                {t(group.label)}
              </p>
            )}
            {group.items.map((item) => {
              const href = item.href.split("?")[0];
              const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
              const count = item.badge ? counts?.[item.badge] : undefined;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-[7px] text-[13.5px]",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--brand)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-4 shrink-0" />
                    {t(item.label)}
                  </span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={cn(
                        "tnum font-mono text-[11.5px]",
                        item.badgeTone === "critical" ? "text-risk-critical" : "text-muted-foreground",
                      )}
                    >
                      {count.toLocaleString()}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
