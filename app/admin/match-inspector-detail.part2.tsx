import React from "react";
import { Text } from "react-native";
import { styles } from "./match-inspector-detail.styles";
import type { MatchTypeSection } from "./match-inspector-detail";
import { MatchTypeCard } from "@/components/admin/match-inspector/MatchTypeCard";

export function MatchTypeSectionsList({
  matchesByType,
  expandedTypes,
  toggleType,
  formatDate,
  statusColor,
  userId,
  nickname
}: {
  matchesByType: MatchTypeSection[];
  expandedTypes: Set<string>;
  toggleType: (typeKey: string) => void;
  formatDate: (iso: string) => string;
  statusColor: (status: string) => string;
  userId: string;
  nickname: string;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{matchesByType.length} Tipi di Match</Text>

      {matchesByType.map((section) => (
        <MatchTypeCard
          key={section.typeKey}
          section={section}
          expanded={expandedTypes.has(section.typeKey)}
          onToggle={() => toggleType(section.typeKey)}
          formatDate={formatDate}
          statusColor={statusColor}
          currentUserId={userId}
          currentNickname={nickname}
        />
      ))}
    </>
  );
}
