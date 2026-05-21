import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface AiFallbackBannerProps {
  onDismiss: () => void;
}

export const AiFallbackBanner: React.FC<AiFallbackBannerProps> = ({ onDismiss }) => {
  const colors = useColors();
  
  return (
    <View style={styles.aiFallbackBanner}>
      <Ionicons name="information-circle-outline" size={16} color="#b45309" />
      <Text style={styles.aiFallbackBannerText}>AI non disponibile, compilazione manuale</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close-outline" size={16} color="#b45309" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  aiFallbackBanner: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    backgroundColor: "#fef3c7", 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: "#fcd34d" 
  },
  aiFallbackBannerText: { 
    flex: 1, 
    fontFamily: "Inter_400Regular", 
    fontSize: 13, 
    color: "#b45309" 
  },
});
