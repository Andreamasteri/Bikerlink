// Task #2657 — Kill switch globale del Layer AI ("*").
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export default function KillSwitchPanel(props: {
  layerPaused: boolean;
  ttl?: number;
  busy?: boolean;
  onPause: (reason: string, ttlSeconds: number) => void;
  onResume: () => void;
}) {
  const colors = useColors();
  const [reason, setReason] = useState("");
  const [ttlMin, setTtlMin] = useState("60");
  // Task #2657 — kill switch a due step: la prima pressione arma, la seconda
  // entro 8 secondi conferma. Auto-reset altrimenti.
  const [armed, setArmed] = useState(false);

  function onPress() {
    const r = reason.trim();
    if (r.length < 3) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 8000);
      return;
    }
    const t = Math.max(1, Math.min(1440, parseInt(ttlMin, 10) || 60));
    props.onPause(r, t * 60);
    setReason("");
    setArmed(false);
  }

  return (
    <View style={[styles.box, { borderColor: props.layerPaused ? colors.error : colors.border, backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <Ionicons
          name={props.layerPaused ? "alert-circle" : "shield-checkmark"}
          size={22}
          color={props.layerPaused ? colors.error : colors.success}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: colors.text }]}>Kill switch Layer AI</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {props.layerPaused
              ? `LAYER IN PAUSA${props.ttl ? ` (residuo ${Math.round(props.ttl / 60)}m)` : ""}`
              : "Layer attivo — eventi/decisioni vengono processati"}
          </Text>
        </View>
      </View>

      {props.layerPaused ? (
        <TouchableOpacity
          testID="killswitch-resume"
          disabled={props.busy}
          onPress={props.onResume}
          style={[styles.bigBtn, { backgroundColor: colors.success, opacity: props.busy ? 0.5 : 1 }]}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.bigBtnText}>Riattiva intero Layer</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <TextInput
            testID="killswitch-reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Motivo pausa layer (min 3 caratteri)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <View style={styles.rowGap}>
            <TextInput
              testID="killswitch-ttl"
              value={ttlMin}
              onChangeText={setTtlMin}
              keyboardType="number-pad"
              placeholder="TTL minuti"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { width: 110, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TouchableOpacity
              testID={armed ? "killswitch-confirm" : "killswitch-pause"}
              disabled={props.busy || reason.trim().length < 3}
              onPress={onPress}
              style={[
                styles.bigBtn,
                { flex: 1, backgroundColor: armed ? "#7a0000" : colors.error, opacity: props.busy || reason.trim().length < 3 ? 0.5 : 1 },
              ]}
            >
              <Ionicons name={armed ? "warning" : "hand-left"} size={16} color="#fff" />
              <Text style={styles.bigBtnText}>
                {armed ? "Conferma — Click di nuovo per pausare" : "Pausa intero Layer"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  rowGap: { flexDirection: "row", gap: 8 },
  title: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  form: { marginTop: 10, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, ...Platform.select({ web: { outlineStyle: "none" as never } }) },
  bigBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 10 },
  bigBtnText: { color: "#fff", fontWeight: "700" },
});
