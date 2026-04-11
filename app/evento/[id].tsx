import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import EventParticipants from "@/components/eventi/EventParticipants";
import EventForm from "@/components/eventi/EventForm";
import type { EventDTO } from "@/shared/event-types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/shared/event-types";

function formatFullDate(dateStr: string, timeStr: string | null): string {
  try {
    const d = new Date(dateStr);
    const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
    ];
    const base = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    return timeStr ? `${base} alle ${timeStr}` : base;
  } catch {
    return dateStr;
  }
}

function resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${getApiUrl()}${imageUrl}`;
}

function StatusBadge({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  if (status === "approved") return null;
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "In attesa di approvazione", color: Colors.warning },
    rejected: { label: "Rifiutato", color: Colors.error },
    cancelled: { label: "Cancellato", color: Colors.textSecondary },
  };
  const info = map[status];
  if (!info) return null;
  return (
    <View>
      <View style={[statusStyles.badge, { backgroundColor: info.color + "22", borderColor: info.color }]}>
        <Text style={[statusStyles.label, { color: info.color }]}>{info.label}</Text>
      </View>
      {status === "rejected" && rejectionReason && (
        <Text style={statusStyles.reason}>Motivo: {rejectionReason}</Text>
      )}
    </View>
  );
}

const statusStyles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  reason: {
    marginTop: 4,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.error,
  },
});

export default function EventoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);

  const { data: event, isLoading, error } = useQuery<EventDTO>({
    queryKey: ["/api/events", id],
    enabled: !!id,
  });

  const isAdmin = (user as any)?.role === "admin" || (user as any)?.role === "moderator";
  const isOwner = event?.creatorId === user?.id;
  const canManage = isOwner || isAdmin;

  const joinMutation = useMutation({
    mutationFn: async (status: "going" | "interested") => {
      return apiRequest("POST", `/api/events/${id}/join`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/events/${id}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/my"] });
      router.back();
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const handleDelete = () => {
    Alert.alert(
      "Elimina evento",
      "Sei sicuro di voler eliminare questo evento? L'operazione è irreversibile.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  const handleOpenMap = () => {
    if (!event?.latitude || !event?.longitude) return;
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${event.locationName ?? "Evento"}&ll=${event.latitude},${event.longitude}`
        : `geo:${event.latitude},${event.longitude}?q=${event.latitude},${event.longitude}(${event.locationName ?? "Evento"})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://maps.google.com/?q=${event.latitude},${event.longitude}`
      );
    });
  };

  const handleOpenWebsite = async () => {
    if (!event?.websiteUrl) return;
    await WebBrowser.openBrowserAsync(event.websiteUrl);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!event || error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textSecondary} />
        <Text style={styles.errorText}>Evento non trovato</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Torna indietro</Text>
        </Pressable>
      </View>
    );
  }

  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? Colors.accent;
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        {canManage && (
          <View style={styles.navRight}>
            <Pressable onPress={() => setShowEdit(true)} style={styles.navBtn}>
              <Ionicons name="pencil" size={20} color={Colors.accent} />
            </Pressable>
            {(isOwner && event.status === "pending") || isAdmin ? (
              <Pressable
                onPress={handleDelete}
                style={[styles.navBtn, deleteMutation.isPending && { opacity: 0.5 }]}
                disabled={deleteMutation.isPending}
              >
                <Ionicons name="trash" size={20} color={Colors.error} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      >
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

          {event.status === "approved" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Partecipazione</Text>
              <View style={styles.joinBtns}>
                <Pressable
                  style={[
                    styles.joinBtn,
                    event.userParticipation === "going" && styles.joinBtnActive,
                    (joinMutation.isPending || leaveMutation.isPending) && styles.joinBtnDisabled,
                  ]}
                  onPress={() => {
                    if (event.userParticipation === "going") {
                      leaveMutation.mutate();
                    } else {
                      joinMutation.mutate("going");
                    }
                  }}
                  disabled={joinMutation.isPending || leaveMutation.isPending}
                >
                  <Ionicons
                    name={event.userParticipation === "going" ? "checkmark-circle" : "checkmark-circle-outline"}
                    size={20}
                    color={event.userParticipation === "going" ? "#000" : Colors.success}
                  />
                  <Text style={[styles.joinBtnText, event.userParticipation === "going" && { color: "#000" }]}>
                    Ci vado!
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.joinBtn,
                    styles.joinBtnMaybe,
                    event.userParticipation === "interested" && styles.joinBtnMaybeActive,
                    (joinMutation.isPending || leaveMutation.isPending) && styles.joinBtnDisabled,
                  ]}
                  onPress={() => {
                    if (event.userParticipation === "interested") {
                      leaveMutation.mutate();
                    } else {
                      joinMutation.mutate("interested");
                    }
                  }}
                  disabled={joinMutation.isPending || leaveMutation.isPending}
                >
                  <Ionicons
                    name={event.userParticipation === "interested" ? "help-circle" : "help-circle-outline"}
                    size={20}
                    color={event.userParticipation === "interested" ? "#000" : Colors.warning}
                  />
                  <Text style={[styles.joinBtnText, event.userParticipation === "interested" && { color: "#000" }]}>
                    Forse
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partecipanti</Text>
            <EventParticipants
              participants={event.participants}
              participantCount={event.participantCount}
              interestedCount={event.interestedCount}
              onPress={(userId) => router.push(`/profile/${userId}` as const)}
            />
          </View>
        </View>
      </ScrollView>

      <EventForm
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        editingEvent={event}
      />
    </View>
  );
}

const CAROUSEL_HEIGHT = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.textSecondary,
  },
  backBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  backBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  navBtn: {
    padding: 6,
  },
  navRight: {
    flexDirection: "row",
    gap: 4,
  },
  carousel: {
    height: CAROUSEL_HEIGHT,
    backgroundColor: Colors.surfaceLight,
  },
  carouselImage: {
    width: Dimensions.get("window").width,
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
  joinBtns: {
    flexDirection: "row",
    gap: 10,
  },
  joinBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.success,
    backgroundColor: Colors.surface,
  },
  joinBtnActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  joinBtnMaybe: {
    borderColor: Colors.warning,
  },
  joinBtnMaybeActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  joinBtnDisabled: {
    opacity: 0.6,
  },
  joinBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
});
