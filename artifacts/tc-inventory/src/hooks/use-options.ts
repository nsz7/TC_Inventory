import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LookupOption {
  id: number;
  category: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

async function fetchOptions(category: string): Promise<LookupOption[]> {
  const res = await fetch(`/api/options?category=${encodeURIComponent(category)}`);
  if (!res.ok) throw new Error("Failed to fetch options");
  return res.json();
}

export function useOptions(category: string) {
  return useQuery({
    queryKey: ["options", category],
    queryFn: () => fetchOptions(category),
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

export function useDeleteOption(category: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/options/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete option");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options", category] }),
  });
}
