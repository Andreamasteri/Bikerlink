import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AiFallbackBannerProps {
  onDismiss: () => void;
  reason?: "key_missing" | "generic";
}

export const AiFallbackBanner: React.FC<AiFallbackBannerProps> = ({ onDismiss, reason = "generic" }) => {
  const isKeyMissing = reason === "key_missing";
  return (
    <View style={styles.aiFallbackBanner}>
      <Ionicons
        name={isKeyMissing ? "alert-circle-outline" : "information-circle-outline"}
        size={16}
        color="#b45309"
      />
      <Text style={styles.aiFallbackBannerText}>
        {isKeyMissing
          ? "Funzione AI non attivata — contatta l'amministratore"
          : "AI non disponibile, compilazione manuale"}
      </Text>
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
