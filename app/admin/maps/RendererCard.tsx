import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { RENDERER_OPTIONS, TILE_OPTIONS } from "@shared/maps-config";
import type { MapsRendererId, MapsTileId, MapsOption } from "@shared/maps-config";

interface RendererCardProps {
  renderer: MapsRendererId;
  tile: MapsTileId;
  rendererNotes: string;
  isPending: boolean;
  tileSourceStatus?: "maptiler" | "demo";
  demSource?: "custom" | "aws-free";
  onRendererChange: (renderer: MapsRendererId, tile: MapsTileId) => void;
}

function StubBadge() {
  return (
    <View style={styles.stubBadge}>
      <Text style={styles.stubBadgeText}>stub</Text>
    </View>
  );
}

function OptionRow<T extends string>({
  opt,
  isSelected,
  onPress,
  disabled,
  dotColor,
}: {
  opt: MapsOption<T>;
  isSelected: boolean;
  onPress: () => void;
  disabled: boolean;
  dotColor: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, isSelected && styles.optionSelected, !opt.implemented && styles.optionDimmed]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <View style={styles.optionLeft}>
        <View style={styles.optionText}>
          <View style={styles.labelRow}>
            <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{opt.label}</Text>
            {!opt.implemented && <StubBadge />}
          </View>
          <Text style={styles.optionDesc} numberOfLines={2}>{opt.description}</Text>
        </View>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />}
    </TouchableOpacity>
  );
}

export function RendererCard({ renderer, tile, rendererNotes, isPending, tileSourceStatus, demSource, onRendererChange }: RendererCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [localTile, setLocalTile] = React.useState<MapsTileId>(tile);

  React.useEffect(() => { setLocalTile(tile); }, [tile]);

  const handleRendererSelect = (r: MapsRendererId) => {
    if (!isPending) onRendererChange(r, localTile);
  };

  const handleTileSelect = (t: MapsTileId) => {
    setLocalTile(t);
    if (!isPending) onRendererChange(renderer, t);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Ionicons name="map-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Renderer</Text>
        {isPending && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />}
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>Attivo: </Text>
        <Text style={styles.currentValue}>{RENDERER_OPTIONS.find((r) => r.id === renderer)?.label ?? renderer}</Text>
        <Text style={styles.currentLabel}> · Tile: </Text>
        <Text style={styles.currentValue}>{TILE_OPTIONS.find((t) => t.id === tile)?.label ?? tile}</Text>
        {!!tileSourceStatus && (
          <View style={tileSourceStatus === "maptiler" ? styles.srcMaptiler : styles.srcDemo}>
            <Text style={styles.srcText}>{tileSourceStatus === "maptiler" ? "● MapTiler" : "● Demo"}</Text>
          </View>
        )}
        {!!demSource && <View style={demSource === "custom" ? styles.srcMaptiler : styles.srcDemo}><Text style={styles.srcText}>{demSource === "custom" ? "DEM: custom" : "DEM: AWS free"}</Text></View>}
      </View>

      {!!rendererNotes && (
        <View style={styles.notesBox}>
          <Ionicons name="information-circle-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.notesText}>{rendererNotes}</Text>
        </View>
      )}

      {expanded && (
        <>
          <Text style={styles.sectionLabel}>Renderer</Text>
          {RENDERER_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.id}
              opt={opt}
              isSelected={renderer === opt.id}
              onPress={() => handleRendererSelect(opt.id)}
              disabled={isPending}
              dotColor={opt.implemented ? Colors.success : Colors.textSecondary}
            />
          ))}
          <Text style={styles.sectionLabel}>Tile Provider</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tileScroll}>
            {TILE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.tileChip, localTile === opt.id && styles.tileChipSelected, !opt.implemented && styles.tileChipDimmed]}
                onPress={() => handleTileSelect(opt.id)}
                disabled={isPending}
              >
                <Text style={[styles.tileChipText, localTile === opt.id && styles.tileChipTextSelected]}>{opt.label}</Text>
                {!opt.implemented && <Text style={styles.stubSmall}>stub</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  currentRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  currentLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  currentValue: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  notesBox: { flexDirection: "row", gap: 4, backgroundColor: Colors.background, padding: 8, borderRadius: 6, marginBottom: 8 },
  notesText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  sectionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 8, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
    backgroundColor: Colors.background,
  },
  optionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  optionDimmed: { opacity: 0.6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  optionLeft: { flex: 1 },
  optionText: { flex: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  optionLabelSelected: { color: Colors.accent },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  stubBadge: { backgroundColor: "#9333ea22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stubBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#9333ea" },
  tileScroll: { marginBottom: 4 },
  tileChip: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileChipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  tileChipDimmed: { opacity: 0.55 },
  tileChipText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  tileChipTextSelected: { color: Colors.accent, fontFamily: "Inter_500Medium" },
  stubSmall: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#9333ea" },
  srcMaptiler: { backgroundColor: "#16a34a22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6 },
  srcDemo: { backgroundColor: "#ca8a0422", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6 },
  srcText: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textSecondary },
});
