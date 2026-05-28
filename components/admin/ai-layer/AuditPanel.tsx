// Task #2657 — Tab Audit: filtri + tabella + export (csv/ndjson/json).
import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAiAudit, auditExportUrl, type AuditFilters } from "@/hooks/admin/ai-layer/useAiAudit";

const SEVERITIES = ["", "debug", "info", "warn", "critical"] as const;
const KINDS = ["all", "event", "decision"] as const;

export default function AuditPanel() {
  const colors = useColors();
  const [f, setF] = useState<AuditFilters>({ kind: "all", limit: 100 });
  const q = useAiAudit(f);

  function open(format: "csv" | "ndjson" | "json") {
    const url = auditExportUrl(f, format);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url).catch(() => undefined);
    }
  }

  return (
    <View>
      <View style={styles.filters}>
        <TextInput
          testID="audit-filter-ai"
          value={f.ai ?? ""}
          onChangeText={(v) => setF({ ...f, ai: v || undefined })}
          placeholder="AI (es. moderation)"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <TextInput
          testID="audit-filter-type"
          value={f.type ?? ""}
          onChangeText={(v) => setF({ ...f, type: v || undefined })}
          placeholder="event type"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <View style={styles.rowGap}>
          <TextInput
            testID="audit-filter-from"
            value={f.from ?? ""}
            onChangeText={(v) => setF({ ...f, from: v || undefined })}
            placeholder="from (ISO o YYYY-MM-DD)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TextInput
            testID="audit-filter-to"
            value={f.to ?? ""}
            onChangeText={(v) => setF({ ...f, to: v || undefined })}
            placeholder="to (ISO o YYYY-MM-DD)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
        </View>
        <View style={styles.chips}>
          {SEVERITIES.map((s) => (
            <TouchableOpacity
              key={s || "all"}
              testID={`audit-sev-${s || "all"}`}
              onPress={() => setF({ ...f, severity: (s || undefined) as AuditFilters["severity"] })}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: f.severity === (s || undefined) ? colors.primary + "22" : "transparent" }]}
            >
              <Text style={{ color: colors.text, fontSize: 11 }}>{s || "tutte"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k}
              testID={`audit-kind-${k}`}
              onPress={() => setF({ ...f, kind: k })}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: f.kind === k ? colors.primary + "22" : "transparent" }]}
            >
              <Text style={{ color: colors.text, fontSize: 11 }}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.exports}>
        <Text style={{ color: colors.textSecondary, flex: 1 }}>
          {q.isLoading ? "Caricamento…" : `${q.data?.count ?? 0} righe (limit ${f.limit})`}
        </Text>
        <TouchableOpacity testID="audit-export-csv" onPress={() => open("csv")} style={[styles.btn, { borderColor: colors.border }]}>
          <Ionicons name="download" size={12} color={colors.text} />
          <Text style={{ color: colors.text, marginLeft: 4, fontSize: 11 }}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="audit-export-ndjson" onPress={() => open("ndjson")} style={[styles.btn, { borderColor: colors.border }]}>
          <Ionicons name="download" size={12} color={colors.text} />
          <Text style={{ color: colors.text, marginLeft: 4, fontSize: 11 }}>NDJSON</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="audit-export-json" onPress={() => open("json")} style={[styles.btn, { borderColor: colors.border }]}>
          <Ionicons name="download" size={12} color={colors.text} />
          <Text style={{ color: colors.text, marginLeft: 4, fontSize: 11 }}>JSON</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.table, { borderColor: colors.border }]}>
        {(q.data?.rows ?? []).slice(0, 100).map((r) => {
          const tone =
            r.severity === "critical" ? colors.error :
            r.severity === "warn" ? colors.warning : colors.textSecondary;
          return (
            <View key={`${r.kind}-${r.id}`} testID={`audit-row-${r.id.slice(0, 8)}`} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text style={[styles.cell, { color: colors.text, width: 90 }]} numberOfLines={1}>{r.aiName}</Text>
              <Text style={[styles.cell, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                <Text style={{ opacity: 0.6 }}>[{r.kind}] </Text>{r.type}
              </Text>
              <Text style={[styles.cell, { color: colors.textSecondary, fontSize: 10, width: 130, textAlign: "right" }]} numberOfLines={1}>
                {new Date(r.createdAt).toLocaleString("it-IT")}
              </Text>
            </View>
          );
        })}
        {(q.data?.rows ?? []).length === 0 && !q.isLoading ? (
          <Text style={{ color: colors.textSecondary, padding: 14 }}>Nessuna riga con questi filtri.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8, marginBottom: 10 },
  rowGap: { flexDirection: "row", gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, ...Platform.select({ web: { outlineStyle: "none" as never } }) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  exports: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  btn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  table: { borderWidth: 1, borderRadius: 10 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cell: { fontSize: 12 },
});
