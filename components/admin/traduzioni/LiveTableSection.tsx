import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StepStatus } from "./StepCard";
import { TranslationFilters } from "./TranslationFilters";
import { TranslationTable } from "./TranslationTable";
import { CellState } from "./TranslationRow";

interface TableRow {
  key: string;
  position: string;
  it: string;
  [key: string]: string;
}

interface LiveTableSectionProps {
  restartStatus: StepStatus;
  restartResult: string;
  onRestartPress: () => void;
  activeLangs: Set<string>;
  toggleLang: (code: string) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  categories: string[];
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  showMissingOnly: boolean;
  setShowMissingOnly: (show: boolean | ((prev: boolean) => boolean)) => void;
  missingCount: number;
  filteredData: TableRow[];
  tableData: TableRow[];
  loadingTable: boolean;
  loadTable: () => void;
  tableError: string;
  editingCell: { key: string; lang: string } | null;
  editDraft: string;
  cellStates: Record<string, CellState>;
  rowHasMissing: (row: TableRow) => boolean;
  handleSave: (key: string, lang: string, value: string) => Promise<void>;
  handleStartEdit: (key: string, lang: string, currentValue: string) => void;
  setEditDraft: (text: string) => void;
  activeLangList: { code: string; label: string }[];
  totalWidth: number;
  COL_POSITION: number;
  COL_IT: number;
  COL_LANG: number;
  t: (key: string) => string;
}

export function LiveTableSection({
  restartStatus,
  restartResult,
  onRestartPress,
  activeLangs,
  toggleLang,
  searchText,
  setSearchText,
  categories,
  activeCategory,
  setActiveCategory,
  showMissingOnly,
  setShowMissingOnly,
  missingCount,
  filteredData,
  tableData,
  loadingTable,
  loadTable,
  tableError,
  editingCell,
  editDraft,
  cellStates,
  rowHasMissing,
  handleSave,
  handleStartEdit,
  setEditDraft,
  activeLangList,
  totalWidth,
  COL_POSITION,
  COL_IT,
  COL_LANG,
  t,
}: LiveTableSectionProps) {
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

      <TranslationFilters
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
        filteredCount={filteredData.length}
        totalCount={tableData.length}
      />

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
        <TranslationTable
          filteredData={filteredData}
          activeLangList={activeLangList}
          totalWidth={totalWidth}
          colPosition={COL_POSITION}
          colIt={COL_IT}
          colLang={COL_LANG}
          editingCell={editingCell}
          editDraft={editDraft}
          cellStates={cellStates}
          rowHasMissing={rowHasMissing}
          handleSave={handleSave}
          handleStartEdit={handleStartEdit}
          setEditDraft={setEditDraft}
        />
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

const styles = StyleSheet.create({
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
  sectionDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
});
