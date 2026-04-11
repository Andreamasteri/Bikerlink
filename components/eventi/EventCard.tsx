import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { EventDTO } from "@/shared/event-types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/shared/event-types";
import { getApiUrl } from "@/lib/query-client";

function formatEventDate(dateStr: string, timeStr: string | null): string {
  try {
    const d = new Date(dateStr);
    const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    const dayName = days[d.getDay()];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const datePart = `${dayName} ${day} ${month} ${year}`;
    if (timeStr) {
      return `${datePart} · ${timeStr}`;
    }
    return datePart;
  } catch {
    return dateStr;
  }
}

function resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("/api/events/images/")) {
    return `${getApiUrl()}${imageUrl}`;
  }
  return `${getApiUrl()}${imageUrl}`;
}

interface EventCardProps {
  event: EventDTO;
  onPress: () => void;
}

export default function EventCard({ event, onPress }: EventCardProps) {
  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? Colors.accent;
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const coverImage = event.images?.[0];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {coverImage ? (
        <Image
          source={{ uri: resolveImageUrl(coverImage.imageUrl) }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="calendar-outline" size={36} color={Colors.textSecondary} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          {event.isRecurring && (
            <View style={styles.recurringBadge}>
              <Ionicons name="repeat" size={10} color="#fff" />
              <Text style={styles.recurringText}>Ricorrente</Text>
            </View>
          )}
          {event.userParticipation && (
            <View style={styles.participatingBadge}>
              <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
              <Text style={[styles.recurringText, { color: Colors.success }]}>
                {event.userParticipation === "going" ? "Partecipo" : "Forse"}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.infoRow}>
          <Ionicons name="calendar" size={12} color={Colors.accent} />
          <Text style={styles.infoText} numberOfLines={1}>
            {formatEventDate(event.eventDate, event.eventTime)}
          </Text>
        </View>

        {event.locationName && (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={12} color={Colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>
              {event.locationName}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={12} color={Colors.textSecondary} />
            <Text style={styles.participantText}>
              {event.participantCount} partecipanti
              {event.interestedCount > 0 ? ` · ${event.interestedCount} forse` : ""}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: {
    width: "100%",
    height: 160,
  },
  imagePlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 12,
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recurringText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  participatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  footer: {
    marginTop: 2,
  },
  participantText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
