import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
} from "react-native";
import Colors from "@/constants/colors";
import { TranslationRow, CellState } from "./TranslationRow";

interface TranslationTableProps {
  filteredData: any[];
  activeLangList: { code: string; label: string }[];
  totalWidth: number;
  colPosition: number;
  colIt: number;
  colLang: number;
  editingCell: { key: string; lang: string } | null;
  editDraft: string;
  cellStates: Record<string, CellState>;
  rowHasMissing: (row: any) => boolean;
  handleSave: (key: string, lang: string, value: string) => Promise<void>;
  handleStartEdit: (key: string, lang: string, currentValue: string) => void;
  setEditDraft: (v: string) => void;
}

export const TranslationTable: React.FC<TranslationTableProps> = ({
  filteredData,
  activeLangList,
  totalWidth,
  colPosition,
  colIt,
  colLang,
  editingCell,
  editDraft,
  cellStates,
  rowHasMissing,
  handleSave,
  handleStartEdit,
  setEditDraft,
}) => {
  const renderHeader = () => (
    <View style={[styles.tableRow, styles.tableHeaderRow, { width: totalWidth }]}>
      <View style={[styles.tableHeaderCell, { width: colPosition }]}>
        <Text style={styles.tableHeaderText}>Posizione</Text>
      </View>
      <View style={[styles.tableHeaderCell, { width: colIt }]}>
        <Text style={styles.tableHeaderText}>IT</Text>
      </View>
      {activeLangList.map((l) => (
        <View key={l.code} style={[styles.tableHeaderCell, { width: colLang }]}>
          <Text style={styles.tableHeaderText}>{l.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderRow = ({ item }: { item: any }) => (
    <TranslationRow
      item={item}
      totalWidth={totalWidth}
      colPosition={colPosition}
      colIt={colIt}
      colLang={colLang}
      activeLangList={activeLangList}
      editingCell={editingCell}
      editDraft={editDraft}
      cellStates={cellStates}
      rowHasMissing={rowHasMissing}
      handleSave={handleSave}
      handleStartEdit={handleStartEdit}
      setEditDraft={setEditDraft}
    />
  );

  return (
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
  );
};

const styles = StyleSheet.create({
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
});
