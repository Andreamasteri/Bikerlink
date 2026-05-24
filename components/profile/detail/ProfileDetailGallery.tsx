import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import Colors from "@/constants/colors";

interface ProfileDetailGalleryProps {
  profile: { photos?: { id: string; photoUrl?: string | null }[] };
  baseUrl: string;
  onPhotoPress: (uri: string) => void;
}

export const ProfileDetailGallery: React.FC<ProfileDetailGalleryProps> = ({ profile, baseUrl, onPhotoPress }) => {
  if (!profile.photos || profile.photos.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Foto</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {profile.photos.map((p) => {
          const uri = p.photoUrl?.startsWith("http") ? p.photoUrl : `${baseUrl}${p.photoUrl}`;
          return (
            <TouchableOpacity key={p.id} onPress={() => onPhotoPress(uri)} activeOpacity={0.8}>
              <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, marginRight: 8, backgroundColor: Colors.surfaceLight },
});
