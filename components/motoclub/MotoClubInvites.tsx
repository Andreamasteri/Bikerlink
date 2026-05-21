import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getCurrentLocale } from "@/lib/i18n";
import { Club, ClubAvatar, UserClub } from "./MotoClubCard";

export type Invite = {
  id: string;
  status: string;
  clubId: string;
  createdAt: string;
};

interface MotoClubInvitesProps {
  pendingInvites: Invite[];
  clubs: Club[];
  onBack: () => void;
  onRespond: (id: string, action: "accept" | "reject") => void;
}

export const MotoClubInvites: React.FC<MotoClubInvitesProps> = ({
  pendingInvites,
  clubs,
  onBack,
  onRespond,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.inviteHeader}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.inviteHeaderTitle}>Inviti ai Club</Text>
      </View>
      <FlatList
        data={pendingInvites}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const club = clubs.find((c) => c.id === item.clubId);
          return (
            <View style={styles.inviteCard}>
              {club && <ClubAvatar club={club} size={44} />}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.inviteClubName}>{club?.name ?? "Club"}</Text>
                <Text style={styles.inviteDate}>
                  {new Date(item.createdAt).toLocaleDateString(getCurrentLocale())}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => onRespond(item.id, "accept")}
              >
                <Text style={styles.acceptText}>Accetta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => onRespond(item.id, "reject")}
              >
                <Text style={styles.rejectText}>Rifiuta</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inviteHeaderTitle: { fontSize: 18, color: Colors.text, fontFamily: "Inter_700Bold" },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  inviteClubName: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  inviteDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.success,
  },
  acceptText: { fontSize: 12, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rejectText: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
});
