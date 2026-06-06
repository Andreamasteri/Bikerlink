import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { useAssistantPrefs } from "@/hooks/useAssistantPrefs";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";

interface ProfileData {
  id: string;
  nickname: string;
  email: string;
  userType: string;
  sex?: string;
  coupleSexConfig?: string;
  birthYear?: number;
  region?: string;
  country?: string;
  avatarUrl?: string;
  floatingWidgetEnabled?: boolean;
  profile?: {
    bio?: string;
    maxPickupDistance?: number;
  };
  photos?: Array<{
    id: string;
    photoUrl: string;
    sortOrder: number;
    isApproved: boolean;
  }>;
  motorcycles?: Array<{
    id: string;
    brand: string;
    model: string;
    year?: number;
    displacement?: number;
    motorcycleType?: string;
    ridingStyle?: string;
  }>;
}

type AssistantPrefsData = {
  prefs: {
    disabled?: boolean;
    proactiveDisabled?: boolean;
    onboardingDisabled?: boolean;
    updatedAt?: string;
  };
};

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

  const updateFloatingWidgetMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const prev = queryClient.getQueryData<ProfileData>(["/api/users/me"]);
      const prevAuth = queryClient.getQueryData<Record<string, unknown>>(["/api/auth/me"]);
      queryClient.setQueryData<ProfileData>(["/api/users/me"], (old) =>
        old ? { ...old, floatingWidgetEnabled: enabled } : old
      );
      queryClient.setQueryData<Record<string, unknown>>(["/api/auth/me"], (old) =>
        old ? { ...old, floatingWidgetEnabled: enabled } : old
      );
      try {
        const res = await apiRequest("PUT", "/api/users/me", { floatingWidgetEnabled: enabled });
        return await res.json();
      } catch (e) {
        queryClient.setQueryData<ProfileData>(["/api/users/me"], prev);
        queryClient.setQueryData<Record<string, unknown>>(["/api/auth/me"], prevAuth);
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  type AIPatch = { disabled?: boolean };
  type AICtx = { prev: AssistantPrefsData | undefined };

  const updateAssistantPrefsMutation = useMutation<AssistantPrefsData, Error, AIPatch, AICtx>({
    mutationFn: async (patch) => {
      const res = await apiRequest("PATCH", "/api/users/me/assistant-prefs", patch);
      return res.json() as Promise<AssistantPrefsData>;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["/api/users/me/assistant-prefs"] });
      const prev = queryClient.getQueryData<AssistantPrefsData>(["/api/users/me/assistant-prefs"]);
      queryClient.setQueryData<AssistantPrefsData>(["/api/users/me/assistant-prefs"], (old) =>
        old ? { prefs: { ...old.prefs, ...patch } } : { prefs: { ...patch } }
      );
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(["/api/users/me/assistant-prefs"], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/assistant-prefs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/assistant/config"] });
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

  const { data: adminWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
  });

  const assistantPrefsQ = useAssistantPrefs();
  const { adminDisabledForPlatform: assistantAdminDisabled } = useAssistantEnabled();

  return {
    updateProfileMutation,
    updateFloatingWidgetMutation,
    updateAssistantPrefsMutation,
    addMotoMutation,
    deletePhotoMutation,
    requestDeletionMutation,
    adminWidgetEnabled: adminWidgetData?.enabled !== false,
    assistantPrefsQ,
    assistantAdminDisabled,
  };
}
