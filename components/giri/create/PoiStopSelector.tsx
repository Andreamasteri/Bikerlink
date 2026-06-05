import React from "react";
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";
import { PoiResult, ResolvedPoiStop } from "./types";

const ACCOMMODATION_CATEGORIES = new Set(["hotel", "hostel", "guest_house", "camp_site"]);

function buildGoogleMapsUrl(query: string, near: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${near}`)}`;
}

function buildBookingUrl(query: string, near: string): string {
  return `https://www.booking.com/searchresults.it.html?ss=${encodeURIComponent(`${query} ${near}`)}`;
}

function categoryIcon(category: string): keyof typeof Ionicons.glyphMap {
  switch (category) {
    case "restaurant": return "restaurant-outline";
    case "cafe": return "cafe-outline";
    case "fuel": return "flash-outline";
    case "motorcycle": return "construct-outline";
    case "alpine_hut": return "trail-sign-outline";
    case "hotel":
    case "hostel":
    case "guest_house": return "bed-outline";
    case "camp_site": return "bonfire-outline";
    case "parking": return "car-outline";
    default: return "location-outline";
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case "restaurant": return "Ristorante";
    case "cafe": return "Bar / Caffè";
    case "fuel": return "Distributore";
    case "motorcycle": return "Officina moto";
    case "alpine_hut": return "Rifugio";
    case "hotel": return "Hotel";
    case "hostel": return "Ostello";
    case "guest_house": return "B&B";
    case "camp_site": return "Campeggio";
    default: return "POI";
  }
}

interface PoiStopSelectorProps {
  stop: ResolvedPoiStop;
  onSelectOption: (option: PoiResult) => void;
  onClearSelection: () => void;
  loading?: boolean;
}

export const PoiStopSelector: React.FC<PoiStopSelectorProps> = ({
  stop,
  onSelectOption,
  onClearSelection,
  loading = false,
}) => {
  const colors = useColors();
  const s = styles(colors);
  const isAccommodation = ACCOMMODATION_CATEGORIES.has(stop.category);
  const googleUrl = buildGoogleMapsUrl(stop.query, stop.near);
  const bookingUrl = buildBookingUrl(stop.query, stop.near);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Ionicons name={categoryIcon(stop.category)} size={16} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{stop.query}</Text>
          <Text style={s.subtitle}>vicino a {stop.near} · {categoryLabel(stop.category)}</Text>
        </View>
        {stop.selectedOption && (
          <Pressable onPress={onClearSelection} hitSlop={10} style={s.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.accentRed} />
          </Pressable>
        )}
      </View>

      {stop.selectedOption ? (
        <View style={s.selectedCard}>
          <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
          <View style={{ flex: 1 }}>
            <Text style={s.selectedName} numberOfLines={1}>{stop.selectedOption.name}</Text>
            {!!stop.selectedOption.address && (
              <Text style={s.selectedAddr} numberOfLines={1}>{stop.selectedOption.address}</Text>
            )}
          </View>
        </View>
      ) : loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.loadingText}>Ricerca in corso…</Text>
        </View>
      ) : stop.options.length > 0 ? (
        <View style={s.optionsList}>
          {stop.options.map((opt, idx) => (
            <Pressable
              key={`${opt.name}-${idx}`}
              style={[s.optionCard, idx === stop.options.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => onSelectOption(opt)}
            >
              <Ionicons name={categoryIcon(opt.category)} size={14} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.optionName} numberOfLines={1}>{opt.name}</Text>
                {!!opt.address && (
                  <Text style={s.optionAddr} numberOfLines={1}>{opt.address}</Text>
                )}
              </View>
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={s.emptyRow}>
          <Ionicons name="search-outline" size={14} color={colors.textSecondary} />
          <Text style={s.emptyText}>Nessun risultato OSM trovato</Text>
        </View>
      )}

      <View style={s.deepLinkRow}>
        <Pressable
          style={s.deepLinkBtn}
          onPress={() => Linking.openURL(googleUrl).catch(() => {})}
        >
          <Ionicons name="map-outline" size={14} color={colors.accent} />
          <Text style={s.deepLinkText}>Cerca su Google Maps</Text>
        </Pressable>
        {isAccommodation && (
          <Pressable
            style={[s.deepLinkBtn, { borderColor: "#0071C2" }]}
            onPress={() => Linking.openURL(bookingUrl).catch(() => {})}
          >
            <Ionicons name="bed-outline" size={14} color="#0071C2" />
            <Text style={[s.deepLinkText, { color: "#0071C2" }]}>Cerca su Booking</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.text,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clearBtn: { padding: 2, marginLeft: 4 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#22c55e12",
    borderBottomWidth: 1,
    borderBottomColor: "#22c55e30",
  },
  selectedName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#22c55e",
  },
  selectedAddr: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.textSecondary,
  },
  optionsList: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.text,
  },
  optionAddr: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.textSecondary,
  },
  deepLinkRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  deepLinkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  deepLinkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.accent,
  },
});
