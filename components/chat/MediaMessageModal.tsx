import React, { useState } from "react";
import { Modal, Pressable, Image, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MediaMessageModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
}

export function MediaMessageModal({ visible, imageUri, onClose }: MediaMessageModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fullscreenOverlay} onPress={onClose}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.fullscreenImage} resizeMode="contain" />
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
            <Text style={styles.errorText}>Impossibile caricare l'immagine</Text>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
