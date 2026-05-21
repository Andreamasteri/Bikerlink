import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface MatchHeaderProps {
  title: string;
  systemDesc: string;
}

export function MatchHeader({ title, systemDesc }: MatchHeaderProps) {
  return (
    <>
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineTitle}>{title}</Text>
      </View>

      <View style={styles.systemDescBanner}>
        <Ionicons name="information-circle" size={15} color={Colors.accent} />
        <Text style={styles.systemDescText}>{systemDesc}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  inlineTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  systemDescBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: Colors.accent + "10",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.accent + "25",
  },
  systemDescText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 21,
  },
});
