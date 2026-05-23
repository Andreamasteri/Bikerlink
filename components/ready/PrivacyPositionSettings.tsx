import React from "react";
import { View, Text, Switch, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { FakeZoneCoordPanel, MapTarget } from "./FakeZoneCoordPanel";

export function PrivacyPositionSettings({
  t,
  colors,
  privacyExpanded,
  setPrivacyExpanded,
  positionFuzz,
  setPositionFuzz,
  positionFuzzKm,
  setPositionFuzzKm,
  fakeHomeEnabled,
  setFakeHomeEnabled,
  homeLatitude,
  homeLongitude,
  fakeHomeLatitude,
  fakeHomeLongitude,
  fakeHomeRadius,
  setFakeHomeRadius,
  fakeWorkEnabled,
  setFakeWorkEnabled,
  workLatitude,
  workLongitude,
  fakeWorkLatitude,
  fakeWorkLongitude,
  fakeWorkRadius,
  setFakeWorkRadius,
  fakeWhateverEnabled,
  setFakeWhateverEnabled,
  whateverLatitude,
  whateverLongitude,
  fakeWhateverLatitude,
  fakeWhateverLongitude,
  fakeWhateverRadius,
  setFakeWhateverRadius,
  privacyMutation,
  pickFromGPS,
  openMapPicker,
}: {
  t: any;
  colors: any;
  privacyExpanded: boolean;
  setPrivacyExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  positionFuzz: boolean;
  setPositionFuzz: (v: boolean) => void;
  positionFuzzKm: number;
  setPositionFuzzKm: (v: number) => void;
  fakeHomeEnabled: boolean;
  setFakeHomeEnabled: (v: boolean) => void;
  homeLatitude: number | null;
  homeLongitude: number | null;
  fakeHomeLatitude: number | null;
  fakeHomeLongitude: number | null;
  fakeHomeRadius: number;
  setFakeHomeRadius: (v: number) => void;
  fakeWorkEnabled: boolean;
  setFakeWorkEnabled: (v: boolean) => void;
  workLatitude: number | null;
  workLongitude: number | null;
  fakeWorkLatitude: number | null;
  fakeWorkLongitude: number | null;
  fakeWorkRadius: number;
  setFakeWorkRadius: (v: number) => void;
  fakeWhateverEnabled: boolean;
  setFakeWhateverEnabled: (v: boolean) => void;
  whateverLatitude: number | null;
  whateverLongitude: number | null;
  fakeWhateverLatitude: number | null;
  fakeWhateverLongitude: number | null;
  fakeWhateverRadius: number;
  setFakeWhateverRadius: (v: number) => void;
  privacyMutation: any;
  pickFromGPS: (target: MapTarget) => void;
  openMapPicker: (target: MapTarget, lat?: number | null, lng?: number | null) => void;
}) {
  return (
    <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
      <Pressable style={styles.accordionHeader} onPress={() => setPrivacyExpanded((v) => !v)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="shield-outline" size={18} color={Colors.accent} />
          <Text style={styles.accordionTitle}>Privacy & Posizione</Text>
        </View>
        <Ionicons name={privacyExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </Pressable>

      {privacyExpanded && (
        <View style={styles.accordionContent}>
          <View style={styles.privacyRow}>
            <Ionicons name="locate-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
            <View style={styles.privacyRowText}>
              <Text style={styles.privacyRowLabel}>Altera Posizione</Text>
              {positionFuzz ? (
                <Text style={styles.privacyWarning}>Disattivala prima di un giro in compagnia!</Text>
              ) : (
                <Text style={styles.privacyRowDesc}>Sposta randomicamente la posizione visibile.</Text>
              )}
            </View>
            <Switch
              value={positionFuzz}
              onValueChange={(val) => { setPositionFuzz(val); privacyMutation.mutate({ positionFuzz: val }); }}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {positionFuzz && (
            <View style={styles.kmRow}>
              <Ionicons name="resize-outline" size={15} color={Colors.textSecondary} />
              <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio:</Text>
              <TextInput
                style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                keyboardType="number-pad"
                value={String(positionFuzzKm)}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 50) {
                    setPositionFuzzKm(n);
                    privacyMutation.mutate({ positionFuzzKm: n });
                  }
                }}
                maxLength={2}
                selectTextOnFocus
              />
              <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km (max 50)</Text>
            </View>
          )}

          <View style={styles.privacyDivider} />

          <View style={styles.privacyRow}>
            <Ionicons name="home-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
            <View style={styles.privacyRowText}>
              <Text style={styles.privacyRowLabel}>Fake Home</Text>
              <Text style={styles.privacyRowDesc}>Vicino a casa, la posizione viene sostituita.</Text>
            </View>
            <Switch
              value={fakeHomeEnabled}
              onValueChange={(val) => { setFakeHomeEnabled(val); privacyMutation.mutate({ fakeHomeEnabled: val }); }}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {fakeHomeEnabled && (
            <>
              <FakeZoneCoordPanel
                realLabel="Posizione Casa (reale)"
                fakeLabel="Posizione Fittizia"
                realLat={homeLatitude}
                realLng={homeLongitude}
                fakeLat={fakeHomeLatitude}
                fakeLng={fakeHomeLongitude}
                realTarget="homeReal"
                fakeTarget="homeFake"
                colors={colors}
                onPickGPS={pickFromGPS}
                onOpenMap={openMapPicker}
              />
              <View style={styles.kmRow}>
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                <TextInput
                  style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                  keyboardType="number-pad"
                  value={String(fakeHomeRadius)}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 1 && n <= 100) {
                      setFakeHomeRadius(n);
                      privacyMutation.mutate({ fakeHomeRadius: n });
                    }
                  }}
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
              </View>
            </>
          )}

          <View style={styles.privacyDivider} />

          <View style={styles.privacyRow}>
            <Ionicons name="business-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
            <View style={styles.privacyRowText}>
              <Text style={styles.privacyRowLabel}>Fake Work</Text>
              <Text style={styles.privacyRowDesc}>Vicino al lavoro, la posizione viene sostituita.</Text>
            </View>
            <Switch
              value={fakeWorkEnabled}
              onValueChange={(val) => { setFakeWorkEnabled(val); privacyMutation.mutate({ fakeWorkEnabled: val }); }}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {fakeWorkEnabled && (
            <>
              <FakeZoneCoordPanel
                realLabel="Posizione Lavoro (reale)"
                fakeLabel="Posizione Fittizia"
                realLat={workLatitude}
                realLng={workLongitude}
                fakeLat={fakeWorkLatitude}
                fakeLng={fakeWorkLongitude}
                realTarget="workReal"
                fakeTarget="workFake"
                colors={colors}
                onPickGPS={pickFromGPS}
                onOpenMap={openMapPicker}
              />
              <View style={styles.kmRow}>
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                <TextInput
                  style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                  keyboardType="number-pad"
                  value={String(fakeWorkRadius)}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 1 && n <= 100) {
                      setFakeWorkRadius(n);
                      privacyMutation.mutate({ fakeWorkRadius: n });
                    }
                  }}
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
              </View>
            </>
          )}

          <View style={styles.privacyDivider} />

          <View style={styles.privacyRow}>
            <Ionicons name="location-outline" size={20} color={Colors.accent} style={styles.privacyRowIcon} />
            <View style={styles.privacyRowText}>
              <Text style={styles.privacyRowLabel}>Fake Whatever</Text>
              <Text style={styles.privacyRowDesc}>Per qualsiasi altro luogo, sostituisci la posizione.</Text>
            </View>
            <Switch
              value={fakeWhateverEnabled}
              onValueChange={(val) => { setFakeWhateverEnabled(val); privacyMutation.mutate({ fakeWhateverEnabled: val }); }}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {fakeWhateverEnabled && (
            <>
              <FakeZoneCoordPanel
                realLabel="Posizione (reale)"
                fakeLabel="Posizione Fittizia"
                realLat={whateverLatitude}
                realLng={whateverLongitude}
                fakeLat={fakeWhateverLatitude}
                fakeLng={fakeWhateverLongitude}
                realTarget="whateverReal"
                fakeTarget="whateverFake"
                colors={colors}
                onPickGPS={pickFromGPS}
                onOpenMap={openMapPicker}
              />
              <View style={styles.kmRow}>
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>Raggio attivazione:</Text>
                <TextInput
                  style={[styles.kmInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                  keyboardType="number-pad"
                  value={String(fakeWhateverRadius)}
                  onChangeText={(v) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 1 && n <= 100) {
                      setFakeWhateverRadius(n);
                      privacyMutation.mutate({ fakeWhateverRadius: n });
                    }
                  }}
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.kmLabel, { color: Colors.textSecondary }]}>km</Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  settingCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  privacyRowIcon: {
    marginRight: 10,
  },
  privacyRowText: {
    flex: 1,
    paddingRight: 8,
  },
  privacyRowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  privacyRowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  privacyWarning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#E8821C",
    marginTop: 2,
  },
  privacyDivider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.6,
    marginVertical: 2,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  accordionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  accordionContent: {
    marginTop: 4,
    gap: 8,
    paddingBottom: 4,
  },
  kmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  kmLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  kmInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    width: 48,
    textAlign: "center",
  },
});
