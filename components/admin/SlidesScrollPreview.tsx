import React from "react";
import { ScrollView, View, Text, Image } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import styles from "./LegalDocsStyles";

interface Props {
  slides: { title: string; imageUrl: string }[];
}

export default function SlidesScrollPreview({ slides }: Props) {
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
          </View>
        );
      })}
    </ScrollView>
  );
}
