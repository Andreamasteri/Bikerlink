import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type CellState = "saving" | "ok" | "error";

interface TranslationCellProps {
  value: string;
  width: number;
  editable: boolean;
  rowKey: string;
  lang?: string;
  onSave?: (key: string, lang: string, value: string) => void;
  cellState?: CellState;
  isEditing?: boolean;
  editDraft?: string;
  onStartEdit?: () => void;
  onDraftChange?: (v: string) => void;
}

export const TranslationCell: React.FC<TranslationCellProps> = ({
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
}) => {
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
};

interface TranslationRowProps {
  item: {
    key: string;
    position: string;
    it: string;
    [key: string]: string;
  };
  totalWidth: number;
  colPosition: number;
  colIt: number;
  colLang: number;
  activeLangList: { code: string; label: string }[];
  editingCell: { key: string; lang: string } | null;
  editDraft: string;
  cellStates: Record<string, CellState>;
  rowHasMissing: (row: any) => boolean;
  handleSave: (key: string, lang: string, value: string) => Promise<void>;
  handleStartEdit: (key: string, lang: string, currentValue: string) => void;
  setEditDraft: (v: string) => void;
}

export const TranslationRow: React.FC<TranslationRowProps> = ({
  item,
  totalWidth,
  colPosition,
  colIt,
  colLang,
  activeLangList,
  editingCell,
  editDraft,
  cellStates,
  rowHasMissing,
  handleSave,
  handleStartEdit,
  setEditDraft,
}) => {
  const missing = rowHasMissing(item);
  return (
    <View style={[styles.tableRow, { width: totalWidth }, missing && styles.tableRowMissing]}>
      <View style={[styles.tableCell, { width: colPosition }]}>
        <View style={styles.positionCellContent}>
          <Text style={styles.tableCellKey} numberOfLines={2}>{item.position}</Text>
          <Text style={styles.tableCellSubKey} numberOfLines={1}>{item.key}</Text>
        </View>
        {missing && <View style={styles.missingDot} />}
      </View>
      <TranslationCell value={item.it} width={colIt} editable={false} rowKey={item.key} />
      {activeLangList.map((l) => {
        const cellKey = `${item.key}:${l.code}`;
        const isEditing = editingCell?.key === item.key && editingCell?.lang === l.code;
        const langVal = item[l.code] as string;
        return (
          <TranslationCell
            key={l.code}
            value={langVal}
            width={colLang}
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
};

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
});
