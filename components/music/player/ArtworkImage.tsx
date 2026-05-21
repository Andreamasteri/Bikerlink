import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ArtworkImageProps {
  uri?: string | null;
  size: number;
  style?: object;
}

export function ArtworkImage({ uri, size, style }: ArtworkImageProps) {
  const [errored, setErrored] = React.useState(false);
  if (!uri || errored) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: 6,
            backgroundColor: Colors.surface,
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <Ionicons name="musical-notes" size={size * 0.4} color={Colors.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size, borderRadius: 6 }, style]}
      onError={() => setErrored(true)}
    />
  );
}
