import React from "react";
import { View, Text, TouchableOpacity, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface HomeHeaderProps {
  areaLabel: string;
  onShowAreaModal: () => void;
  onShowHomeMessage: () => void;
  onChatPress: () => void;
  homeMessageEnabled: boolean;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  areaLabel,
  onShowAreaModal,
  onShowHomeMessage,
  onChatPress,
  homeMessageEnabled,
}) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.titleRow}
        onPress={onShowHomeMessage}
        activeOpacity={homeMessageEnabled ? 0.7 : 1}
      >
        <Text style={styles.title}>BikerLink</Text>
        <Image
          source={require("@/assets/images/helmet-logo.png")}
          style={styles.helmetLogo}
          resizeMode="contain"
        />
      </TouchableOpacity>
      <Pressable style={styles.defineAreaBtnInline} onPress={onShowAreaModal}>
        <Ionicons name="globe-outline" size={14} color={Colors.accent} />
        <Text style={styles.defineAreaBtnInlineText} numberOfLines={1}>
          {areaLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.accent} />
      </Pressable>
      <Pressable onPress={onChatPress}>
        <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.accent,
  },
  helmetLogo: {
    width: 28,
    height: 28,
    marginLeft: 6,
  },
  defineAreaBtnInline: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    flex: 1,
    marginHorizontal: 12,
  },
  defineAreaBtnInlineText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 4,
    flexShrink: 1,
  },
});
