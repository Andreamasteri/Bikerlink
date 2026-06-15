import { useCallback } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import type { ConversationDetail } from "@/app/chat/chat-id-types";

interface CurrentUser {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  userType?: string | null;
  sex?: string | null;
}

interface UseChatConversationActionsProps {
  id: string;
  userId: string;
  user: CurrentUser | null;
  conversation: ConversationDetail | undefined;
  isMotoclub: boolean;
  t: (key: string) => string;
  onDeleteSuccess: () => void;
}

export function useChatConversationActions({
  id,
  userId,
  conversation,
  isMotoclub,
  t,
  onDeleteSuccess,
}: UseChatConversationActionsProps) {
  const otherParticipant = conversation?.participants.find((p) => p.id !== userId);
  const isPrivateChat = !isMotoclub && conversation?.participants.length === 2;

  const { data: lastfmStatus } = useQuery<{ connected: boolean; trackCount?: number }>({
    queryKey: ["/api/lastfm/status"],
    retry: false,
  });
  const musicConnected = lastfmStatus?.connected ?? false;
  const musicTrackCount = lastfmStatus?.trackCount ?? 0;

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/chat/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      onDeleteSuccess();
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/chat/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile eliminare il messaggio. Riprova.");
    },
  });

  const handleDeleteMessage = useCallback((messageId: string) => {
    deleteMessageMutation.mutate(messageId);
  }, [deleteMessageMutation]);

  const sharePlaylistMutation = useMutation({
    mutationFn: async ({ toUserId }: { toUserId: string }) => {
      const res = await apiRequest("POST", "/api/lastfm/share-playlist", {
        toUserId,
        conversationId: id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", id, "messages"] });
      Alert.alert(t("chat.librarySent"), t("chat.librarySentMsg"));
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile condividere la libreria. Riprova.");
    },
  });

  const handleSharePlaylist = useCallback(() => {
    if (!musicConnected) {
      Alert.alert(t("chat.musicNotConnected"), t("chat.connectLastfmMsg"));
      return;
    }
    if (!isPrivateChat || !otherParticipant) return;
    Alert.alert(
      t("chat.sendLibraryTitle"),
      t("chat.sendLibraryMsg")
        .replace("{count}", String(musicTrackCount))
        .replace("{name}", otherParticipant.nickname ?? ""),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("chat.send"), onPress: () => sharePlaylistMutation.mutate({ toUserId: otherParticipant.id }) },
      ]
    );
  }, [musicConnected, musicTrackCount, isPrivateChat, otherParticipant, sharePlaylistMutation, t]);

  const handleDeleteConversation = useCallback(() => {
    Alert.alert(
      t("chat.deleteTitle2"),
      t("chat.deleteConversationSimpleMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => deleteConversationMutation.mutate() },
      ]
    );
  }, [deleteConversationMutation, t]);

  return {
    otherParticipant,
    isPrivateChat,
    musicConnected,
    handleDeleteMessage,
    handleSharePlaylist,
    handleDeleteConversation,
  };
}
