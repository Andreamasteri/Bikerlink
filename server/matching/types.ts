import { 
  type matchPreferences 
} from "@shared/db";

export type MatchPrefRow = typeof matchPreferences.$inferSelect;

export interface MatchRule {
  searchType1: string;
  searchType2: string;
}

export interface MatchResult {
  bikerBiker: number;
  zavorrina: number;
}
