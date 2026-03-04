import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { t } from "@/lib/i18n";

interface MapUser {
  id: string;
  nickname: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  latitude: number;
  longitude: number;
}

interface MapWorkshop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isSynecoPartner: boolean;
}

interface MapEasterEgg {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface InteractiveMapProps {
  users?: MapUser[];
  workshops?: MapWorkshop[];
  easterEggs?: MapEasterEgg[];
  isAvailable: boolean;
  onToggleAvailability: () => void;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterCoppia: boolean;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterCoppia: () => void;
}

function getUserMarkerColor(userType: string): string {
  switch (userType) {
    case "biker":
      return Colors.dark.bikerColor;
    case "zavorrina":
      return Colors.dark.zavorrinaColor;
    case "coppia":
      return Colors.dark.coppiaColor;
    default:
      return Colors.dark.accent;
  }
}

function getUserMarkerIcon(userType: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (userType) {
    case "biker":
      return "motorbike";
    case "zavorrina":
      return "seat-passenger";
    case "coppia":
      return "heart-multiple";
    default:
      return "account";
  }
}

export default function InteractiveMap({
  users = [],
  workshops = [],
  easterEggs = [],
  isAvailable,
  onToggleAvailability,
  filterBiker,
  filterZavorrina,
  filterCoppia,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterCoppia,
}: InteractiveMapProps) {
  const filteredUsers = users.filter((u) => {
    if (u.userType === "biker" && !filterBiker) return false;
    if (u.userType === "zavorrina" && !filterZavorrina) return false;
    if (u.userType === "coppia" && !filterCoppia) return false;
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterBiker && { backgroundColor: Colors.dark.bikerColor }]}
          onPress={onToggleFilterBiker}
        >
          <MaterialCommunityIcons name="motorbike" size={16} color="#fff" />
          <Text style={styles.filterText}>Biker</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterZavorrina && { backgroundColor: Colors.dark.zavorrinaColor }]}
          onPress={onToggleFilterZavorrina}
        >
          <MaterialCommunityIcons name="seat-passenger" size={16} color="#fff" />
          <Text style={styles.filterText}>Zavorrine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterCoppia && { backgroundColor: Colors.dark.coppiaColor }]}
          onPress={onToggleFilterCoppia}
        >
          <MaterialCommunityIcons name="heart-multiple" size={16} color="#fff" />
          <Text style={styles.filterText}>Coppie</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mapPlaceholder}>
        <MaterialCommunityIcons name="map-outline" size={64} color={Colors.dark.textSecondary} />
        <Text style={styles.mapPlaceholderText}>{t("map.title")}</Text>
        <Text style={styles.mapSubtext}>
          La mappa interattiva è disponibile su dispositivo mobile tramite Expo Go
        </Text>
      </View>

      <ScrollView style={styles.listContainer}>
        {filteredUsers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("map.nearbyUsers")} ({filteredUsers.length})
            </Text>
            {filteredUsers.map((user) => (
              <View key={user.id} style={styles.listItem}>
                <View style={[styles.userDot, { backgroundColor: getUserMarkerColor(user.userType) }]}>
                  <MaterialCommunityIcons
                    name={getUserMarkerIcon(user.userType)}
                    size={14}
                    color="#fff"
                  />
                </View>
                <Text style={styles.listItemText}>{user.nickname}</Text>
                <Text style={styles.listItemSub}>
                  {user.userType === "biker" ? "Biker" : user.userType === "zavorrina" ? "Zavorrina" : "Coppia"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {workshops.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Officine Syneco ({workshops.length})
            </Text>
            {workshops.map((w) => (
              <View key={w.id} style={styles.listItem}>
                <View style={[styles.userDot, { backgroundColor: "#FF6B35" }]}>
                  <MaterialCommunityIcons name="wrench" size={14} color="#fff" />
                </View>
                <Text style={styles.listItemText}>{w.name}</Text>
              </View>
            ))}
          </View>
        )}

        {easterEggs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Easter Eggs ({easterEggs.length})
            </Text>
            {easterEggs.map((e) => (
              <View key={e.id} style={styles.listItem}>
                <View style={[styles.userDot, { backgroundColor: Colors.dark.accent }]}>
                  <MaterialCommunityIcons name="egg-easter" size={14} color="#fff" />
                </View>
                <Text style={styles.listItemText}>{e.name}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.availabilityBtn, isAvailable && styles.availabilityBtnActive]}
        onPress={onToggleAvailability}
      >
        <MaterialCommunityIcons
          name={isAvailable ? "broadcast" : "broadcast-off"}
          size={20}
          color="#fff"
        />
        <Text style={styles.availabilityText}>
          {isAvailable ? t("map.available") : t("map.unavailable")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 67 + 8,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.dark.surface,
  },
  filterText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  mapPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  mapPlaceholderText: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
  },
  mapSubtext: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  listContainer: { flex: 1, paddingHorizontal: 16 },
  section: { marginTop: 16 },
  sectionTitle: {
    color: Colors.dark.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  userDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  listItemText: { color: Colors.dark.text, fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  listItemSub: { color: Colors.dark.textSecondary, fontSize: 12 },
  availabilityBtn: {
    position: "absolute",
    bottom: 34 + 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  availabilityBtnActive: {
    backgroundColor: Colors.dark.success,
    borderColor: Colors.dark.success,
  },
  availabilityText: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
});
