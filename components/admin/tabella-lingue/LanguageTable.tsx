import React from "react";
import { View, Text, FlatList, ScrollView, StyleSheet } from "react-native";
import { LanguageRow } from "./LanguageRow";
import {
  TableRow,
  TABLE_LANGS,
  COL_POSITION,
  COL_IT,
  COL_LANG,
  styles,
} from "./types";

interface LanguageTableProps {
  data: TableRow[];
  tableAreaHeight: number;
  recentlySaved: Set<string>;
  onOpenModal: (row: TableRow, lang: { code: string; label: string }) => void;
  onDeleteRow: (key: string) => void;
  headerRowHeight: number;
  activeLangs: Set<string>;
}

export const LanguageTable: React.FC<LanguageTableProps> = ({
  data,
  tableAreaHeight,
  recentlySaved,
  onOpenModal,
  onDeleteRow,
  headerRowHeight,
  activeLangs,
}) => {
  const activeLangList = TABLE_LANGS.filter((l) => activeLangs.has(l.code));
  const totalWidth = COL_POSITION + COL_IT + activeLangList.length * COL_LANG;

  const renderHeader = () => (
    <View style={[styles.tableRow, styles.tableHeaderRow, { width: totalWidth }]}>
      <View style={[styles.tableHeaderCell, { width: COL_POSITION }]}>
        <Text style={styles.tableHeaderText}>Posizione</Text>
      </View>
      <View style={[styles.tableHeaderCell, { width: COL_IT }]}>
        <Text style={styles.tableHeaderText}>Italiano</Text>
      </View>
      {activeLangList.map((l) => (
        <View key={l.code} style={[styles.tableHeaderCell, { width: COL_LANG }]}>
          <Text style={styles.tableHeaderText}>{l.label}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={localStyles.tableScroll}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {renderHeader()}
          {tableAreaHeight > 0 ? (
            <FlatList
              data={data}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <LanguageRow
                  item={item}
                  totalWidth={totalWidth}
                  recentlySaved={recentlySaved}
                  onOpenModal={onOpenModal}
                  onDeleteRow={onDeleteRow}
                  activeLangList={activeLangList}
                />
              )}
              nestedScrollEnabled
              style={{ height: tableAreaHeight - headerRowHeight }}
              initialNumToRender={30}
              maxToRenderPerBatch={20}
              windowSize={10}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  tableScroll: {
    flex: 1,
  },
});
