import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import EventParticipantsComponent from "@/components/eventi/EventParticipants";
import type { EventDTO } from "@/shared/event-types";

interface EventDetailParticipantsProps {
  event: EventDTO;
}

export default function EventDetailParticipants({ event }: EventDetailParticipantsProps) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Partecipanti</Text>
      <EventParticipantsComponent
        participants={event.participants}
        participantCount={event.participantCount}
        interestedCount={event.interestedCount}
        onPress={(userId) => router.push(`/profile/${userId}` as const)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
