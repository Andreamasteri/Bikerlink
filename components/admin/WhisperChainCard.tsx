import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface WhisperConfigData {
  chain: string[];
  envOverride: string | null;
}

async function fetchWhisperConfig(): Promise<WhisperConfigData> {
  const url = new URL("/api/admin/whisper-config", getApiUrl()).toString();
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<WhisperConfigData>;
}

export function WhisperChainCard() {
  const router = useRouter();
  const { data, isLoading } = useQuery<WhisperConfigData>({
    queryKey: ["/api/admin/whisper-config"],
    queryFn: fetchWhisperConfig,
    staleTime: 30_000,
    retry: false,
  });

  const activeCount = data?.chain.length ?? 0;
  const hasOverride = Boolean(data?.envOverride);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/admin/whisper-config" as never)}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="microphone-settings" size={22} color="#8B5CF6" />
      </View>

      <View style={styles.info}>
        <Text style={styles.title}>Voce & Trascrizione</Text>
        <Text style={styles.subtitle}>Chain STT configurabile</Text>
      </View>

      <View style={styles.right}>
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        ) : (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        )}
        {hasOverride && (
          <MaterialCommunityIcons name="lock-outline" size={14} color="#F59E0B" style={{ marginLeft: 4 }} />
        )}
        <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} style={{ marginLeft: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#8B5CF622",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
