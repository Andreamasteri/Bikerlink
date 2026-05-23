import React from 'react';
import { MatchList } from '@/components/match/MatchList';

interface MatchCardStackProps {
  currentList: any[];
  renderItem: ({ item }: { item: any }) => React.ReactElement;
  isRefetching: boolean;
  onRefresh: () => void;
  isLoading: boolean;
  isServerBusy: boolean;
  activeTab: string;
  getEmptyIcon: () => any;
  getEmptyTitle: () => string;
  getEmptyDesc: () => string;
}

export const MatchCardStack: React.FC<MatchCardStackProps> = (props) => {
  return (
    <MatchList {...props} />
  );
};
