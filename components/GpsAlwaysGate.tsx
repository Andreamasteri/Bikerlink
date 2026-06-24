import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AlwaysPermissionNotice from "@/components/AlwaysPermissionNotice";
import { useLocationGate } from "@/lib/location-context";
import { useTheme } from "@/lib/theme-context";
import { stopBackgroundLocationTask } from "@/lib/background-location-task";

export function BackgroundRevocationBanner() {
  const { backgroundPermissionRevoked } = useLocationGate();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (backgroundPermissionRevoked) {
      stopBackgroundLocationTask().catch(() => {});
    }
  }, [backgroundPermissionRevoked]);

  if (!backgroundPermissionRevoked) return null;

  return (
    <View
      style={[
        styles.banner,
        { top: insets.top, backgroundColor: colors.accent },
      ]}
    >
      <Text style={styles.text}>
        Posizione in background disattivata — vai in Impostazioni {">"} Permessi {">"} Sempre
      </Text>
    </View>
  );
}

export function GpsAlwaysGate({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { hasBackgroundPermission, backgroundPermissionChecked, backgroundPermissionRevoked } = useLocationGate();
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !backgroundPermissionChecked || hasBackgroundPermission) return null;
  if (!dismissed) return <AlwaysPermissionNotice onDismiss={() => setDismissed(true)} />;
  if (backgroundPermissionRevoked) return <BackgroundRevocationBanner />;
  return null;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 9999,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
  },
});
