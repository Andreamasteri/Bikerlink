import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export type MapTarget =
  | "homeReal"
  | "homeFake"
  | "workReal"
  | "workFake"
  | "whateverReal"
  | "whateverFake";

export function FakeZoneCoordPanel({
  realLabel,
  fakeLabel,
  realLat,
  realLng,
  fakeLat,
  fakeLng,
  realTarget,
  fakeTarget,
  colors,
  onPickGPS,
  onOpenMap,
}: {
  realLabel: string;
  fakeLabel: string;
  realLat: number | null;
  realLng: number | null;
  fakeLat: number | null;
  fakeLng: number | null;
  realTarget: MapTarget;
  fakeTarget: MapTarget;
  colors: ReturnType<typeof useColors>;
  onPickGPS: (target: MapTarget) => void;
  onOpenMap: (target: MapTarget, lat?: number | null, lng?: number | null) => void;
}) {
  return (
    <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ padding: 10, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginBottom: 4 }}>
          {realLabel}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.text, marginBottom: 6 }}>
          {realLat != null && realLng != null
            ? `${realLat.toFixed(5)}, ${realLng.toFixed(5)}`
            : "Non impostata"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onPickGPS(realTarget)}
          >
            <Ionicons name="locate" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>GPS</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onOpenMap(realTarget, realLat, realLng)}
          >
            <Ionicons name="map-outline" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>Mappa</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ padding: 10, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginBottom: 4 }}>
          {fakeLabel}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.text, marginBottom: 6 }}>
          {fakeLat != null && fakeLng != null
            ? `${fakeLat.toFixed(5)}, ${fakeLng.toFixed(5)}`
            : "Non impostata"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onPickGPS(fakeTarget)}
          >
            <Ionicons name="locate" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>GPS</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            onPress={() => onOpenMap(fakeTarget, fakeLat, fakeLng)}
          >
            <Ionicons name="map-outline" size={13} color={colors.text} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.text }}>Mappa</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
