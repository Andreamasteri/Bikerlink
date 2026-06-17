import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import {
  TableRow,
  TABLE_LANGS,
  COL_POSITION,
  COL_IT,
  COL_LANG,
  getCellStatus,
  styles,
} from "./types";

interface LanguageRowProps {
  item: TableRow;
  totalWidth: number;
  recentlySaved: Set<string>;
  onOpenModal: (row: TableRow, lang: { code: string; label: string }) => void;
  onDeleteRow: (key: string) => void;
  activeLangList?: { code: string; label: string }[];
}

export const LanguageRow: React.FC<LanguageRowProps> = ({
  item,
  totalWidth,
  recentlySaved,
  onOpenModal,
  onDeleteRow,
  activeLangList,
}) => {
  const langList = activeLangList ?? TABLE_LANGS;
  const hasMissing = TABLE_LANGS.some(
    (l) => !(item[l.code as keyof TableRow] as string)?.trim()
  );

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

  const handleLongPress = () => {
    Alert.alert(
      "Elimina chiave",
      `Vuoi eliminare la chiave "${item.key}"?\n\nQuesta azione è irreversibile.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => onDeleteRow(item.key),
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onLongPress={handleLongPress}
      delayLongPress={600}
      activeOpacity={1}
    >
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
        {langList.map((l) => {
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
              onPress={() => onOpenModal(item, l)}
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
    </TouchableOpacity>
  );
};
