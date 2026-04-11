import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

type StepStatus = "idle" | "loading" | "success" | "error";

const LANGS = [
  { code: "en", label: "EN — Inglese" },
  { code: "de", label: "DE — Tedesco" },
  { code: "es", label: "ES — Spagnolo" },
  { code: "fr", label: "FR — Francese" },
  { code: "tr", label: "TR — Turco" },
];

function StepCard({
  stepNumber,
  title,
  description,
  status,
  onPress,
  buttonLabel,
  resultText,
  children,
  disabled,
}: {
  stepNumber: number;
  title: string;
  description: string;
  status: StepStatus;
  onPress: () => void;
  buttonLabel: string;
  resultText?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.stepBadge, isSuccess && styles.stepBadgeSuccess, isError && styles.stepBadgeError]}>
          <Text style={styles.stepBadgeText}>{stepNumber}</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{description}</Text>
        </View>
      </View>

      {children}

      <TouchableOpacity
        style={[styles.button, (isLoading || disabled) && styles.buttonDisabled]}
        onPress={onPress}
        disabled={isLoading || !!disabled}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        )}
      </TouchableOpacity>

      {resultText ? (
        <View style={[styles.resultBox, isSuccess && styles.resultBoxSuccess, isError && styles.resultBoxError]}>
          <MaterialCommunityIcons
            name={isSuccess ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={isSuccess ? "#4CAF50" : "#F44336"}
          />
          <Text style={[styles.resultText, isSuccess ? styles.resultTextSuccess : styles.resultTextError]}>
            {resultText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function LangCheckbox({
  lang,
  label,
  checked,
  disabled,
  onToggle,
}: {
  lang: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.checkbox, disabled && styles.checkboxDisabled]}
      onPress={disabled ? undefined : onToggle}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <MaterialCommunityIcons
        name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
        size={22}
        color={disabled ? Colors.textSecondary : checked ? Colors.accent : Colors.textSecondary}
      />
      <Text style={[styles.checkboxLabel, disabled && styles.checkboxLabelDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TraduzioniScreen() {
  const insets = useSafeAreaInsets();

  const [prepareStatus, setPrepareStatus] = useState<StepStatus>("idle");
  const [prepareResult, setPrepareResult] = useState("");

  const [exportLangs, setExportLangs] = useState<string[]>(["en", "de", "es", "fr", "tr"]);
  const [exportStatus, setExportStatus] = useState<StepStatus>("idle");
  const [exportResult, setExportResult] = useState("");
  const [exportedFileUrl, setExportedFileUrl] = useState<string | null>(null);

  const [importInfo, setImportInfo] = useState<{ exportedLangs: string[] }>({ exportedLangs: [] });
  const [importLangs, setImportLangs] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<StepStatus>("idle");
  const [importResult, setImportResult] = useState("");

  const [applyStatus, setApplyStatus] = useState<StepStatus>("idle");
  const [applyResult, setApplyResult] = useState("");

  const [restartStatus, setRestartStatus] = useState<StepStatus>("idle");
  const [restartResult, setRestartResult] = useState("");

  useEffect(() => {
    loadImportInfo();
  }, []);

  async function loadImportInfo() {
    try {
      const resp = await fetch(new URL("/api/admin/translations/import-info", getApiUrl()).toString(), {
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setImportInfo({ exportedLangs: data.exportedLangs || [] });
        setImportLangs(data.exportedLangs || []);
      }
    } catch {}
  }

  async function handlePrepare() {
    setPrepareStatus("loading");
    setPrepareResult("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/prepare", {});
      const data = await resp.json();
      setPrepareStatus("success");
      const langSummary = data.langCounts
        ? Object.entries(data.langCounts as Record<string, number>)
            .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
            .join(", ")
        : "";
      setPrepareResult(
        `${data.count} stringhe IT` + (langSummary ? ` | Esistenti → ${langSummary}` : "")
      );
    } catch (e: any) {
      setPrepareStatus("error");
      setPrepareResult(e?.message || "Errore durante la preparazione");
    }
  }

  async function handleExport() {
    if (exportLangs.length === 0) {
      setExportStatus("error");
      setExportResult("Seleziona almeno una lingua");
      return;
    }
    setExportStatus("loading");
    setExportResult("");
    setExportedFileUrl(null);
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/export", { langs: exportLangs });
      const data = await resp.json();
      setExportStatus("success");
      setExportResult(data.message || "Sheet creato con successo");
      setExportedFileUrl(data.fileUrl || null);
      await loadImportInfo();
    } catch (e: any) {
      setExportStatus("error");
      setExportResult(e?.message || "Errore durante l'esportazione");
    }
  }

  async function handleImport() {
    if (importLangs.length === 0) {
      setImportStatus("error");
      setImportResult("Seleziona almeno una lingua da importare");
      return;
    }
    setImportStatus("loading");
    setImportResult("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/import", { langs: importLangs });
      const data = await resp.json();
      setImportStatus("success");
      setImportResult(data.message || "Dati importati con successo");
    } catch (e: any) {
      setImportStatus("error");
      setImportResult(e?.message || "Errore durante l'importazione");
    }
  }

  async function handleApply() {
    setApplyStatus("loading");
    setApplyResult("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/apply", {});
      const data = await resp.json();
      setApplyStatus("success");
      setApplyResult(data.message || "Traduzioni applicate con successo");
    } catch (e: any) {
      setApplyStatus("error");
      setApplyResult(e?.message || "Errore durante l'applicazione");
    }
  }

  async function handleRestart() {
    setRestartStatus("loading");
    setRestartResult("");
    try {
      await apiRequest("POST", "/api/admin/translations/restart", {});
      setRestartStatus("success");
      setRestartResult("Backend in riavvio...");
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      const isConnectionDrop =
        msg.includes("Network request failed") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("503") ||
        msg.includes("502");
      if (isConnectionDrop) {
        setRestartStatus("success");
        setRestartResult("Backend in riavvio (connessione chiusa dal server)...");
      } else {
        setRestartStatus("error");
        setRestartResult(msg || "Errore durante il riavvio");
      }
    }
  }

  function toggleExportLang(code: string) {
    setExportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  function toggleImportLang(code: string) {
    if (!importInfo.exportedLangs.includes(code)) return;
    setImportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      <Text style={styles.pageDesc}>
        Esporta tutte le stringhe dell'app su un Google Sheet, falle tradurre esternamente, poi importa e applica i risultati.
      </Text>

      <StepCard
        stepNumber={1}
        title="Prepara generazione"
        description="Scansiona il file IT e conta tutte le stringhe da esportare."
        status={prepareStatus}
        buttonLabel="Prepara"
        onPress={handlePrepare}
        resultText={prepareResult}
      />

      <StepCard
        stepNumber={2}
        title="Genera ed esporta su Drive"
        description="Crea un Google Sheet con le colonne selezionate. IT è sempre inclusa."
        status={exportStatus}
        buttonLabel="Genera ed esporta"
        onPress={handleExport}
        resultText={exportResult}
      >
        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>Lingue da includere nel foglio:</Text>
          {LANGS.map((l) => (
            <LangCheckbox
              key={l.code}
              lang={l.code}
              label={l.label}
              checked={exportLangs.includes(l.code)}
              onToggle={() => toggleExportLang(l.code)}
            />
          ))}
        </View>
        {exportedFileUrl ? (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL(exportedFileUrl!)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="open-in-new" size={16} color={Colors.accent} />
            <Text style={styles.linkButtonText}>Apri Google Sheet</Text>
          </TouchableOpacity>
        ) : null}
      </StepCard>

      <StepCard
        stepNumber={3}
        title="Importa da Drive"
        description="Rilegge il Google Sheet e carica le traduzioni delle lingue selezionate."
        status={importStatus}
        buttonLabel="Importa"
        onPress={handleImport}
        resultText={importResult}
        disabled={importInfo.exportedLangs.length === 0}
      >
        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>
            {importInfo.exportedLangs.length === 0
              ? "Nessuna esportazione disponibile — esegui prima il passo 2"
              : "Lingue da importare (solo quelle esportate):"}
          </Text>
          {LANGS.map((l) => {
            const available = importInfo.exportedLangs.includes(l.code);
            return (
              <LangCheckbox
                key={l.code}
                lang={l.code}
                label={l.label}
                checked={importLangs.includes(l.code)}
                disabled={!available}
                onToggle={() => toggleImportLang(l.code)}
              />
            );
          })}
        </View>
      </StepCard>

      <StepCard
        stepNumber={4}
        title="Applica traduzioni"
        description="Scrive i valori importati nei file TypeScript lib/i18n/. Crea tr.ts se mancante."
        status={applyStatus}
        buttonLabel="Applica"
        onPress={handleApply}
        resultText={applyResult}
      />

      <StepCard
        stepNumber={5}
        title="Riavvia Backend"
        description="Riavvia il server per recepire le modifiche ai file i18n."
        status={restartStatus}
        buttonLabel="Riavvia Backend"
        onPress={handleRestart}
        resultText={restartResult}
      />

      {restartStatus === "success" ? (
        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="information-outline" size={20} color={Colors.accent} />
          <View style={styles.infoBannerText}>
            <Text style={styles.infoBannerTitle}>Per aggiornare l'app frontend:</Text>
            <Text style={styles.infoBannerBody}>
              1. Apri il workflow "Start Frontend" su Replit e riavvialo.{"\n"}
              2. Per una pubblicazione definitiva su App Store, usa il pulsante "Expo Launch" su Replit dopo aver riavviato il frontend.
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  pageDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
    lineHeight: 19,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepBadgeSuccess: {
    backgroundColor: "#4CAF50",
  },
  stepBadgeError: {
    backgroundColor: "#F44336",
  },
  stepBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  resultBoxSuccess: {
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  resultBoxError: {
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  resultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  resultTextSuccess: {
    color: "#4CAF50",
  },
  resultTextError: {
    color: "#F44336",
  },
  langPicker: {
    gap: 6,
    paddingTop: 4,
  },
  langPickerLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  checkboxLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  checkboxLabelDisabled: {
    color: Colors.textSecondary,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  linkButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
  infoBanner: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 152, 0, 0.3)",
  },
  infoBannerText: {
    flex: 1,
    gap: 4,
  },
  infoBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  infoBannerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
