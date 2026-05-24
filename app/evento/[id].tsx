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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import EventForm from "@/components/eventi/EventForm";
import type { EventDTO } from "@/shared/event-types";
import { useT } from "@/lib/language-context";
import EventDetailHeader from "@/components/evento/detail/EventDetailHeader";
import EventDetailMap from "@/components/evento/detail/EventDetailMap";
import EventDetailParticipants from "@/components/evento/detail/EventDetailParticipants";
import EventDetailActions from "@/components/evento/detail/EventDetailActions";

function formatFullDate(dateStr: string, timeStr: string | null): string {
  try {
    const d = new Date(dateStr);
    const base = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return timeStr ? `${base} ${timeStr}` : base;
  } catch {
    return dateStr;
  }
}

function resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${getApiUrl()}${imageUrl}`;
}

export default function EventoDetail() {
  const t = useT();
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

  const userRole = (user as { role?: string } | null)?.role;
  const isAdmin = userRole === "admin" || userRole === "moderator";
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
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/events/${id}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
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
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
  });

  const handleDelete = () => {
    Alert.alert(
      t("events.deleteTitle"),
      t("events.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("events.deleteBtn"), style: "destructive", onPress: () => deleteMutation.mutate() },
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

  const topInset = insets.top;
  const bottomInset = insets.bottom;

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
        <EventDetailHeader
          event={event}
          isAdmin={isAdmin}
          isOwner={isOwner}
          imgIndex={imgIndex}
          setImgIndex={setImgIndex}
          resolveImageUrl={resolveImageUrl}
          formatFullDate={formatFullDate}
          handleOpenMap={handleOpenMap}
          handleOpenWebsite={handleOpenWebsite}
        />

        {event.latitude != null && event.longitude != null && (
          <View style={{ paddingHorizontal: 16 }}>
            <EventDetailMap
              latitude={event.latitude}
              longitude={event.longitude}
              handleOpenMap={handleOpenMap}
            />
          </View>
        )}

        <EventDetailActions
          event={event}
          joinMutationPending={joinMutation.isPending}
          leaveMutationPending={leaveMutation.isPending}
          onJoin={(status) => joinMutation.mutate(status)}
          onLeave={() => leaveMutation.mutate()}
        />

        <EventDetailParticipants event={event} />
      </ScrollView>

      <EventForm
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        editingEvent={event}
      />
    </View>
  );
}

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
});
