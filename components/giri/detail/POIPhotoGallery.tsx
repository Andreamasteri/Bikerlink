import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, FlatList, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { getApiUrl } from "@/lib/query-client";
import type { ThemeColors } from '@/constants/colors';

interface POIPhoto {
  id: string;
  poiId: string;
  userId: string;
  photoUrl: string;
  caption: string | null;
  createdAt: string;
}

interface POIPhotoGalleryProps {
  poiId: string;
  colors: ThemeColors;
}

const POIPhotoGallery: React.FC<POIPhotoGalleryProps> = ({ poiId, colors }) => {
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const { data: photos = [], isLoading } = useQuery<POIPhoto[]>({
    queryKey: ["/api/planned-routes/poi", poiId, "photos"],
    queryFn: async () => {
      const url = new URL(`/api/planned-routes/poi/${poiId}/photos`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.photos ?? [];
    },
    staleTime: 60_000,
  });

  const handleUploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permesso negato", "Per caricare foto è necessario l'accesso alla galleria.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert("Errore", "Impossibile leggere l'immagine."); return; }

    setUploading(true);
    try {
      const url = new URL(`/api/planned-routes/poi/${poiId}/photos`, getApiUrl());
      const resp = await fetch(url.toString(), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" }),
      });
      if (!resp.ok) throw new Error("Upload fallito");
      qc.invalidateQueries({ queryKey: ["/api/planned-routes", poiId, "photos"] });
    } catch {
      Alert.alert("Errore", "Impossibile caricare la foto.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary }}>
          FOTO COMMUNITY ({photos.length})
        </Text>
        <Pressable
          onPress={handleUploadPhoto}
          disabled={uploading}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          {uploading
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Ionicons name="camera-outline" size={14} color={colors.accent} />
          }
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.accent }}>
            {uploading ? "Caricamento..." : "Aggiungi foto"}
          </Text>
        </Pressable>
      </View>
      {isLoading && <ActivityIndicator color={colors.accent} size="small" />}
      {!isLoading && photos.length === 0 && (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary }}>
          Nessuna foto ancora. Sii il primo a condividerne una!
        </Text>
      )}
      {photos.length > 0 && (
        <FlatList
          horizontal
          data={photos}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ marginRight: 8 }}>
              <Image
                source={{ uri: item.photoUrl }}
                style={{ width: 90, height: 90, borderRadius: 10 }}
                resizeMode="cover"
              />
              {item.caption && (
                <Text
                  style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, marginTop: 2, maxWidth: 90 }}
                  numberOfLines={1}
                >
                  {item.caption}
                </Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

export default POIPhotoGallery;
