import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { useT } from "@/lib/language-context";
import { StepCard, StepStatus } from "@/components/admin/traduzioni/StepCard";
import { LangCheckbox } from "@/components/admin/traduzioni/LangCheckbox";
import { TranslationFilters } from "@/components/admin/traduzioni/TranslationFilters";
import { TranslationTable } from "@/components/admin/traduzioni/TranslationTable";
import { CellState } from "@/components/admin/traduzioni/TranslationRow";

import { AiSection } from "@/components/admin/traduzioni/AiSection";
import { ExportSection } from "@/components/admin/traduzioni/ExportSection";
import { ImportSection } from "@/components/admin/traduzioni/ImportSection";
import { InfoBanner } from "@/components/admin/traduzioni/InfoBanner";
import { PrepareSection } from "@/components/admin/traduzioni/PrepareSection";
import { RestartSection } from "@/components/admin/traduzioni/RestartSection";
import { LiveTableSection } from "@/components/admin/traduzioni/LiveTableSection";
import { traduzioniStyles as styles } from "@/components/admin/traduzioni/styles";

const LANGS = [
  { code: "en", label: "EN — Inglese" },
  { code: "de", label: "DE — Tedesco" },
  { code: "es", label: "ES — Spagnolo" },
  { code: "fr", label: "FR — Francese" },
  { code: "el", label: "EL — Greco" },
  { code: "tr", label: "TR — Turco" },
];

const TABLE_LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "el", label: "EL" },
  { code: "tr", label: "TR" },
];

type TableRow = {
  key: string;
  position: string;
  it: string;
  [key: string]: string;
};

const COL_POSITION = 220;
const COL_IT = 180;
const COL_LANG = 170;

