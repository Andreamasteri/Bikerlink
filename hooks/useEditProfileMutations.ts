import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

export function useEditProfileMutations() {
  const t = useT();
  const router = useRouter();

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PUT", "/api/users/me", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      Alert.alert(t("common.success"), "Profilo aggiornato");
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  const addMotoMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/motorcycles", data);
      return await res.json();
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/users/me/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/request-deletion");
    },
  });

  return {
    updateProfileMutation,
    addMotoMutation,
    deletePhotoMutation,
    requestDeletionMutation,
  };
}
