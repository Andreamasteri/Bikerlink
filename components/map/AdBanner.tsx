import React, { useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type Ad = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  imageVersion?: number;
  linkUrl?: string;
  rotationDuration?: number;
  rotationMode?: string;
};

type Props = {
  ad: Ad;
  onPress: (ad: Ad) => void;
};

export default function AdBanner({ ad, onPress }: Props) {
  const [imageError, setImageError] = useState(false);
  const [retried, setRetried] = useState(false);

  const imageUri = (() => {
    if (!ad.imageUrl) return "";
    if (ad.imageUrl.startsWith("http://") || ad.imageUrl.startsWith("https://")) {
      return ad.imageUrl;
    }
    const baseUrl = getApiUrl();
    const base = `${baseUrl.replace(/\/$/, "")}${ad.imageUrl}`;
    const v = ad.imageVersion ?? 0;
    return `${base}${base.includes("?") ? "&" : "?"}v=${v}`;
  })();

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.banner} onPress={() => onPress(ad)}>
        {imageUri && !imageError ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="disk"
            onError={() => {
              setImageError(true);
              if (!retried) {
                setTimeout(() => {
                  setRetried(true);
                  setImageError(false);
                }, 3000);
              }
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <MaterialIcons name="broken-image" size={28} color={Colors.textSecondary} />
            <Text style={styles.adText}>{ad.name}</Text>
            {ad.description && <Text style={styles.adSubText}>{ad.description}</Text>}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  banner: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  image: {
    width: "100%",
    height: 240,
    borderRadius: 10,
  },
  placeholder: {
    backgroundColor: Colors.surfaceLight,
    padding: 16,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  adText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  adSubText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
});
