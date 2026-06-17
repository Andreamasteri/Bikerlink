import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { isAiKeyMissingError, AI_KEY_MISSING_MESSAGE } from "@/lib/ai-errors";
import Colors from "@/constants/colors";

import { TableRow, TABLE_LANGS } from "@/components/admin/tabella-lingue/types";
import { LanguageTable } from "@/components/admin/tabella-lingue/LanguageTable";
import { LanguageFilters } from "@/components/admin/tabella-lingue/LanguageFilters";
import { LanguageEditModal } from "@/components/admin/tabella-lingue/LanguageEditModal";
import { AddKeyModal, AddKeyFormData } from "@/components/admin/tabella-lingue/AddKeyModal";
import { ActionButton, ActionResultBanner, ActionState } from "@/components/admin/tabella-lingue/ActionButtons";

const HEADER_ROW_HEIGHT = 36;

export default function TabellaLingue() {
  const insets = useSafeAreaInsets();
  const [tableAreaHeight, setTableAreaHeight] = useState(0);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");

  const [editRow, setEditRow] = useState<TableRow | null>(null);
  const [editFocusLang, setEditFocusLang] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState("");

  const [activeLangs, setActiveLangs] = useState<Set<string>>(
    new Set(TABLE_LANGS.map((l) => l.code))
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [syncState, setSyncState] = useState<ActionState>("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [aiState, setAiState] = useState<ActionState>("idle");
  const [aiMsg, setAiMsg] = useState("");
  const [applyState, setApplyState] = useState<ActionState>("idle");
  const [applyMsg, setApplyMsg] = useState("");

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

  useEffect(() => { loadTable(); }, [loadTable]);

  const handleToggleLang = useCallback((code: string) => {
    setActiveLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const categories = useMemo(() => {
    const prefixSet = new Set<string>();
    tableData.forEach((row) => {
      const prefix = row.key.split(/[._]/)[0];
      if (prefix) prefixSet.add(prefix);
    });
    return Array.from(prefixSet).sort();
  }, [tableData]);

  const rowHasMissing = useCallback(
    (row: TableRow) => TABLE_LANGS.some((l) => !(row[l.code as keyof TableRow] as string)?.trim()),
    []
  );

  const totalMissing = useMemo(() => tableData.filter(rowHasMissing).length, [tableData, rowHasMissing]);

  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return tableData.filter((row) => {
      const matchCat = activeCategory
        ? row.key.startsWith(activeCategory + ".") || row.key.startsWith(activeCategory + "_") || row.key.split(/[._]/)[0] === activeCategory
        : true;
      if (!matchCat) return false;
      if (showMissingOnly && !rowHasMissing(row)) return false;
      if (!q) return true;
      return row.key.toLowerCase().includes(q) || (row.it ?? "").toLowerCase().includes(q) || (row.position ?? "").toLowerCase().includes(q);
    });
  }, [tableData, searchText, activeCategory, showMissingOnly, rowHasMissing]);

  const openModal = useCallback((row: TableRow, lang: { code: string; label: string }) => {
    setEditRow(row); setEditFocusLang(lang.code);
  }, []);

  const closeModal = useCallback(() => { setEditRow(null); setEditFocusLang(undefined); }, []);

  const handleSave = useCallback(async (updates: Record<string, string>) => {
    if (!editRow) return;
    const rowKey = editRow.key;
    const snapshots: Record<string, string> = {};
    TABLE_LANGS.forEach((l) => { snapshots[l.code] = (editRow[l.code as keyof TableRow] as string) ?? ""; });
    setSaving(true);
    setTableData((prev) => prev.map((row) => (row.key === rowKey ? { ...row, ...updates } : row)));
    closeModal();
    try {
      for (const [lang, value] of Object.entries(updates)) {
        const resp = await apiRequest("PATCH", "/api/admin/translations/key", { key: rowKey, lang, value });
        if (!resp.ok) throw new Error(`Errore nel salvataggio [${lang}]`);
        const cellKey = `${rowKey}:${lang}`;
        setRecentlySaved((prev) => new Set(prev).add(cellKey));
        setTimeout(() => { setRecentlySaved((prev) => { const next = new Set(prev); next.delete(cellKey); return next; }); }, 2500);
      }
    } catch {
      const restore: Record<string, string> = {};
      TABLE_LANGS.forEach((l) => { if (updates[l.code] !== undefined) restore[l.code] = snapshots[l.code]; });
      setTableData((prev) => prev.map((row) => (row.key === rowKey ? { ...row, ...restore } : row)));
      setSaveError(`Salvataggio fallito per "${rowKey}". Riprova.`);
      setTimeout(() => setSaveError(""), 5000);
    } finally { setSaving(false); }
  }, [editRow, closeModal]);

  const handleAddKey = useCallback(async (data: AddKeyFormData) => {
    setAddSaving(true); setAddError("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/keys", data);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Errore creazione chiave");
      setTableData((prev) => [...prev, { key: json.key, position: json.position ?? "", it: json.it ?? "", en: json.en ?? "", de: json.de ?? "", es: json.es ?? "", fr: json.fr ?? "", el: json.el ?? "", tr: json.tr ?? "" }]);
      setAddModalVisible(false);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally { setAddSaving(false); }
  }, []);

  const handleDeleteRow = useCallback(async (key: string) => {
    const snapshotIndex = tableData.findIndex((r) => r.key === key);
    const snapshot = snapshotIndex >= 0 ? tableData[snapshotIndex] : null;
    setTableData((prev) => prev.filter((r) => r.key !== key));
    try {
      const resp = await apiRequest("DELETE", `/api/admin/translations/keys/${encodeURIComponent(key)}`);
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
    } catch {
      if (snapshot) { setTableData((prev) => { const next = [...prev]; next.splice(Math.min(snapshotIndex, next.length), 0, snapshot); return next; }); }
      setSaveError(`Eliminazione fallita per "${key}". Riprova.`);
      setTimeout(() => setSaveError(""), 5000);
    }
  }, [tableData]);

  const handleSyncFromFiles = useCallback(async () => {
    setSyncState("loading"); setSyncMsg("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/sync-from-files", {});
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Errore sincronizzazione");
      setSyncState("ok"); setSyncMsg(data.message || "Sincronizzazione completata"); loadTable();
    } catch (e: unknown) { setSyncState("error"); setSyncMsg(e instanceof Error ? e.message : "Errore sincronizzazione"); }
  }, [loadTable]);

  const handleAiComplete = useCallback(async () => {
    setAiState("loading"); setAiMsg("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/ai-complete", {});
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Errore AI");
      setAiState("ok"); setAiMsg(data.message || "Completamento AI riuscito"); loadTable();
    } catch (e: unknown) {
      const msg = isAiKeyMissingError(e) ? AI_KEY_MISSING_MESSAGE : e instanceof Error ? e.message : "Errore AI";
      setAiState("error"); setAiMsg(msg);
    }
  }, [loadTable]);

  const handleApplyToFiles = useCallback(() => {
    Alert.alert("Applica ai file", "Sovrascrive lib/i18n/*.ts con i valori dal database e riavvia il backend. Continuare?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Applica e riavvia", style: "destructive",
        onPress: async () => {
          setApplyState("loading"); setApplyMsg("");
          try {
            const resp = await apiRequest("POST", "/api/admin/translations/apply-to-files", {});
            const data = await resp.json();
            if (!resp.ok) throw new Error(data?.message || "Errore scrittura file");
            setApplyState("ok"); setApplyMsg((data.message || "File aggiornati") + " — backend in riavvio…");
          } catch (e: unknown) { setApplyState("error"); setApplyMsg(e instanceof Error ? e.message : "Errore scrittura file"); }
        },
      },
    ]);
  }, []);

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
      <LanguageFilters
        searchText={searchText}
        onSearchChange={setSearchText}
        filteredCount={filteredData.length}
        totalCount={tableData.length}
        totalMissing={totalMissing}
        activeLangs={activeLangs}
        onToggleLang={handleToggleLang}
        categories={categories}
        activeCategory={activeCategory}
        onSetCategory={setActiveCategory}
        showMissingOnly={showMissingOnly}
        onToggleMissingOnly={() => setShowMissingOnly((v) => !v)}
      />

      <View style={styles.actionsRow}>
        <ActionButton label="Sincronizza da file" icon="sync" state={syncState} onPress={handleSyncFromFiles} color="#2196F3" />
        <ActionButton label="Completa con AI" icon="auto-fix" state={aiState} onPress={handleAiComplete} color="#9C27B0" />
        <ActionButton label="Applica ai file" icon="file-export-outline" state={applyState} onPress={handleApplyToFiles} color="#FF5722" />
      </View>

      {syncMsg ? <ActionResultBanner msg={syncMsg} state={syncState} onDismiss={() => setSyncMsg("")} /> : null}
      {aiMsg ? <ActionResultBanner msg={aiMsg} state={aiState} onDismiss={() => setAiMsg("")} /> : null}
      {applyMsg ? <ActionResultBanner msg={applyMsg} state={applyState} onDismiss={() => setApplyMsg("")} /> : null}

      <View style={styles.addKeyRow}>
        <TouchableOpacity style={styles.addKeyBtn} onPress={() => { setAddError(""); setAddModalVisible(true); }} activeOpacity={0.8}>
          <MaterialIcons name="add" size={16} color="#fff" />
          <Text style={styles.addKeyBtnText}>Aggiungi chiave</Text>
        </TouchableOpacity>
        <Text style={styles.addKeyHint}>Tieni premuto una riga per eliminarla</Text>
      </View>

      {saveError ? (
        <TouchableOpacity style={styles.saveErrorBanner} onPress={() => setSaveError("")} activeOpacity={0.8}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.saveErrorBannerText}>{saveError}</Text>
          <MaterialIcons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <View style={styles.tableArea} onLayout={(e) => setTableAreaHeight(e.nativeEvent.layout.height)}>
        <LanguageTable
          data={filteredData}
          tableAreaHeight={tableAreaHeight}
          recentlySaved={recentlySaved}
          onOpenModal={openModal}
          onDeleteRow={handleDeleteRow}
          headerRowHeight={HEADER_ROW_HEIGHT}
          activeLangs={activeLangs}
        />
      </View>

      <LanguageEditModal visible={editRow !== null} row={editRow} focusLang={editFocusLang} onClose={closeModal} onSave={handleSave} saving={saving} />
      <AddKeyModal visible={addModalVisible} saving={addSaving} error={addError} onClose={() => setAddModalVisible(false)} onSave={handleAddKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background, padding: 20 },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  errorText: { marginTop: 12, color: "#F44336", fontSize: 14, textAlign: "center" },
  retryBtn: { marginTop: 16, backgroundColor: Colors.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  actionsRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border ?? "#2a2a2a", backgroundColor: Colors.surface },
  addKeyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border ?? "#2a2a2a", gap: 12 },
  addKeyBtn: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, gap: 5 },
  addKeyBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  addKeyHint: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  tableArea: { flex: 1 },
  saveErrorBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#C62828", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  saveErrorBannerText: { flex: 1, color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
});
