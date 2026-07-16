/**
 * Task #175 — Bowie risponde alle domande esatte "dove è il tasto X" dal manuale.
 * Task #188 — Estende SEARCH_MANUAL_RE con i cue UI nelle 6 lingue non-italiane
 *             (en, de, es, fr, el, tr) così Bowie non inventa etichette per utenti
 *             non italofoni.
 *
 * Il manuale generato da Horus (Task #152) include un "Dizionario dell'Interfaccia —
 * Schermata per Schermata" con titoli esatti di schermate, etichette di bottoni,
 * campi e messaggi risolti dall'i18n. Questo test verifica la catena completa:
 *
 *   1. SEARCH_MANUAL_RE riconosce le domande UI ("dove trovo il tasto", "cosa fa
 *      il pulsante") come cue di richiamo semantico → Bowie usa search_manual.
 *
 *   2. Il tool search_manual, quando eseguito con una query UI, restituisce i
 *      frammenti corretti del dizionario dell'interfaccia:
 *        a) Via TC ai-hub (hubPost) — path primario;
 *        b) Via Replit pgvector (searchNadir) — fallback su hub non disponibile;
 *        c) Via Replit pgvector — fallback su hub disponibile ma risposta in errore.
 *
 * Il contenuto del dizionario è sintetizzato da Horus in questa forma:
 *   ### Club
 *   **Bottoni e azioni**: "Partecipa" → ti unisce al club
 *
 * La query "dove trovo il tasto per unirmi al club?" deve ritrovare quel frammento.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock per il modulo storage (richiesto da manual.ts a module-scope, ma non
// usato dalle funzioni pure come chunkManual che testiamo in Suite 5).
// ---------------------------------------------------------------------------
vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(),
    upsertAppSetting: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Frammento di dizionario dell'interfaccia sintetizzato da Horus (Task #152).
// Contiene etichette di bottone ESATTE come le produce buildManualLexiconPrompt.
// ---------------------------------------------------------------------------
const DICT_FRAGMENT = [
  "### Club",
  '**Percorso di accesso**: tab "Proposte" → sezione "Club"',
  '**Titolo visualizzato**: "Club"',
  '**Bottoni e azioni**: "Partecipa" → ti unisce al club; "Azzera" → resetta i filtri attivi',
  '**Messaggi**: "Sei già membro di questo club" se già iscritto',
].join("\n");

const RESET_FRAGMENT = [
  "### Filtra Percorsi",
  '**Bottoni e azioni**: "Azzera" → cancella tutti i filtri applicati e ricarica l\'elenco',
].join("\n");

// ---------------------------------------------------------------------------
// Mock hoisted — creati prima delle factory vi.mock()
// ---------------------------------------------------------------------------

const hubMocks = vi.hoisted(() => ({
  isHubAvailable: vi.fn(() => true),
  hubPost: vi.fn(),
}));

const nadirMocks = vi.hoisted(() => ({
  searchNadir: vi.fn(),
}));

vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: hubMocks.isHubAvailable,
  hubPost: hubMocks.hubPost,
  NADIR_SEARCH_TIMEOUT_MS: 3_500,
}));

vi.mock("../ai/nadir", () => ({
  searchNadir: nadirMocks.searchNadir,
}));

// Dipendenze inter-agente non rilevanti per questo test: mock minimi per evitare
// di caricare i client Ollama/DB all'import.
vi.mock("../ai/assistant/inter-agent", () => ({
  askHorus: vi.fn(),
  askQuebracho: vi.fn(),
  askAres: vi.fn(),
}));
vi.mock("../ai/assistant/horus-memory", () => ({ appendHorusNote: vi.fn() }));
vi.mock("../ai/assistant/task-review", () => ({ reviewTaskPlan: vi.fn() }));

import { buildSearchManualTool } from "../ai/assistant/inter-agent-tools";
import { SEARCH_MANUAL_RE, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS } from "../ai/nadir/constants";
import { chunkManual } from "../ai/nadir/manual";

// ---------------------------------------------------------------------------
// Helper: costruisce il tool e ritorna solo search_manual
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTool(opts: { requesterId?: string; includeAllUsers?: boolean } = {}): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = buildSearchManualTool({ language: "it", ...opts } as any) as Record<string, any>;
  return tools.search_manual;
}

/** Risposta hub ben formata con frammenti del dizionario dell'interfaccia. */
function hubOkResponse(fragments: Array<{ origin: string; text: string; similarity: number }>) {
  return {
    ok: true,
    data: {
      model: "ai-hub:all-minilm",
      fragments,
    },
  };
}

