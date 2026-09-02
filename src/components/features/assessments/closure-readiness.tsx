"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, CircleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * What this ticket still needs before it can be closed.
 *
 * Shown while the work is in progress rather than at the moment of closing:
 * learning that the scope was never recorded is useful during the test and
 * useless a month later when the tester has moved on.
 */
interface Readiness {
  ready: boolean;
  blocking: string[];
  warnings: string[];
  satisfied: string[];
}

export function ClosureReadiness({
  assessmentId,
  status,
}: {
  assessmentId: string;
  status: string;
}) {
  const { t } = useTranslation();

  const { data } = useQuery<Readiness>({
    queryKey: ["closure-readiness", assessmentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assessments/${assessmentId}/closure-readiness`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data;
    },
    staleTime: 30_000,
  });

  const total =
    (data?.blocking.length ?? 0) + (data?.warnings.length ?? 0) + (data?.satisfied.length ?? 0);

  // Nothing configured for this kind of ticket, or it is already closed.
  if (!data || total === 0 || status === "DONE" || status === "CANCELLED") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {data.ready ? (
            <CheckCircle2 className="h-4 w-4 text-risk-fresh" />
          ) : (
            <CircleAlert className="h-4 w-4 text-risk-high" />
          )}
          {t("closure.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className={cn("font-medium", data.ready ? "text-risk-fresh" : "text-risk-high")}>
          {data.ready
            ? t("closure.ready")
            : t("closure.notReady", { count: String(data.blocking.length) })}
        </p>

        {data.blocking.length > 0 && (
          <ul className="space-y-1.5">
            {data.blocking.map((check) => (
              <li key={check} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk-high" />
                <span>
                  <span className="font-medium">{t(`admin.closure.check.${check}`)}</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {t(`admin.closure.checkHelp.${check}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {data.warnings.length > 0 && (
          <div className="border-t pt-2.5">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("closure.advisory")}
            </p>
            <ul className="space-y-1">
              {data.warnings.map((check) => (
                <li key={check} className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t(`admin.closure.check.${check}`)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.satisfied.length > 0 && (
          <p className="border-t pt-2.5 text-xs text-muted-foreground">
            {t("closure.satisfied", {
              done: String(data.satisfied.length),
              total: String(total),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
