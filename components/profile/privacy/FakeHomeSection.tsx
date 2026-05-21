import React from "react";
import { View, Text, Switch, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  fakeHomeEnabled: boolean;
  onFakeHomeEnabledChange: (val: boolean) => void;
  homeLatitude: number | null;
  homeLongitude: number | null;
  fakeHomeLatitude: number | null;
  fakeHomeLongitude: number | null;
  fakeHomeRadius: number;
  onFakeHomeRadiusChange: (val: number) => void;
  onFakeHomeRadiusEndEditing: () => void;
  onPickCoord: (target: "home" | "fake") => void;
  onOpenMapPicker: (target: "home" | "fake") => void;
}

export const FakeHomeSection = ({
  fakeHomeEnabled,
  onFakeHomeEnabledChange,
  homeLatitude,
  homeLongitude,
  fakeHomeLatitude,
  fakeHomeLongitude,
  fakeHomeRadius,
  onFakeHomeRadiusChange,
  onFakeHomeRadiusEndEditing,
  onPickCoord,
  onOpenMapPicker,
}: Props) => {
  return (
    <>
      <View style={styles.privacyRow}>
        <View style={styles.privacyRowLeft}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Casa fittizia</Text>
            <Text style={styles.privacyDesc}>
              Mostra una posizione "casa" alternativa invece di quella reale.
            </Text>
            {fakeHomeEnabled && (
              <Text style={styles.privacyWarning}>
                ⚠ Aggiorna la tua posizione dopo aver attivato questa opzione.
              </Text>
            )}
          </View>
        </View>
        <Switch
          value={fakeHomeEnabled}
          onValueChange={onFakeHomeEnabledChange}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.fakeHomeCard}>
        <View style={styles.fakeHomeSection}>
          <Text style={styles.fakeHomeSectionLabel}>Posizione Casa</Text>
          {homeLatitude != null && homeLongitude != null ? (
            <Text style={styles.fakeHomeCoords}>
              {homeLatitude.toFixed(5)}, {homeLongitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.fakeHomeCoords}>Non impostata</Text>
          )}
          <View style={styles.fakeHomeBtnRow}>
            <Pressable style={styles.fakeHomeBtn} onPress={() => onPickCoord("home")}>
              <Ionicons name="locate" size={14} color={Colors.accent} />
              <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
            </Pressable>
            <Pressable style={styles.fakeHomeBtn} onPress={() => onOpenMapPicker("home")}>
              <Ionicons name="map" size={14} color={Colors.accent} />
              <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {fakeHomeEnabled && (
        <View style={[styles.fakeHomeCard, { marginTop: 8 }]}>
          <View style={styles.fakeHomeSection}>
            <Text style={styles.fakeHomeSectionLabel}>Posizione Fittizia</Text>
            {fakeHomeLatitude != null && fakeHomeLongitude != null ? (
              <Text style={styles.fakeHomeCoords}>
                {fakeHomeLatitude.toFixed(5)}, {fakeHomeLongitude.toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.fakeHomeCoords}>Non impostata</Text>
            )}
            <View style={styles.fakeHomeBtnRow}>
              <Pressable style={styles.fakeHomeBtn} onPress={() => onPickCoord("fake")}>
                <Ionicons name="locate" size={14} color={Colors.accent} />
                <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
              </Pressable>
              <Pressable style={styles.fakeHomeBtn} onPress={() => onOpenMapPicker("fake")}>
                <Ionicons name="map" size={14} color={Colors.accent} />
                <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
              </Pressable>
            </View>
            <View style={[styles.privacyKmRow, { paddingHorizontal: 0 }]}>
              <Text style={styles.privacyKmLabel}>Raggio (km):</Text>
              <TextInput
                style={styles.privacyKmInput}
                keyboardType="decimal-pad"
                value={String(fakeHomeRadius)}
                onChangeText={(t) => {
                  const n = parseFloat(t);
                  if (!isNaN(n) && n > 0) onFakeHomeRadiusChange(n);
                }}
                onEndEditing={onFakeHomeRadiusEndEditing}
              />
              <Text style={styles.privacyKmLabel}>km</Text>
            </View>
          </View>
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
  privacyWarning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#F59E0B",
    lineHeight: 17,
    marginTop: 4,
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
  fakeHomeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeSection: {
    gap: 6,
  },
  fakeHomeSectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fakeHomeCoords: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    opacity: 0.7,
  },
  fakeHomeBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  fakeHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
