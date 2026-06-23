import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import Colors from "@/constants/colors";
import OtaPanel from "@/components/admin/ota/OtaPanel";
import OtaPanelExtra from "@/components/admin/ota/OtaPanelExtra";

export default function AdminOta() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
    >
      <View style={styles.card}>
        <OtaPanel />
        <OtaPanelExtra />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
