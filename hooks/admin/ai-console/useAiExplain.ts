// Task #2645 — "Spiegami questo": apre la AI Console con un seed context per
// l'entità passata. Espone trigger() + un flag globale (badge FAB) condiviso
// via in-memory store con listener (no context provider, minimal footprint).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";

export interface ExplainTarget {
  type: "report" | "user" | "violation" | "snapshot" | "route" | "match";
  id: string;
  label?: string;
  /** Seed message opzionale; se assente generato da type/label. */
  seed?: string;
  /** Task #2645 — timestamp di trigger: chiave anti-replay per il consumer. */
  at?: number;
}

type Listener = (pending: ExplainTarget | null) => void;
let _pending: ExplainTarget | null = null;
const _listeners = new Set<Listener>();

export function getExplainPending(): ExplainTarget | null { return _pending; }

export function setExplainPending(t: ExplainTarget | null): void {
  _pending = t;
  for (const fn of _listeners) try { fn(_pending); } catch { /* noop */ }
}

export function consumeExplainPending(): ExplainTarget | null {
  const t = _pending;
  if (t) setExplainPending(null);
  return t;
}

export function useExplainPending(): ExplainTarget | null {
  const [val, setVal] = useState<ExplainTarget | null>(_pending);
  useEffect(() => {
    const fn: Listener = (p) => setVal(p);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return val;
}

function defaultSeed(t: ExplainTarget): string {
  const lbl = t.label ? ` "${t.label}"` : "";
  switch (t.type) {
    case "report":     return `Spiegami il report ${t.id}${lbl}. Categoria, severità, motivazione e azioni consigliate.`;
    case "user":       return `Profilo utente ${t.id}${lbl}: storico segnalazioni, ban, segnali sospetti.`;
    case "violation":  return `Spiegami la violazione integrità ${t.id}${lbl}: root cause, blast radius, fix proposto.`;
    case "snapshot":   return `Spiegami lo snapshot watchdog ${t.id}${lbl}: cosa è andato in rosso e perché.`;
    case "route":      return `Analizza il percorso ${t.id}${lbl}: anomalie GPS, performance, problemi noti.`;
    case "match":      return `Spiegami il match ${t.id}${lbl}: scoring, mismatch, regole applicate.`;
  }
}

/** Hook usato da qualsiasi schermata admin per esporre un trigger "Spiegami questo". */
export function useAiExplain(target: ExplainTarget) {
  const router = useRouter();
  const trigger = useCallback(() => {
    const seed = target.seed ?? defaultSeed(target);
    setExplainPending({ ...target, seed, at: Date.now() });
    router.push("/admin/ai-console" as never);
  // check-router-in-effect-deps: safe — router.push chiamato da trigger utente, non da useEffect
  }, [router, target]);
  return { trigger };
}
