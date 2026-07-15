/**
 * Task #75 — Pannello admin "Nadir" (motore di ricerca semantica).
 *
 * Nadir NON è una persona: è un motore di ricerca. Da qui l'admin può:
 *   • scrivere/modificare il manuale a testo libero (senza redeploy),
 *   • lanciare una reindicizzazione immediata,
 *   • vedere ultimo esito reindicizzazione, salute della ricerca (streak notti
 *     fallite), conteggio frammenti per origine e il MODELLO di embedding attivo
 *     (così l'identità del sottosistema non è mai ambigua).
 *
 * Riusa la pipeline di embedding/HNSW esistente (divergenza deliberata dal
 * servizio TC standalone di BikerBlog — vedi server/ai/nadir/constants.ts).
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface NadirTranslationStatus {
  lang: string;
  name: string;
  exists: boolean;
  translatedAt: string | null;
  length: number;
  stale: boolean;
}

interface NadirTranslationsList {
  sourceLang: string;
  languages: NadirTranslationStatus[];
}

interface NadirTranslationText {
  lang: string;
  text: string;
  translatedAt: string;
  stale: boolean;
}

interface NadirStatus {
  defaultModel: string;
  lastRunModel: string | null;
  indexStatus: {
    lastRunAt: string;
    trigger: string;
    ok: boolean;
    durationMs: number;
    model: string;
    counts: { manual: number; conversation: number; comment: number };
    errors: string[];
    openAiFallbackActive?: boolean;
    openAiFallbackReason?: string | null;
  } | null;
  searchHealth: {
    lastCheckAt: string;
    ok: boolean;
    consecutiveFailedNights: number;
    hits: number;
    error: string | null;
  } | null;
  indexedCounts: { manual: number; conversation: number; comment: number };
  manual: { length: number; empty: boolean };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "mai";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

export default function NadirScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [manualText, setManualText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);

  const manualQuery = useQuery<{ text: string }>({
    queryKey: ["/api/admin/nadir/manual"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/nadir/manual")).json(),
    staleTime: 30_000,
  });

  const statusQuery = useQuery<NadirStatus>({
    queryKey: ["/api/admin/nadir/status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/nadir/status")).json(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (manualQuery.data && !dirty) {
      setManualText(manualQuery.data.text ?? "");
    }
  }, [manualQuery.data, dirty]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) =>
      (await apiRequest("PUT", "/api/admin/nadir/manual", { text })).json(),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/nadir/manual"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/nadir/status"] });
    },
  });

  const reindexMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/nadir/reindex")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/nadir/status"] });
    },
  });

  const translationsQuery = useQuery<NadirTranslationsList>({
    queryKey: ["/api/admin/nadir/manual/translations"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/nadir/manual/translations")).json(),
    staleTime: 15_000,
  });

  const translationTextQuery = useQuery<NadirTranslationText>({
    queryKey: ["/api/admin/nadir/manual/translations", expandedLang],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/nadir/manual/translations/${expandedLang}`)).json(),
    enabled: !!expandedLang,
  });

  const retranslateMutation = useMutation({
    mutationFn: async (lang: string) =>
      (await apiRequest("POST", `/api/admin/nadir/manual/translations/${lang}/retranslate`)).json(),
    onSuccess: (_data, lang) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/nadir/manual/translations"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/nadir/manual/translations", lang] });
    },
  });

  const status = statusQuery.data;
  const health = status?.searchHealth;
  const idx = status?.indexStatus;
  const counts = status?.indexedCounts ?? { manual: 0, conversation: 0, comment: 0 };

  const healthColor = !health
    ? Colors.textSecondary
    : health.ok
    ? Colors.success
    : Colors.error;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="magnify-scan" size={26} color="#3B82F6" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Nadir — Ricerca semantica</Text>
          <Text style={styles.subtitle}>
            Motore di ricerca per significato su manuale, conversazioni AI e commenti utenti.
          </Text>
        </View>
      </View>

      {/* ── Identità / modello attivo ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Identità sottosistema</Text>
        <Row label="Modello embedding attivo" value={status?.defaultModel ?? "—"} mono />
        <Row label="Modello ultima reindicizzazione" value={status?.lastRunModel ?? "—"} mono />
      </View>

      {/* ── Editor manuale ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manuale (testo libero)</Text>
        <Text style={styles.hint}>
          Salvato senza redeploy. Reindicizzato ogni notte o con "Reindicizza ora".
        </Text>
        {manualQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : (
          <TextInput
            style={styles.editor}
            value={manualText}
            onChangeText={(t) => {
              setManualText(t);
              setDirty(true);
            }}
            multiline
            textAlignVertical="top"
            placeholder="Scrivi qui il manuale Nadir…"
            placeholderTextColor={Colors.textSecondary}
            testID="nadir-manual-editor"
          />
        )}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, (!dirty || saveMutation.isPending) && styles.btnDisabled]}
            onPress={() => saveMutation.mutate(manualText)}
            disabled={!dirty || saveMutation.isPending}
            testID="nadir-save-manual"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>Salva manuale</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, reindexMutation.isPending && styles.btnDisabled]}
            onPress={() => reindexMutation.mutate()}
            disabled={reindexMutation.isPending}
            testID="nadir-reindex-now"
          >
            {reindexMutation.isPending ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Text style={[styles.btnText, { color: Colors.primary }]}>Reindicizza ora</Text>
            )}
          </TouchableOpacity>
        </View>
        {saveMutation.isError ? (
          <Text style={styles.errText}>Errore salvataggio.</Text>
        ) : null}
        {reindexMutation.isError ? (
          <Text style={styles.errText}>Errore reindicizzazione.</Text>
        ) : null}
      </View>

      {/* ── Stato reindicizzazione ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ultima reindicizzazione</Text>
        <Row label="Quando" value={fmtDate(idx?.lastRunAt)} />
        <Row label="Trigger" value={idx?.trigger ?? "—"} />
        <Row
          label="Esito"
          value={idx ? (idx.ok ? "OK" : "con errori") : "—"}
          valueColor={idx ? (idx.ok ? healthColorOk() : Colors.error) : undefined}
        />
        <Row label="Durata" value={idx ? `${idx.durationMs} ms` : "—"} />
        {idx?.openAiFallbackActive ? (
          <Text style={styles.errText}>
            ⚠️ Quota OpenAI esaurita durante il run — reindicizzazione (parziale o totale) in
            fallback locale finché la quota non si libera.
            {idx.openAiFallbackReason ? ` (${idx.openAiFallbackReason})` : ""}
          </Text>
        ) : null}
        {idx?.errors && idx.errors.length > 0 ? (
          <Text style={styles.errText}>{idx.errors.join("\n")}</Text>
        ) : null}
      </View>

      {/* ── Salute ricerca ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Salute ricerca</Text>
        <View style={styles.healthRow}>
          <MaterialCommunityIcons
            name={health?.ok ? "check-circle" : health ? "alert-circle" : "help-circle"}
            size={22}
            color={healthColor}
          />
          <Text style={[styles.healthText, { color: healthColor }]}>
            {!health
              ? "Nessun controllo ancora"
              : health.ok
              ? "Ricerca funzionante"
              : `Ricerca ROTTA da ${health.consecutiveFailedNights} nott${
                  health.consecutiveFailedNights === 1 ? "e" : "i"
                }`}
          </Text>
        </View>
        <Row label="Ultimo controllo" value={fmtDate(health?.lastCheckAt)} />
        <Row label="Notti fallite di fila" value={String(health?.consecutiveFailedNights ?? 0)} />
        <Row label="Hit ultima sonda" value={String(health?.hits ?? 0)} />
        {health?.error ? <Text style={styles.errText}>{health.error}</Text> : null}
      </View>

      {/* ── Traduzioni del manuale (Task #113) ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Traduzioni del manuale</Text>
        <Text style={styles.hint}>
          Generate automaticamente da Horus in ogni scansione completa. "Stantia" = l'italiano è
          cambiato dopo l'ultima traduzione: Nadir e la chat ricadono sull'italiano finché non viene
          rigenerata.
        </Text>
        {translationsQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
        ) : (
          (translationsQuery.data?.languages ?? []).map((t) => {
            const isExpanded = expandedLang === t.lang;
            const isRetranslating = retranslateMutation.isPending && retranslateMutation.variables === t.lang;
            const statusColor = !t.exists ? Colors.textSecondary : t.stale ? Colors.error : Colors.success;
            const statusLabel = !t.exists ? "mancante" : t.stale ? "stantia" : "aggiornata";
            return (
              <View key={t.lang} style={styles.translationBlock} testID={`nadir-translation-${t.lang}`}>
                <View style={styles.translationHeaderRow}>
                  <MaterialCommunityIcons
                    name={!t.exists ? "help-circle-outline" : t.stale ? "alert-circle" : "check-circle"}
                    size={18}
                    color={statusColor}
                  />
                  <Text style={styles.translationLang}>{t.name} ({t.lang})</Text>
                  <Text style={[styles.translationStatus, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                <Row label="Generata il" value={fmtDate(t.translatedAt)} />
                <Row label="Lunghezza" value={t.exists ? `${t.length} caratteri` : "—"} />
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary, !t.exists && styles.btnDisabled]}
                    onPress={() => setExpandedLang(isExpanded ? null : t.lang)}
                    disabled={!t.exists}
                    testID={`nadir-view-translation-${t.lang}`}
                  >
                    <Text style={[styles.btnText, { color: Colors.primary }]}>
                      {isExpanded ? "Nascondi" : "Visualizza"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, isRetranslating && styles.btnDisabled]}
                    onPress={() => retranslateMutation.mutate(t.lang)}
                    disabled={isRetranslating}
                    testID={`nadir-retranslate-${t.lang}`}
                  >
                    {isRetranslating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.btnText}>Ritraduci ora</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {retranslateMutation.isError && retranslateMutation.variables === t.lang ? (
                  <Text style={styles.errText}>Errore ritraduzione.</Text>
                ) : null}
                {isExpanded ? (
                  translationTextQuery.isLoading ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    <ScrollView style={styles.translationPreview} nestedScrollEnabled>
                      <Text style={styles.translationPreviewText} selectable>
                        {translationTextQuery.data?.text ?? ""}
                      </Text>
                    </ScrollView>
                  )
                ) : null}
              </View>
            );
          })
        )}
        {translationsQuery.isError ? <Text style={styles.errText}>Errore caricamento traduzioni.</Text> : null}
      </View>

      {/* ── Conteggio frammenti indicizzati ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Frammenti indicizzati</Text>
        <Row label="Manuale" value={String(counts.manual)} />
        <Row label="Conversazioni AI" value={String(counts.conversation)} />
        <Row label="Commenti utenti" value={String(counts.comment)} />
        <Row
          label="Totale"
          value={String(counts.manual + counts.conversation + counts.comment)}
          bold
        />
      </View>
    </ScrollView>
  );
}

function healthColorOk(): string {
  return Colors.success;
}

function Row({
  label,
  value,
  mono,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowValueMono,
          bold && styles.rowValueBold,
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 8,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  editor: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { borderWidth: 1, borderColor: Colors.primary },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    textAlign: "right",
    flexShrink: 1,
    marginLeft: 12,
  },
  rowValueMono: { fontFamily: "Inter_400Regular", fontSize: 12 },
  rowValueBold: { fontFamily: "Inter_700Bold" },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  healthText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  errText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
    marginTop: 8,
  },
  translationBlock: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 12,
  },
  translationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  translationLang: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  translationStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  translationPreview: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    backgroundColor: Colors.background,
  },
  translationPreviewText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
  },
});
