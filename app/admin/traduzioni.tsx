import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,

  FlatList,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

type StepStatus = "idle" | "loading" | "success" | "error";

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
  en: string;
  de: string;
  es: string;
  fr: string;
  el: string;
  tr: string;
};

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

const COL_POSITION = 220;
const COL_IT = 180;
const COL_LANG = 170;

function TableCell({
  value,
  width,
  editable,
  rowKey,
  lang,
  onSave,
  cellState,
  isEditing,
  editDraft,
  onStartEdit,
  onDraftChange,
}: {
  value: string;
  width: number;
  editable: boolean;
  rowKey: string;
  lang?: string;
  onSave?: (key: string, lang: string, value: string) => void;
  cellState?: "saving" | "ok" | "error" | undefined;
  isEditing?: boolean;
  editDraft?: string;
  onStartEdit?: () => void;
  onDraftChange?: (v: string) => void;
}) {
  if (!editable) {
    return (
      <View style={[styles.tableCell, { width }]}>
        <Text style={styles.tableCellText}>{value}</Text>
      </View>
    );
  }

  if (cellState === "saving") {
    return (
      <View style={[styles.tableCell, { width }, styles.tableCellSaving]}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  }

  if (cellState === "ok") {
    return (
      <View style={[styles.tableCell, { width }, styles.tableCellOk]}>
        <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" />
        <Text style={[styles.tableCellText, { color: "#4CAF50", flex: 1 }]}>{value}</Text>
      </View>
    );
  }

  if (cellState === "error") {
    return (
      <View style={[styles.tableCell, { width }, styles.tableCellError]}>
        <MaterialCommunityIcons name="alert-circle" size={14} color="#F44336" />
        <Text style={[styles.tableCellText, { color: "#F44336", flex: 1 }]}>{value}</Text>
      </View>
    );
  }

  if (isEditing) {
    return (
      <View style={[styles.tableCell, { width }, styles.tableCellEditing]}>
        <TextInput
          style={styles.tableCellInput}
          value={editDraft}
          onChangeText={onDraftChange}
          onBlur={() => {
            if (onSave && lang && editDraft !== undefined) {
              onSave(rowKey, lang, editDraft);
            }
          }}
          onSubmitEditing={() => {
            if (onSave && lang && editDraft !== undefined) {
              onSave(rowKey, lang, editDraft);
            }
          }}
          multiline
          autoFocus
          blurOnSubmit={false}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.tableCell, { width }, styles.tableCellTappable]}
      onPress={onStartEdit}
      activeOpacity={0.7}
    >
      <Text style={[styles.tableCellText, !value && styles.tableCellEmpty]}>
        {value || "—"}
      </Text>
      <MaterialCommunityIcons name="pencil-outline" size={11} color={Colors.textSecondary} style={{ marginLeft: 2 }} />
    </TouchableOpacity>
  );
}

