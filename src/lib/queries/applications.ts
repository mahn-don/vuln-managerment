"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse, PaginationMeta } from "@/types/api";

const BASE_URL = "/api/v1/applications";

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || "API request failed");
  }
  return data;
}

// List applications
export function useApplications(params?: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.set(key, String(value));
      }
    });
  }
  const queryString = searchParams.toString();
  const url = queryString ? `${BASE_URL}?${queryString}` : BASE_URL;

  return useQuery({
    queryKey: ["applications", params],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(url);
      return { data: res.data!, meta: res.meta! };
    },
  });
}

// Get single application
export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ["application", id],
    queryFn: async () => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE_URL}/${id}`);
      return res.data!;
    },
    enabled: !!id,
  });
}

// Get application security summary
export function useApplicationSecuritySummary(id: string | undefined) {
  return useQuery({
    queryKey: ["application-security-summary", id],
    queryFn: async () => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE_URL}/${id}/security-summary`);
      return res.data!;
    },
    enabled: !!id,
  });
}

// Create application
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetchApi<Record<string, unknown>>(BASE_URL, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

// Update application
export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE_URL}/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return res.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", variables.id] });
    },
  });
}

// Delete application (soft)
export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await fetchApi(`${BASE_URL}/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

// Get aliases
export function useApplicationAliases(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["application-aliases", applicationId],
    queryFn: async () => {
      const res = await fetchApi<unknown[]>(`${BASE_URL}/${applicationId}/aliases`);
      return res.data!;
    },
    enabled: !!applicationId,
  });
}

// Add alias
export function useAddAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, data }: { applicationId: string; data: { alias: string; source?: string } }) => {
      const res = await fetchApi<Record<string, unknown>>(`${BASE_URL}/${applicationId}/aliases`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-aliases", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application", variables.applicationId] });
    },
  });
}

// Remove alias
export function useRemoveAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, aliasId }: { applicationId: string; aliasId: string }) => {
      await fetchApi(`${BASE_URL}/${applicationId}/aliases/${aliasId}`, { method: "DELETE" });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-aliases", variables.applicationId] });
    },
  });
}
