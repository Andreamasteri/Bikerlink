import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getApiUrl } from "@/lib/query-client";

interface EditBasicInfoProps {
  nickname: string;
  setNickname: (name: string) => void;
  birthYear: string;
  setBirthYear: (year: string) => void;
  bio: string;
  setBio: (bio: string) => void;
  photos: any[];
  uploadPhotoMutation: any;
  pickImageForSlot: (existingPhotoId?: string) => void;
  handleDeletePhoto: (photoId: string) => void;
  failedPhotos: Set<string>;
  setFailedPhotos: React.Dispatch<React.SetStateAction<Set<string>>>;
  replacingSlot: string | null;
}

export function EditBasicInfo({
  nickname,
  setNickname,
  birthYear,
  setBirthYear,
  bio,
  setBio,
  photos,
  uploadPhotoMutation,
  pickImageForSlot,
  handleDeletePhoto,
  failedPhotos,
  setFailedPhotos,
  replacingSlot,
}: EditBasicInfoProps) {
  const t = useT();

  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>Informazioni personali</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("auth.nickname")}</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholderTextColor={Colors.textSecondary}
            maxLength={50}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("auth.birthYear")}</Text>
          <TextInput
            style={styles.input}
            value={birthYear}
            onChangeText={setBirthYear}
            placeholder="1990"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Scrivi qualcosa di te..."
          placeholderTextColor={Colors.textSecondary}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{bio.length}/500</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>{t("profile.photos")}</Text>
        <View style={styles.photoGrid}>
          {[0, 1, 2].map((slotIndex) => {
            const photo = photos[slotIndex];
            const isUploading = uploadPhotoMutation.isPending && !photo;
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
                      onPress={() => pickImageForSlot(photo.id)}
                    >
                      <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.photoActionBtn, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                      onPress={() => handleDeletePhoto(photo.id)}
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
                onPress={() => pickImageForSlot()}
                activeOpacity={0.7}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
                    <Text style={styles.addPhotoText}>Aggiungi foto</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    fontWeight: "500" as const,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bioInput: {
    height: 120,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 4,
  },
  photoGrid: {
    flexDirection: "row",
    gap: 12,
  },
  photoItem: {
    width: 100,
    height: 100,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    position: "absolute",
    top: 5,
    right: 5,
    flexDirection: "row",
    gap: 5,
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
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  slotLabelText: {
    fontSize: 10,
    color: "#FFFFFF",
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
    fontWeight: "600" as const,
  },
  addPhotoSlot: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
