import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import type { Proposal } from "@/components/map/userDetailTypes";

type Props = {
  proposals: Proposal[];
  detailLoading: boolean;
  onClose: () => void;
};

export default function UserProposals({ proposals, detailLoading, onClose }: Props) {
  const t = useT();
  const router = useRouter();

  if (proposals.length > 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("home.rideProposals")}</Text>
        {proposals.map((p) => (
          <Pressable
            key={p.id}
            style={styles.proposalCard}
            onPress={() => { onClose(); router.push(`/proposals/${p.id}` as any); }}
          >
            <Ionicons name="navigate" size={16} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.proposalTitle}>{p.title}</Text>
              {p.location && <Text style={styles.proposalSub}>{p.location}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    );
  }

  if (!detailLoading) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{t("home.noActiveProposals")}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  proposalCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, padding: 10, borderRadius: 8, marginBottom: 6,
  },
  proposalTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  proposalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyState: { alignItems: "center", paddingVertical: 12 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
