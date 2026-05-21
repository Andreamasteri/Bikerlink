import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ErrorBannerProps {
  error: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error }) => {
  if (!error) return null;
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={Colors.error} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229, 57, 53, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
