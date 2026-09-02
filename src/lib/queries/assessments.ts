"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";

const BASE = "/api/v1/assessments";

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || "Request failed");
  return data;
}

export function useAssessments(params?: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") sp.set(k, String(v)); });
  const url = sp.toString() ? `${BASE}?${sp}` : BASE;

  return useQuery({
    queryKey: ["assessments", params],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(url);
      return { data: res.data!, meta: res.meta! };
    },
  });
}

export function useAssessment(id: string | undefined) {
  return useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE}/${id}`);
      return res.data!;
    },
    enabled: !!id,
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetchApi<Record<string, unknown>>(BASE, { method: "POST", body: JSON.stringify(data) });
      return res.data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessments"] }),
  });
}

export function useUpdateAssessmentStatus() {
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
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
  });
}

export function useAssignAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assigneeId, reason }: { id: string; assigneeId: string; reason?: string }) => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE}/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ assigneeId, reason }),
      });
      return res.data!;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
  });
}

export function useAssessmentHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["assessment-history", id],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(`${BASE}/${id}/history`);
      return res.data!;
    },
    enabled: !!id,
  });
}
