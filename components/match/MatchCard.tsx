// Task #2603 — barrel: ri-esporta i componenti splittati in components/match/card/.
// Mantiene retrocompatibilità per i consumer che importano da "@/components/match/MatchCard".
export { getSearchTypeIcon, SEARCH_TYPE_I18N, SUPERMATCH_COLOR } from "./card/constants";
export { GarageMatchCard } from "./card/GarageMatchCard";
export { BikerBikerMatchCard } from "./card/BikerBikerMatchCard";
export { ProposalProfileMatchCard } from "./card/ProposalProfileMatchCard";
export { MatchCardFull } from "./card/MatchCardFull";
