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
  TextInput,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

type StepStatus = "idle" | "loading" | "success" | "error";

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveSheet {
  id: string;
  name: string;
  modifiedTime?: string;
}

const LANGS = [
  { code: "en", label: "EN — Inglese" },
  { code: "de", label: "DE — Tedesco" },
  { code: "es", label: "ES — Spagnolo" },
  { code: "fr", label: "FR — Francese" },
  { code: "tr", label: "TR — Turco" },
];

function extractFileId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

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

function PickerModal<T extends { id: string; name: string }>({
  visible,
  title,
  items,
  loading,
  onSelect,
  onClose,
  selectedId,
  emptyMessage,
}: {
  visible: boolean;
  title: string;
  items: T[];
  loading: boolean;
  onSelect: (item: T) => void;
  onClose: () => void;
  selectedId?: string | null;
  emptyMessage: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.modalLoading}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedId === item.id && styles.modalItemSelected]}
                  onPress={() => { onSelect(item); onClose(); }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={selectedId === item.id ? "check-circle" : "circle-outline"}
                    size={18}
                    color={selectedId === item.id ? Colors.accent : Colors.textSecondary}
                  />
                  <Text style={styles.modalItemText} numberOfLines={2}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
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

  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);

  const [importInfo, setImportInfo] = useState<{ exportedLangs: string[] }>({ exportedLangs: [] });
  const [importLangs, setImportLangs] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<StepStatus>("idle");
  const [importResult, setImportResult] = useState("");

  const [manualFileInput, setManualFileInput] = useState("");
  const [sheets, setSheets] = useState<DriveSheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<DriveSheet | null>(null);

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

  async function loadFolders() {
    if (foldersLoading) return;
    setFoldersLoading(true);
    try {
      const resp = await fetch(new URL("/api/admin/translations/list-folders", getApiUrl()).toString(), {
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setFolders(data.folders || []);
      }
    } catch {}
    setFoldersLoading(false);
  }

  async function loadSheets() {
    if (sheetsLoading) return;
    setSheetsLoading(true);
    try {
      const resp = await fetch(new URL("/api/admin/translations/list-sheets", getApiUrl()).toString(), {
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setSheets(data.sheets || []);
      }
    } catch {}
    setSheetsLoading(false);
  }

  function openFolderPicker() {
    if (folders.length === 0) loadFolders();
    setShowFolderPicker(true);
  }

  function openSheetPicker() {
    if (sheets.length === 0) loadSheets();
    setShowSheetPicker(true);
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
      const body: Record<string, unknown> = { langs: exportLangs };
      if (selectedFolder) body.folderId = selectedFolder.id;
      const resp = await apiRequest("POST", "/api/admin/translations/export", body);
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

  function getResolvedFileId(): string | null {
    if (manualFileInput.trim()) return extractFileId(manualFileInput);
    if (selectedSheet) return selectedSheet.id;
    return null;
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
      const body: Record<string, unknown> = { langs: importLangs };
      const customFileId = getResolvedFileId();
      if (customFileId) body.fileId = customFileId;
      const resp = await apiRequest("POST", "/api/admin/translations/import", body);
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

  const hasCustomImportSource = !!(manualFileInput.trim() || selectedSheet);

  useEffect(() => {
    if (!hasCustomImportSource && importInfo.exportedLangs.length > 0) {
      setImportLangs((prev) => prev.filter((l) => importInfo.exportedLangs.includes(l)));
    }
  }, [hasCustomImportSource, importInfo.exportedLangs]);

  function toggleImportLang(code: string) {
    if (!hasCustomImportSource && !importInfo.exportedLangs.includes(code)) return;
    setImportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  const importDisabled = importLangs.length === 0 ||
    (!hasCustomImportSource && importInfo.exportedLangs.length === 0);

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

        <View style={styles.sectionDivider} />
        <Text style={styles.langPickerLabel}>Cartella di destinazione:</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={openFolderPicker} activeOpacity={0.7}>
          <MaterialCommunityIcons name="folder-outline" size={18} color={Colors.accent} />
          <Text style={styles.pickerButtonText} numberOfLines={1}>
            {selectedFolder ? selectedFolder.name : "Root / Drive principale"}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        {selectedFolder ? (
          <TouchableOpacity
            onPress={() => setSelectedFolder(null)}
            style={styles.clearButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.clearButtonText}>Usa Root</Text>
          </TouchableOpacity>
        ) : null}

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
        disabled={importDisabled}
      >
        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>Lingue da importare:</Text>
          {LANGS.map((l) => {
            const available = hasCustomImportSource || importInfo.exportedLangs.includes(l.code);
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

        <View style={styles.sectionDivider} />
        <Text style={styles.langPickerLabel}>File sorgente:</Text>

        {importInfo.exportedLangs.length > 0 && !hasCustomImportSource ? (
          <View style={styles.sessionFileInfo}>
            <MaterialCommunityIcons name="check-circle-outline" size={14} color="#4CAF50" />
            <Text style={styles.sessionFileText}>Usa il file esportato in questa sessione</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.pickerButton} onPress={openSheetPicker} activeOpacity={0.7}>
          <MaterialCommunityIcons name="table" size={18} color={Colors.accent} />
          <Text style={styles.pickerButtonText} numberOfLines={1}>
            {selectedSheet ? selectedSheet.name : "Sfoglia Drive…"}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        {selectedSheet ? (
          <TouchableOpacity
            onPress={() => setSelectedSheet(null)}
            style={styles.clearButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.clearButtonText}>Rimuovi selezione</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.langPickerLabel, { marginTop: 8 }]}>oppure incolla URL / ID del foglio:</Text>
        <TextInput
          style={styles.textInput}
          value={manualFileInput}
          onChangeText={setManualFileInput}
          placeholder="https://docs.google.com/spreadsheets/d/…  oppure ID"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {manualFileInput.trim() ? (
          <View style={styles.sessionFileInfo}>
            <MaterialCommunityIcons name="information-outline" size={14} color={Colors.accent} />
            <Text style={[styles.sessionFileText, { color: Colors.accent }]}>
              File ID: {extractFileId(manualFileInput)}
            </Text>
          </View>
        ) : null}
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

      <PickerModal
        visible={showFolderPicker}
        title="Seleziona cartella"
        items={folders}
        loading={foldersLoading}
        selectedId={selectedFolder?.id}
        onSelect={(f) => setSelectedFolder(f)}
        onClose={() => setShowFolderPicker(false)}
        emptyMessage="Nessuna cartella trovata su Drive"
      />

      <PickerModal
        visible={showSheetPicker}
        title="Seleziona Google Sheet"
        items={sheets}
        loading={sheetsLoading}
        selectedId={selectedSheet?.id}
        onSelect={(s) => { setSelectedSheet(s); setManualFileInput(""); }}
        onClose={() => setShowSheetPicker(false)}
        emptyMessage="Nessun foglio trovato su Drive"
      />
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
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerButtonText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  clearButtonText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  sessionFileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  sessionFileText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#4CAF50",
    flex: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  modalLoading: {
    padding: 32,
    alignItems: "center",
  },
  modalList: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalItemSelected: {
    backgroundColor: "rgba(255,152,0,0.08)",
  },
  modalItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
