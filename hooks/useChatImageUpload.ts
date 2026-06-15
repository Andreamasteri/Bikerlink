import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { showImagePickerMenu, uriToBlob } from "@/lib/image-picker-utils";
import type { ChatMessage } from "@/components/chat/MessageBubble";

interface CurrentUser {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  userType?: string | null;
  sex?: string | null;
}

interface UseChatImageUploadProps {
  id: string;
  userId: string;
  user: CurrentUser | null;
  t: (key: string) => string;
}

export function useChatImageUpload({ id, userId, user, t }: UseChatImageUploadProps) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const uploadPhoto = useCallback(async (uri: string) => {
    const optimisticId = `optimistic-photo-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      conversationId: id,
      senderId: userId,
      messageType: "image",
      content: null,
      imageUrl: uri,
      latitude: null,
      longitude: null,
      isFiltered: false,
      createdAt: new Date().toISOString(),
      sender: user
        ? {
            id: user.id,
            nickname: user.nickname ?? "",
            avatarUrl: user.avatarUrl ?? null,
            userType: user.userType ?? "biker",
            sex: user.sex ?? null,
          }
        : null,
    };
    queryClient.setQueryData<ChatMessage[]>(
      ["/api/chat/conversations", id, "messages"],
      (old) => (old ? [optimisticMsg, ...old] : [optimisticMsg])
    );

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const blob = await uriToBlob(uri, mimeType);
      formData.append("image", blob, filename);

      const uploadUrl = new URL(`/api/chat/conversations/${id}/images`, getApiUrl()).toString();
      const resp = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: t("chat.uploadError") }));
        throw new Error((err as Error).message ?? t("chat.uploadPhotoError"));
      }

      const newMessage: ChatMessage = await resp.json();
      queryClient.setQueryData<ChatMessage[]>(
        ["/api/chat/conversations", id, "messages"],
        (old) => {
          if (!old) return [newMessage];
          return old.map((m) => (m.id === optimisticId ? newMessage : m));
        }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    } catch (err: unknown) {
      queryClient.setQueryData<ChatMessage[]>(
        ["/api/chat/conversations", id, "messages"],
        (old) => (old ? old.filter((m) => m.id !== optimisticId) : old)
      );
      Alert.alert("Errore", (err instanceof Error ? err.message : null) ?? "Impossibile inviare la foto.");
    } finally {
      setIsUploadingImage(false);
    }
  }, [id, userId, user, t]);

  const handleSendPhoto = useCallback(() => {
    showImagePickerMenu((uri) => { uploadPhoto(uri); });
  }, [uploadPhoto]);

  return { uploadPhoto, handleSendPhoto, isUploadingImage };
}
