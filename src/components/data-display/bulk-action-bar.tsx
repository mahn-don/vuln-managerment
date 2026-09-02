"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * The verbs that act on a selection.
 *
 * Rows became selectable so that work could be done in bulk rather than one
 * record at a time. Assign and Set status each fan out to the existing
 * per-record endpoints — there is no bulk endpoint yet — so the bar reports how
 * many of the calls actually succeeded rather than claiming a clean sweep.
 */

type AssignableUser = { id: string; displayName: string };

export function BulkActionBar({
  selected,
  statuses,
  onAssign,
  onSetStatus,
  onCopy,
  onClear,
  className,
}: {
  selected: string[];
  /** Status values this entity can move to; omit to hide the control */
  statuses?: string[];
  /** Applies one id at a time; resolves false when that id failed */
  onAssign?: (id: string, userId: string) => Promise<boolean>;
  onSetStatus?: (id: string, status: string) => Promise<boolean>;
  onCopy: () => Promise<void> | void;
  onClear: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<"assign" | "status" | null>(null);
  const [busy, setBusy] = useState(false);

  // Assignable staff, not the user directory: reachable by anyone who may
  // assign. An empty list is still distinguished from "still loading" so the
  // menu never sits on a spinner.
  const { data: users, isLoading: usersLoading } = useQuery<AssignableUser[]>({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const res = await fetch("/api/v1/users/assignable");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: open === "assign" && Boolean(onAssign),
    staleTime: 300_000,
  });

  async function runBulk(action: (id: string) => Promise<boolean>) {
    setBusy(true);
    setOpen(null);
    try {
      const results = await Promise.all(selected.map((id) => action(id).catch(() => false)));
      const ok = results.filter(Boolean).length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(t("bulk.applied", { count: String(ok) }));
      } else {
        toast.error(t("bulk.partial", { ok: String(ok), failed: String(failed) }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-3.5 border-b bg-accent px-6 py-2 text-[12.5px] text-accent-foreground",
        className,
      )}
    >
      <span className="tnum font-semibold">
        {selected.length} {t("common.selected")}
      </span>
      <span className="h-4 w-px bg-current opacity-25" />

      {busy && <Loader2 className="size-3.5 animate-spin" />}

      {onAssign && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(open === "assign" ? null : "assign")}
        >
          {t("bulk.assignTo")}
        </button>
      )}

      {onSetStatus && statuses && statuses.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(open === "status" ? null : "status")}
        >
          {t("bulk.setStatus")}
        </button>
      )}

      <button type="button" disabled={busy} onClick={() => void onCopy()}>
        {t("common.copyAsTsv")}
      </button>

      <button type="button" onClick={onClear} className="ml-auto opacity-70">
        {t("common.clear")}
      </button>

      {open === "assign" && onAssign && (
        <Menu>
          {usersLoading ? (
            <p className="px-3 py-2 text-[12.5px] text-muted-foreground">{t("common.loading")}</p>
          ) : (users ?? []).length === 0 ? (
            <p className="px-3 py-2 text-[12.5px] text-muted-foreground">{t("bulk.noAssignees")}</p>
          ) : (
            (users ?? []).map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                onClick={() => runBulk((id) => onAssign(id, u.id))}
              >
                {u.displayName}
              </button>
            ))
          )}
        </Menu>
      )}

      {open === "status" && onSetStatus && (
        <Menu>
          {statuses!.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
              onClick={() => runBulk((id) => onSetStatus(id, s))}
            >
              {s.replace(/_/g, " ").toLowerCase()}
            </button>
          ))}
        </Menu>
      )}
    </div>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-6 top-full z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border bg-popover py-1 shadow-lg">
      {children}
    </div>
  );
}
