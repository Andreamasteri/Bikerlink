import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface CompatibleBiker {
  userId: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  ridingStyle: string | null;
  isAvailable: boolean;
  distanceKm: number | null;
}

interface GiriParticipantsProps {
  matchBikers: CompatibleBiker[] | null;
  matchLoading: boolean;
  matchBannerDismissed: boolean;
  onDismissBanner: () => void;
  onFindBikers: () => void;
  onPressBiker: (userId: string) => void;
}

export const GiriParticipants: React.FC<GiriParticipantsProps> = ({
  matchBikers,
  matchLoading,
  matchBannerDismissed,
  onDismissBanner,
  onFindBikers,
  onPressBiker,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Biker compatibili vicini</Text>
        {matchLoading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>

      {!matchBannerDismissed && matchBikers && matchBikers.length > 0 && (
        <View style={s.matchBanner}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
          <Text style={s.matchBannerText}>
            Abbiamo trovato {matchBikers.length} biker con stile di guida simile pronti a partire!
          </Text>
          <Pressable onPress={onDismissBanner}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {!matchBikers && !matchLoading && (
        <Pressable style={s.loadMoreBtn} onPress={onFindBikers}>
          <Ionicons name="search-outline" size={16} color={colors.accent} />
          <Text style={s.loadMoreText}>Trova compagni di viaggio</Text>
        </Pressable>
      )}

      {matchBikers && (
        <View>
          {matchBikers.length === 0 ? (
            <View style={s.emptyState}>
              <MaterialCommunityIcons name="motorbike-off" size={32} color={colors.border} />
              <Text style={s.emptyText}>Nessun biker compatibile trovato vicino al percorso</Text>
            </View>
          ) : (
            matchBikers.map((biker, i) => (
              <Pressable
                key={i}
                style={s.bikerRow}
                onPress={() => onPressBiker(biker.userId)}
              >
                {biker.avatarUrl ? (
                  <Image source={{ uri: biker.avatarUrl }} style={s.bikerAvatar} />
                ) : (
                  <View style={s.bikerAvatarFallback}>
                    <Text style={s.bikerAvatarText}>{biker.nickname.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.bikerName}>{biker.nickname}</Text>
                  {biker.ridingStyle && <Text style={s.bikerCity}>{biker.ridingStyle}</Text>}
                </View>
                {biker.distanceKm !== null && <Text style={s.bikerDist}>{biker.distanceKm} km</Text>}
                {biker.isAvailable && <View style={s.onlineDot} />}
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  matchBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.accent + "22", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.accent + "44" },
  matchBannerText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text, flex: 1 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  bikerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  bikerAvatar: { width: 40, height: 40, borderRadius: 20 },
  bikerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + "33", justifyContent: "center", alignItems: "center" },
  bikerAvatarText: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.accent },
  bikerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  bikerCity: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  bikerDist: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" },
  emptyState: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
});
