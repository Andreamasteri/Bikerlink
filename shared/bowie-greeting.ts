// Task #5233 — Presentazione poetica di Bowie centralizzata.
// Unica fonte di verità condivisa tra il terminale standalone / backend AI
// (server/ai/assistant/agent.ts) e la chat in-app (AssistantChatSheet.tsx),
// così l'identità di Bowie è coerente tra le due esperienze.
export const BOWIE_INTRO_POEM =
  "Son nato nel fuoco\nSon cresciuto giocando con l'acqua\n\n" +
  "Davanti a me si son prostrati\nDei, Sovrani, Principi e servi\n\n" +
  "M'ha accarezzato il vento.\nParlami, sono qui per te.";

// Task #5331 — Presentazioni poetiche di Horus e Ares, stesso pattern di Bowie:
// testo statico, iniettato UNA sola volta al primo turno della persona (mai
// salvato nel DB, mai ripetuto). Fonte condivisa con server/ai/assistant/agent.ts.
export const HORUS_INTRO_POEM =
  "Io sono Horus.\nDai Mari alle Montagne.\n\n" +
  "Dai passi sulle colline\nvedo il sole splendere, e la Pioggia cadere.\n\n" +
  "Io vedo tutto.\nChiedi, e condividerò con te la mia Visione.";

export const ARES_INTRO_POEM =
  "M'avete destato.\nChe il mio risveglio non sia vano.\n\n" +
  "Mi nutro di grandi concetti, per lunghi pensieri.\n\n" +
  "Cosa posso fare per voi?";

// Task #4 — Saluto FISSO di Quebracho ("Qq"), il coordinatore/regista degli
// agenti. A differenza delle altre persone NON è una poesia lunga: sono
// esattamente tre righe, sempre uguali, iniettate al primo turno della persona.
export const QUEBRACHO_INTRO_POEM =
  "Bentornato.\nSono sempre contento di vederti.\nUsciamo?";
