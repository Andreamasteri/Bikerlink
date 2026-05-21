import React from "react";
import { View, Text, StyleSheet, Switch, TextInput, TouchableOpacity, ActivityIndicator, Ionicons } from "@expo/vector-icons";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, Switch as RNSwitch, TextInput as RNTextInput, TouchableOpacity as RNTouchableOpacity, ActivityIndicator as RNActivityIndicator } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const styles = RNStyleSheet.create({
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
});

interface OtaGateSectionProps {
  otaGateEnabled: boolean;
  onOtaGateToggle: (val: boolean) => void;
  otaGatePending: boolean;
  otaWaitInput: string;
  setOtaWaitInput: (val: string) => void;
  onOtaWaitSave: () => void;
  otaWaitPending: boolean;
  otaRetentionInput: string;
  setOtaRetentionInput: (val: string) => void;
  onOtaRetentionSave: () => void;
  otaRetentionPending: boolean;
  otaRetentionSuccess: boolean;
}

export function OtaGateSection({
  otaGateEnabled,
  onOtaGateToggle,
  otaGatePending,
  otaWaitInput,
  setOtaWaitInput,
  onOtaWaitSave,
  otaWaitPending,
  otaRetentionInput,
  setOtaRetentionInput,
  onOtaRetentionSave,
  otaRetentionPending,
  otaRetentionSuccess,
}: OtaGateSectionProps) {
  return (
    <RNView>
      <RNView style={styles.paidCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="cloud-download-outline" size={20} color="#ff6b35" />
            <RNText style={styles.synecoLabel}>OTA Recovery Gate</RNText>
          </RNView>
          <RNSwitch
            value={otaGateEnabled}
            onValueChange={onOtaGateToggle}
            trackColor={{ false: Colors.border, true: "#ff6b35" }}
            thumbColor={otaGateEnabled ? Colors.text : Colors.textSecondary}
            disabled={otaGatePending}
          />
        </RNView>
        <RNText style={styles.synecoDesc}>
          {otaGateEnabled
            ? "Schermata attesa OTA attiva — nuovi login vedranno la gate screen"
            : "Gate OTA disattivata — login normale per tutti gli utenti"}
        </RNText>
        <RNView style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8, opacity: otaGateEnabled ? 1 : 0.4 }}>
          <RNText style={[styles.synecoDesc, { flex: 1 }]}>Secondi attesa:</RNText>
          <RNTextInput
            style={[styles.synecoDesc, { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: Colors.text, minWidth: 60, textAlign: "center" }]}
            value={otaWaitInput}
            onChangeText={setOtaWaitInput}
            keyboardType="numeric"
            maxLength={4}
            editable={otaGateEnabled}
          />
          <RNTouchableOpacity
            style={[styles.saveBtn, { paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={onOtaWaitSave}
            disabled={otaWaitPending || !otaGateEnabled}
          >
            <RNText style={styles.saveBtnText}>Salva</RNText>
          </RNTouchableOpacity>
        </RNView>
      </RNView>

      <RNView style={styles.paidCard}>
        <RNView style={styles.synecoHeader}>
          <RNView style={styles.synecoInfo}>
            <IoniconsSet name="timer-outline" size={20} color="#ff6b35" />
            <RNText style={styles.synecoLabel}>OTA Cleanup — Finestra di retention</RNText>
          </RNView>
        </RNView>
        <RNText style={styles.synecoDesc}>
          Numero di giorni dopo cui le release OTA con stato "superseded" o "draft" vengono eliminate automaticamente. Default: 90 giorni.
        </RNText>
        <RNView style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
          <RNText style={[styles.synecoDesc, { flex: 1 }]}>Giorni di retention:</RNText>
          <RNTextInput
            style={[styles.synecoDesc, { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: Colors.text, minWidth: 60, textAlign: "center" }]}
            value={otaRetentionInput}
            onChangeText={setOtaRetentionInput}
            keyboardType="numeric"
            maxLength={4}
          />
          <RNTouchableOpacity
            style={[styles.saveBtn, { paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={onOtaRetentionSave}
            disabled={otaRetentionPending}
          >
            {otaRetentionPending
              ? <RNActivityIndicator size="small" color="#fff" />
              : <RNText style={styles.saveBtnText}>Salva</RNText>}
          </RNTouchableOpacity>
        </RNView>
        {otaRetentionSuccess && (
          <RNText style={[styles.synecoDesc, { color: Colors.accent, marginTop: 6 }]}>
            Retention aggiornata — verrà applicata al prossimo ciclo di cleanup (avvio o mezzanotte).
          </RNText>
        )}
      </RNView>
    </RNView>
  );
}
