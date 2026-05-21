import React from "react";
import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import type { Photo } from "@/components/map/userDetailTypes";

type Props = {
  photos: Photo[];
  onPhotoPress: (uri: string) => void;
};

export default function UserPhotoStrip({ photos, onPhotoPress }: Props) {
  const baseUrl = getApiUrl();

  if (!photos || photos.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Foto</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        {photos.map((p) => {
          const uri = p.photoUrl?.startsWith("http") ? p.photoUrl : `${baseUrl}${p.photoUrl}`;
          return (
            <TouchableOpacity key={p.id} onPress={() => onPhotoPress(uri)} activeOpacity={0.8}>
              <Image source={{ uri }} style={styles.photo} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  photo: { width: 80, height: 80, borderRadius: 10, marginRight: 8 },
});
