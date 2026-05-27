// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import { Ionicons } from "@expo/vector-icons";

export function getSearchTypeIcon(searchType?: string | null): keyof typeof Ionicons.glyphMap {
  switch (searchType) {
    case "find_a_friend": return "people";
    case "find_a_guest": return "person-add";
    case "hitcher":
    case "hitchhiker": return "car";
    case "find_a_biker": return "bicycle";
    default: return "megaphone";
  }
}

export const SEARCH_TYPE_I18N: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "proposals.searchType.findPassenger",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker"
};

export const TARGET_TYPE_I18N: Record<string, string> = {
  biker: "proposal.targetBiker",
  zavorrina: "proposal.targetZavorrina",
  hitchhiker: "proposal.targetHitchhiker",
  hitcher: "proposal.targetHotcher",
  coppia: "userType.coppia"
};

export function getTargetLabel(types: string[] | null | undefined, t: (k: string) => string): string | null {
  if (!types || types.length === 0) return null;
  return types
    .map((type) => {
      const key = TARGET_TYPE_I18N[type];
      return key ? t(key) : type;
    })
    .filter(Boolean)
    .join(" / ") || null;
}

export function getCompatibilityExplanation(
  myTargets: string[] | null | undefined,
  theirTargets: string[] | null | undefined,
  t: (k: string) => string
): string {
  const mySet = new Set(myTargets ?? []);
  const theirSet = new Set(theirTargets ?? []);

  const isBikerBiker = mySet.has("biker") && theirSet.has("biker");
  const isGarage =
    (mySet.has("zavorrina") && theirSet.has("biker")) ||
    (mySet.has("biker") && theirSet.has("zavorrina"));

  if (isBikerBiker) {
    return t("compatibility.bikerBikerExplanation");
  }
  if (isGarage) {
    return t("compatibility.garageExplanation");
  }
  return t("compatibility.genericExplanation");
}

export const SUPERMATCH_COLOR = "#FF8C00";
