import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import LeafletMiniMap from "@/components/LeafletMiniMap";

interface ClubLocationSectionProps {
  latitude: number | null;
  longitude: number | null;
  hasPendingProposal: boolean;
  onPropose: () => void;
}

export const ClubLocationSection: React.FC<ClubLocationSectionProps> = ({
  latitude,
  longitude,
  hasPendingProposal,
  onPropose,
}) => {
  return (
    <View style={styles.locationSection}>
      {latitude != null ? (
        <>
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker-check" size={18} color={Colors.success} />
            <Text style={styles.locationText}>Sede confermata in mappa</Text>
          </View>
          <View style={{ height: 160, marginTop: 8, borderRadius: 8, overflow: "hidden" }}>
            <LeafletMiniMap latitude={latitude} longitude={longitude!} height={160} />
          </View>
        </>
      ) : (
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker-question" size={18} color={Colors.textSecondary} />
          <Text style={styles.locationText}>Nessuna sede fisssata</Text>
        </View>
      )}
      {hasPendingProposal && (
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="clock-outline" size={16} color="#F59E0B" />
          <Text style={[styles.locationText, { color: "#F59E0B" }]}>Proposta in attesa di approvazione</Text>
        </View>
      )}
      {!hasPendingProposal && (
        <TouchableOpacity
          style={styles.proposeBtn}
          onPress={onPropose}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={16} color="#fff" />
          <Text style={styles.proposeBtnText}>Proponi sede</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  locationSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  proposeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2979FF",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  proposeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
});