/** Risposta searchNadir ben formata con frammenti del dizionario dell'interfaccia. */
function nadirOkResponse(fragments: Array<{ origin: string; text: string; similarity: number }>) {
  return {
    model: "local:multilingual-e5-small",
    fragments: fragments.map((f) => ({ ...f, entityId: `manual-${f.origin}-1` })),
  };
}

beforeEach(() => {
  hubMocks.isHubAvailable.mockReset().mockReturnValue(true);
  hubMocks.hubPost.mockReset();
  nadirMocks.searchNadir.mockReset();
});

// ---------------------------------------------------------------------------
// Suite 1 — SEARCH_MANUAL_RE cattura i cue UI (Task #175 + Task #188)
// ---------------------------------------------------------------------------

describe("SEARCH_MANUAL_RE — cue UI per domande sull'interfaccia (Task #175 + Task #188)", () => {
  const MATCHING = [
    // Cue esistenti (non regrediti)
    "cosa ti avevo detto la volta scorsa?",
    "ne avevamo già parlato di questo?",
    "cosa dice il manuale sul routing?",
    "cerca nella knowledge base",
    "cerca per significato nella base di conoscenza",
    // Nuovi cue UI italiani (Task #175)
    "dove trovo il tasto per unirmi al club?",
    "dove trovate il tasto per confermare?",
    "cosa fa il pulsante Azzera?",
    "a cosa serve il pulsante Filtri?",
    "cosa fa questo bottone?",
    "dove sono i bottoni di navigazione?",
    "dov'è il tasto per cancellare?",
    // English (Task #188)
    "where is the join button?",
    "what does the reset button do?",
    "I can't find the button to confirm",
    // German (Task #188)
    "wo ist der Knopf zum Beitreten?",
    "was macht der Knopf Azzera?",
    "wo ist der Taste zum Bestätigen?",
    "was macht die Schaltfläche Filter?",
    // Spanish (Task #188)
    "¿dónde está el botón para unirse al club?",
    "¿qué hace el botón Azzera?",
    "no encuentro el botón de confirmar",
    "dónde está el botón de filtros",
    // French (Task #188)
    "où est le bouton pour rejoindre?",
    "que fait le bouton Azzera?",
    "je ne trouve pas le bouton de confirmation",
    // Greek (Task #188)
    "πού είναι το κουμπί για ένταξη;",
    "τι κάνει το κουμπί Azzera;",
    "δεν βρίσκω το κουμπί επιβεβαίωσης",
    // Turkish (Task #188)
    "katılmak için düğme nerede?",
    "düğme ne yapar?",
    "Azzera tuşu ne işe yarar?",
    "filtreleme düğmesi nerede var?",
  ];

  const NOT_MATCHING = [
    "ciao, come va?",
    "che tempo fa?",
    "dammi un aggiornamento generale",
    "quali sono i percorsi consigliati in Toscana?",
    "quanti utenti ci sono online?",
  ];

  for (const msg of MATCHING) {
    it(`corrisponde: "${msg}"`, () => {
      expect(SEARCH_MANUAL_RE.test(msg)).toBe(true);
    });
  }

  for (const msg of NOT_MATCHING) {
    it(`non corrisponde: "${msg}"`, () => {
      expect(SEARCH_MANUAL_RE.test(msg)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2 — search_manual ritorna il dizionario dell'interfaccia via hub
// ---------------------------------------------------------------------------

describe("search_manual — dizionario interfaccia via TC ai-hub (path primario)", () => {
  it("ritorna l'entry 'Partecipa' dal dizionario quando chiesto 'dove trovo il tasto per unirmi al club?'", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.93 }]),
    );
    const tool = buildTool({ requesterId: "user-42" });

    const res = await tool.execute(
      { query: "dove trovo il tasto per unirmi al club?", limit: 5 },
      {},
    );

    // Usa il path hub
    expect(hubMocks.hubPost).toHaveBeenCalledWith("/nadir/search", {
      query: "dove trovo il tasto per unirmi al club?",
      limit: 5,
      language: "it",
    }, 3_500);
    expect(nadirMocks.searchNadir).not.toHaveBeenCalled();

    // Il risultato contiene il frammento con l'etichetta esatta "Partecipa"
    expect(res.ok).toBe(true);
    expect(res.model).toBe("ai-hub:all-minilm");
    expect(res.fragments).toHaveLength(1);
    expect(res.fragments[0].text).toContain("Partecipa");
    expect(res.fragments[0].text).toContain("ti unisce al club");
    expect(res.fragments[0].origin).toBe("manual");
    expect(res.fragments[0].similarity).toBeCloseTo(0.93, 2);
  });

  it("ritorna l'entry 'Azzera' dal dizionario quando chiesto 'cosa fa il pulsante Azzera?'", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([
        { origin: "manual", text: DICT_FRAGMENT, similarity: 0.95 },
        { origin: "manual", text: RESET_FRAGMENT, similarity: 0.91 },
      ]),
    );
    const tool = buildTool({ requesterId: "user-99" });

    const res = await tool.execute({ query: "cosa fa il pulsante Azzera?", limit: 5 }, {});

    expect(hubMocks.hubPost).toHaveBeenCalledWith("/nadir/search", {
      query: "cosa fa il pulsante Azzera?",
      limit: 5,
      language: "it",
    }, 3_500);
    expect(res.ok).toBe(true);
    // Entrambi i frammenti del dizionario che menzionano "Azzera" sono restituiti
    const texts = res.fragments.map((f: { text: string }) => f.text).join(" ");
    expect(texts).toContain("Azzera");
    expect(res.fragments.length).toBe(2);
  });

  it("passa il parametro language all'hub per filtrare i frammenti nella lingua dell'utente", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.88 }]),
    );
    // Tool costruito per un utente in lingua inglese
    const tools = buildSearchManualTool({ language: "en", requesterId: "user-en" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (tools as Record<string, any>).search_manual;

    await tool.execute({ query: "where is the join button?", limit: 3 }, {});

    expect(hubMocks.hubPost).toHaveBeenCalledWith("/nadir/search", {
      query: "where is the join button?",
      limit: 3,
      language: "en",
    }, 3_500);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — search_manual ritorna il dizionario via pgvector fallback
// ---------------------------------------------------------------------------

describe("search_manual — dizionario interfaccia via Replit pgvector (fallback)", () => {
  it("fallback quando hub non disponibile: restituisce frammenti del dizionario da searchNadir", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    nadirMocks.searchNadir.mockResolvedValue(
      nadirOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.87 }]),
    );
    const tool = buildTool({ requesterId: "user-fallback" });

    const res = await tool.execute(
      { query: "dove trovo il tasto per unirmi al club?", limit: 5 },
      {},
    );

    // Hub non chiamato, searchNadir chiamato
    expect(hubMocks.hubPost).not.toHaveBeenCalled();
    expect(nadirMocks.searchNadir).toHaveBeenCalledTimes(1);
    expect(nadirMocks.searchNadir).toHaveBeenCalledWith(
      "dove trovo il tasto per unirmi al club?",
      5,
      expect.objectContaining({ requesterId: "user-fallback", language: "it" }),
    );

    expect(res.ok).toBe(true);
    expect(res.model).toBe("local:multilingual-e5-small");
    expect(res.fragments[0].text).toContain("Partecipa");
    expect(res.fragments[0].origin).toBe("manual");
  });

  it("fallback su errore hub: restituisce frammenti del dizionario da searchNadir", async () => {
    hubMocks.hubPost.mockResolvedValue({ ok: false, error: "timeout" });
    nadirMocks.searchNadir.mockResolvedValue(
      nadirOkResponse([
        { origin: "manual", text: RESET_FRAGMENT, similarity: 0.82 },
        { origin: "manual", text: DICT_FRAGMENT, similarity: 0.79 },
      ]),
    );
    const tool = buildTool({ requesterId: "user-err" });

    const res = await tool.execute({ query: "cosa fa il pulsante Azzera?", limit: 5 }, {});

    expect(hubMocks.hubPost).toHaveBeenCalledTimes(1);
    expect(nadirMocks.searchNadir).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.fragments).toHaveLength(2);
    const texts = res.fragments.map((f: { text: string }) => f.text).join(" ");
    expect(texts).toContain("Azzera");
    expect(texts).toContain("Partecipa");
  });

  it("fallback: scoping utente corretto — requesterId passato a searchNadir, non admin", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    nadirMocks.searchNadir.mockResolvedValue(
      nadirOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.85 }]),
    );
    const tool = buildTool({ requesterId: "user-scoped", includeAllUsers: false });

    await tool.execute({ query: "dove trovo il tasto per i filtri?", limit: 5 }, {});

    expect(nadirMocks.searchNadir).toHaveBeenCalledWith(
      expect.any(String),
      5,
      expect.objectContaining({ requesterId: "user-scoped", includeAllUsers: false }),
    );
  });

  it("fallback admin: includeAllUsers=true passato a searchNadir", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    nadirMocks.searchNadir.mockResolvedValue(
      nadirOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.9 }]),
    );
    const tool = buildTool({ requesterId: "admin-1", includeAllUsers: true });

    await tool.execute({ query: "dove trovo il bottone Partecipa?", limit: 5 }, {});

    expect(nadirMocks.searchNadir).toHaveBeenCalledWith(
      expect.any(String),
      5,
      expect.objectContaining({ includeAllUsers: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Formato frammenti: i testi del dizionario passano intatti
// ---------------------------------------------------------------------------

describe("search_manual — integrità del testo del dizionario nei frammenti restituiti", () => {
  it("il testo del frammento contiene le etichette esatte di bottoni tra virgolette", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.94 }]),
    );
    const tool = buildTool();
    const res = await tool.execute({ query: "dove trovo il tasto per unirmi al club?", limit: 5 }, {});

    const text: string = res.fragments[0].text;
    // Etichette tra virgolette doppie come le produce buildManualLexiconPrompt
    expect(text).toContain('"Partecipa"');
    expect(text).toContain('"Azzera"');
    // Schermata con il nome esatto
    expect(text).toContain("### Club");
  });

  it("similarity è un numero con al più 4 decimali (arrotondato come da tool)", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.923456789 }]),
    );
    const tool = buildTool();
    const res = await tool.execute({ query: "cosa fa il pulsante Azzera?", limit: 1 }, {});

    const sim: number = res.fragments[0].similarity;
    // Il tool arrotonda a 4 decimali
    expect(sim).toBe(0.9235);
  });

  it("origin='manual' è preservato intatto nel frammento restituito", async () => {
    hubMocks.hubPost.mockResolvedValue(
      hubOkResponse([{ origin: "manual", text: DICT_FRAGMENT, similarity: 0.9 }]),
    );
    const tool = buildTool();
    const res = await tool.execute({ query: "dove trovo il bottone per filtrare?", limit: 1 }, {});

    expect(res.fragments[0].origin).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — chunkManual produce un chunk per sezione del Dizionario
//           dell'Interfaccia (Task #187)
//
// Verifica che le sezioni ### del Dizionario, separate da righe vuote e
// ciascuna sotto MANUAL_CHUNK_SIZE, non vengano mai fuse insieme. Se due
// sezioni finissero in un unico chunk, una query su "Partecipa" (Club)
// restituirebbe anche contenuto di "Mappa" o "Filtri", riducendo la precisione
// con cui Bowie può identificare la schermata giusta.
// ---------------------------------------------------------------------------

describe("chunkManual — sezioni Dizionario dell'Interfaccia in chunk separati (Task #187)", () => {
  /**
   * Dizionario realistico con 3 sezioni schermata, ognuna sotto
   * MANUAL_CHUNK_SIZE (600 car). Le sezioni sono separate da una riga vuota,
   * come le genera Horus con buildManualLexiconPrompt.
   */
  const DIZIONARIO = [
    "### Club",
    '**Percorso di accesso**: tab "Proposte" → sezione "Club"',
    '**Titolo visualizzato**: "Club"',
    '**Bottoni e azioni**: "Partecipa" → ti unisce al club; "Azzera" → resetta i filtri attivi',
    '**Messaggi**: "Sei già membro di questo club" se già iscritto',
    "",
    "### Mappa",
    '**Percorso di accesso**: tab "Mappa"',
    '**Titolo visualizzato**: "Mappa"',
    '**Bottoni e azioni**: "Centra" → centra la mappa sulla posizione attuale; "Segnala" → apre il form hazard',
    '**Messaggi**: "Posizione non disponibile" se GPS spento',
    "",
    "### Filtri Percorsi",
    '**Percorso di accesso**: schermata "Percorsi" → icona filtro',
    '**Titolo visualizzato**: "Filtra Percorsi"',
    '**Bottoni e azioni**: "Azzera" → cancella tutti i filtri; "Applica" → esegue la ricerca filtrata',
    '**Messaggi**: "Nessun percorso trovato" se i filtri escludono tutto',
  ].join("\n");

  it("ogni sezione è sotto MANUAL_CHUNK_SIZE — precondizione del test", () => {
    const sections = DIZIONARIO.split(/\n\s*\n/);
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      expect(section.length).toBeLessThan(MANUAL_CHUNK_SIZE);
    }
  });

  it("produce esattamente un chunk per sezione schermata", () => {
    const chunks = chunkManual(DIZIONARIO, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    expect(chunks).toHaveLength(3);
  });

  it("il chunk Club contiene solo il contenuto di Club — non quello di Mappa o Filtri", () => {
    const chunks = chunkManual(DIZIONARIO, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    const clubChunk = chunks.find((c) => c.includes("### Club"));
    expect(clubChunk).toBeDefined();
    expect(clubChunk).toContain("Partecipa");
    expect(clubChunk).not.toContain("### Mappa");
    expect(clubChunk).not.toContain("### Filtri");
    expect(clubChunk).not.toContain("Centra");
    expect(clubChunk).not.toContain("Applica");
  });

  it("il chunk Mappa contiene solo il contenuto di Mappa — non quello di Club o Filtri", () => {
    const chunks = chunkManual(DIZIONARIO, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    const mappaChunk = chunks.find((c) => c.includes("### Mappa"));
    expect(mappaChunk).toBeDefined();
    expect(mappaChunk).toContain("Centra");
    expect(mappaChunk).toContain("Segnala");
    expect(mappaChunk).not.toContain("### Club");
    expect(mappaChunk).not.toContain("### Filtri");
    expect(mappaChunk).not.toContain("Partecipa");
    expect(mappaChunk).not.toContain("Applica");
  });

  it("il chunk Filtri contiene solo il contenuto di Filtri — non quello di Club o Mappa", () => {
    const chunks = chunkManual(DIZIONARIO, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    const filtriChunk = chunks.find((c) => c.includes("### Filtri"));
    expect(filtriChunk).toBeDefined();
    expect(filtriChunk).toContain("Azzera");
    expect(filtriChunk).toContain("Applica");
    expect(filtriChunk).not.toContain("### Club");
    expect(filtriChunk).not.toContain("### Mappa");
    expect(filtriChunk).not.toContain("Partecipa");
    expect(filtriChunk).not.toContain("Centra");
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — chunkManual: sezione Dizionario singola più lunga di MANUAL_CHUNK_SIZE
//           (Task #195)
//
// Verifica che quando una sezione "### Schermata" supera MANUAL_CHUNK_SIZE
// (per via di molti bottoni/campi), chunkManual non la tagli a un confine
// di byte arbitrario (che può cadere a metà di un'etichetta tra virgolette o
// a metà di una parola). Il comportamento atteso è:
//
//   1. Lo split avviene su un confine \n### (sezione interna) se presente,
//      oppure sul più vicino \n prima del limite, mai nel mezzo di una riga.
//   2. Il primo chunk contiene l'intestazione ### della sezione.
//   3. Nessun dato viene perso: la somma dei chunk copre l'intero testo.
// ---------------------------------------------------------------------------

describe("chunkManual — sezione Dizionario singola più lunga di MANUAL_CHUNK_SIZE (Task #195)", () => {
  /**
   * Sezione Dizionario realistica di una schermata con molti bottoni e messaggi,
   * senza righe vuote interne → un unico paragrafo per chunkManual.
   * Supera di poco MANUAL_CHUNK_SIZE in modo da produrre esattamente 2 chunk.
   */
  const LONG_SECTION = [
    "### Profilo Avanzato",
    '**Percorso di accesso**: tab "Impostazioni" → voce "Il mio profilo"',
    '**Titolo visualizzato**: "Profilo Avanzato"',
    '**Bottoni e azioni**: "Salva modifiche" → persiste nome, bio e foto; "Annulla" → scarta le modifiche non salvate; "Elimina foto" → rimuove la foto profilo corrente; "Cambia email" → apre il modulo di modifica email con verifica; "Cambia password" → apre il modulo di modifica password con conferma',
    '**Campi**: "Nome visualizzato" (testo libero, max 40 car.); "Bio" (testo libero, max 200 car.); "Email" (sola lettura, modificabile via "Cambia email"); "Foto profilo" (immagine, tocca per sostituire)',
    '**Messaggi**: "Profilo aggiornato con successo" dopo salvataggio; "Email già in uso" se l\'indirizzo è già registrato da un altro account; "Password troppo corta" se inferiore a 8 caratteri; "Le password non coincidono" se la conferma non combacia',
  ].join("\n");

  it("precondizione: la sezione supera MANUAL_CHUNK_SIZE", () => {
    expect(LONG_SECTION.length).toBeGreaterThan(MANUAL_CHUNK_SIZE);
  });

  it("produce più di un chunk", () => {
    const chunks = chunkManual(LONG_SECTION, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("il primo chunk contiene l'intestazione ### della sezione", () => {
    const chunks = chunkManual(LONG_SECTION, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    expect(chunks[0]).toContain("### Profilo Avanzato");
  });

  it("nessun chunk termina a metà di una riga — ogni split cade su \\n o confine ###", () => {
    const chunks = chunkManual(LONG_SECTION, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    // Ricostruisce il testo combinando i chunk con \n e verifica che ogni
    // giunzione corrisponda a un \n nel testo originale normalizzato.
    const normalized = LONG_SECTION.replace(/\r\n/g, "\n").trim();
    let cursor = 0;
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const pos = normalized.indexOf(chunk, cursor);
      expect(pos).toBeGreaterThanOrEqual(0); // il chunk esiste nel testo originale
      cursor = pos + chunk.length;
      if (idx < chunks.length - 1) {
        // Dopo il chunk (al cursore) deve esserci un \n nel testo originale,
        // non un carattere di mezzo-parola.
        const charAfter = normalized[cursor] ?? "\n";
        expect(charAfter).toBe("\n");
      }
    }
  });

  it("nessun dato viene perso — i chunk coprono l'intero testo della sezione", () => {
    const chunks = chunkManual(LONG_SECTION, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);
    const normalized = LONG_SECTION.replace(/\r\n/g, "\n").trim();
    // Ogni riga del testo originale deve apparire in almeno un chunk
    const lines = normalized.split("\n").filter(Boolean);
    for (const line of lines) {
      const found = chunks.some((c) => c.includes(line));
      expect(found).toBe(true);
    }
  });

  it("sezione con sotto-sezioni ### concatenate senza righe vuote: split sui confini ###", () => {
    // Scenario: Horus genera sezioni concatenate senza blank-line separatrice.
    // chunkManual deve spezzare su \n### piuttosto che a metà di una riga.
    const COMBINED = [
      "### SchermataPrima",
      '**Bottoni e azioni**: "Conferma" → salva la scelta; "Indietro" → torna alla schermata precedente; "Aiuto" → apre il pannello di aiuto contestuale con la spiegazione della funzione attiva',
      '**Messaggi**: "Operazione completata" dopo conferma; "Si è verificato un errore, riprova" in caso di timeout di rete',
      "### SchermataDue",
      '**Bottoni e azioni**: "Invia" → trasmette il modulo compilato al server; "Svuota" → azzera tutti i campi del modulo; "Anteprima" → mostra una preview del contenuto prima dell\'invio definitivo',
      '**Messaggi**: "Modulo inviato" dopo trasmissione; "Campi obbligatori mancanti" se manca almeno un campo richiesto',
    ].join("\n");

    // Precondizione: il testo supera MANUAL_CHUNK_SIZE come unico paragrafo
    expect(COMBINED.length).toBeGreaterThan(MANUAL_CHUNK_SIZE);

    const chunks = chunkManual(COMBINED, MANUAL_CHUNK_SIZE, MANUAL_MAX_CHUNKS);

    // Con split su \n### i due blocchi restano separati
    const primaChunk = chunks.find((c) => c.includes("### SchermataPrima"));
    const dueChunk = chunks.find((c) => c.includes("### SchermataDue"));
    expect(primaChunk).toBeDefined();
    expect(dueChunk).toBeDefined();

    // Ognuno contiene solo il proprio contenuto
    expect(primaChunk).toContain("Conferma");
    expect(primaChunk).not.toContain("### SchermataDue");
    expect(primaChunk).not.toContain("Invia");

    expect(dueChunk).toContain("Invia");
    expect(dueChunk).not.toContain("### SchermataPrima");
    expect(dueChunk).not.toContain("Conferma");
  });
});
