import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "user";
  active: boolean;
}

export const CURRENT_USER_QUERY_KEY = ["auth", "me"];

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<CurrentUser>("/api/auth/me");
      } catch {
        // Not logged in, or session expired — treated the same as "no user".
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      apiFetch<CurrentUser>("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
    onSuccess: (user) => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      // Log out client-side even if the request itself failed (e.g. the
      // session was already gone) — there's nothing to keep either way.
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
    },
  });
}
