import React from "react";
import { View, StyleSheet, Image, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ContestUploadProps {
  selectedImage: string | null;
  caption: string;
  setCaption: (text: string) => void;
  onCancel: () => void;
  onUpload: () => void;
  isUploading: boolean;
}

export function ContestUpload({
  selectedImage,
  caption,
  setCaption,
  onCancel,
  onUpload,
  isUploading,
}: ContestUploadProps) {
  if (!selectedImage) return null;

  return (
    <View style={styles.uploadContainer}>
      <Image source={{ uri: selectedImage }} style={styles.uploadPreview} />
      <TextInput
        style={styles.captionInput}
        placeholder="Didascalia (opzionale)"
        placeholderTextColor={Colors.textSecondary}
        value={caption}
        onChangeText={setCaption}
        maxLength={200}
      />
      <View style={styles.uploadActions}>
        <Pressable onPress={onCancel} style={styles.cancelUploadBtn}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </Pressable>
        <Pressable
          onPress={onUpload}
          disabled={isUploading}
          style={styles.confirmUploadBtn}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="checkmark" size={22} color="#FFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  uploadContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  uploadPreview: {
    width: "100%",
    height: 200,
    backgroundColor: Colors.surfaceLight,
  },
  captionInput: {
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  uploadActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelUploadBtn: {
    padding: 8,
  },
  confirmUploadBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    padding: 10,
  },
});
