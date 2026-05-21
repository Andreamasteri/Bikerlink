import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const TABLE_LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "el", label: "EL" },
  { code: "tr", label: "TR" },
];

export type TableRow = {
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

export const COL_POSITION = 200;
export const COL_IT = 160;
export const COL_LANG = 150;

export function getCellStatus(value: string, itValue: string): "empty" | "same" | "ok" {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "empty";
  if (trimmed === (itValue ?? "").trim()) return "same";
  return "ok";
}

export const styles = StyleSheet.create({
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
});
