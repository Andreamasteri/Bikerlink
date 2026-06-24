import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { MusicMatch } from "./types";

export function MatchCard({ match }: { match: MusicMatch }) {
  const t = useT();
  const router = useRouter();
  const localQueryClient = useQueryClient();
  const [chatLoading, setChatLoading] = useState(false);

  const openChat = useCallback(async () => {
    setChatLoading(true);
    try {
      const res = await apiRequest("POST", "/api/chat/conversations", { conversationType: "private", participantIds: [match.user.id] });
      const data = await res.json();
      localQueryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      router.push(`/chat/${data.id}` as never);
    } catch {
      Alert.alert(t("music.error"), t("music.chatOpenError"));
    } finally {
      setChatLoading(false);
    }
  // check-router-in-effect-deps: safe — router.push chiamato da press utente, non da useEffect
  }, [match.user.id, router, localQueryClient, t]);

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchLeft}>
        {match.user.photos[0] ? (
          <Image source={{ uri: match.user.photos[0] }} style={styles.matchAvatar} />
        ) : (
          <View style={[styles.matchAvatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={22} color={Colors.textSecondary} />
          </View>
        )}
      </View>
      <View style={styles.matchInfo}>
        <Text style={styles.matchName}>{match.user.nickname}</Text>
        <View style={styles.matchBadges}>
          {match.songsInCommon > 0 && (
            <View style={styles.badge}>
              <Ionicons name="musical-note" size={11} color={Colors.accent} />
              <Text style={styles.badgeText}>{match.songsInCommon} brani</Text>
            </View>
          )}
          {match.sharedGenre && (
            <View style={styles.badge}>
              <Ionicons name="radio" size={11} color={Colors.accent} />
              <Text style={styles.badgeText}>{match.sharedGenre}</Text>
            </View>
          )}
          {match.sharedArtist && (
            <View style={styles.badge}>
              <Ionicons name="person" size={11} color="#9B59B6" />
              <Text style={styles.badgeText}>{match.sharedArtist}</Text>
            </View>
          )}
        </View>
        {match.distanceKm > 0 && (
          <Text style={styles.matchDist}>{match.distanceKm} km di distanza</Text>
        )}
        <View style={styles.matchActions}>
          <TouchableOpacity
            style={styles.matchActionBtn}
            onPress={() => router.push(`/profile/${match.user.id}` as never)}
          >
            <Text style={styles.matchActionText}>Profilo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.matchActionBtn, { backgroundColor: Colors.accent }]}
            onPress={openChat}
            disabled={chatLoading}
          >
            {chatLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.matchActionText, { color: "#fff" }]}>Scrivi</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  matchLeft: {
    marginRight: 12,
  },
  matchAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 4,
  },
  matchBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  matchDist: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  matchActions: {
    flexDirection: "row",
    gap: 8,
  },
  matchActionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  matchActionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
});
