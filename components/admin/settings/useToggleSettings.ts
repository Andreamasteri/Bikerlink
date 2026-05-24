import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useToggleSettings(t: (k: string) => string, setProtectedToggle: (v: any) => void, setProtectedPassword: (v: string) => void) {
  const disableFeatureMutation = useMutation({
    mutationFn: async (key: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/disable-feature", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error((err as Error).message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  const protectedToggleMutation = useMutation({
    mutationFn: async ({ key, value, adminPassword }: { key: string; value: string; adminPassword?: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/toggle-protected", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, adminPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error((err as Error).message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/gps-required"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/marketplace-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ghost-mode-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/phone-field-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/user-available-on-login"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/primal-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/floating-widget"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setProtectedToggle(null);
      setProtectedPassword("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  return {
    disableFeatureMutation,
    protectedToggleMutation,
  };
}
