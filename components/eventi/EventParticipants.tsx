import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { EventParticipantDTO } from "@/shared/event-types";

interface EventParticipantsProps {
  participants: EventParticipantDTO[];
  participantCount: number;
  interestedCount: number;
  onPress?: (userId: string) => void;
}

const MAX_AVATARS = 5;

export default function EventParticipants({
  participants,
  participantCount,
  interestedCount,
  onPress,
}: EventParticipantsProps) {
  const going = participants.filter((p) => p.participationStatus === "going");
  const interested = participants.filter((p) => p.participationStatus === "interested");
  const displayAvatars = going.slice(0, MAX_AVATARS);
  const extra = participantCount - displayAvatars.length;

  if (participantCount === 0 && interestedCount === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={24} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nessun partecipante ancora</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.counters}>
        {participantCount > 0 && (
          <View style={styles.counterChip}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={[styles.counterText, { color: Colors.success }]}>
              {participantCount} ci vanno
            </Text>
          </View>
        )}
        {interestedCount > 0 && (
          <View style={styles.counterChip}>
            <Ionicons name="help-circle" size={14} color={Colors.warning} />
            <Text style={[styles.counterText, { color: Colors.warning }]}>
              {interestedCount} forse
            </Text>
          </View>
        )}
      </View>

      {displayAvatars.length > 0 && (
        <View style={styles.avatarRow}>
          {displayAvatars.map((p, idx) => (
            <Pressable
              key={p.userId}
              style={[styles.avatarWrapper, { marginLeft: idx === 0 ? 0 : -10, zIndex: MAX_AVATARS - idx }]}
              onPress={() => onPress?.(p.userId)}
            >
              {p.photoUrl ? (
                <Image
                  source={{ uri: p.photoUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={14} color={Colors.textSecondary} />
                </View>
              )}
            </Pressable>
          ))}
          {extra > 0 && (
            <View style={[styles.avatarWrapper, styles.extraBadge, { marginLeft: -10, zIndex: 0 }]}>
              <Text style={styles.extraText}>+{extra}</Text>
            </View>
          )}
        </View>
      )}

      {going.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.sectionLabel}>Ci vanno</Text>
          {going.map((p) => (
            <Pressable
              key={p.userId}
              style={styles.participantRow}
              onPress={() => onPress?.(p.userId)}
            >
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={styles.listAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.listAvatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={12} color={Colors.textSecondary} />
                </View>
              )}
              <Text style={styles.participantName}>{p.nickname ?? "Utente"}</Text>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            </Pressable>
          ))}
        </View>
      )}

      {interested.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.sectionLabel}>Forse ci saranno</Text>
          {interested.map((p) => (
            <Pressable
              key={p.userId}
              style={styles.participantRow}
              onPress={() => onPress?.(p.userId)}
            >
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={styles.listAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.listAvatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={12} color={Colors.textSecondary} />
                </View>
              )}
              <Text style={styles.participantName}>{p.nickname ?? "Utente"}</Text>
              <Ionicons name="help-circle" size={14} color={Colors.warning} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  counters: {
    flexDirection: "row",
    gap: 8,
  },
  counterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  counterText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrapper: {
    borderWidth: 2,
    borderColor: Colors.surface,
    borderRadius: 18,
    overflow: "hidden",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  extraBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  extraText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  listSection: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  listAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  participantName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
