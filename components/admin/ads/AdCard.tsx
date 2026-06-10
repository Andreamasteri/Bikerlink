import React, { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

export interface Campaign {
  id: string;
  name: string;
  sponsor: string;
  imageUrl: string | null;
  linkUrl: string | null;
  displayMode: string;
  description: string | null;
  isActive: boolean;
  impressions: number;
  targetUserType: string;
  rotationDuration: number;
  rotationMode: string;
  sortOrder: number;
  placement: string;
  imageVersion: number;
  groupId: string | null;
  imageHealthy?: boolean;
}

interface AdCardProps {
  item: Campaign;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (item: Campaign) => void;
  onEdit: (item: Campaign) => void;
  onEditGroup?: () => void;
  groupCount?: number;
  groupAllActive?: boolean;
  groupSomeActive?: boolean;
  isBroken?: boolean;
  onReupload?: (item: Campaign) => void;
}

export function AdCard({
  item,
  onToggle,
  onDelete,
  onEdit,
  onEditGroup,
  groupCount,
  groupAllActive,
  groupSomeActive,
  isBroken,
  onReupload,
}: AdCardProps) {
  const [imageError, setImageError] = useState(false);

  const imageUri = item.imageUrl
    ? (() => {
        const v = item.imageVersion ?? 0;
        const base = item.imageUrl.startsWith("http")
          ? item.imageUrl
          : `${getApiUrl().replace(/\/$/, "")}${item.imageUrl}`;
        return `${base}${base.includes("?") ? "&" : "?"}v=${v}`;
      })()
    : null;

  useEffect(() => {
    setImageError(false);
  }, [imageUri]);

  return (
    <View style={[styles.card, isBroken && styles.cardBroken]}>
      {imageUri && !imageError ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : imageUri && (imageError || isBroken) ? (
        <View style={[styles.cardImage, styles.imageFallback]}>
          <MaterialIcons name="broken-image" size={28} color={Colors.error} />
          <Text style={[styles.imageFallbackText, { color: Colors.error }]}>Immagine non raggiungibile</Text>
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {item.linkUrl ? (
            <Text style={styles.cardLink} numberOfLines={1}>{item.linkUrl}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.success + "22" : Colors.error + "22" }]}>
              <Text style={[styles.badgeText, { color: item.isActive ? Colors.success : Colors.error }]}>
                {item.isActive ? "Attiva" : "Disattiva"}
              </Text>
            </View>
            {isBroken && (
              <View style={[styles.badge, { backgroundColor: Colors.error + "22" }]}>
                <MaterialIcons name="broken-image" size={11} color={Colors.error} style={{ marginRight: 2 }} />
                <Text style={[styles.badgeText, { color: Colors.error }]}>Immagine rotta</Text>
              </View>
            )}
            {groupCount && groupCount > 1 ? (
              (() => {
                const gc = groupAllActive === undefined
                  ? Colors.accent
                  : groupAllActive
                  ? Colors.success
                  : groupSomeActive
                  ? Colors.warning
                  : Colors.textSecondary;
                return (
                  <View style={[styles.badge, { backgroundColor: gc + "22", flexDirection: "row", alignItems: "center", gap: 3 }]}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: gc }} />
                    <Text style={[styles.badgeText, { color: gc }]}>Gruppo ({groupCount})</Text>
                  </View>
                );
              })()
            ) : null}
            <Text style={styles.cardImpressions}>{item.impressions} impressioni</Text>
          </View>
          {groupCount && groupCount > 1 && onEditGroup ? (
            <TouchableOpacity onPress={onEditGroup} style={styles.groupEditBtn}>
              <MaterialIcons name="folder-special" size={13} color={Colors.accent} />
              <Text style={styles.groupEditBtnText}>Modifica gruppo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.cardActions}>
          {item.isActive ? (
            <TouchableOpacity onPress={() => onToggle(item.id, false)} style={styles.actionBtn}>
              <MaterialIcons name="pause-circle-filled" size={28} color={Colors.warning} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => onToggle(item.id, true)} style={styles.actionBtn}>
              <MaterialIcons name="play-circle-filled" size={28} color={Colors.success} />
            </TouchableOpacity>
          )}
          {isBroken && onReupload && (
            <TouchableOpacity onPress={() => onReupload(item)} style={styles.actionBtn} accessibilityLabel="Ricarica immagine">
              <MaterialIcons name="add-photo-alternate" size={22} color={Colors.warning} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionBtn}>
            <MaterialIcons name="edit" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionBtn}>
            <MaterialIcons name="delete-outline" size={26} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardBroken: {
    borderColor: Colors.error,
    borderWidth: 1.5,
  },
  cardImage: {
    width: "100%",
    height: 140,
    backgroundColor: Colors.surfaceLight,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  imageFallbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardBody: {
    flexDirection: "row",
    padding: 14,
    alignItems: "center",
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  cardLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.accent,
    marginTop: 3,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  cardImpressions: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardActions: {
    flexDirection: "column",
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    padding: 4,
  },
  groupEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  groupEditBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
});
