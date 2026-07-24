import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LookupOption {
  id: number;
  category: string;
  label: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

async function fetchOptions(category: string, includeInactive: boolean): Promise<LookupOption[]> {
  const params = new URLSearchParams({ category });
  if (includeInactive) params.set("includeInactive", "true");
  const res = await fetch(`/api/options?${params}`);
  if (!res.ok) throw new Error("Failed to fetch options");
  return res.json();
}

/** Every other dropdown in the app wants active-only (the default). The
 * Settings management screen passes includeInactive so it can show
 * deactivated entries too, with a way to reactivate them — entries in use
 * are never deleted, only deactivated, so there needs to be a way back. */
export function useOptions(category: string, includeInactive = false) {
  return useQuery({
    queryKey: ["options", category, { includeInactive }],
    queryFn: () => fetchOptions(category, includeInactive),
    staleTime: 60_000,
  });
}

export function useAddOption(category: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch("/api/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, label }),
      });
      if (!res.ok) throw new Error("Failed to add option");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options", category] }),
  });
}

/** Deactivate/reactivate, never delete — deactivated entries vanish from
 * every other dropdown but keep displaying correctly on existing records. */
export function useSetOptionActive(category: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch(`/api/options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed to update option");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options", category] }),
  });
}
