import React from "react";
import { View, Text, Pressable, Image, Alert, StyleSheet } from "react-native";
import { useT } from "@/lib/language-context";
import { useColors } from "@/hooks/useColors";
import { UseMutationResult } from "@tanstack/react-query";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");

interface SosButtonProps {
  mySosData: { id?: string } | null | undefined;
  setShowSosModal: (show: boolean) => void;
  cancelSosMutation: UseMutationResult<unknown, Error, string>;
}

export function SosButton({
  mySosData,
  setShowSosModal,
  cancelSosMutation,
}: SosButtonProps) {
  const t = useT();
  const colors = useColors();

  const handlePress = () => {
    if (mySosData) {
      Alert.alert(
        t("ready.cancelSosTitle"),
        t("ready.cancelSosMsg"),
        [
          { text: t("common.no"), style: "cancel" },
          {
            text: t("ready.cancelSosYes"),
            style: "destructive",
            onPress: () => cancelSosMutation.mutate(mySosData?.id ?? ""),
          },
        ]
      );
    } else {
      setShowSosModal(true);
    }
  };

  const iconTint = mySosData ? colors.error : colors.accentRed;

  return (
    <View style={styles.sosRow}>
      <Pressable
        style={styles.sosBtn}
        onPress={handlePress}
      >
        <Image
          source={sosLaunchIcon}
          style={[styles.sosIconLeft, { tintColor: iconTint }]}
          resizeMode="contain"
        />
        <Text style={[styles.sosLabelLeft, { color: iconTint }]}>
          {mySosData ? t("sos.active") : t("sos.launch")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sosRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sosBtn: {
    alignItems: "center",
    gap: 10,
  },
  sosIconLeft: {
    width: 187,
    height: 146,
  },
  sosLabelLeft: {
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
});
