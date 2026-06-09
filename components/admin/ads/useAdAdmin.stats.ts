// overflow di components/admin/ads/useAdAdmin.ts — sottoset stats estratto
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ImageHealthData {
  brokenIds: string[];
  checkedAt: string | null;
  isRunning: boolean;
}

export function useAdAdminStats() {
  const { data: imageHealth } = useQuery<ImageHealthData>({
    queryKey: ["/api/admin/advertisements/image-health"],
    refetchInterval: 60_000,
  });

  const { data: cacheStats } = useQuery<{ count: number; totalBytes: number }>({
    queryKey: ["/api/admin/advertisements/cache-stats"],
    staleTime: 60_000,
  });

  const [healthBannerDismissed, setHealthBannerDismissed] = useState(false);

  async function handleCheckImages() {
    try {
      await apiRequest("POST", "/api/admin/advertisements/image-health/check");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements/image-health"] });
      }, 3000);
    } catch {
      // no-op: ignore health check failures
    }
  }

  return {
    imageHealth,
    cacheStats,
    healthBannerDismissed,
    setHealthBannerDismissed,
    handleCheckImages,
  };
}
