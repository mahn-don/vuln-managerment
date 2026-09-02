"use client";

import { useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import { useIdentity } from "@/components/providers/role-provider";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, LogOut, User, Globe } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function Topbar() {
  const identity = useIdentity();
  const router = useRouter();
  const user = identity;
  const [searchQuery, setSearchQuery] = useState("");
  const { t, locale, setLocale } = useTranslation();

  const { data: notifData } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: async () => {
      const res = await fetch("/api/v1/notifications?limit=1&unreadOnly=true");
      const json = await res.json();
      return json.success ? json.data?.unreadCount ?? 0 : 0;
    },
    refetchInterval: 30000,
    enabled: !!user,
  });

  const unreadCount = (notifData as number) || 0;

  const handleSearch = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && searchQuery.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      }
    },
    [searchQuery, router]
  );

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search.placeholder")}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Switcher */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocale(locale === "en" ? "vi" : "en")}
          className="gap-1.5 px-2.5 text-xs font-medium"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale === "en" ? "VI" : "EN"}
        </Button>

        {/* Notifications */}
        <Link href="/notifications" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-risk-critical px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "gap-2 px-2")}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm">{user?.name || t("common.user")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role?.replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
            </DropdownMenuLabel>
            {/* My Workspace moved to the sidebar as "My queue" — it is the first
                screen of the day, not a setting buried in the avatar menu. */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
