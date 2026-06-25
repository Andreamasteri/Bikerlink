// LARGE-FILE-ALLOW: file di traduzione — struttura piatta inevitabile, una chiave per riga
import aiAssistantIt from "./ai-assistant-it";
import part1 from './it.part1';
import part2 from './it.part2';
import part3 from './it.part3';
import part4 from './it.part4';

const translations = {
  ...aiAssistantIt,
  ...part1,
  ...part2,
  ...part3,
  ...part4,

  "Sezione non disponibile": "Sezione non disponibile",
  "business.notFound": "Attività non trovata",
  "common.back": "Indietro",
  "business.dealer": "Concessionaria",
  "business.venue": "Locale",
  "business.directions": "Indicazioni",
  "business.call": "Chiama",
  "business.event": "Evento",
  "business.website": "Sito web",
  "common.ok": "OK",
  "push.match.title": "Ehi, hai un match! 🔥",
  "push.match.body": "Tocca per vedere chi è",
  "push.zoneProposal.title": "C'è una proposta nella tua zona! 🏍️",
  "push.zoneProposal.body": "Apri BikerLink per scoprirla",
  "push.plannedRouteInvite.title": "Sei stato proposto per un giro! 🏍️",
  "push.plannedRouteInvite.body": "Un percorso compatibile con il tuo stile ti aspetta — apri BikerLink",
  "push.proposalMatch.title": "Hai un nuovo match proposta! 🔥",
  "push.proposalMatch.body": "Una proposta compatibile è stata trovata per il tuo viaggio.",
  "push.proposalZone.title": "Nuova proposta in zona! 🏍️",
  "push.proposalZone.body": "Un biker ha creato una proposta di viaggio vicino a te.",
  "push.drivingStyleChanged.title": "Il tuo stile di guida è cambiato! 🏍️",
  "push.drivingStyleChanged.body": "Scopri come sei evoluto",
};

export default translations;
