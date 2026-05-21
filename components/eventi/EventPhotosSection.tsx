import React from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface EventPhotosSectionProps {
  pendingImages: string[];
  handlePickImage: () => void;
  removeImage: (idx: number) => void;
}

export function EventPhotosSection({
  pendingImages,
  handlePickImage,
  removeImage,
}: EventPhotosSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Locandine</Text>
      <Text style={styles.hint}>Carica fino a 5 immagini promozionali (JPG)</Text>

      <View style={styles.imagesGrid}>
        {pendingImages.map((uri, idx) => (
          <View key={idx} style={styles.imageThumb}>
            <Image source={{ uri }} style={styles.thumbImg} />
            <Pressable style={styles.removeImg} onPress={() => removeImage(idx)}>
              <Ionicons name="close-circle" size={20} color={Colors.accentRed} />
            </Pressable>
          </View>
        ))}
        {pendingImages.length < 5 && (
          <Pressable style={styles.addImageBtn} onPress={handlePickImage}>
            <Ionicons name="add-circle-outline" size={32} color={Colors.accent} />
            <Text style={styles.addImageText}>Aggiungi</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  imageThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "visible",
    position: "relative",
  },
  thumbImg: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImg: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: Colors.background,
    borderRadius: 10,
  },
  addImageBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addImageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
});