function LiveTableSection({ restartStatus, restartResult, onRestartPress }: {
  restartStatus: StepStatus;
  restartResult: string;
  onRestartPress: () => void;
}) {
  const t = useT();
  const [activeLangs, setActiveLangs] = useState<Set<string>>(new Set(["en", "de", "es", "fr", "el", "tr"]));
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableError, setTableError] = useState("");
  const [editingCell, setEditingCell] = useState<{ key: string; lang: string } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [cellStates, setCellStates] = useState<Record<string, "saving" | "ok" | "error">>({});
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
  }, []);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  function toggleLang(code: string) {
    setActiveLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

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
  }, []);

  const categories = React.useMemo(() => {
    const prefixSet = new Set<string>();
    tableData.forEach((row) => {
      const prefix = row.key.split(/[._]/)[0];
      if (prefix) prefixSet.add(prefix);
    });
    return Array.from(prefixSet).sort();
  }, [tableData]);

  const rowHasMissing = useCallback((row: TableRow) => {
    return TABLE_LANGS.some((l) => !((row[l.code as keyof TableRow] as string) ?? "").trim());
  }, []);

  const missingCount = React.useMemo(() => tableData.filter(rowHasMissing).length, [tableData, rowHasMissing]);

  const filteredData = React.useMemo(() => {
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

  const renderHeader = () => (
    <View style={[styles.tableRow, styles.tableHeaderRow, { width: totalWidth }]}>
      <View style={[styles.tableHeaderCell, { width: COL_POSITION }]}>
        <Text style={styles.tableHeaderText}>Posizione</Text>
      </View>
      <View style={[styles.tableHeaderCell, { width: COL_IT }]}>
        <Text style={styles.tableHeaderText}>IT</Text>
      </View>
      {activeLangList.map((l) => (
        <View key={l.code} style={[styles.tableHeaderCell, { width: COL_LANG }]}>
          <Text style={styles.tableHeaderText}>{l.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderRow = useCallback(({ item }: { item: TableRow }) => {
    const missing = rowHasMissing(item);
    return (
      <View style={[styles.tableRow, { width: totalWidth }, missing && styles.tableRowMissing]}>
        <View style={[styles.tableCell, { width: COL_POSITION }]}>
          <View style={styles.positionCellContent}>
            <Text style={styles.tableCellKey} numberOfLines={2}>{item.position}</Text>
            <Text style={styles.tableCellSubKey} numberOfLines={1}>{item.key}</Text>
          </View>
          {missing && <View style={styles.missingDot} />}
        </View>
        <TableCell value={item.it} width={COL_IT} editable={false} rowKey={item.key} />
        {activeLangList.map((l) => {
          const cellKey = `${item.key}:${l.code}`;
          const isEditing = editingCell?.key === item.key && editingCell?.lang === l.code;
          const langVal = item[l.code as keyof TableRow] as string;
          return (
            <TableCell
              key={l.code}
              value={langVal}
              width={COL_LANG}
              editable
              rowKey={item.key}
              lang={l.code}
              onSave={handleSave}
              cellState={cellStates[cellKey]}
              isEditing={isEditing}
              editDraft={isEditing ? editDraft : undefined}
              onStartEdit={() => handleStartEdit(item.key, l.code, langVal)}
              onDraftChange={setEditDraft}
            />
          );
        })}
      </View>
    );
  }, [activeLangList, editingCell, editDraft, cellStates, handleSave, handleStartEdit, totalWidth, rowHasMissing]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.stepBadge, { backgroundColor: Colors.accent }]}>
          <MaterialCommunityIcons name="table-edit" size={16} color="#fff" />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Tabella Live</Text>
          <Text style={styles.cardDesc}>Modifica singole traduzioni direttamente. Tocca una cella per editarla.</Text>
        </View>
      </View>

      <View style={styles.langChipsRow}>
        <View style={[styles.langChip, styles.langChipFixed]}>
          <Text style={styles.langChipTextFixed}>IT</Text>
        </View>
        {TABLE_LANGS.map((l) => {
          const active = activeLangs.has(l.code);
          return (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, active && styles.langChipActive]}
              onPress={() => toggleLang(l.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.langChipText, active && styles.langChipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, loadingTable && styles.buttonDisabled]}
        onPress={loadTable}
        disabled={loadingTable}
        activeOpacity={0.7}
      >
        {loadingTable ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.buttonText}>{tableData.length > 0 ? t("admin.updateTable") : t("admin.loadTable")}</Text>
          </>
        )}
      </TouchableOpacity>

      {tableError ? (
        <View style={[styles.resultBox, styles.resultBoxError]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#F44336" />
          <Text style={[styles.resultText, styles.resultTextError]}>{tableError}</Text>
        </View>
      ) : null}

      {tableData.length > 0 ? (
        <>
          <View style={styles.searchRow}>
            <MaterialCommunityIcons name="magnify" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t("admin.searchKey")}
              placeholderTextColor={Colors.textSecondary}
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText("")} activeOpacity={0.7} style={styles.searchClear}>
                <MaterialCommunityIcons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {categories.length > 0 && (
            <View style={styles.categoryChipsRow}>
              <TouchableOpacity
                style={[styles.categoryChip, activeCategory === null && styles.categoryChipActive]}
                onPress={() => setActiveCategory(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.categoryChipText, activeCategory === null && styles.categoryChipTextActive]}>Tutte</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.missingFilterRow}>
            <TouchableOpacity
              style={[styles.missingChip, showMissingOnly && styles.missingChipActive]}
              onPress={() => setShowMissingOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.missingDotSmall} />
              <Text style={[styles.missingChipText, showMissingOnly && styles.missingChipTextActive]}>
                Mancanti{missingCount > 0 ? ` (${missingCount})` : ""}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.filterCount}>
            {filteredData.length} / {tableData.length} stringhe
          </Text>

          <View style={styles.tableContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {renderHeader()}
                <FlatList
                  data={filteredData}
                  renderItem={renderRow}
                  keyExtractor={(item) => item.key}
                  style={{ maxHeight: 520 }}
                  nestedScrollEnabled
                  removeClippedSubviews={false}
                />
              </View>
            </ScrollView>
          </View>
        </>
      ) : null}

      <View style={styles.sectionDivider} />

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary, restartStatus === "loading" && styles.buttonDisabled]}
        onPress={onRestartPress}
        disabled={restartStatus === "loading"}
        activeOpacity={0.7}
      >
        {restartStatus === "loading" ? (
          <ActivityIndicator color={Colors.accent} size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="restart" size={16} color={Colors.accent} />
            <Text style={styles.buttonSecondaryText}>Riavvia Backend</Text>
          </>
        )}
      </TouchableOpacity>

      {restartResult ? (
        <View style={[styles.resultBox, restartStatus === "success" ? styles.resultBoxSuccess : styles.resultBoxError]}>
          <MaterialCommunityIcons
            name={restartStatus === "success" ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={restartStatus === "success" ? "#4CAF50" : "#F44336"}
          />
          <Text style={[styles.resultText, restartStatus === "success" ? styles.resultTextSuccess : styles.resultTextError]}>
            {restartResult}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TraduzioniScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();

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
    } catch {}
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
    } catch {}
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
            <Text style={styles.cardDesc}>{t("admin.exportWordDesc")}</Text>
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

      <LiveTableSection
        restartStatus={restartStatus}
        restartResult={restartResult}
        onRestartPress={handleRestart}
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
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  buttonSecondaryText: { color: Colors.accent, fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
  langChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  langChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  langChipFixed: {
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.surface,
    opacity: 0.7,
  },
  langChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  langChipTextActive: {
    color: Colors.accent,
  },
  langChipTextFixed: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  searchClear: {
    padding: 4,
  },
  categoryChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  categoryChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  categoryChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: Colors.accent,
  },
  filterCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  tableContainer: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderRow: {
    backgroundColor: Colors.accent,
  },
  tableHeaderCell: {
    padding: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.2)",
  },
  tableHeaderText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  tableCell: {
    padding: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  tableCellText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    flex: 1,
  },
  tableCellEmpty: {
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  tableCellKey: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    lineHeight: 16,
  },
  tableCellSubKey: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  tableCellTappable: {
    backgroundColor: "transparent",
  },
  tableCellEditing: {
    backgroundColor: Colors.accent + "10",
    padding: 4,
  },
  tableCellInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 36,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 4,
    backgroundColor: Colors.background,
  },
  tableCellSaving: {
    backgroundColor: Colors.accent + "08",
  },
  tableCellOk: {
    backgroundColor: "#4CAF5010",
  },
  tableCellError: {
    backgroundColor: "#F4433610",
  },
  tableRowMissing: {
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
    backgroundColor: "#FF980008",
  },
  missingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF9800",
    alignSelf: "center",
    flexShrink: 0,
    marginLeft: 4,
  },
  positionCellContent: {
    flex: 1,
    flexDirection: "column",
  },
  missingFilterRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  missingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#FF9800",
    backgroundColor: "transparent",
  },
  missingChipActive: {
    backgroundColor: "#FF980020",
  },
  missingChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9800",
  },
  missingChipTextActive: {
    color: "#FF9800",
  },
  missingDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF9800",
  },
});
