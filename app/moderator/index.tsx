import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,

} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ModerationPhoto {
  id: string;
  type: "user_photo" | "contest_entry";
  photoUrl: string;
  userId: string;
  caption?: string;
  createdAt: string;
  isApproved: boolean;
}

function PhotoCard({ item, onApprove, onReject }: {
  item: ModerationPhoto;
  onApprove: (id: string, type: string) => void;
  onReject: (id: string, type: string) => void;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  return (
    <View style={styles.card}>
      <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />
      <View style={styles.cardInfo}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {item.type === "contest_entry" ? "Contest" : "Profilo"}
          </Text>
        </View>
        {item.caption ? (
          <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
        ) : null}
        <Text style={styles.dateText}>
          {new Date(item.createdAt).toLocaleDateString("it-IT")}
        </Text>
      </View>
      {showRejectInput ? (
        <View style={styles.rejectInputContainer}>
          <TextInput
            style={styles.rejectInput}
            placeholder="Motivo del rifiuto (opzionale)"
            placeholderTextColor={Colors.textSecondary}
            value={rejectReason}
            onChangeText={setRejectReason}
          />
          <View style={styles.rejectActions}>
            <TouchableOpacity
              onPress={() => setShowRejectInput(false)}
              style={styles.cancelBtn}
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onReject(item.id, item.type);
                setShowRejectInput(false);
                setRejectReason("");
              }}
              style={styles.confirmRejectBtn}
            >
              <Ionicons name="checkmark" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onApprove(item.id, item.type)}
            style={styles.approveBtn}
          >
            <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRejectInput(true)}
            style={styles.rejectBtn}
          >
            <Ionicons name="close-circle" size={28} color={Colors.error} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ModeratorPhotosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webTopInset = 0;

  const { data: photos, isLoading } = useQuery<ModerationPhoto[]>({
    queryKey: ["/api/moderator/photos"]
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      await apiRequest("PUT", `/api/moderator/photos/${id}/approve`, { type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/photos"] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, type, reason }: { id: string; type: string; reason?: string }) => {
      await apiRequest("PUT", `/api/moderator/photos/${id}/reject`, { type, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/photos"] });
    }
  });

  const handleApprove = (id: string, type: string) => {
    approveMutation.mutate({ id, type });
  };

  const handleReject = (id: string, type: string) => {
    rejectMutation.mutate({ id, type });
  };

  const renderItem = ({ item }: { item: ModerationPhoto }) => (
    <PhotoCard item={item} onApprove={handleApprove} onReject={handleReject} />
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile" as Href)}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Moderazione Foto</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push("/moderator/feedback")} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="bug-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/moderator/campaigns")} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="bullhorn-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : !photos || photos.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle" size={64} color={Colors.success} />
            <Text style={styles.emptyText}>Nessuna foto da moderare</Text>
          </View>
        ) : (
          <FlatList
            data={photos}
            renderItem={renderItem}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text
  },
  headerActions: {
    flexDirection: "row",
    gap: 4
  },
  headerActionBtn: {
    padding: 4
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium"
  },
  list: {
    padding: 16,
    gap: 16
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16
  },
  photo: {
    width: "100%",
    height: 250
  },
  cardInfo: {
    padding: 12,
    gap: 6
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.accent + "30",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  typeBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textTransform: "uppercase" as const
  },
  caption: {
    fontSize: 14,
    color: Colors.text,
    fontFamily: "Inter_400Regular"
  },
  dateText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular"
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  approveBtn: {
    padding: 8
  },
  rejectBtn: {
    padding: 8
  },
  rejectInputContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8
  },
  rejectInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14
  },
  rejectActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12
  },
  cancelBtn: {
    padding: 8
  },
  confirmRejectBtn: {
    backgroundColor: Colors.error,
    borderRadius: 8,
    padding: 8
  }
});
