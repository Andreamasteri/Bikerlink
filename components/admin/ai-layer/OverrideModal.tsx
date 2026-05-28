// Task #2657 — Modal override decisione di conflitto.
import React, { useState } from "react";
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { AiConflictRow } from "@/hooks/admin/ai-layer/useAiConflicts";

type Decision = "useEventA" | "useEventB" | "custom";

export default function OverrideModal(props: {
  conflict: AiConflictRow | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (decision: Decision, rationale: string) => void;
}) {
  const colors = useColors();
  const [decision, setDecision] = useState<Decision>("useEventA");
  const [rationale, setRationale] = useState("");
  const visible = props.conflict !== null;

  function submit() {
    const r = rationale.trim();
    if (r.length < 5) return;
    props.onSubmit(decision, r);
    setRationale("");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Override conflitto</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>
            {props.conflict?.conflictType ?? ""}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>Decisione</Text>
          <View style={styles.choices}>
            {(["useEventA", "useEventB", "custom"] as Decision[]).map((d) => (
              <TouchableOpacity
                key={d}
                testID={`override-choice-${d}`}
                onPress={() => setDecision(d)}
                style={[
                  styles.choice,
                  { borderColor: colors.border, backgroundColor: decision === d ? colors.primary + "22" : "transparent" },
                ]}
              >
                <Text style={{ color: decision === d ? colors.primary : colors.text, fontWeight: "600", fontSize: 12 }}>
                  {d === "useEventA" ? "Evento A" : d === "useEventB" ? "Evento B" : "Custom"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Motivazione (obbligatoria, min 5)</Text>
          <TextInput
            testID="override-rationale"
            value={rationale}
            onChangeText={setRationale}
            placeholder="Spiega perché stai forzando questa decisione…"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />

          <View style={styles.actions}>
            <TouchableOpacity onPress={props.onClose} style={[styles.btn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="override-submit"
              disabled={props.busy || rationale.trim().length < 5}
              onPress={submit}
              style={[styles.btn, { backgroundColor: colors.primary, opacity: props.busy || rationale.trim().length < 5 ? 0.5 : 1 }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>{props.busy ? "Invio…" : "Applica override"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  dialog: { padding: 18, borderRadius: 14, borderWidth: 1, maxWidth: 520, alignSelf: "center", width: "100%" },
  title: { fontSize: 18, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  choices: { flexDirection: "row", gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: "top", ...Platform.select({ web: { outlineStyle: "none" as never } }) },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14, gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
});
