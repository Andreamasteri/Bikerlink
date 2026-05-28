// Task #2657 — Editor YAML policies con validate + save.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAiPolicies, useSavePolicies, useValidatePolicies } from "@/hooks/admin/ai-layer/useAiPolicies";

export default function PolicyEditor() {
  const colors = useColors();
  const { data, isLoading } = useAiPolicies();
  const validate = useValidatePolicies();
  const save = useSavePolicies();
  const [text, setText] = useState("");
  const [validation, setValidation] = useState<{ valid: boolean; error?: string; rulesCount?: number } | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.yaml && text === "") setText(data.yaml);
  }, [data?.yaml]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onValidate() {
    setSavedMsg(null);
    const r = await validate.mutateAsync(text);
    setValidation(r);
  }
  async function onSave() {
    setSavedMsg(null);
    try {
      const r = await save.mutateAsync(text);
      setSavedMsg(`Salvato: ${r.count} regole, versione ${r.status.version ?? "—"}`);
      setValidation({ valid: true, rulesCount: r.count });
    } catch (e) {
      setValidation({ valid: false, error: (e as Error).message });
    }
  }

  if (isLoading) return <Text style={{ color: colors.textSecondary, padding: 12 }}>Caricamento policies…</Text>;

  return (
    <View>
      <Text style={[styles.label, { color: colors.text }]}>
        config/ai-policies.yaml · {data?.status.rulesCount ?? 0} regole caricate
      </Text>
      <TextInput
        testID="policy-editor-textarea"
        multiline
        value={text}
        onChangeText={(t) => { setText(t); setValidation(null); setSavedMsg(null); }}
        style={[styles.area, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
      />
      <View style={styles.row}>
        <TouchableOpacity
          testID="policy-validate"
          onPress={onValidate}
          disabled={validate.isPending}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Ionicons name="checkmark-done" size={14} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 6 }}>
            {validate.isPending ? "Validating…" : "Valida YAML"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="policy-save"
          onPress={onSave}
          disabled={save.isPending || !validation?.valid}
          style={[styles.btn, { backgroundColor: colors.primary, opacity: save.isPending || !validation?.valid ? 0.5 : 1 }]}
        >
          <Ionicons name="save" size={14} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", marginLeft: 6 }}>
            {save.isPending ? "Salvataggio…" : "Salva & ricarica"}
          </Text>
        </TouchableOpacity>
      </View>
      {validation ? (
        <Text style={{ color: validation.valid ? colors.success : colors.error, marginTop: 10, fontSize: 12 }}>
          {validation.valid
            ? `✓ YAML valido (${validation.rulesCount ?? data?.status.rulesCount ?? 0} regole)`
            : `✗ ${validation.error ?? "errore validazione"}`}
        </Text>
      ) : null}
      {savedMsg ? <Text style={{ color: colors.success, marginTop: 6, fontSize: 12 }}>{savedMsg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  area: {
    borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 260, fontFamily: Platform.select({ web: "monospace", default: "Courier" }),
    fontSize: 12, textAlignVertical: "top", ...Platform.select({ web: { outlineStyle: "none" as never } }),
  },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  btn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
});
