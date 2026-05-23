import React from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useLocale } from "@/lib/language-context";
import { getApiUrl } from "@/lib/query-client";

export interface PerformanceData {
  totalDistanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxAltitude: number;
  durationSeconds: number;
  idleTimeSeconds: number;
  date: string;
}

export interface ContestEntry {
  id: string;
  userId: string;
  photoUrl: string | null;
  caption: string | null;
  performanceData: string | null;
  weekNumber: number;
  year: number;
  votesCount: number;
  isApproved: boolean;
  createdAt: string;
  hasVoted: boolean;
  isOwn: boolean;
}

function formatPerfTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function resolvePhotoUrl(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  const base = getApiUrl().replace(/\/$/, "");

  if (photoUrl.startsWith("file:///")) return null;

  if (photoUrl.startsWith("https://storage.googleapis.com/")) {
    const decoded = decodeURIComponent(photoUrl);
    const filename = decoded.split("/").pop();
    if (!filename) return null;
    return `${base}/api/contest/photos/${filename}`;
  }

  if (photoUrl.startsWith("/uploads/contest/")) {
    const filename = photoUrl.replace("/uploads/contest/", "");
    return `${base}/api/contest/photos/${filename}`;
  }

  if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) return photoUrl;

  return `${base}${photoUrl.startsWith("/") ? "" : "/"}${photoUrl}`;
}

function PerformanceCard({ data }: { data: PerformanceData }) {
  const locale = useLocale();
  const dur = data.durationSeconds || 0;
  const net = Math.max(dur - (data.idleTimeSeconds || 0), 0);

  return (
    <View style={styles.perfCard}>
      <View style={styles.perfHeader}>
        <Ionicons name="speedometer" size={16} color={Colors.accent} />
        <Text style={styles.perfHeaderText}>Performance</Text>
      </View>
      <View style={styles.perfGrid}>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.totalDistanceKm.toFixed(1)}</Text>
          <Text style={styles.perfLabel}>km</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.maxSpeedKmh.toFixed(0)}</Text>
          <Text style={styles.perfLabel}>km/h max</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{data.maxAltitude.toFixed(0)}</Text>
          <Text style={styles.perfLabel}>m quota</Text>
        </View>
        <View style={styles.perfItem}>
          <Text style={styles.perfValue}>{formatPerfTime(net)}</Text>
          <Text style={styles.perfLabel}>in moto</Text>
        </View>
      </View>
      {data.date ? (
        <Text style={styles.perfDate}>
          {new Date(data.date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      ) : null}
    </View>
  );
}

export function ContestEntryCard({
  entry,
  onVote,
  onDelete,
  votingDisabled,
}: {
  entry: ContestEntry;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
  votingDisabled: boolean;
}) {
  let perfData: PerformanceData | null = null;
  if (entry.performanceData) {
    try {
      perfData = JSON.parse(entry.performanceData);
    } catch {
      // no-op: fallback to null if performance data is malformed
    }
  }

  const photoUri = resolvePhotoUrl(entry.photoUrl);

  return (
    <View style={styles.photoCard}>
      {perfData ? (
        <PerformanceCard data={perfData} />
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, { justifyContent: "center", alignItems: "center" }]}>
          <Ionicons name="image-outline" size={32} color={Colors.textSecondary} />
        </View>
      )}
      {entry.isOwn ? (
        <Pressable style={styles.deleteBtn} onPress={() => onDelete(entry.id)}>
          <Ionicons name="trash" size={16} color="#FFF" />
        </Pressable>
      ) : null}
      {entry.caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {entry.caption}
        </Text>
      ) : null}
      <View style={styles.photoFooter}>
        <Pressable
          onPress={() => onVote(entry.id)}
          disabled={entry.hasVoted || entry.isOwn || votingDisabled}
          style={[
            styles.voteBtn,
            (entry.isOwn || votingDisabled) && !entry.hasVoted && styles.voteBtnDisabled,
          ]}
        >
          <Ionicons
            name={entry.hasVoted ? "heart" : "heart-outline"}
            size={18}
            color={entry.hasVoted || !entry.isOwn ? Colors.accentRed : Colors.textSecondary}
          />
          <Text style={[styles.voteCount, entry.isOwn && { color: Colors.textSecondary }]}>
            {entry.votesCount}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
    position: "relative",
  },
  deleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  cardImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.surfaceLight,
  },
  caption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  photoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
  },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  voteBtnDisabled: {
    opacity: 0.5,
  },
  voteCount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accentRed,
  },
  perfCard: {
    backgroundColor: Colors.background,
    padding: 12,
    aspectRatio: 4 / 3,
    justifyContent: "center",
  },
  perfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    justifyContent: "center",
  },
  perfHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  perfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },
  perfItem: {
    alignItems: "center",
    width: "45%",
    paddingVertical: 4,
  },
  perfValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  perfLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  perfDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
});
