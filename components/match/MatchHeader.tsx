import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface MatchHeaderProps {
  title: string;
}

export function MatchHeader({ title }: MatchHeaderProps) {
  const t = useT();
  const [infoVisible, setInfoVisible] = useState(false);

  return (
    <>
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineTitle}>{title}</Text>
        <TouchableOpacity onPress={() => setInfoVisible(true)} style={styles.infoButton} hitSlop={10}>
          <Ionicons name="information-circle-outline" size={26} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setInfoVisible(false)}>
          <Pressable style={styles.popup} onPress={() => {}}>
            <Ionicons name="information-circle" size={28} color={Colors.accent} style={styles.popupIcon} />
            <Text style={styles.popupText}>{t("match.systemDesc")}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setInfoVisible(false)}>
              <Text style={styles.closeBtnText}>{t("match.infoClose")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  infoButton: {
    padding: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  popup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  popupIcon: {
    marginBottom: 12,
  },
  popupText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 20,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 36,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