export default function TraduzioniScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [activeLangs, setActiveLangs] = useState<Set<string>>(new Set(["en", "de", "es", "fr", "el", "tr"]));
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableError, setTableError] = useState("");
  const [editingCell, setEditingCell] = useState<{ key: string; lang: string } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({});
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const loadTable = useCallback(async () => {
    setLoadingTable(true);
    setTableError("");
    try {
      const url = new URL("/api/admin/translations/table", getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      const data: TableRow[] = await resp.json();
      setTableData(data);
    } catch (e: unknown) {
      setTableError(e instanceof Error ? e.message : t("admin.loadError2"));
    } finally {
      setLoadingTable(false);
    }
  }, [t]);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  const toggleLang = useCallback((code: string) => {
    setActiveLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleStartEdit = useCallback((key: string, lang: string, currentValue: string) => {
    setEditingCell({ key, lang });
    setEditDraft(currentValue);
  }, []);

  const handleSave = useCallback(async (key: string, lang: string, value: string) => {
    const cellKey = `${key}:${lang}`;
    setEditingCell(null);

    if (!value.trim()) return;

    setCellStates((prev) => ({ ...prev, [cellKey]: "saving" }));
    try {
      const resp = await apiRequest("PATCH", "/api/admin/translations/key", { key, lang, value: value.trim() });
      if (!resp.ok) throw new Error(t("admin.saveError"));
      setTableData((prev) =>
        prev.map((row) =>
          row.key === key ? { ...row, [lang]: value.trim() } : row
        )
      );
      setCellStates((prev) => ({ ...prev, [cellKey]: "ok" }));
      setTimeout(() => {
        setCellStates((prev) => {
          const next = { ...prev };
          if (next[cellKey] === "ok") delete next[cellKey];
          return next;
        });
      }, 2500);
    } catch {
      setCellStates((prev) => ({ ...prev, [cellKey]: "error" }));
      setTimeout(() => {
        setCellStates((prev) => {
          const next = { ...prev };
          if (next[cellKey] === "error") delete next[cellKey];
          return next;
        });
      }, 3000);
    }
  }, [t]);

  const categories = useMemo(() => {
    const prefixSet = new Set<string>();
    tableData.forEach((row) => {
      const prefix = row.key.split(/[._]/)[0];
      if (prefix) prefixSet.add(prefix);
    });
    return Array.from(prefixSet).sort();
  }, [tableData]);

  const rowHasMissing = useCallback((row: TableRow) => {
    return TABLE_LANGS.some((l) => !((row[l.code] as string) ?? "").trim());
  }, []);

  const missingCount = useMemo(() => tableData.filter(rowHasMissing).length, [tableData, rowHasMissing]);

  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return tableData.filter((row) => {
      const matchesCategory = activeCategory ? row.key.startsWith(activeCategory + ".") || row.key.startsWith(activeCategory + "_") || row.key.split(/[._]/)[0] === activeCategory : true;
      if (!matchesCategory) return false;
      if (showMissingOnly && !rowHasMissing(row)) return false;
      if (!q) return true;
      return row.key.toLowerCase().includes(q) || row.it.toLowerCase().includes(q);
    });
  }, [tableData, searchText, activeCategory, showMissingOnly, rowHasMissing]);

  const activeLangList = TABLE_LANGS.filter((l) => activeLangs.has(l.code));
  const totalWidth = COL_POSITION + COL_IT + activeLangList.length * COL_LANG;

  const [prepareStatus, setPrepareStatus] = useState<StepStatus>("idle");
  const [prepareResult, setPrepareResult] = useState("");

  const [exportLangs, setExportLangs] = useState<string[]>(["en", "de", "es", "fr", "el", "tr"]);

  const [restartStatus, setRestartStatus] = useState<StepStatus>("idle");
  const [restartResult, setRestartResult] = useState("");

  const [docxLoading, setDocxLoading] = useState(false);
  const [docxResult, setDocxResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [importStatus, setImportStatus] = useState<StepStatus>("idle");
  const [importResult, setImportResult] = useState("");
  const [importFileName, setImportFileName] = useState<string>("");
  const webImportInputRef = useRef<any>(null);

  const [aiStatus, setAiStatus] = useState<StepStatus>("idle");
  const [aiResult, setAiResult] = useState("");
  const [aiSummary, setAiSummary] = useState<Record<string, number> | null>(null);

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
      setPrepareResult(e?.message || t("admin.prepareError"));
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
    } catch {
      // no-op: return fallback message
    }
    return t("admin.downloadError");
  }

  async function handleDownloadDocx() {
    setDocxLoading(true);
    setDocxResult(null);
    try {
      const langs = exportLangs.length > 0 ? exportLangs : ["en", "de", "es", "fr", "el", "tr"];
      const url = new URL(
        `/api/admin/translations/download-docx?langs=${langs.join(",")}`,
        getApiUrl()
      );
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
          dialogTitle: t("admin.saveWord"),
        });
        setDocxResult({ ok: true, msg: "File Word pronto da condividere" });
      } else {
        setDocxResult({ ok: false, msg: t("admin.sharingUnavailable") });
      }
    } catch (e: unknown) {
      setDocxResult({ ok: false, msg: extractErrorMessage(e, t("admin.wordDownloadError")) });
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
        setRestartResult(msg || t("admin.restartError"));
      }
    }
  }

  function toggleExportLang(code: string) {
    setExportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, "");
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(cleaned);
      const len = binary.length;
      const buffer = new ArrayBuffer(len);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < len; i++) view[i] = binary.charCodeAt(i);
      return buffer;
    }
    const BufferImpl = (globalThis as { Buffer?: { from: (s: string, e: string) => Uint8Array } })
      .Buffer;
    if (BufferImpl) {
      const buf = BufferImpl.from(cleaned, "base64");
      const out = new ArrayBuffer(buf.byteLength);
      new Uint8Array(out).set(buf);
      return out;
    }
    throw new Error("Decodifica base64 non disponibile in questo runtime");
  }

  async function uploadDocxFile(formData: FormData): Promise<void> {
    type ImportResponse = {
      ok?: boolean;
      langCounts?: Record<string, number>;
      message?: string;
    };
    const url = new URL("/api/admin/translations/import-docx", getApiUrl());
    const resp = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    let payload: ImportResponse | null = null;
    try {
      const parsed: unknown = await resp.json();
      if (parsed && typeof parsed === "object") {
        payload = parsed as ImportResponse;
      }
    } catch {
      // no-op: payload stays null
    }
    if (!resp.ok || !payload?.ok) {
      const errMsg =
        (payload && typeof payload.message === "string" && payload.message) ||
        `Errore HTTP ${resp.status}`;
      throw new Error(errMsg);
    }
    const summary = payload.langCounts
      ? Object.entries(payload.langCounts)
          .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
          .join(", ")
      : "";
    setImportStatus("success");
    setImportResult(
      summary ? `Stringhe aggiornate → ${summary}` : payload.message || "Import completato"
    );
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
      setImportResult(extractErrorMessage(err, t("admin.importError")));
    } finally {
      if (webImportInputRef.current) webImportInputRef.current.value = "";
    }
  }

  async function handlePickAndImportNative() {
    setImportStatus("loading");
    setImportResult("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [DOCX_MIME, "application/octet-stream", "*/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        setImportStatus("idle");
        return;
      }
      const asset = picked.assets[0];
      const fileName = asset.name || "translations.docx";
      if (!/\.docx$/i.test(fileName)) {
        throw new Error(t("admin.selectDocxFile"));
      }
      setImportFileName(fileName);

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = base64ToArrayBuffer(base64);
      const blob = new Blob([arrayBuffer], { type: DOCX_MIME });

      const fd = new FormData();
      fd.append("file", blob, fileName);
      await uploadDocxFile(fd);
    } catch (err: unknown) {
      setImportStatus("error");
      setImportResult(extractErrorMessage(err, t("admin.importError")));
    }
  }

  function handleImportPress() {
    if (importStatus === "loading") return;
    handlePickAndImportNative();
  }

  async function handleAiComplete() {
    setAiStatus("loading");
    setAiResult("");
    setAiSummary(null);
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/ai-complete", {});
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Errore AI");
      setAiStatus("success");
      setAiResult(data.message || "Completamento AI riuscito");
      if (data.summary) setAiSummary(data.summary as Record<string, number>);
    } catch (e: any) {
      setAiStatus("error");
      setAiResult(e?.message || "Errore durante il completamento AI");
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24, paddingTop: 0 },
      ]}
    >
      <Text style={styles.pageDesc}>
        Esporta tutte le stringhe dell'app in Word, falle tradurre esternamente, poi importa il file
        tradotto direttamente da qui e riavvia il backend.
      </Text>

      <PrepareSection
        prepareStatus={prepareStatus}
        prepareResult={prepareResult}
        onPrepare={handlePrepare}
        t={t}
      />

      <ExportSection
        exportLangs={exportLangs}
        toggleExportLang={toggleExportLang}
        docxLoading={docxLoading}
        onDownload={handleDownloadDocx}
        docxResult={docxResult}
        t={t}
      />

      <ImportSection
        importStatus={importStatus}
        importFileName={importFileName}
        importResult={importResult}
        onImportPress={handleImportPress}
        t={t}
      />

      <AiSection
        aiStatus={aiStatus}
        handleAiComplete={handleAiComplete}
        aiResult={aiResult}
        aiSummary={aiSummary}
      />

      <RestartSection
        restartStatus={restartStatus}
        restartResult={restartResult}
        onRestart={handleRestart}
        t={t}
      />

      {restartStatus === "success" ? <InfoBanner /> : null}

      <LiveTableSection
        restartStatus={restartStatus}
        restartResult={restartResult}
        onRestartPress={handleRestart}
        activeLangs={activeLangs}
        toggleLang={toggleLang}
        searchText={searchText}
        setSearchText={setSearchText}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        showMissingOnly={showMissingOnly}
        setShowMissingOnly={setShowMissingOnly}
        missingCount={missingCount}
        filteredData={filteredData}
        tableData={tableData}
        loadingTable={loadingTable}
        loadTable={loadTable}
        tableError={tableError}
        editingCell={editingCell}
        editDraft={editDraft}
        cellStates={cellStates}
        rowHasMissing={rowHasMissing}
        handleSave={handleSave}
        handleStartEdit={handleStartEdit}
        setEditDraft={setEditDraft}
        activeLangList={activeLangList}
        totalWidth={totalWidth}
        COL_POSITION={COL_POSITION}
        COL_IT={COL_IT}
        COL_LANG={COL_LANG}
        t={t}
      />
    </ScrollView>
  );
}

