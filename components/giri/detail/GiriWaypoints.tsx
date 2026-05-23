import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Waypoint { lat: number; lng: number; name?: string; }

interface GiriWaypointsProps {
  waypoints: Waypoint[];
}

export const GiriWaypoints: React.FC<GiriWaypointsProps> = ({ waypoints }) => {
  const colors = useColors();
  const s = styles(colors);

  const activeWaypoints = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Tappe del percorso</Text>
      <View style={{ gap: 0 }}>
        {activeWaypoints.map((wp, i) => (
          <View key={i} style={s.wpRow}>
            <View style={{ alignItems: "center" }}>
              <View style={[s.wpDot, { backgroundColor: i === 0 ? "#22c55e" : i === activeWaypoints.length - 1 ? colors.accentRed : colors.accent }]} />
              {i < activeWaypoints.length - 1 && <View style={s.wpLine} />}
            </View>
            <Text style={s.wpText} numberOfLines={2}>
              {wp.name || `Tappa ${i + 1}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  wpDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  wpLine: { position: "absolute", left: 5, top: 16, width: 2, height: 20, backgroundColor: colors.border },
  wpText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, flex: 1 },
});
