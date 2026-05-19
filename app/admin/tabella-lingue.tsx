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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

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

const COL_POSITION = 200;
const COL_IT = 160;
const COL_LANG = 150;

function getCellStatus(value: string, itValue: string): "empty" | "same" | "ok" {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "empty";
  if (trimmed === (itValue ?? "").trim()) return "same";
  return "ok";
}

function getCellStyle(status: "empty" | "same" | "ok") {
  if (status === "empty") return styles.cellEmpty;
  if (status === "same") return styles.cellSame;
  return null;
}

function getCellTextStyle(status: "empty" | "same" | "ok") {
  if (status === "empty") return styles.cellTextEmpty;
  if (status === "same") return styles.cellTextSame;
  return null;
}

type EditModal = {
  key: string;
  lang: string;
  langLabel: string;
  position: string;
  itValue: string;
  currentValue: string;
};

const HEADER_ROW_HEIGHT = 36;

export default function TabellaLingue() {
  const insets = useSafeAreaInsets();
  const [tableAreaHeight, setTableAreaHeight] = useState(0);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleAiComplete = useCallback(async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/ai-complete", {});
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Errore AI");
      setAiResult({ ok: true, msg: data.message || "Completamento AI riuscito" });
      loadTable();
    } catch (e: unknown) {
      setAiResult({ ok: false, msg: e instanceof Error ? e.message : "Errore AI" });
    } finally {
      setAiLoading(false);
    }
  }, []);

  const loadTable = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiRequest("GET", "/api/admin/translations/table");
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      const data: TableRow[] = await resp.json();
      setTableData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  const filteredData = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return tableData;
    return tableData.filter(
      (row) =>
        row.key.toLowerCase().includes(q) ||
        (row.position ?? "").toLowerCase().includes(q) ||
        (row.it ?? "").toLowerCase().includes(q)
    );
  }, [tableData, searchText]);

  const totalMissing = React.useMemo(() => {
    return tableData.reduce((acc, row) => {
      const hasMissing = TABLE_LANGS.some((l) => !(row[l.code as keyof TableRow] as string)?.trim());
      return hasMissing ? acc + 1 : acc;
    }, 0);
  }, [tableData]);

  const openModal = useCallback((row: TableRow, lang: { code: string; label: string }) => {
    setEditModal({
      key: row.key,
      lang: lang.code,
      langLabel: lang.label,
      position: row.position,
      itValue: row.it ?? "",
      currentValue: (row[lang.code as keyof TableRow] as string) ?? "",
    });
    setDraftValue((row[lang.code as keyof TableRow] as string) ?? "");
    setSaveError("");
  }, []);

  const closeModal = useCallback(() => {
    setEditModal(null);
    setDraftValue("");
    setSaveError("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!editModal) return;
    const savedKey = editModal.key;
    const savedLang = editModal.lang;
    const savedValue = draftValue.trim();
    const previousValue = editModal.currentValue;

    setSaving(true);
    setSaveError("");

    setTableData((prev) =>
      prev.map((row) =>
        row.key === savedKey ? { ...row, [savedLang]: savedValue } : row
      )
    );
    closeModal();

    try {
      const resp = await apiRequest("PATCH", "/api/admin/translations/key", {
        key: savedKey,
        lang: savedLang,
        value: savedValue,
      });
      if (!resp.ok) throw new Error("Errore nel salvataggio");
      const cellKey = `${savedKey}:${savedLang}`;
      setRecentlySaved((prev) => new Set(prev).add(cellKey));
      setTimeout(() => {
        setRecentlySaved((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }, 2500);
    } catch {
      setTableData((prev) =>
        prev.map((row) =>
          row.key === savedKey ? { ...row, [savedLang]: previousValue } : row
        )
      );
      setSaveError(`Salvataggio fallito per "${savedKey}" [${savedLang}]. Riprova.`);
      setTimeout(() => setSaveError(""), 5000);
    } finally {
      setSaving(false);
    }
  }, [editModal, draftValue, closeModal]);

  const totalWidth = COL_POSITION + COL_IT + TABLE_LANGS.length * COL_LANG;

  const renderHeader = () => (
    <View style={[styles.tableRow, styles.tableHeaderRow, { width: totalWidth }]}>
      <View style={[styles.tableHeaderCell, { width: COL_POSITION }]}>
        <Text style={styles.tableHeaderText}>Posizione</Text>
      </View>
      <View style={[styles.tableHeaderCell, { width: COL_IT }]}>
        <Text style={styles.tableHeaderText}>Italiano</Text>
      </View>
      {TABLE_LANGS.map((l) => (
        <View key={l.code} style={[styles.tableHeaderCell, { width: COL_LANG }]}>
          <Text style={styles.tableHeaderText}>{l.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderRow = useCallback(
    ({ item }: { item: TableRow }) => {
      const hasMissing = TABLE_LANGS.some(
        (l) => !(item[l.code as keyof TableRow] as string)?.trim()
      );
      return (
        <View
          style={[
            styles.tableRow,
            { width: totalWidth },
            hasMissing && styles.tableRowMissing,
          ]}
        >
          <View style={[styles.tableCell, styles.positionCell, { width: COL_POSITION }]}>
            <Text style={styles.positionText} numberOfLines={2}>
              {item.position || item.key}
            </Text>
            <Text style={styles.keyText} numberOfLines={1}>
              {item.key}
            </Text>
          </View>
          <View style={[styles.tableCell, { width: COL_IT }]}>
            <Text style={styles.itText} numberOfLines={3}>
              {item.it || "—"}
            </Text>
          </View>
          {TABLE_LANGS.map((l) => {
            const val = (item[l.code as keyof TableRow] as string) ?? "";
            const cellKey = `${item.key}:${l.code}`;
            const status = getCellStatus(val, item.it);
            const justSaved = recentlySaved.has(cellKey);
            return (
              <TouchableOpacity
                key={l.code}
                style={[
                  styles.tableCell,
                  styles.langCell,
                  { width: COL_LANG },
                  getCellStyle(status),
                  justSaved && styles.cellJustSaved,
                ]}
                onPress={() => openModal(item, l)}
                activeOpacity={0.7}
              >
                {justSaved ? (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={13}
                    color="#4CAF50"
                    style={{ marginRight: 3 }}
                  />
                ) : null}
                <Text
                  style={[styles.langCellText, getCellTextStyle(status)]}
                  numberOfLines={3}
                >
                  {val || "—"}
                </Text>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={11}
                  color={Colors.textSecondary}
                  style={{ marginLeft: 2, opacity: 0.6 }}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      );
    },
    [totalWidth, recentlySaved, openModal]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento traduzioni...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 20 }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#F44336" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadTable}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca per chiave o testo italiano..."
            placeholderTextColor={Colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchText.length > 0 && Platform.OS !== "ios" ? (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <MaterialIcons name="clear" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {filteredData.length} chiavi
            {searchText ? ` su ${tableData.length}` : ""}
          </Text>
          {totalMissing > 0 ? (
            <View style={styles.missingBadge}>
              <Text style={styles.missingBadgeText}>{totalMissing} incompleti</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#FF5252" }]} />
            <Text style={styles.legendText}>Vuoto</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#FFC107" }]} />
            <Text style={styles.legendText}>Identico all'italiano</Text>
          </View>
        </View>
      </View>

      <View style={styles.aiBar}>
        <TouchableOpacity
          style={[styles.aiBtn, aiLoading && styles.aiBtnDisabled]}
          onPress={handleAiComplete}
          disabled={aiLoading}
          activeOpacity={0.7}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="auto-fix" size={15} color="#fff" />
              <Text style={styles.aiBtnText}>Completa con AI</Text>
            </>
          )}
        </TouchableOpacity>
        {aiResult ? (
          <View style={[styles.aiResultBadge, aiResult.ok ? styles.aiResultBadgeOk : styles.aiResultBadgeErr]}>
            <MaterialCommunityIcons
              name={aiResult.ok ? "check-circle" : "alert-circle"}
              size={12}
              color={aiResult.ok ? "#4CAF50" : "#F44336"}
            />
            <Text style={[styles.aiResultText, { color: aiResult.ok ? "#4CAF50" : "#F44336" }]} numberOfLines={2}>
              {aiResult.msg}
            </Text>
          </View>
        ) : null}
      </View>

      {saveError ? (
        <TouchableOpacity style={styles.saveErrorBanner} onPress={() => setSaveError("")} activeOpacity={0.8}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.saveErrorBannerText}>{saveError}</Text>
          <MaterialIcons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <View
        style={styles.tableScroll}
        onLayout={(e) => setTableAreaHeight(e.nativeEvent.layout.height)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {renderHeader()}
            {tableAreaHeight > 0 ? (
              <FlatList
                data={filteredData}
                keyExtractor={(item) => item.key}
                renderItem={renderRow}
                nestedScrollEnabled
                style={{ height: tableAreaHeight - HEADER_ROW_HEIGHT }}
                initialNumToRender={30}
                maxToRenderPerBatch={20}
                windowSize={10}
              />
            ) : null}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={editModal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            activeOpacity={1}
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editModal?.langLabel} — {editModal?.position || editModal?.key}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {editModal?.key}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalItRow}>
              <Text style={styles.modalItLabel}>Italiano (riferimento):</Text>
              <Text style={styles.modalItValue}>{editModal?.itValue || "—"}</Text>
            </View>

            <Text style={styles.modalInputLabel}>Traduzione {editModal?.langLabel}:</Text>
            <TextInput
              style={styles.modalInput}
              value={draftValue}
              onChangeText={setDraftValue}
              multiline
              autoFocus
              placeholder="Inserisci la traduzione..."
              placeholderTextColor={Colors.textSecondary}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (saving || !draftValue.trim()) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || !draftValue.trim()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Salva</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    color: "#F44336",
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  topBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  statsText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  missingBadge: {
    backgroundColor: "#FF5252",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  missingBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  legend: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  tableScroll: {
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    minHeight: 48,
  },
  tableHeaderRow: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
    minHeight: 36,
  },
  tableRowMissing: {
    backgroundColor: "rgba(255, 82, 82, 0.04)",
  },
  tableHeaderCell: {
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: Colors.border ?? "#2a2a2a",
  },
  tableHeaderText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableCell: {
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: Colors.border ?? "#2a2a2a",
    minHeight: 44,
  },
  positionCell: {
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  positionText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  keyText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  itText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  langCell: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  langCellText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  cellEmpty: {
    backgroundColor: "rgba(255, 82, 82, 0.15)",
  },
  cellSame: {
    backgroundColor: "rgba(255, 193, 7, 0.15)",
  },
  cellJustSaved: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
  },
  cellTextEmpty: {
    color: "#FF5252",
  },
  cellTextSame: {
    color: "#FFA000",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 480,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 10,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  modalItRow: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  modalItLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  modalItValue: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  modalInputLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.accent,
    lineHeight: 20,
  },
  saveErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C62828",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  saveErrorBannerText: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border ?? "#444",
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    flexWrap: "wrap",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  aiBtnDisabled: {
    opacity: 0.5,
  },
  aiBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  aiResultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  aiResultBadgeOk: {
    backgroundColor: "#4CAF5015",
  },
  aiResultBadgeErr: {
    backgroundColor: "#F4433615",
  },
  aiResultText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
