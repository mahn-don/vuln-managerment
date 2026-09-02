"use client";

import Link from "next/link";
import { Bug, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useFilterParams } from "@/lib/use-filter-params";
import { FilterBar } from "@/components/filters/filter-bar";

export default function AnalyticsPage() {
  const { t } = useTranslation();
  // This screen carries no figures of its own; the range it picks is handed to
  // whichever analytics page the reader opens, so the window survives the click.
  const { range } = useFilterParams();
  const rangeQs = `?preset=${range.preset}${
    range.preset === "custom" ? `&from=${range.from}&to=${range.to}` : ""
  }`;

  const analyticsPages = [
    {
      title: t("analytics.vulnTrends"),
      description: t("analytics.vulnTrendsDesc"),
      href: "/analytics/vulnerabilities",
      icon: Bug,
    },
    {
      title: t("analytics.assessmentMetrics"),
      description: t("analytics.assessmentMetricsDesc"),
      href: "/analytics/assessments",
      icon: ClipboardCheck,
    },
    {
      title: t("dashboard.slaCompliance"),
      description: t("analytics.slaComplianceDesc"),
      href: "/analytics/sla",
      icon: ShieldAlert,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("analytics.securityAnalytics")}
        </h1>
        <p className="text-muted-foreground">
          {t("analytics.insightsAndTrends")}
        </p>
      </div>

      <FilterBar showDateRange className="-mx-6 border-t" />

      <div className="grid gap-4 md:grid-cols-3">
        {analyticsPages.map((page) => (
          <Link
            key={page.href}
            href={page.href + rangeQs}
            className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
          >
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="rounded-md bg-primary/10 p-3 w-fit">
                  <page.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{page.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {page.description}
                  </p>
                </div>
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "mt-auto w-fit"
                  )}
                >
                  {t("analytics.viewAnalytics")}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
