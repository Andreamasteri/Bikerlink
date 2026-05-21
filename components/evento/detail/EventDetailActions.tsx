import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { EventDTO } from "@/shared/event-types";

interface EventDetailActionsProps {
  event: EventDTO;
  joinMutationPending: boolean;
  leaveMutationPending: boolean;
  onJoin: (status: "going" | "interested") => void;
  onLeave: () => void;
}

export default function EventDetailActions({
  event,
  joinMutationPending,
  leaveMutationPending,
  onJoin,
  onLeave,
}: EventDetailActionsProps) {
  if (event.status !== "approved") return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Partecipazione</Text>
      <View style={styles.joinBtns}>
        <Pressable
          style={[
            styles.joinBtn,
            event.userParticipation === "going" && styles.joinBtnActive,
            (joinMutationPending || leaveMutationPending) && styles.joinBtnDisabled,
          ]}
          onPress={() => {
            if (event.userParticipation === "going") {
              onLeave();
            } else {
              onJoin("going");
            }
          }}
          disabled={joinMutationPending || leaveMutationPending}
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
            (joinMutationPending || leaveMutationPending) && styles.joinBtnDisabled,
          ]}
          onPress={() => {
            if (event.userParticipation === "interested") {
              onLeave();
            } else {
              onJoin("interested");
            }
          }}
          disabled={joinMutationPending || leaveMutationPending}
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
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
