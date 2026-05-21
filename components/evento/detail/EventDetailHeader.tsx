import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/shared/event-types";
import type { EventDTO } from "@/shared/event-types";
import StatusBadge from "./StatusBadge";

interface EventDetailHeaderProps {
  event: EventDTO;
  isAdmin: boolean;
  isOwner: boolean;
  imgIndex: number;
  setImgIndex: (index: number) => void;
  resolveImageUrl: (url: string) => string;
  formatFullDate: (date: string, time: string | null) => string;
  handleOpenMap: () => void;
  handleOpenWebsite: () => void;
}

const CAROUSEL_HEIGHT = 260;

export default function EventDetailHeader({
  event,
  isAdmin,
  isOwner,
  imgIndex,
  setImgIndex,
  resolveImageUrl,
  formatFullDate,
  handleOpenMap,
  handleOpenWebsite,
}: EventDetailHeaderProps) {
  const router = useRouter();
  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? Colors.accent;
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;

  return (
    <>
      {event.images.length > 0 ? (
        <View style={styles.carousel}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
              setImgIndex(idx);
            }}
          >
            {event.images.map((img) => (
              <Image
                key={img.id}
                source={{ uri: resolveImageUrl(img.imageUrl) }}
                style={styles.carouselImage}
                contentFit="cover"
              />
            ))}
          </ScrollView>
          {event.images.length > 1 && (
            <View style={styles.dots}>
              {event.images.map((_, i) => (
                <View key={i} style={[styles.dot, i === imgIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.imagePlaceholder}>
          <MaterialCommunityIcons name="motorbike" size={56} color={Colors.textSecondary} />
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          {event.isRecurring && (
            <View style={styles.recurringBadge}>
              <Ionicons name="repeat" size={11} color={Colors.textSecondary} />
              <Text style={styles.recurringText}>Ricorrente</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{event.title}</Text>

        {(isOwner || isAdmin) && event.status !== "approved" && (
          <StatusBadge status={event.status} rejectionReason={event.rejectionReason} />
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color={Colors.accent} />
            <Text style={styles.infoText}>{formatFullDate(event.eventDate, event.eventTime)}</Text>
          </View>

          {event.isRecurring && event.recurrenceInfo && (
            <View style={styles.infoRow}>
              <Ionicons name="repeat" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{event.recurrenceInfo}</Text>
            </View>
          )}

          {event.locationName && (
            <Pressable style={styles.infoRow} onPress={handleOpenMap}>
              <Ionicons name="location" size={16} color={Colors.accent} />
              <Text style={[styles.infoText, { flex: 1 }]}>{event.locationName}</Text>
              {(event.latitude && event.longitude) && (
                <Ionicons name="open-outline" size={14} color={Colors.textSecondary} />
              )}
            </Pressable>
          )}

          {event.maxParticipants && event.maxParticipants > 0 && (
            <View style={styles.infoRow}>
              <Ionicons name="people" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>
                Max {event.maxParticipants} partecipanti
              </Text>
            </View>
          )}

          {event.websiteUrl && (
            <Pressable style={styles.infoRow} onPress={handleOpenWebsite}>
              <Ionicons name="globe-outline" size={16} color={Colors.accent} />
              <Text style={[styles.infoText, styles.link]} numberOfLines={1}>
                {event.websiteUrl}
              </Text>
              <Ionicons name="open-outline" size={14} color={Colors.accent} />
            </Pressable>
          )}
        </View>

        {event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descrizione</Text>
            <Text style={styles.description}>{event.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organizzatore</Text>
          <Pressable
            style={styles.creatorRow}
            onPress={() => router.push(`/profile/${event.creatorId}` as const)}
          >
            <Ionicons name="person-circle-outline" size={28} color={Colors.textSecondary} />
            <Text style={styles.creatorText}>@{event.creatorNickname ?? "Utente"}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  carousel: {
    height: CAROUSEL_HEIGHT,
    backgroundColor: Colors.surfaceLight,
  },
  carouselImage: {
    width: "100%",
    height: CAROUSEL_HEIGHT,
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 14,
  },
  imagePlaceholder: {
    height: 160,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  typeBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recurringText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    lineHeight: 30,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  link: {
    color: Colors.accent,
    flex: 1,
    textDecorationLine: "underline",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  creatorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
});
