import React from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface HeaderProps {
  onBack: () => void;
  onTitleTap: () => void;
  title: string;
}

export const GiriCreateHeader: React.FC<HeaderProps> = ({ onBack, onTitleTap, title }) => {
  const colors = useColors();
  
  return (
    <View style={styles.nav}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Pressable onPress={onTitleTap} hitSlop={8}>
        <Text style={[styles.navTitle, { color: colors.text }]}>{title}</Text>
      </Pressable>
      <View style={{ width: 40 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  nav: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 12, 
    paddingBottom: 10 
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
});
