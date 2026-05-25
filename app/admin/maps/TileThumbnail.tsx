import React, { useEffect, useState } from "react";
import { View, Image, StyleSheet, Text } from "react-native";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";

const Z = 12, X = 2153, Y = 1468;

async function fetchTileDataUri(providerId: string): Promise<string> {
  const url = new URL(`/api/admin/maps/tile-preview/${providerId}/${Z}/${X}/${Y}`, getApiUrl()).toString();
  const res = await fetch(url, { headers: await authFetchHeaders(), credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

interface Props { providerId: string; keyAvailable: boolean; keyRequired: boolean }

export function TileThumbnail({ providerId, keyAvailable, keyRequired }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (keyRequired && !keyAvailable) return;
    let alive = true;
    fetchTileDataUri(providerId)
      .then((u) => { if (alive) { setUri(u); setDone(true); } })
      .catch(() => { if (alive) setDone(true); });
    return () => { alive = false; };
  }, [providerId, keyRequired, keyAvailable]);

  if (keyRequired && !keyAvailable) {
    return (
      <View style={[styles.box, styles.missing]}>
        <Text style={styles.emoji}>🔑</Text>
        <Text style={styles.missingLabel}>key required</Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {!done && <View style={styles.skeleton} />}
      {uri != null && <Image source={{ uri }} style={styles.img} resizeMode="cover" />}
      {done && uri == null && <View style={[styles.skeleton, styles.errBox]}><Text style={styles.err}>!</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 120, height: 80, borderRadius: 6, overflow: "hidden", backgroundColor: Colors.border },
  skeleton: { ...StyleSheet.absoluteFill, backgroundColor: Colors.surface },
  img: { width: 120, height: 80 },
  missing: { justifyContent: "center", alignItems: "center", gap: 2 },
  emoji: { fontSize: 16 },
  missingLabel: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textSecondary, textAlign: "center" },
  errBox: { justifyContent: "center", alignItems: "center" },
  err: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
});
