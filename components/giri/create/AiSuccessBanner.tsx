import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AiSuccessBannerProps {
  onDismiss: () => void;
}

export const AiSuccessBanner: React.FC<AiSuccessBannerProps> = ({ onDismiss }) => {
  return (
    <View style={styles.aiSuccessBanner}>
      <Ionicons name="checkmark-circle-outline" size={16} color="#15803d" />
      <Text style={styles.aiSuccessBannerText}>Analisi AI completata con successo!</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close-outline" size={16} color="#15803d" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  aiSuccessBanner: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    backgroundColor: "#dcfce7", 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: "#86efac" 
  },
  aiSuccessBannerText: { 
    flex: 1, 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
    color: "#15803d" 
  },
});
