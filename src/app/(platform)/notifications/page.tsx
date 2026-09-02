"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/data-display/empty-state";
import { Bell, CheckCheck, AlertTriangle, GitCompareArrows, RefreshCw, Info } from "lucide-react";
import Link from "next/link";
import type { ApiResponse } from "@/types/api";
import { useTranslation } from "@/lib/i18n";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeIcons: Record<string, typeof AlertTriangle> = {
  sla_breach: AlertTriangle,
  sla_approaching: AlertTriangle,
  mapping_review: GitCompareArrows,
  sync_failure: RefreshCw,
  new_critical_vuln: AlertTriangle,
};

function getEntityUrl(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  const routes: Record<string, string> = {
    application: `/applications/${id}`,
    assessment: `/assessments/${id}`,
    vulnerability: `/vulnerabilities/${id}`,
    mapping: `/mappings`,
  };
  return routes[type] || null;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/notifications?page=${page}&limit=20`);
      const json: ApiResponse<{ items: NotificationItem[]; unreadCount: number }> = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return { items: json.data!.items, unreadCount: json.data!.unreadCount, meta: json.meta! };
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/v1/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const items = data?.items ?? [];
  const meta = data?.meta;
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("notifications.title")}</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} ${t("notifications.unread")}` : t("common.allCaughtUp")}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="mr-2 h-4 w-4" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("notifications.noNotifications")}
          description={t("notifications.notificationsDescription")}
        />
      ) : (
        <div className="space-y-2">
          {items.map((notif) => {
            const Icon = typeIcons[notif.type] || Info;
            const entityUrl = getEntityUrl(notif.entityType, notif.entityId);

            return (
              <div
                key={notif.id}
                className={`rounded-lg border p-4 transition-colors ${notif.isRead ? "bg-background" : "bg-brand-surface border-brand/25"}`}
                onClick={() => !notif.isRead && markRead.mutate(notif.id)}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${notif.isRead ? "text-muted-foreground" : "text-brand"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${notif.isRead ? "" : "text-accent-foreground"}`}>{notif.title}</p>
                      {!notif.isRead && <Badge className="bg-brand text-primary-foreground text-[10px]">{t("status.new")}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                      {entityUrl && (
                        <Link href={entityUrl} className="text-primary hover:underline">
                          {t("common.viewDetails")}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">{t("common.page")} {meta.page} {t("common.of")} {meta.pages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
