import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProfileMoto {
  id: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  engineSize?: number | null;
  ridingStyle?: string | null;
  isForSale?: boolean;
  saleDescription?: string | null;
}
interface ProfileDetailMotoProps {
  profile: { motorcycles?: ProfileMoto[] };
  marketplaceEnabled: boolean;
}

export const ProfileDetailMoto: React.FC<ProfileDetailMotoProps> = ({ profile, marketplaceEnabled }) => {
  if (!profile.motorcycles || profile.motorcycles.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Moto</Text>
      {profile.motorcycles.map((m) => (
        <View key={m.id} style={styles.motoCard}>
          <MaterialCommunityIcons name="motorbike" size={24} color={Colors.accent} />
          <View style={styles.motoInfo}>
            <Text style={styles.motoName}>{m.brand} {m.model}</Text>
            {!!m.year && <Text style={styles.motoDetail}>Anno: {m.year}</Text>}
            {!!m.engineSize && <Text style={styles.motoDetail}>{m.engineSize}cc</Text>}
            {!!m.ridingStyle && <Text style={styles.motoDetail}>Stile: {m.ridingStyle}</Text>}
            {marketplaceEnabled && m.isForSale && (
              <View style={styles.saleBadge}>
                <Ionicons name="pricetag" size={12} color="#FF9800" />
                <Text style={styles.saleBadgeText}>In Vendita</Text>
              </View>
            )}
            {marketplaceEnabled && m.isForSale && !!m.saleDescription && (
              <Text style={[styles.motoDetail, { fontStyle: "italic", marginTop: 4 }]}>{m.saleDescription}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  motoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  motoInfo: { flex: 1 },
  motoName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  motoDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  saleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    backgroundColor: "#FF980015",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  saleBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FF9800" },
});
