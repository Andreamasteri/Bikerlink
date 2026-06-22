/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text } from "react-native";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatSaved(bytesBefore: number, bytesAfter: number): string {
  const saved = bytesBefore - bytesAfter;
  if (saved <= 0) return "—";
  return `−${formatBytes(saved)}`;
}

export function DbTableRow({
  row,
  idx,
  detail,
  colors,
  styles,
  hasDetail
}: {
  row: any;
  idx: number;
  detail: any;
  colors: any;
  styles: any;
  hasDetail: boolean;
}) {
  const isFull = detail?.mode === "full";
  return (
    <View
      key={row.name}
      style={[
        styles.tableRow,
        idx % 2 === 1 && { backgroundColor: colors.surface + "88" },
        isFull && styles.tableRowFull,
      ]}
    >
      <Text style={[styles.tableName, { flex: 2 }]} numberOfLines={1}>
        {row.name}
      </Text>
      <Text style={[styles.tableSize, styles.colRight]}>
        {formatBytes(row.sizeBytes)}
      </Text>
      <Text style={[styles.tableSize, styles.colRight, styles.totalSize]}>
        {formatBytes(row.totalSizeBytes)}
      </Text>
      {hasDetail && (
        <Text
          style={[
            styles.tableSize,
            styles.colRight,
            detail && detail.bytesBefore > detail.bytesAfter
              ? styles.savedPositive
              : styles.savedNeutral,
          ]}
        >
          {detail
            ? formatSaved(detail.bytesBefore, detail.bytesAfter)
            : "—"}
        </Text>
      )}
      {hasDetail && (
        <View style={styles.colMode}>
          {detail ? (
            detail.mode ? (
              <View style={[
                styles.modeBadge,
                isFull ? styles.modeBadgeFull : styles.modeBadgeAnalyze,
              ]}>
                <Text style={[
                  styles.modeBadgeText,
                  isFull ? styles.modeBadgeTextFull : styles.modeBadgeTextAnalyze,
                ]}>
                  {isFull ? "FULL" : "ANALYZE"}
                </Text>
                {detail.bloatRatio !== undefined && (
                  <Text style={[
                    styles.bloatText,
                    isFull ? styles.bloatTextFull : styles.bloatTextAnalyze,
                  ]}>
                    {(detail.bloatRatio * 100).toFixed(1)}%
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.savedNeutral}>—</Text>
            )
          ) : (
            <Text style={styles.savedNeutral}>—</Text>
          )}
        </View>
      )}
    </View>
  );
}
