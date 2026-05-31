import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { isAiKeyMissingError, AI_KEY_MISSING_MESSAGE } from "@/lib/ai-errors";
import Colors from "@/constants/colors";

import {
  TableRow,
  TABLE_LANGS,
} from "@/components/admin/tabella-lingue/types";
import { LanguageTable } from "@/components/admin/tabella-lingue/LanguageTable";
import { LanguageFilters } from "@/components/admin/tabella-lingue/LanguageFilters";
import { LanguageAiStats } from "@/components/admin/tabella-lingue/LanguageAiStats";
import { LanguageEditModal, EditModalData } from "@/components/admin/tabella-lingue/LanguageEditModal";
import { AddKeyModal, AddKeyFormData } from "@/components/admin/tabella-lingue/AddKeyModal";

const HEADER_ROW_HEIGHT = 36;

export default function TabellaLingue() {
  const insets = useSafeAreaInsets();
  const [tableAreaHeight, setTableAreaHeight] = useState(0);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editModal, setEditModal] = useState<EditModalData | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const loadTable = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiRequest("GET", "/api/admin/translations/table");
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      const data: TableRow[] = await resp.json();
      setTableData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? (e as Error).message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

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
      const msg = isAiKeyMissingError(e)
        ? AI_KEY_MISSING_MESSAGE
        : e instanceof Error ? (e as Error).message : "Errore AI";
      setAiResult({ ok: false, msg });
    } finally {
      setAiLoading(false);
    }
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

  const handleAddKey = useCallback(async (data: AddKeyFormData) => {
    setAddSaving(true);
    setAddError("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/keys", data);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Errore creazione chiave");
      setTableData((prev) => {
        const newRow: TableRow = {
          key: json.key,
          position: json.position ?? "",
          it: json.it ?? "",
          en: json.en ?? "",
          de: json.de ?? "",
          es: json.es ?? "",
          fr: json.fr ?? "",
          el: json.el ?? "",
          tr: json.tr ?? "",
        };
        return [...prev, newRow];
      });
      setAddModalVisible(false);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? (e as Error).message : "Errore sconosciuto");
    } finally {
      setAddSaving(false);
    }
  }, []);

  const handleDeleteRow = useCallback(async (key: string) => {
    const snapshotIndex = tableData.findIndex((r) => r.key === key);
    const snapshot = snapshotIndex >= 0 ? tableData[snapshotIndex] : null;
    setTableData((prev) => prev.filter((r) => r.key !== key));
    try {
      const resp = await apiRequest("DELETE", `/api/admin/translations/keys/${encodeURIComponent(key)}`);
      if (!resp.ok) {
        throw new Error(`Errore ${resp.status}`);
      }
    } catch {
      if (snapshot) {
        setTableData((prev) => {
          const next = [...prev];
          const insertAt = Math.min(snapshotIndex, next.length);
          next.splice(insertAt, 0, snapshot);
          return next;
        });
      }
      setSaveError(`Eliminazione fallita per "${key}". Riprova.`);
      setTimeout(() => setSaveError(""), 5000);
    }
  }, [tableData]);

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
      />

      <LanguageAiStats
        aiLoading={aiLoading}
        aiResult={aiResult}
        onAiComplete={handleAiComplete}
      />

      <View style={styles.addKeyRow}>
        <TouchableOpacity
          style={styles.addKeyBtn}
          onPress={() => {
            setAddError("");
            setAddModalVisible(true);
          }}
          activeOpacity={0.8}
        >
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

      <View
        style={styles.tableArea}
        onLayout={(e) => setTableAreaHeight(e.nativeEvent.layout.height)}
      >
        <LanguageTable
          data={filteredData}
          tableAreaHeight={tableAreaHeight}
          recentlySaved={recentlySaved}
          onOpenModal={openModal}
          onDeleteRow={handleDeleteRow}
          headerRowHeight={HEADER_ROW_HEIGHT}
        />
      </View>

      <LanguageEditModal
        visible={editModal !== null}
        data={editModal}
        draftValue={draftValue}
        onDraftValueChange={setDraftValue}
        onClose={closeModal}
        onSave={handleSave}
        saving={saving}
      />

      <AddKeyModal
        visible={addModalVisible}
        saving={addSaving}
        error={addError}
        onClose={() => setAddModalVisible(false)}
        onSave={handleAddKey}
      />
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
  addKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    gap: 12,
  },
  addKeyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  addKeyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  addKeyHint: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  tableArea: {
    flex: 1,
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
});
