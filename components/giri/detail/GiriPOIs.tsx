import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import POIPhotoGallery from './POIPhotoGallery';

interface POI {
  id: number;
  lat: number;
  lng: number;
  type: string;
  name: string | null;
  brand: string | null;
}

interface GiriPOIsProps {
  pois: POI[] | null;
  poisLoading: boolean;
  onLoadPOIs: () => void;
  selectedPOI: POI | null;
  onSelectPOI: (poi: POI | null) => void;
  poiTypeLabel: (type: string) => string;
  poiTypeIcon: (type: string) => keyof typeof Ionicons.glyphMap;
}

export const GiriPOIs: React.FC<GiriPOIsProps> = ({
  pois,
  poisLoading,
  onLoadPOIs,
  selectedPOI,
  onSelectPOI,
  poiTypeLabel,
  poiTypeIcon,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>POI lungo il percorso</Text>
        {poisLoading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      {!pois && !poisLoading && (
        <Pressable style={s.loadMoreBtn} onPress={onLoadPOIs}>
          <Ionicons name="location-outline" size={16} color={colors.accent} />
          <Text style={s.loadMoreText}>Cerca distributori, bar e hotel</Text>
        </Pressable>
      )}
      {pois !== null && pois.length === 0 && (
        <Text style={s.emptyText}>Nessun punto di interesse trovato</Text>
      )}
      {pois && pois.map((poi) => (
        <View key={poi.id}>
          <Pressable
            style={s.poiRow}
            onPress={() => onSelectPOI(selectedPOI?.id === poi.id ? null : poi)}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Ionicons name={poiTypeIcon(poi.type)} size={16} color={colors.accent} />
              <Text style={s.poiName} numberOfLines={1}>
                {poi.name || poi.brand || poiTypeLabel(poi.type)}
              </Text>
            </View>
            <Text style={s.poiCoords}>{poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</Text>
            <Ionicons
              name={selectedPOI?.id === poi.id ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textSecondary}
              style={{ marginLeft: 8 }}
            />
          </Pressable>
          {selectedPOI?.id === poi.id && (
            <View style={s.poiPhotoSection}>
              <POIPhotoGallery poiId={String(poi.id)} colors={colors} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
  poiRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingLeft: 20 },
  poiName: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text, flex: 1 },
  poiCoords: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  poiPhotoSection: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 4, marginLeft: 20, marginBottom: 8 },
});
