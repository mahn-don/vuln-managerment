"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import { AssessmentStatus, VulnerabilityStatus } from "@/types/workflow-status";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { useRole } from "@/components/providers/role-provider";

/**
 * The write controls on a record.
 *
 * Both detail screens were read-only: a manager holding UPDATE_*_STATUS,
 * ASSIGN_ASSESSMENTS and ACCEPT_RISK could open a record and change nothing,
 * with bulk selection on the list the only way to act. Controls are rendered
 * only for permissions the signed-in role actually holds, so the panel never
 * offers an action that will come back 403.
 */

type Entity = "vulnerability" | "assessment";

interface AssignableUser {
  id: string;
  displayName: string;
  role: string;
}

const STATUSES: Record<Entity, string[]> = {
  vulnerability: Object.values(VulnerabilityStatus),
  assessment: Object.values(AssessmentStatus),
};

const STATUS_PERMISSION: Record<Entity, Permission> = {
  vulnerability: Permission.UPDATE_VULNERABILITY_STATUS,
  assessment: Permission.UPDATE_ASSESSMENT_STATUS,
};

const ASSIGN_PERMISSION: Record<Entity, Permission> = {
  vulnerability: Permission.UPDATE_VULNERABILITY_STATUS,
  assessment: Permission.ASSIGN_ASSESSMENTS,
};

export function RecordActions({
  entity,
  id,
  status,
  queryKey,
}: {
  entity: Entity;
  id: string;
  status: string;
  /** The detail query to refresh once a change lands. */
  queryKey: unknown[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const role = useRole();

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);

  const canSetStatus = Boolean(role && hasPermission(role, STATUS_PERMISSION[entity]));
  const canAssign = Boolean(role && hasPermission(role, ASSIGN_PERMISSION[entity]));
  const canAcceptRisk =
    entity === "vulnerability" && Boolean(role && hasPermission(role, Permission.ACCEPT_RISK));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["nav-counts"] });
  };

  async function send(url: string, method: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.error?.message ?? t("common.actionFailed"));
    }
    return json.data;
  }

  const statusMutation = useMutation({
    mutationFn: (next: string) =>
      send(`/api/v1/${entity === "vulnerability" ? "vulnerabilities" : "assessments"}/${id}/status`, "PATCH", {
        status: next,
      }),
    onSuccess: () => {
      toast.success(t("record.statusUpdated"));
      setPendingStatus(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      entity === "vulnerability"
        ? send(`/api/v1/vulnerabilities/${id}`, "PUT", { assigneeId: userId })
        : send(`/api/v1/assessments/${id}/assign`, "PATCH", { assigneeId: userId }),
    onSuccess: () => {
      toast.success(t("record.assigned"));
      setAssignOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const riskMutation = useMutation({
    mutationFn: (input: { justification: string; expirationDate?: string; conditions?: string }) =>
      send(`/api/v1/vulnerabilities/${id}/risk-acceptance`, "POST", input),
    onSuccess: () => {
      toast.success(t("record.riskAcceptanceRecorded"));
      setRiskOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * The moves the workflow actually allows from here. Offering the full
   * vocabulary meant picking a forbidden status and being told so afterwards.
   */
  const { data: transitions } = useQuery<{ toStatus: string; label?: string }[]>({
    queryKey: ["transitions", entity, status],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workflows/${entity}/transitions?from=${encodeURIComponent(status)}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: canSetStatus && Boolean(status),
    staleTime: 300_000,
  });

  // Only fetched when a picker is open: assignable staff, not the user directory.
  const { data: users, isLoading: usersLoading } = useQuery<AssignableUser[]>({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const res = await fetch("/api/v1/users/assignable");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: assignOpen,
    staleTime: 300_000,
  });

  if (!canSetStatus && !canAssign && !canAcceptRisk) return null;

  const busy = statusMutation.isPending || assignMutation.isPending || riskMutation.isPending;

  // Current status stays in the list so the trigger can render it; the rest are
  // the allowed moves, falling back to the vocabulary if the workflow is silent.
  const reachable = (transitions ?? []).map((tr) => tr.toStatus);
  const options = [status, ...(reachable.length > 0 ? reachable : STATUSES[entity])].filter(
    (value, i, all) => value && all.indexOf(value) === i
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSetStatus && (
        <Select
          value={pendingStatus ?? status}
          onValueChange={(next: string | null) => {
            if (!next || next === status) return;
            setPendingStatus(next);
            statusMutation.mutate(next);
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-[200px] text-[13px]" aria-label={t("record.changeStatus")}>
            {/* Base UI shows the raw value unless given children. */}
            <SelectValue placeholder={t("record.changeStatus")}>
              {(pendingStatus ?? status).replace(/_/g, " ").toLowerCase()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {canAssign && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setAssignOpen(true)}>
          {t("record.assign")}
        </Button>
      )}

      {canAcceptRisk && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setRiskOpen(true)}>
          {t("record.acceptRisk")}
        </Button>
      )}

      {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("record.assign")}</DialogTitle>
            <DialogDescription>{t("record.assignDescription")}</DialogDescription>
          </DialogHeader>
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (users ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bulk.noAssignees")}</p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {(users ?? []).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => assignMutation.mutate(u.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    <span className="font-medium">{u.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.role.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <RiskAcceptanceDialog
        open={riskOpen}
        onOpenChange={setRiskOpen}
        busy={busy}
        onSubmit={(input) => riskMutation.mutate(input)}
      />
    </div>
  );
}

function RiskAcceptanceDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (input: { justification: string; expirationDate?: string; conditions?: string }) => void;
}) {
  const { t } = useTranslation();
  const [justification, setJustification] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [conditions, setConditions] = useState("");

  // Matches the server contract, so the length is enforced before the round trip.
  const tooShort = justification.trim().length < 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("record.acceptRisk")}</DialogTitle>
          <DialogDescription>{t("record.acceptRiskDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ra-justification">{t("record.justification")}</Label>
            <Textarea
              id="ra-justification"
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t("record.justificationPlaceholder")}
            />
            {tooShort && justification.length > 0 && (
              <p className="text-xs text-muted-foreground">{t("record.justificationTooShort")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ra-expiry">{t("record.expiresOn")}</Label>
            <Input
              id="ra-expiry"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ra-conditions">{t("record.conditions")}</Label>
            <Textarea
              id="ra-conditions"
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy || tooShort}
            onClick={() =>
              onSubmit({
                justification: justification.trim(),
                expirationDate: expirationDate || undefined,
                conditions: conditions.trim() || undefined,
              })
            }
          >
            {t("record.recordAcceptance")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
