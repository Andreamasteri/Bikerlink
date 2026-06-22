import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { RoutingStatus } from "@/components/admin/routing-control/types";

interface Props {
  onPress?: () => void;
}

export function RoutingCloudBanner({ onPress }: Props) {
  const { data } = useQuery<RoutingStatus>({
    queryKey: ["/api/admin/routing/status"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const gh = data?.graphhopper;
  const cloud = data?.cloudFallback;

  if (!gh?.down || !cloud?.active) return null;

  const inner = (
    <View style={styles.banner} testID="routing-cloud-banner">
      <View style={styles.left}>
        <MaterialCommunityIcons name="cloud-outline" size={18} color="#b45309" />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Routing su cloud</Text>
          <Text style={styles.subtitle}>
            ThinkCentre non raggiungibile — fallback cloud attivo
          </Text>
        </View>
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={16} color="#b45309" style={styles.arrow} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#92400e",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#b45309",
    marginTop: 1,
  },
  arrow: {
    marginLeft: 8,
  },
});
