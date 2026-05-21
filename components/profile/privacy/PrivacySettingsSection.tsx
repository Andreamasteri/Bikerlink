import React from "react";
import { View, Text, Switch, TextInput, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface Props {
  hideFromMap: boolean;
  onHideFromMapChange: (val: boolean) => void;
  positionFuzz: boolean;
  onPositionFuzzChange: (val: boolean) => void;
  positionFuzzKm: number;
  onPositionFuzzKmChange: (val: number) => void;
  onPositionFuzzKmEndEditing: () => void;
}

export const PrivacySettingsSection = ({
  hideFromMap,
  onHideFromMapChange,
  positionFuzz,
  onPositionFuzzChange,
  positionFuzzKm,
  onPositionFuzzKmChange,
  onPositionFuzzKmEndEditing,
}: Props) => {
  return (
    <>
      <View style={styles.privacyRow}>
        <View style={styles.privacyRowLeft}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Nasconditi dalla mappa</Text>
            <Text style={styles.privacyDesc}>
              Il tuo pin non sarà visibile nella mappa pubblica.
            </Text>
          </View>
        </View>
        <Switch
          value={hideFromMap}
          onValueChange={onHideFromMapChange}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.privacyRow}>
        <View style={styles.privacyRowLeft}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Posizione sfocata</Text>
            <Text style={styles.privacyDesc}>
              La tua posizione viene mostrata con un offset casuale per proteggere la privacy.
            </Text>
          </View>
        </View>
        <Switch
          value={positionFuzz}
          onValueChange={onPositionFuzzChange}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor="#fff"
        />
      </View>

      {positionFuzz && (
        <View style={styles.privacyKmRow}>
          <Text style={styles.privacyKmLabel}>Raggio sfocatura (km):</Text>
          <TextInput
            style={styles.privacyKmInput}
            keyboardType="decimal-pad"
            value={String(positionFuzzKm)}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n) && n > 0) onPositionFuzzKmChange(n);
            }}
            onEndEditing={onPositionFuzzKmEndEditing}
          />
          <Text style={styles.privacyKmLabel}>km</Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  privacyRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    marginRight: 12,
  },
  privacyLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  privacyDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  privacyKmRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  privacyKmLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginRight: 6,
  },
  privacyKmInput: {
    minWidth: 64,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginRight: 6,
    paddingVertical: 0,
  },
});
