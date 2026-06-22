import React from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

export type SlidePreview = { title: string; imageUrl: string };

export function SlidesScrollPreview({
  slides,
  onRemove,
}: {
  slides: SlidePreview[];
  onRemove?: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.previewScroll}
      contentContainerStyle={styles.previewScrollContent}
    >
      {slides.map((slide, i) => {
        const imageUri = new URL(slide.imageUrl, getApiUrl()).toString();
        return (
          <View key={i} style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            <Text style={styles.previewCardTitle} numberOfLines={2}>{slide.title}</Text>
            {onRemove && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(i)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

export const styles = StyleSheet.create({
  previewScroll: {
    marginHorizontal: -16,
  },
  previewScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  previewCard: {
    width: 240,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  removeBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  previewImage: {
    width: 240,
    height: 134,
  },
  previewCardTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
    padding: 8,
    lineHeight: 17,
  },
});
