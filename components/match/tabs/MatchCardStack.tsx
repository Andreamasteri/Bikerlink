import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { MatchList } from '@/components/match/MatchList';

interface MatchCardStackProps {
  currentList: Record<string, unknown>[];
  renderItem: ({ item }: { item: Record<string, unknown> }) => React.ReactElement;
  isRefetching: boolean;
  onRefresh: () => void;
  isLoading: boolean;
  isServerBusy: boolean;
  activeTab: string;
  getEmptyIcon: () => keyof typeof Ionicons.glyphMap;
  getEmptyTitle: () => string;
  getEmptyDesc: () => string;
}

export const MatchCardStack: React.FC<MatchCardStackProps> = (props) => {
  return (
    <MatchList {...props} />
  );
};
