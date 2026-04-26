import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
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
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkbox} onPress={onToggle} activeOpacity={0.7}>
      <MaterialCommunityIcons
        name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
        size={22}
        color={checked ? Colors.accent : Colors.textSecondary}
      />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TraduzioniScreen() {
  const insets = useSafeAreaInsets();

  const [prepareStatus, setPrepareStatus] = useState<StepStatus>("idle");
  const [prepareResult, setPrepareResult] = useState("");

  const [exportLangs, setExportLangs] = useState<string[]>(["en", "de", "es", "fr", "tr"]);

  const [restartStatus, setRestartStatus] = useState<StepStatus>("idle");
  const [restartResult, setRestartResult] = useState("");

  const [docxLoading, setDocxLoading] = useState(false);
  const [docxResult, setDocxResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [importStatus, setImportStatus] = useState<StepStatus>("idle");
  const [importResult, setImportResult] = useState("");
  const [importFileName, setImportFileName] = useState<string>("");
  const webImportInputRef = React.useRef<HTMLInputElement | null>(null);

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

  function extractErrorMessage(e: unknown, fallback: string): string {
    if (e instanceof Error) return e.message || fallback;
    return fallback;
  }

  async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buf);
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(binary);
  }

  async function parseBinaryErrorMessage(resp: Response): Promise<string> {
    try {
      const data: unknown = await resp.json();
      if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
        return (data as { message: string }).message;
      }
    } catch {}
    return "Errore download";
  }

  async function handleDownloadDocx() {
    setDocxLoading(true);
    setDocxResult(null);
    try {
      const langs = exportLangs.length > 0 ? exportLangs : ["en", "de", "es", "fr", "tr"];
      const url = new URL(
        `/api/admin/translations/download-docx?langs=${langs.join(",")}`,
        getApiUrl()
      );
      if (Platform.OS === "web") {
        const resp = await fetch(url.toString(), { credentials: "include" });
        if (!resp.ok) throw new Error(await parseBinaryErrorMessage(resp));
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `BikerLink_Traduzioni_${new Date().toISOString().slice(0, 10)}.docx`;
        a.click();
        URL.revokeObjectURL(blobUrl);
        setDocxResult({ ok: true, msg: "Download Word avviato" });
      } else {
        const resp = await fetch(url.toString(), { credentials: "include" });
        if (!resp.ok) throw new Error(await parseBinaryErrorMessage(resp));
        const arrayBuf = await resp.arrayBuffer();
        const base64 = await arrayBufferToBase64(arrayBuf);
        const filePath = `${FileSystem.cacheDirectory}BikerLink_Traduzioni.docx`;
        await FileSystem.writeAsStringAsync(filePath, base64, { encoding: "base64" });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            dialogTitle: "Salva Word Traduzioni",
          });
          setDocxResult({ ok: true, msg: "File Word pronto da condividere" });
        } else {
          setDocxResult({ ok: false, msg: "Condivisione non disponibile su questo dispositivo" });
        }
      }
    } catch (e: unknown) {
      setDocxResult({ ok: false, msg: extractErrorMessage(e, "Errore download Word") });
    } finally {
      setDocxLoading(false);
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

  async function uploadDocxFile(formData: FormData): Promise<void> {
    const url = new URL("/api/admin/translations/import-docx", getApiUrl());
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      body: formData as any,
    });
    let payload: any = null;
    try {
      payload = await resp.json();
    } catch {}
    if (!resp.ok || !payload?.ok) {
      const errMsg =
        (payload && typeof payload.message === "string" && payload.message) ||
        `Errore HTTP ${resp.status}`;
      throw new Error(errMsg);
    }
    const summary = payload.langCounts
      ? Object.entries(payload.langCounts as Record<string, number>)
          .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
          .join(", ")
      : "";
    setImportStatus("success");
    setImportResult(summary ? `Stringhe aggiornate → ${summary}` : payload.message || "Import completato");
  }

  async function handleWebFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportStatus("loading");
    setImportResult("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      await uploadDocxFile(fd);
    } catch (err: unknown) {
      setImportStatus("error");
      setImportResult(extractErrorMessage(err, "Errore durante l'import"));
    } finally {
      if (webImportInputRef.current) webImportInputRef.current.value = "";
    }
  }

  async function handlePickAndImportNative() {
    setImportStatus("loading");
    setImportResult("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/octet-stream",
          "*/*",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        setImportStatus("idle");
        return;
      }
      const asset = picked.assets[0];
      if (!/\.docx$/i.test(asset.name || "")) {
        throw new Error("Seleziona un file con estensione .docx");
      }
      setImportFileName(asset.name || "documento.docx");

      const fd = new FormData();
      fd.append("file", {
        uri: asset.uri,
        name: asset.name || "translations.docx",
        type:
          asset.mimeType ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as any);
      await uploadDocxFile(fd);
    } catch (err: unknown) {
      setImportStatus("error");
      setImportResult(extractErrorMessage(err, "Errore durante l'import"));
    }
  }

  function handleImportPress() {
    if (importStatus === "loading") return;
    if (Platform.OS === "web") {
      webImportInputRef.current?.click();
    } else {
      handlePickAndImportNative();
    }
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
        Esporta tutte le stringhe dell'app in Word, falle tradurre esternamente, poi sostituisci i file
        in lib/i18n/ e riavvia il backend.
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

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.stepBadge]}>
            <Text style={styles.stepBadgeText}>2</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Scarica tabella traduzioni</Text>
            <Text style={styles.cardDesc}>Genera ed esporta in Word per la traduzione esterna. IT è sempre inclusa.</Text>
          </View>
        </View>

        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>Lingue da includere:</Text>
          {LANGS.map((l) => (
            <LangCheckbox
              key={l.code}
              label={l.label}
              checked={exportLangs.includes(l.code)}
              onToggle={() => toggleExportLang(l.code)}
            />
          ))}
        </View>

        <View style={styles.sectionDivider} />

        <TouchableOpacity
          style={[styles.button, docxLoading && styles.buttonDisabled]}
          onPress={handleDownloadDocx}
          disabled={docxLoading}
          activeOpacity={0.7}
        >
          {docxLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="microsoft-word" size={18} color="#fff" />
              <Text style={styles.buttonText}>Scarica Tabella Word (.docx)</Text>
            </>
          )}
        </TouchableOpacity>

        {docxResult ? (
          <View style={[styles.inlineHint, docxResult.ok ? styles.inlineHintOk : styles.inlineHintErr]}>
            <MaterialCommunityIcons
              name={docxResult.ok ? "check-circle-outline" : "alert-circle-outline"}
              size={14}
              color={docxResult.ok ? "#4CAF50" : "#eb5757"}
            />
            <Text style={[styles.inlineHintText, { color: docxResult.ok ? "#4CAF50" : "#eb5757" }]}>
              {docxResult.msg}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.stepBadge,
              importStatus === "success" && styles.stepBadgeSuccess,
              importStatus === "error" && styles.stepBadgeError,
            ]}
          >
            <Text style={styles.stepBadgeText}>3</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Importa DOCX tradotto</Text>
            <Text style={styles.cardDesc}>
              Carica il file Word tradotto: le celle non vuote sovrascrivono i valori esistenti in
              lib/i18n/. Le celle vuote vengono ignorate.
            </Text>
          </View>
        </View>

        {Platform.OS === "web" ? (
          <input
            ref={(el) => {
              webImportInputRef.current = el;
            }}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
            onChange={handleWebFileSelected}
          />
        ) : null}

        <TouchableOpacity
          style={[styles.button, importStatus === "loading" && styles.buttonDisabled]}
          onPress={handleImportPress}
          disabled={importStatus === "loading"}
          activeOpacity={0.7}
        >
          {importStatus === "loading" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="file-upload-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Seleziona file .docx</Text>
            </>
          )}
        </TouchableOpacity>

        {importFileName ? (
          <Text style={styles.importFileName} numberOfLines={1}>
            File: {importFileName}
          </Text>
        ) : null}

        {importResult ? (
          <View
            style={[
              styles.resultBox,
              importStatus === "success" && styles.resultBoxSuccess,
              importStatus === "error" && styles.resultBoxError,
            ]}
          >
            <MaterialCommunityIcons
              name={
                importStatus === "success" ? "check-circle-outline" : "alert-circle-outline"
              }
              size={16}
              color={importStatus === "success" ? "#4CAF50" : "#F44336"}
            />
            <Text
              style={[
                styles.resultText,
                importStatus === "success" ? styles.resultTextSuccess : styles.resultTextError,
              ]}
            >
              {importResult}
            </Text>
          </View>
        ) : null}
      </View>

      <StepCard
        stepNumber={4}
        title="Riavvia Backend"
        description="Riavvia il server per caricare le nuove traduzioni in lib/i18n/."
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
    gap: 14,
  },
  pageDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderText: { flex: 1 },
  stepBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  stepBadgeSuccess: { backgroundColor: "#4CAF50" },
  stepBadgeError: { backgroundColor: "#F44336" },
  stepBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  cardDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 16 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  secondaryButtonText: { color: Colors.accent, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.background,
  },
  resultBoxSuccess: { backgroundColor: "#4CAF5015" },
  resultBoxError: { backgroundColor: "#F4433615" },
  resultText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  resultTextSuccess: { color: "#4CAF50" },
  resultTextError: { color: "#F44336" },
  langPicker: { marginBottom: 12 },
  langPickerLabel: {
    fontSize: 12, color: Colors.textSecondary,
    fontFamily: "Inter_500Medium", marginBottom: 8,
  },
  checkbox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6,
  },
  checkboxLabel: { fontSize: 13, color: Colors.text, fontFamily: "Inter_400Regular" },
  sectionDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  inlineHint: {
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 6, flexDirection: "row", alignItems: "center", gap: 6,
  },
  inlineHintOk: { backgroundColor: "#4CAF5015" },
  inlineHintErr: { backgroundColor: "#eb575715" },
  inlineHintText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  importFileName: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  infoBanner: {
    flexDirection: "row", gap: 12,
    backgroundColor: Colors.accent + "15",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  infoBannerText: { flex: 1 },
  infoBannerTitle: { fontSize: 13, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoBannerBody: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
