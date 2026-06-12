import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { queryClient, apiRequest, ServerBusyError } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";

interface Options {
  activeTab: string;
  lastfmConnected: boolean;
}

export function useMusicMatchFeature({ activeTab, lastfmConnected }: Options) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- music match shape
  const { data: musicMatches, isLoading: musicLoading, refetch: musicRefetch, isRefetching: musicRefetching, error: musicError } = useQuery<any, unknown, any[]>({
    queryKey: ["/api/match/music"],
    enabled: !!user && activeTab === "music" && lastfmConnected,
    refetchInterval: 60000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server returns { matches: [] }, extract the array
    select: (data: any) => (Array.isArray(data) ? data : (data?.matches ?? [])),
  });

  const isServerBusy = musicError instanceof ServerBusyError;

  const acceptMusicMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("POST", "/api/chat/conversations", { targetUserId: userId }),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/match/music"] });
      const previousMusic = queryClient.getQueryData(["/api/match/music"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- music match shape
      queryClient.setQueryData(["/api/match/music"], (old: any) => {
        if (Array.isArray(old)) return old.filter((m: { user?: { id?: string } }) => m.user?.id !== userId);
        if (old && Array.isArray(old.matches)) return { ...old, matches: old.matches.filter((m: { user?: { id?: string } }) => m.user?.id !== userId) };
        return old;
      });
      return { previousMusic };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/match/music"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape
      if ((data as any).id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape
        router.push(`/chat/${(data as any).id}` as never);
      }
    },
    onError: (_err: unknown, _userId: string, context: { previousMusic?: unknown } | undefined) => {
      if (context?.previousMusic !== undefined) {
        queryClient.setQueryData(["/api/match/music"], context.previousMusic);
      }
      Alert.alert(t("common.error"), t("match.acceptError"));
    },
  });

  const rejectMusicMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("POST", `/api/match/music/${userId}/reject`),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/match/music"] });
      const previousMusic = queryClient.getQueryData(["/api/match/music"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- music match shape
      queryClient.setQueryData(["/api/match/music"], (old: any) => {
        if (Array.isArray(old)) return old.filter((m: { user?: { id?: string } }) => m.user?.id !== userId);
        if (old && Array.isArray(old.matches)) return { ...old, matches: old.matches.filter((m: { user?: { id?: string } }) => m.user?.id !== userId) };
        return old;
      });
      return { previousMusic };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match/music"] });
    },
    onError: (_err: unknown, _userId: string, context: { previousMusic?: unknown } | undefined) => {
      if (context?.previousMusic !== undefined) {
        queryClient.setQueryData(["/api/match/music"], context.previousMusic);
      }
      Alert.alert(t("common.error"), t("match.rejectError"));
    },
  });

  return {
    musicMatches,
    musicLoading,
    musicRefetch,
    musicRefetching,
    isServerBusy,
    acceptMusicMutation,
    rejectMusicMutation,
  };
}
