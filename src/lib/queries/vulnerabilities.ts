"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";

const BASE = "/api/v1/vulnerabilities";

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Request failed");
  return data;
}

export function useVulnerabilities(params?: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") sp.set(k, String(v)); });
  const url = sp.toString() ? `${BASE}?${sp}` : BASE;

  return useQuery({
    queryKey: ["vulnerabilities", params],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(url);
      return { data: res.data!, meta: res.meta! };
    },
  });
}

export function useVulnerability(id: string | undefined) {
  return useQuery({
    queryKey: ["vulnerability", id],
    queryFn: async () => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE}/${id}`);
      return res.data!;
    },
    enabled: !!id,
  });
}

export function useCreateVulnerability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetchApi<Record<string, unknown>>(BASE, { method: "POST", body: JSON.stringify(data) });
      return res.data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vulnerabilities"] }),
  });
}

export function useUpdateVulnerabilityStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE}/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      return res.data!;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["vulnerabilities"] });
      qc.invalidateQueries({ queryKey: ["vulnerability", id] });
    },
  });
}

export function useVulnerabilityHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["vulnerability-history", id],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(`${BASE}/${id}/history`);
      return res.data!;
    },
    enabled: !!id,
  });
}

export function useCreateRiskAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vulnId, data }: { vulnId: string; data: Record<string, unknown> }) => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE}/${vulnId}/risk-acceptance`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.data!;
    },
    onSuccess: (_, { vulnId }) => {
      qc.invalidateQueries({ queryKey: ["vulnerability", vulnId] });
      qc.invalidateQueries({ queryKey: ["vulnerabilities"] });
    },
  });
}
