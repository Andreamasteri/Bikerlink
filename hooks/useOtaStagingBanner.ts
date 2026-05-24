import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

interface OtaRelease {
  id: string;
  status: string;
}

export function useOtaStagingBanner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: releases } = useQuery<OtaRelease[]>({
    queryKey: ["/api/admin/ota/releases", "pending"],
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const hasPending = isAdmin && (releases ?? []).some((r) => r.status === "pending");

  return { hasPending };
}
