import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

type DrivingProfile = "geometric" | "real" | "my_style";

interface MyStyleProfile {
  totalKm: number;
  targetKm: number;
  hasReachedThreshold: boolean;
  progressPct: number;
  avgLeanAngle: number | null;
  avgGforce: number | null;
  sampleCount: number;
}

interface DrivingProfileSectionProps {
  drivingProfile: DrivingProfile;
  setDrivingProfile: (v: DrivingProfile) => void;
  myStyleProfile?: MyStyleProfile;
}

export const DrivingProfileSection: React.FC<DrivingProfileSectionProps> = ({
  drivingProfile,
  setDrivingProfile,
  myStyleProfile,
}) => {
  const colors = useColors();
  const s = styles(colors);

  const profiles: DrivingProfile[] = ["geometric", "real", "my_style"];

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Profilo di guida</Text>
      {profiles.map((prof) => {
        const isMyStyle = prof === "my_style";
        const locked = isMyStyle && !myStyleProfile?.hasReachedThreshold;
        const isActive = drivingProfile === prof && !locked;

        const labels: Record<DrivingProfile, string> = {
          geometric: "Curvy geometrico",
          real: "Curvy reale",
          my_style: "Il mio stile",
        };
        const descs: Record<DrivingProfile, string> = {
          geometric: "Basato sulla forma geometrica delle strade",
          real: "Basato su dati reali di piega e G-force dei biker",
          my_style: "Personalizzato sulla tua telemetria storica",
        };
        const icons: Record<DrivingProfile, keyof typeof Ionicons.glyphMap> = {
          geometric: "compass-outline",
          real: "people-outline",
          my_style: "person-outline",
        };

        return (
          <Pressable
            key={prof}
            style={[s.profileCard, isActive && { borderColor: colors.accent, borderWidth: 2 }]}
            onPress={() => {
              if (locked) return;
              setDrivingProfile(prof);
            }}
            disabled={locked}
          >
            <View style={s.profileCardLeft}>
              <Ionicons name={icons[prof]} size={22} color={isActive ? colors.accent : colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.profileCardTitle, isActive && { color: colors.accent }]}>{labels[prof]}</Text>
              <Text style={s.profileCardDesc}>{descs[prof]}</Text>
              {locked && (
                <View style={s.profileLockRow}>
                  <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
                  <Text style={s.profileLockText}>
                    Disponibile dopo {myStyleProfile?.targetKm ?? 400} km registrati
                    {myStyleProfile && myStyleProfile.totalKm > 0
                      ? ` (${Math.round(myStyleProfile.totalKm)} km registrati)`
                      : ""}
                  </Text>
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
