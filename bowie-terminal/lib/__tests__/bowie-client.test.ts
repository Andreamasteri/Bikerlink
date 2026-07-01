import { describe, it, expect, vi, beforeEach } from "vitest";

// Il modulo importa `expo/fetch` a livello di file: lo mockiamo prima di
// importare bowie-client così sendMessage usa il nostro finto stream.
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));

import { fetch as expoFetch } from "expo/fetch";
import { sendMessage, SessionExpiredError, type StreamCallbacks, type DoneData } from "../bowie-client";

type MockFetch = ReturnType<typeof vi.fn>;
const mockFetch = expoFetch as unknown as MockFetch;

// Costruisce un body SSE finto che restituisce i chunk uno alla volta,
// esattamente come farebbe res.body.getReader() del backend.
function streamResponse(chunks: string[], init?: { status?: number; ok?: boolean; noBody?: boolean }) {
  const encoder = new TextEncoder();
  let i = 0;
  const reader = {
    read: async () => {
      if (i < chunks.length) {
        const value = encoder.encode(chunks[i]);
        i += 1;
        return { done: false, value };
      }
      return { done: true, value: undefined };
    },
  };
  return {
    status: init?.status ?? 200,
    ok: init?.ok ?? true,
    body: init?.noBody ? null : { getReader: () => reader },
  };
}

// Raccoglie tutti i callback in una struttura ispezionabile.
function makeCallbacks() {
  const personas: string[] = [];
  const deltas: string[] = [];
  const dones: DoneData[] = [];
  const errors: { code: number; message: string }[] = [];
  const cbs: StreamCallbacks = {
    onPersona: (p) => personas.push(p),
    onDelta: (t) => deltas.push(t),
    onDone: (d) => dones.push(d),
    onError: (e) => errors.push(e),
  };
  return { cbs, personas, deltas, dones, errors };
}

describe("sendMessage SSE parser", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("instrada persona (stringa), delta e done da eventi ben formati", async () => {
    const chunks = [
      'event: persona\ndata: "bowie"\n\n',
      'event: delta\ndata: {"text":"Ciao "}\n\n',
      'event: delta\ndata: {"text":"biker"}\n\n',
      'event: done\ndata: {"text":"Ciao biker","persona":"bowie"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, personas, deltas, dones, errors } = makeCallbacks();

    await sendMessage("ciao", "tok", cbs);

    expect(personas).toEqual(["bowie"]);
    expect(deltas).toEqual(["Ciao ", "biker"]);
    expect(dones).toHaveLength(1);
    expect(dones[0]).toEqual({ text: "Ciao biker", persona: "bowie" });
    expect(errors).toHaveLength(0);
  });

  it("colora Horus e Ares leggendo la persona come stringa nuda", async () => {
    const chunks = [
      'event: persona\ndata: "horus"\n\n',
      'event: delta\ndata: {"text":"rotta pronta"}\n\n',
      'event: done\ndata: {"text":"rotta pronta","persona":"horus"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, personas } = makeCallbacks();

    await sendMessage("percorso", "tok", cbs);

    expect(personas).toEqual(["horus"]);
  });

  it("ricompone eventi divisi a metà tra due chunk di rete", async () => {
    // Il boundary "\n\n" cade a cavallo di due chunk, e il JSON del delta è
    // spezzato in mezzo: il buffer deve ricucirli entrambi.
    const chunks = [
      'event: persona\ndata: "ares"\n',
      '\nevent: delta\ndata: {"text":"attenz',
      'ione strada"}\n\n',
      'event: done\ndata: {"text":"attenzione strada","persona":"ares"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, personas, deltas, dones } = makeCallbacks();

    await sendMessage("sos", "tok", cbs);

    expect(personas).toEqual(["ares"]);
    expect(deltas).toEqual(["attenzione strada"]);
    expect(dones[0].text).toBe("attenzione strada");
  });

  it("gestisce più eventi consegnati in un unico chunk", async () => {
    const chunks = [
      'event: persona\ndata: "bowie"\n\nevent: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\nevent: done\ndata: {"text":"ab"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, personas, deltas, dones } = makeCallbacks();

    await sendMessage("x", "tok", cbs);

    expect(personas).toEqual(["bowie"]);
    expect(deltas).toEqual(["a", "b"]);
    expect(dones[0].text).toBe("ab");
  });

  it("propaga il rifiuto di sicurezza tramite done securityBlocked", async () => {
    const chunks = [
      'event: persona\ndata: "ares"\n\n',
      'event: done\ndata: {"text":"Non posso aiutarti con questo.","securityBlocked":true,"persona":"ares"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, personas, deltas, dones, errors } = makeCallbacks();

    await sendMessage("richiesta bloccata", "tok", cbs);

    expect(personas).toEqual(["ares"]);
    expect(deltas).toHaveLength(0);
    expect(dones).toHaveLength(1);
    expect(dones[0].securityBlocked).toBe(true);
    expect(dones[0].text).toBe("Non posso aiutarti con questo.");
    expect(errors).toHaveLength(0);
  });

  it("instrada l'evento error con code e message", async () => {
    const chunks = ['event: error\ndata: {"code":503,"message":"Servizio non disponibile"}\n\n'];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, errors } = makeCallbacks();

    await sendMessage("boom", "tok", cbs);

    expect(errors).toEqual([{ code: 503, message: "Servizio non disponibile" }]);
  });

  it("ignora eventi sconosciuti (es. action) senza toccare gli altri callback", async () => {
    const chunks = [
      'event: action\ndata: {"type":"navigate"}\n\n',
      'event: delta\ndata: {"text":"ok"}\n\n',
      'event: done\ndata: {"text":"ok"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, deltas, dones, errors } = makeCallbacks();

    await sendMessage("x", "tok", cbs);

    expect(deltas).toEqual(["ok"]);
    expect(dones).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it("scarta data non-JSON senza lanciare né notificare", async () => {
    const chunks = [
      "event: delta\ndata: non-json\n\n",
      'event: delta\ndata: {"text":"valido"}\n\n',
      'event: done\ndata: {"text":"valido"}\n\n',
    ];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, deltas, dones, errors } = makeCallbacks();

    await sendMessage("x", "tok", cbs);

    expect(deltas).toEqual(["valido"]);
    expect(dones).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it("non emette l'ultimo evento se non è chiuso da una riga vuota", async () => {
    // Senza il "\n\n" finale l'evento resta nel buffer e non viene consegnato.
    const chunks = ['event: delta\ndata: {"text":"tronco"}'];
    mockFetch.mockResolvedValue(streamResponse(chunks));
    const { cbs, deltas } = makeCallbacks();

    await sendMessage("x", "tok", cbs);

    expect(deltas).toHaveLength(0);
  });

  it("lancia SessionExpiredError su 401 e 403", async () => {
    mockFetch.mockResolvedValue(streamResponse([], { status: 401, ok: false, noBody: true }));
    await expect(sendMessage("x", "tok", makeCallbacks().cbs)).rejects.toBeInstanceOf(SessionExpiredError);

    mockFetch.mockResolvedValue(streamResponse([], { status: 403, ok: false, noBody: true }));
    await expect(sendMessage("x", "tok", makeCallbacks().cbs)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("notifica onError e non lancia quando la risposta non è ok", async () => {
    mockFetch.mockResolvedValue(streamResponse([], { status: 500, ok: false, noBody: true }));
    const { cbs, errors } = makeCallbacks();

    await sendMessage("x", "tok", cbs);

    expect(errors).toEqual([{ code: 500, message: "Errore server (500)" }]);
  });
});
