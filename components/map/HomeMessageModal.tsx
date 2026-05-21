import React from "react";
import { Modal, Pressable, View, Text, Image, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

type Props = {
  visible: boolean;
  text: string;
  onClose: () => void;
};

export default function HomeMessageModal({ visible, text, onClose }: Props) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Image source={require("@/assets/images/helmet-logo.png")} style={{ width: 40, height: 40 }} resizeMode="contain" />
            <Text style={styles.title}>BikerLink</Text>
          </View>
          <Text style={styles.text}>{text}</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{t("tracking.close")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    maxWidth: 420,
    width: "90%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text },
  text: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 20,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
