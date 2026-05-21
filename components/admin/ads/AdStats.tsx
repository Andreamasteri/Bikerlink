import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface AdStatsProps {
  count: number;
  cacheStats?: {
    count: number;
    totalBytes: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export function AdStats({ count, cacheStats }: AdStatsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.countText}>
        {count} campagne trovate
      </Text>
      {cacheStats && (
        <Text style={styles.checkedAtText}>
          Cache: {cacheStats.count} file, {formatBytes(cacheStats.totalBytes)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 2,
  },
  countText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  checkedAtText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    opacity: 0.7,
    marginTop: 1,
  },
});
