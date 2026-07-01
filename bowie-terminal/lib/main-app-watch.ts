// Task #5298 — algoritmo baseline/ack per l'auto-chiusura del Bowie Terminal
// standalone quando l'utente apre l'app PRINCIPALE BikerLink.
//
// Perché baseline/ack e non "valore != null → chiudi":
//   l'app principale scrive users.lastMainAppForegroundAt anche PRIMA che Bowie
//   venga aperto. Se il terminale reagisse a un valore semplicemente presente,
//   si auto-chiuderebbe subito dopo il login (falso positivo). Invece:
//     1) la PRIMA lettura dopo boot/login registra il valore come "baseline"
//        e NON agisce (qualunque sia — anche non-null).
//     2) si agisce SOLO quando una lettura successiva mostra un valore DIVERSO
//        dalla baseline: significa che l'app principale è stata aperta DOPO che
//        Bowie era già in esecuzione.
//   Una volta scattato, lo stato resta "triggered" e non riparte (idempotente).
//
// Puro e senza dipendenze: testabile in isolamento (vedi __tests__).

export interface WatchState {
  // Ultimo valore osservato del segnale (timestamp ISO o null).
  baseline: string | null;
  // true dopo la prima lettura (baseline registrata).
  initialized: boolean;
  // true dopo che è stata rilevata un'apertura dell'app principale.
  triggered: boolean;
}

export function createWatchState(): WatchState {
  return { baseline: null, initialized: false, triggered: false };
}

export interface EvaluateResult {
  state: WatchState;
  // true SOLO nel tick in cui va eseguita l'azione di auto-chiusura.
  shouldTrigger: boolean;
}

// Applica una nuova lettura del segnale allo stato corrente.
// `value` è il valore letto dal server (users.lastMainAppForegroundAt): un
// timestamp ISO oppure null se l'app principale non è mai stata aperta.
export function evaluateSignal(state: WatchState, value: string | null): EvaluateResult {
  // Prima lettura: registra baseline, nessuna azione (evita falsi positivi
  // subito dopo il login del terminale).
  if (!state.initialized) {
    return {
      state: { baseline: value, initialized: true, triggered: false },
      shouldTrigger: false,
    };
  }

  // Già scattato: idempotente, non riparte.
  if (state.triggered) {
    return { state, shouldTrigger: false };
  }

  // Il valore è cambiato rispetto alla baseline e non è null → l'app principale
  // è stata aperta dopo l'avvio del terminale.
  if (value != null && value !== state.baseline) {
    return {
      state: { baseline: value, initialized: true, triggered: true },
      shouldTrigger: true,
    };
  }

  // Nessun cambiamento: aggiorna solo la baseline (resta identica) e non agire.
  return { state, shouldTrigger: false };
}
