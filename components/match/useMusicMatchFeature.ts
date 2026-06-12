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

interface MusicMatchItem {
  user?: { id?: string };
  [key: string]: unknown;
}

type MusicMatchRaw = MusicMatchItem[] | { matches?: MusicMatchItem[] };

export function useMusicMatchFeature({ activeTab, lastfmConnected }: Options) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();

  const { data: musicMatches, isLoading: musicLoading, refetch: musicRefetch, isRefetching: musicRefetching, error: musicError } = useQuery<MusicMatchRaw, unknown, MusicMatchItem[]>({
    queryKey: ["/api/match/music"],
    enabled: !!user && activeTab === "music" && lastfmConnected,
    refetchInterval: 60000,
    select: (data: MusicMatchRaw) => (Array.isArray(data) ? data : (data?.matches ?? [])),
  });

  const isServerBusy = musicError instanceof ServerBusyError;

  const acceptMusicMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("POST", "/api/chat/conversations", { targetUserId: userId }),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/match/music"] });
      const previousMusic = queryClient.getQueryData(["/api/match/music"]);
      queryClient.setQueryData(["/api/match/music"], (old: MusicMatchRaw | undefined) => {
        if (Array.isArray(old)) return old.filter((m) => m.user?.id !== userId);
        if (old && Array.isArray((old as { matches?: MusicMatchItem[] }).matches)) {
          return { ...(old as { matches: MusicMatchItem[] }), matches: (old as { matches: MusicMatchItem[] }).matches.filter((m) => m.user?.id !== userId) };
        }
        return old;
      });
      return { previousMusic };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/match/music"] });
      const conv = data as unknown as { id?: string };
      if (conv.id) {
        router.push(`/chat/${conv.id}` as never);
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
      queryClient.setQueryData(["/api/match/music"], (old: MusicMatchRaw | undefined) => {
        if (Array.isArray(old)) return old.filter((m) => m.user?.id !== userId);
        if (old && Array.isArray((old as { matches?: MusicMatchItem[] }).matches)) {
          return { ...(old as { matches: MusicMatchItem[] }), matches: (old as { matches: MusicMatchItem[] }).matches.filter((m) => m.user?.id !== userId) };
        }
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
