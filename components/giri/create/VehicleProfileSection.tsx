import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";
import type { VehicleProfile } from "./types";

interface VehicleProfileSectionProps {
  vehicleProfile: VehicleProfile;
  setVehicleProfile: (v: VehicleProfile) => void;
  autoCurvyAvailable: boolean;
}

const OPTIONS: {
  key: VehicleProfile;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  requiresGhProfile?: "motorcycle_fast" | "car";
}[] = [
  { key: "moto", label: "Moto", desc: "Percorso curvy per moto", icon: "bicycle-outline" },
  { key: "moto_fast", label: "Moto veloce", desc: "Priorità a strade scorrevoli e a scorrimento veloce", icon: "speedometer-outline", requiresGhProfile: "motorcycle_fast" },
  { key: "car", label: "Auto", desc: "Routing stradale per automobili", icon: "car-outline", requiresGhProfile: "car" },
  { key: "auto_curvy", label: "Auto panoramica", desc: "Statali e provinciali, niente autostrade", icon: "car-sport-outline" },
];

export const VehicleProfileSection: React.FC<VehicleProfileSectionProps> = ({
  vehicleProfile,
  setVehicleProfile,
  autoCurvyAvailable,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Veicolo</Text>
      {OPTIONS.map((opt) => {
        const locked = opt.key === "auto_curvy" && !autoCurvyAvailable;
        const isActive = vehicleProfile === opt.key && !locked;

        return (
          <Pressable
            key={opt.key}
            style={[s.profileCard, isActive && { borderColor: colors.accent, borderWidth: 2 }]}
            onPress={() => {
              if (locked) return;
              setVehicleProfile(opt.key);
            }}
            disabled={locked}
          >
            <View style={s.profileCardLeft}>
              <Ionicons name={opt.icon} size={22} color={isActive ? colors.accent : colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.profileCardTitle, isActive && { color: colors.accent }]}>{opt.label}</Text>
              <Text style={s.profileCardDesc}>{opt.desc}</Text>
              {locked && (
                <View style={s.profileLockRow}>
                  <Ionicons name="cloud-offline-outline" size={12} color={colors.textSecondary} />
                  <Text style={s.profileLockText}>Server panoramico non disponibile al momento</Text>
                </View>
              )}
            </View>
            {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: 20 },
    sectionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    profileCardLeft: { width: 32, alignItems: "center" },
    profileCardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text, marginBottom: 2 },
    profileCardDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
    profileLockRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    profileLockText: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  });
