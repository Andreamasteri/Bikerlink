import React, { useState, useEffect } from "react";
import { View, Image, StyleSheet, Text } from "react-native";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";
import type { TileCategory } from "@/lib/maps/tile-providers";

const Z = 12, X = 2153, Y = 1468;

const CATEGORY_COLORS: Record<TileCategory, string> = {
  base: "#2563eb",      // blu
  topo: "#16a34a",      // verde
  satellite: "#ea580c", // arancione
  overlay: "#9333ea",   // viola
};

interface Props {
  providerId: string;
  category: TileCategory;
  label: string;
  keyAvailable: boolean;
  keyRequired: boolean;
}

function Placeholder({ category, label, note }: { category: TileCategory; label: string; note: string }) {
  const color = CATEGORY_COLORS[category] ?? Colors.border;
  const initial = (label.trim()[0] ?? "?").toUpperCase();
  return (
    <View style={[styles.box, styles.placeholder, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[styles.initial, { color }]}>{initial}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

export function TileThumbnail({ providerId, category, label, keyAvailable, keyRequired }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [providerId, keyAvailable]);

  if (keyRequired && !keyAvailable) {
    return <Placeholder category={category} label={label} note="key richiesta" />;
  }

  if (failed) {
    return <Placeholder category={category} label={label} note="offline" />;
  }

  const uri = new URL(`/api/admin/maps/tile-preview/${providerId}/${Z}/${X}/${Y}`, getApiUrl()).toString();

  return (
    <View style={styles.box}>
      {!loaded && <View style={styles.skeleton} />}
      <Image
        source={{ uri, headers: authFetchHeaders() }}
        style={styles.img}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 120, height: 80, borderRadius: 6, overflow: "hidden", backgroundColor: Colors.border },
  skeleton: { ...StyleSheet.absoluteFill, backgroundColor: Colors.surface },
  img: { width: 120, height: 80 },
  placeholder: { justifyContent: "center", alignItems: "center", gap: 2, borderWidth: 1 },
  initial: { fontFamily: "Inter_700Bold", fontSize: 26 },
  note: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textSecondary, textAlign: "center" },
});
