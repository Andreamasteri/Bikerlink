import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  FlatList, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";

const HAZARD_COLORS: Record<string, string> = {
  oil: "#FF6F00",
  gravel: "#795548",
  animals: "#2E7D32",
  roadwork: "#F57C00",
  wet: "#1565C0",
  accident: "#C62828",
  fog: "#546E7A",
  slowdown: "#6A1B9A",
};

interface HazardComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  nickname: string;
}

interface HazardDetail {
  id: string;
  type: string;
  lat: number;
  lng: number;
  description?: string | null;
  confirmCount: number;
  expiresAt?: string | null;
  createdAt: string;
  label: string;
  icon: string;
}

interface HazardDetailResponse {
  hazard: HazardDetail;
  comments: HazardComment[];
}

interface HazardDetailSheetProps {
  hazardId: string | null;
  onClose: () => void;
}

function formatTimeAgo(isoString: string): string {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return "adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return `${Math.floor(diff / 86400)}g fa`;
}

function formatExpiry(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  const remaining = (new Date(isoString).getTime() - Date.now()) / 1000;
  if (remaining <= 0) return "Scaduta";
  if (remaining < 3600) return `Scade tra ${Math.floor(remaining / 60)} min`;
  return `Scade tra ${Math.floor(remaining / 3600)}h`;
}

export function HazardDetailSheet({ hazardId, onClose }: HazardDetailSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const queryKey = ["/api/road-hazards", hazardId];

  const { data, isLoading, isError } = useQuery<HazardDetailResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        getApiUrl() + "/api/road-hazards/" + hazardId,
        { headers: authFetchHeaders() }
      );
      if (!res.ok) throw new Error("Errore caricamento");
      const json = await res.json();
      return json.data;
    },
    enabled: !!hazardId,
    staleTime: 30_000,
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/road-hazards/${hazardId}/comments`, {
        text: commentText.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      const myComment = data?.comments.find((c) => c.userId === user?.id);
      if (!myComment) setCommentText("");
    },
  });

  const bottomPad = insets.bottom;
  const accentColor = data ? (HAZARD_COLORS[data.hazard.type] ?? "#FF6F00") : "#FF6F00";

  const myExistingComment = data?.comments.find((c) => c.userId === user?.id);

  React.useEffect(() => {
    setCommentText(myExistingComment ? myExistingComment.text : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazardId, myExistingComment?.id]);

  const visible = !!hazardId;

  const renderComment = ({ item }: { item: HazardComment }) => (
    <View style={[styles.commentRow, { borderBottomColor: colors.border }]}>
      <View style={styles.commentHeader}>
        <Text style={[styles.commentNick, { color: accentColor }]}>{item.nickname}</Text>
        <Text style={[styles.commentTime, { color: colors.textMuted }]}>
          {formatTimeAgo(item.updatedAt || item.createdAt)}
        </Text>
      </View>
      <Text style={[styles.commentText, { color: colors.text }]}>{item.text}</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kavWrapper}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: bottomPad + 12 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator color={accentColor} />
            </View>
          )}

          {isError && (
            <Text style={[styles.errorMsg, { color: colors.textMuted }]}>
              Impossibile caricare la segnalazione.
            </Text>
          )}

          {data && (
            <>
              {/* Header */}
              <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.iconBadge, { backgroundColor: accentColor }]}>
                  <Text style={styles.iconEmoji}>{data.hazard.icon}</Text>
                </View>
                <View style={styles.headerMeta}>
                  <Text style={[styles.hazardTitle, { color: colors.text }]} numberOfLines={1}>
                    {data.hazard.label}
                  </Text>
                  <Text style={[styles.hazardMeta, { color: colors.textMuted }]}>
                    {formatTimeAgo(data.hazard.createdAt)}
                    {data.hazard.confirmCount > 0 ? ` · ${data.hazard.confirmCount} ✓` : ""}
                    {data.hazard.expiresAt ? ` · ${formatExpiry(data.hazard.expiresAt)}` : ""}
                  </Text>
                  {data.hazard.description ? (
                    <Text style={[styles.hazardDesc, { color: colors.textMuted }]} numberOfLines={2}>
                      {data.hazard.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Comments */}
              <FlatList<HazardComment>
                data={data.comments}
                keyExtractor={(c) => c.id}
                renderItem={renderComment}
                style={styles.commentList}
                ListEmptyComponent={
                  <Text style={[styles.emptyComments, { color: colors.textMuted }]}>
                    Nessun commento ancora. Sii il primo!
                  </Text>
                }
                scrollEnabled={!!data.comments.length}
                showsVerticalScrollIndicator={false}
              />

              {/* Input */}
              {isAuthenticated ? (
                <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
                  <TextInput
                    ref={inputRef}
                    style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                    placeholder={myExistingComment ? "Modifica il tuo commento…" : "Lascia un commento…"}
                    placeholderTextColor={colors.textMuted}
                    value={commentText}
                    onChangeText={(t) => setCommentText(t.slice(0, 140))}
                    maxLength={140}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (commentText.trim()) commentMutation.mutate();
                    }}
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      { backgroundColor: commentText.trim() ? accentColor : colors.border },
                    ]}
                    onPress={() => commentMutation.mutate()}
                    disabled={!commentText.trim() || commentMutation.isPending}
                    activeOpacity={0.8}
                  >
                    {commentMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.sendIcon}>➤</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.loginHint, { color: colors.textMuted }]}>
                  Accedi per lasciare un commento.
                </Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  kavWrapper: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: "75%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  centered: {
    paddingVertical: 32,
    alignItems: "center",
  },
  errorMsg: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 22,
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  hazardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  hazardMeta: {
    fontSize: 12,
  },
  hazardDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  commentList: {
    maxHeight: 200,
  },
  commentRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  commentNick: {
    fontSize: 12,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 11,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 19,
  },
  emptyComments: {
    textAlign: "center",
    paddingVertical: 16,
    fontSize: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    minHeight: 38,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendIcon: {
    color: "#fff",
    fontSize: 16,
    marginLeft: 2,
  },
  loginHint: {
    textAlign: "center",
    fontSize: 13,
    paddingTop: 12,
    paddingBottom: 4,
  },
});
