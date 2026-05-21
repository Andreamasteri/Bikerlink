import React from "react";
import { View, Text, Pressable, Image, Alert, StyleSheet } from "react-native";
import { useT } from "@/lib/language-context";
import { UseMutationResult } from "@tanstack/react-query";

const sosLaunchIcon = require("@/assets/images/sos-launch-icon.png");

interface SosButtonProps {
  mySosData: any;
  setShowSosModal: (show: boolean) => void;
  cancelSosMutation: UseMutationResult<any, Error, string>;
}

export function SosButton({
  mySosData,
  setShowSosModal,
  cancelSosMutation,
}: SosButtonProps) {
  const t = useT();

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
            onPress: () => cancelSosMutation.mutate(mySosData.id),
          },
        ]
      );
    } else {
      setShowSosModal(true);
    }
  };

  return (
    <View style={styles.sosRow}>
      <Pressable
        style={[styles.sosBtn, mySosData ? styles.sosBtnActive : null]}
        onPress={handlePress}
      >
        <Image
          source={sosLaunchIcon}
          style={[
            styles.sosIconLeft,
            mySosData ? styles.sosIconLeftActive : null,
          ]}
          resizeMode="contain"
        />
        <Text
          style={[
            styles.sosLabelLeft,
            mySosData ? styles.sosLabelLeftActive : null,
          ]}
        >
          {mySosData ? "SOS ATTIVO" : "LANCIA SOS"}
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
  sosBtnActive: {
    opacity: 1,
  },
  sosIconLeft: {
    width: 187,
    height: 146,
    tintColor: "#CC0000",
  },
  sosIconLeftActive: {
    tintColor: "#990000",
  },
  sosLabelLeft: {
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    color: "#CC0000",
    textAlign: "center",
  },
  sosLabelLeftActive: {
    color: "#990000",
  },
});
