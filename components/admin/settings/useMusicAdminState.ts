import { useQuery, useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useMusicAdminState() {
  const { data: musicMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-match"],
  });
  const musicMatchEnabled = musicMatchData?.enabled !== false;

  const { data: musicExportData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-export-playlist"],
  });
  const musicExportEnabled = musicExportData?.enabled !== false;

  const { data: musicImportData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-import-playlist"],
  });
  const musicImportEnabled = musicImportData?.enabled !== false;

  const musicMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_match_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-match"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const musicExportMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_export_playlist_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-export-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const musicImportMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_import_playlist_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-import-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  return {
    musicMatchEnabled,
    musicExportEnabled,
    musicImportEnabled,
    musicMatchMutation,
    musicExportMutation,
    musicImportMutation,
    musicImportPending: musicImportMutation.isPending,
  };
}
