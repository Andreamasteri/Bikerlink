import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { RENDERER_OPTIONS, TILE_OPTIONS } from "@shared/maps-config";
import type { MapsRendererId, MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { TESTER_RENDERER_KEY, TESTER_TILE_KEY } from "@/lib/maps/useMapsRollout";

interface MapsRolloutSettings {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
  testerCanCustomize?: boolean;
}

const VALID_RENDERERS: MapsRendererId[] = ["leaflet", "maplibre", "openlayers", "maplibre-full-3d"];

export const ProfileMapsBetaSection: React.FC = () => {
  const colors = useColors();
  const { user } = useAuth();
  const isMapTester = (user as { mapTester?: boolean } | null)?.mapTester ?? false;

  const [expanded, setExpanded] = useState(false);
  const [renderer, setRenderer] = useState<MapsRendererId | null>(null);
  const [tileId, setTileId] = useState<string | null>(null);

  const { data } = useQuery<MapsRolloutSettings>({
    queryKey: ["/api/settings/maps-rollout"],
    staleTime: 60_000,
    enabled: isMapTester,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await AsyncStorage.getMany([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
        if (!active) return;
        const rv = result[TESTER_RENDERER_KEY];
        setRenderer(rv && VALID_RENDERERS.includes(rv as MapsRendererId) ? (rv as MapsRendererId) : null);
        setTileId(result[TESTER_TILE_KEY] ?? null);
      } catch {
        // Preferenze non leggibili: usa i default lato server
      }
    })();
    return () => { active = false; };
  }, []);

  if (!isMapTester) return null;

  const canCustomize = data?.rollout === "tester" && (data?.testerCanCustomize ?? false);
  const serverRenderer = data?.renderer ?? "leaflet";

  const selectRenderer = async (id: MapsRendererId) => {
    setRenderer(id);
    try { await AsyncStorage.setItem(TESTER_RENDERER_KEY, id); } catch { /* noop */ }
  };

  const selectTile = async (id: string) => {
    setTileId(id);
    try { await AsyncStorage.setItem(TESTER_TILE_KEY, id); } catch { /* noop */ }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🗺 Beta Mappe</Text>
        </View>
        {canCustomize && (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
            style={{ marginLeft: "auto" }}
          />
        )}
      </TouchableOpacity>

      {!canCustomize && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Stai usando il sistema mappe sperimentale. La personalizzazione è gestita dagli admin.
        </Text>
      )}

      {canCustomize && expanded && (
        <View style={styles.body}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Renderer</Text>
          {RENDERER_OPTIONS.filter((o) => o.implemented).map((opt) => {
            const isActive = (renderer ?? serverRenderer) === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.background }, isActive && { borderColor: colors.accent, backgroundColor: colors.accent + "11" }]}
                onPress={() => selectRenderer(opt.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: colors.text }, isActive && { color: colors.accent }]}>{opt.label}</Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary }]} numberOfLines={2}>{opt.description}</Text>
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tile</Text>
          <View style={styles.tileRow}>
            {TILE_OPTIONS.filter((o) => o.implemented).map((opt) => {
              const isActive = tileId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.tileChip, { borderColor: colors.border, backgroundColor: colors.background }, isActive && { borderColor: colors.accent, backgroundColor: colors.accent + "11" }]}
                  onPress={() => selectTile(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tileChipText, { color: colors.text }, isActive && { color: colors.accent }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Le modifiche si applicano alla prossima apertura della mappa.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
  },
  header: { flexDirection: "row", alignItems: "center" },
  badge: {
    backgroundColor: "#9333ea22",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#9333ea" },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8, lineHeight: 17 },
  body: { marginTop: 12 },
  sectionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginBottom: 8,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  tileRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tileChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tileChipText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  note: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 10, fontStyle: "italic" },
});
