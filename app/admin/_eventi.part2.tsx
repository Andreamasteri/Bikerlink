import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { EventDTO } from "@/shared/event-types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/shared/event-types";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function resolveImageUrl(imageUrl: string, apiUrl: string): string {
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${apiUrl}${imageUrl}`;
}

export function EventAdminCard({
  event,
  onApprove,
  onReject,
  onView,
  isPending,
  apiUrl,
}: {
  event: EventDTO;
  onApprove?: () => void;
  onReject?: () => void;
  onView: () => void;
  isPending?: boolean;
  apiUrl: string;
}) {
  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? Colors.accent;
  const cover = event.images?.[0];

  return (
    <View style={card.container}>
      <Pressable onPress={onView} style={card.pressable}>
        {cover ? (
          <Image
            source={{ uri: resolveImageUrl(cover.imageUrl, apiUrl) }}
            style={card.image}
            contentFit="cover"
          />
        ) : (
          <View style={[card.image, card.imageFallback]}>
            <Ionicons name="calendar-outline" size={24} color={Colors.textSecondary} />
          </View>
        )}
        <View style={card.body}>
          <View style={card.row}>
            <View style={[card.typeBadge, { backgroundColor: typeColor }]}>
              <Text style={card.typeText}>{EVENT_TYPE_LABELS[event.eventType]}</Text>
            </View>
            <Text style={card.date}>{formatDate(event.eventDate)}</Text>
          </View>
          <Text style={card.title} numberOfLines={2}>{event.title}</Text>
          {event.locationName && (
            <Text style={card.location} numberOfLines={1}>
              <Ionicons name="location" size={11} color={Colors.textSecondary} /> {event.locationName}
            </Text>
          )}
          <Text style={card.creator}>@{event.creatorNickname ?? "utente"}</Text>
        </View>
      </Pressable>

      {(onApprove || onReject) && (
        <View style={card.actions}>
          {onApprove && (
            <Pressable
              style={[card.btn, card.approveBtn, isPending && card.btnDisabled]}
              onPress={onApprove}
              disabled={isPending}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={card.btnText}>Approva</Text>
            </Pressable>
          )}
          {onReject && (
            <Pressable
              style={[card.btn, card.rejectBtn, isPending && card.btnDisabled]}
              onPress={onReject}
              disabled={isPending}
            >
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={card.btnText}>Rifiuta</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const card = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  pressable: {
    flexDirection: "row",
  },
  image: {
    width: 80,
    height: 80,
  },
  imageFallback: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    padding: 10,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  date: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    lineHeight: 18,
  },
  location: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  creator: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.error,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
