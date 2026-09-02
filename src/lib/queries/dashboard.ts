"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data: ApiResponse<T> = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Request failed");
  return data.data!;
}

export interface ExecutiveDashboardData {
  kpis: {
    totalApplications: number;
    internetFacingApplications: number;
    internalOnlyApplications: number;
    assessmentCoverage: number;
    applicationsNeverAssessed: number;
    overdueAssessments: number;
    openVulnerabilities: number;
    criticalOpen: number;
    highOpen: number;
    mediumOpen: number;
    lowOpen: number;
    slaCompliance: number;
  };
  charts: {
    vulnBySeverity: Record<string, number>;
    vulnTrend: { month: string; count: number }[];
  };
  provenance: {
    lastSyncedAt: string | null;
    vulnerabilitiesCounted: number;
    applicationsCounted: number;
  };
}

export interface OperationsDashboardData {
  kpis: {
    assessmentBacklog: number;
    waitingAssignment: number;
    inProgress: number;
    newVulnsThisWeek: number;
    slaBreaches: number;
    approachingSLA: number;
    verificationBacklog: number;
  };
  charts: {
    assessmentsByStatus: Record<string, number>;
    workloadByEngineer: { name: string; assessments: number; vulnerabilities: number }[];
  };
}

/** The reporting window from the filter strip, forwarded to the API. */
export interface DashboardRange {
  from?: string;
  to?: string;
}

function withRange(base: string, range?: DashboardRange) {
  const sp = new URLSearchParams();
  if (range?.from) sp.set("from", range.from);
  if (range?.to) sp.set("to", range.to);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function useExecutiveDashboard(range?: DashboardRange) {
  return useQuery({
    queryKey: ["dashboard", "executive", range?.from, range?.to],
    queryFn: () => fetchApi<ExecutiveDashboardData>(withRange("/api/v1/dashboard/executive", range)),
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useOperationsDashboard(range?: DashboardRange) {
  return useQuery({
    queryKey: ["dashboard", "operations", range?.from, range?.to],
    queryFn: () => fetchApi<OperationsDashboardData>(withRange("/api/v1/dashboard/operations", range)),
    refetchInterval: 60000,
  });
}
