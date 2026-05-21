import React from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface GpsBannerProps {
  requestPermission: () => Promise<boolean>;
}

export function GpsBanner({ requestPermission }: GpsBannerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 12 }]}>
      <Ionicons name="navigate-outline" size={28} color="#fff" />
      <Text style={styles.title}>GPS non attivo</Text>
      <Text style={styles.text}>
        BikerLink ha bisogno della posizione per funzionare.{"\n"}
        Senza GPS puoi accedere solo al Profilo.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={async () => {
          const granted = await requestPermission();
          if (!granted) {
            Linking.openSettings();
          }
        }}
      >
        <Ionicons name="location" size={18} color="#fff" />
        <Text style={styles.btnText}>Attiva posizione</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#D32F2F",
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#fff",
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
