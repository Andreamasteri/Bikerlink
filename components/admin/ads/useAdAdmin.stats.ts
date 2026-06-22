import { useQuery } from "@tanstack/react-query";

export function useAdAdminStats() {
  const { data: imageHealth } = useQuery<{ brokenIds: string[] }>({
    queryKey: ["/api/admin/advertisements/image-health"],
  });

  const cacheStats = { hits: 0, misses: 0 };
  const [healthBannerDismissed, setHealthBannerDismissed] = (require("react").useState)(false);

  const handleCheckImages = () => {};

  return {
    imageHealth,
    cacheStats,
    healthBannerDismissed,
    setHealthBannerDismissed,
    handleCheckImages
  };
}
