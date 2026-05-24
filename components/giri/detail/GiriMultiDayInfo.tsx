import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ThemeColors } from '@/constants/colors';

interface HotelStop { location?: string; hotels?: Array<{ name?: string; address?: string; lat?: number; lng?: number; bookingUrl?: string }> }

interface GiriMultiDayInfoProps {
  days: Array<{ day: number; from: string; to: string; km: number; minutes: number }>;
  hotels: HotelStop[] | null;
  hotelsLoading: boolean;
  onLoadHotels: () => void;
}

export const GiriMultiDayInfo: React.FC<GiriMultiDayInfoProps> = ({
  days,
  hotels,
  hotelsLoading,
  onLoadHotels,
}) => {
  const colors = useColors();
  const s = styles(colors);

  const formatDuration = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}min`;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  return (
    <View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Piano di viaggio multi-giorno</Text>
        {days.map((day) => (
          <View key={day.day} style={s.dayCard}>
            <View style={s.dayBadge}>
              <Text style={s.dayBadgeText}>GIORNO {day.day}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.dayRoute}>
                <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                <Text style={s.dayRouteText} numberOfLines={1}>{day.from}</Text>
              </View>
              <View style={s.dayRouteLine} />
              <View style={s.dayRoute}>
                <Ionicons name="flag-outline" size={12} color={colors.accent} />
                <Text style={s.dayRouteText} numberOfLines={1}>{day.to}</Text>
              </View>
            </View>
            <View style={s.dayStats}>
              <Text style={s.dayStatValue}>{day.km} km</Text>
              <Text style={s.dayStatLabel}>{formatDuration(day.minutes)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Hotel per le soste</Text>
          {hotelsLoading && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        {!hotels && !hotelsLoading && (
          <Pressable style={s.loadMoreBtn} onPress={onLoadHotels}>
            <Ionicons name="bed-outline" size={16} color={colors.accent} />
            <Text style={s.loadMoreText}>Cerca hotel lungo il percorso</Text>
          </Pressable>
        )}
        {hotels !== null && hotels.length === 0 && (
          <Text style={s.emptyText}>Nessun hotel trovato per le soste</Text>
        )}
        {hotels !== null && hotels.map((day, di) => (
          <View key={di} style={s.hotelDayBlock}>
            <Text style={s.hotelDayTitle}>Sosta Giorno {di + 1} — {day.location ?? `Tappa ${di + 1}`}</Text>
            {(day.hotels ?? []).slice(0, 3).map((h, hi) => (
              <Pressable
                key={hi}
                style={s.hotelCard}
                onPress={() => h.bookingUrl ? Linking.openURL(h.bookingUrl) : null}
              >
                <View style={s.hotelCardLeft}>
                  <Ionicons name="bed-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.hotelName} numberOfLines={1}>{h.name ?? "Hotel"}</Text>
                  <Text style={s.hotelAddress} numberOfLines={1}>{h.address ?? `${(h.lat ?? 0).toFixed(3)}, ${(h.lng ?? 0).toFixed(3)}`}</Text>
                </View>
                {h.bookingUrl && (
                  <View style={s.hotelBookBadge}>
                    <Text style={s.hotelBookText}>Prenota</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  dayCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  dayBadge: { backgroundColor: colors.accent + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 70, alignItems: "center" },
  dayBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.accent },
  dayRoute: { flexDirection: "row", alignItems: "center", gap: 6 },
  dayRouteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  dayRouteLine: { width: 2, height: 12, backgroundColor: colors.border, marginLeft: 3, marginVertical: 2 },
  dayStats: { alignItems: "flex-end" },
  dayStatValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text },
  dayStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
  hotelDayBlock: { marginBottom: 16 },
  hotelDayTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  hotelCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
  hotelCardLeft: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + "22", justifyContent: "center", alignItems: "center" },
  hotelName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  hotelAddress: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  hotelBookBadge: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  hotelBookText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
});
