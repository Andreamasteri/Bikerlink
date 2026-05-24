import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { BulkImageAsset } from "@/lib/image-picker-utils";

interface AdImageUploadProps {
  images: BulkImageAsset[];
  onPickImages: () => void;
  onRemoveImage: (index: number) => void;
  uploading: boolean;
  progress: { current: number; total: number } | null;
}

export function AdImageUpload({
  images,
  onPickImages,
  onRemoveImage,
  uploading,
  progress,
}: AdImageUploadProps) {
  const t = useT();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.pickImagesBtn, uploading && { opacity: 0.5 }]}
        onPress={onPickImages}
        disabled={uploading}
      >
        <MaterialIcons name="add-photo-alternate" size={22} color={Colors.accent} />
        <Text style={styles.pickImagesBtnText}>
          {images.length === 0 ? t("admin.chooseImages") : t("admin.addImagesCount").replace("{count}", String(images.length))}
        </Text>
      </TouchableOpacity>

      {images.length > 0 && (
        <View style={styles.thumbnailGrid}>
          {images.map((img, idx) => (
            <View key={img.uri + idx} style={styles.thumbnailWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />
              {!uploading && (
                <TouchableOpacity
                  style={styles.thumbnailRemove}
                  onPress={() => onRemoveImage(idx)}
                >
                  <MaterialIcons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              )}
              <View style={styles.thumbnailIndex}>
                <Text style={styles.thumbnailIndexText}>#{idx + 1}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {progress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage string width
                { width: `${Math.round((progress.current / progress.total) * 100)}%` as any },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress.current}/{progress.total} campagne create…
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  pickImagesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    backgroundColor: Colors.accent + "0A",
  },
  pickImagesBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.accent,
  },
  thumbnailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  thumbnailWrap: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.surfaceLight,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailIndex: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  thumbnailIndexText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#fff",
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
  },
  progressText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
