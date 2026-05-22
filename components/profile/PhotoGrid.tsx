import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

const screenWidth = Dimensions.get("window").width;
const photoSize = (screenWidth - 32 - 16) / 3;

type Photo = {
  id: string;
  photoUrl: string;
  sortOrder: number;
  isApproved: boolean;
};

type Props = {
  photos?: Photo[];
  failedPhotos: Set<string>;
  setFailedPhotos: React.Dispatch<React.SetStateAction<Set<string>>>;
  replacingSlot: string | null;
  isUploading: boolean;
  onPickImage: (existingPhotoId?: string) => void;
  onDeletePhoto: (photoId: string) => void;
};

export default function PhotoGrid({
  photos,
  failedPhotos,
  setFailedPhotos,
  replacingSlot,
  isUploading,
  onPickImage,
  onDeletePhoto,
}: Props) {
  const t = useT();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("profile.photos")}</Text>
      </View>
      <View style={styles.photoGrid}>
        {[0, 1, 2].map((slotIndex) => {
          const photo = photos?.[slotIndex];
          const isSlotUploading = isUploading && !photo;
          const isReplacing = photo && replacingSlot === photo.id;
          if (photo) {
            const photoUri = photo.photoUrl.startsWith("http")
              ? photo.photoUrl
              : `${getApiUrl()}${photo.photoUrl}`;
            return (
              <View key={photo.id} style={styles.photoItem}>
                {failedPhotos.has(photo.id) ? (
                  <View style={styles.photoBroken}>
                    <Ionicons name="image-outline" size={28} color={Colors.textSecondary} />
                  </View>
                ) : (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                    onError={() => setFailedPhotos(prev => new Set(prev).add(photo.id))}
                  />
                )}
                {isReplacing && (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    style={styles.photoActionBtn}
                    onPress={() => onPickImage(photo.id)}
                  >
                    <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoActionBtn, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                    onPress={() => onDeletePhoto(photo.id)}
                  >
                    <Ionicons name="trash" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {!photo.isApproved && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingText}>In attesa</Text>
                  </View>
                )}
                <View style={styles.slotLabel}>
                  <Text style={styles.slotLabelText}>Foto {slotIndex + 1}</Text>
                </View>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={`empty-${slotIndex}`}
              style={styles.addPhotoSlot}
              onPress={() => onPickImage()}
              activeOpacity={0.7}
              disabled={isSlotUploading}
            >
              {isSlotUploading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <>
                  <Ionicons name="add" size={28} color={Colors.textSecondary} />
                  <Text style={styles.addPhotoText}>Foto {slotIndex + 1}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoItem: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoBroken: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 6,
  },
  photoActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  slotLabelText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 4,
    alignItems: "center",
  },
  pendingText: {
    fontSize: 10,
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
  },
  addPhotoSlot: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
