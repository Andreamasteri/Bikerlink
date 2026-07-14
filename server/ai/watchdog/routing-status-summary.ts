// Task #25 — Riepilogo LIVE dello stato dei motori di routing, iniettato nel
// system prompt di Horus quando un admin chatta con lui (modalità admin).
//
// Così, alla domanda "come sta andando il routing?", Horus risponde con dati
// concreti (stato di GraphHopper, Valhalla, Photon + pipeline combinata + problemi
// recenti) invece di risposte generiche. La fonte è la STESSA delle sonde di
// correttezza del watchdog (cache ~4 min, quindi live/fresco) più i problemi
// routing dell'ultimo snapshot dell'aggregator.
import {
  getLastCorrectnessResults,
  runRoutingCorrectnessProbes,
  type CorrectnessProbeResult,
} from "./routing-correctness-probes";
import { getLatestSnapshot } from "./aggregator";
import type { Problem } from "./types";

const ENGINE_LABEL: Record<CorrectnessProbeResult["engine"], string> = {
  graphhopper: "GraphHopper (routing)",
  valhalla: "Valhalla (routing)",
  photon: "Photon (geocoding)",
  pipeline: "Pipeline combinata",
};

function engineLine(r: CorrectnessProbeResult): string {
  const label = ENGINE_LABEL[r.engine] ?? r.engine;
  if (!r.configured) return `- ${label}: non configurato`;
  if (r.skipped) return `- ${label}: sonda saltata (ThinkCentre spento/in manutenzione)`;
  const state = r.ok ? "OK" : "KO";
  const parts: string[] = [];
  if (r.latencyMs != null) parts.push(`${r.latencyMs}ms`);
  if (r.distanceKm != null) parts.push(`${r.distanceKm}km`);
  if (r.durationMin != null) parts.push(`${r.durationMin}min`);
  if (r.reason) parts.push(r.reason);
  const suffix = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  return `- ${label}: ${state}${suffix}`;
}

/** Formatta lo stato routing. Puro (testabile) — riceve sonde e problemi già raccolti. */
export function formatRoutingStatusSummary(
  probes: CorrectnessProbeResult[],
  horusProblems: Problem[],
): string {
  const lines: string[] = ["STATO LIVE DEI MOTORI DI ROUTING (sola lettura, dati correnti):"];
  if (probes.length === 0) {
    lines.push("- Nessuna sonda di correttezza disponibile al momento.");
  } else {
    // Ordine stabile: routing engines, geocoding, pipeline in coda.
    const order: CorrectnessProbeResult["engine"][] = ["graphhopper", "valhalla", "photon", "pipeline"];
    const byEngine = new Map(probes.map((p) => [p.engine, p]));
    for (const eng of order) {
      const r = byEngine.get(eng);
      if (r) lines.push(engineLine(r));
    }
  }

  const routing = horusProblems.filter((p) => p.source === "horus" || p.id.startsWith("horus."));
  if (routing.length > 0) {
    lines.push("");
    lines.push(`Problemi routing/geocoding attivi (${routing.length}):`);
    for (const p of routing.slice(0, 8)) {
      lines.push(`- [${p.severity}] ${p.title}`);
    }
  } else {
    lines.push("");
    lines.push("Nessun problema di routing/geocoding attivo nell'ultimo snapshot.");
  }
  return lines.join("\n");
}

/**
 * Compone il riepilogo routing live da iniettare nel prompt di Horus (admin).
 * Best-effort: se le sonde/lo snapshot non sono disponibili, ritorna comunque una
 * stringa utile (senza mai lanciare) così la chat non si blocca mai.
 */
export async function buildRoutingStatusSummary(): Promise<string> {
  let probes: CorrectnessProbeResult[] = [];
  try {
    // Usa i risultati già cachati (freschi ≤4 min); se non ce ne sono ancora,
    // esegue le sonde una volta (rispetta comunque la cache interna).
    const last = getLastCorrectnessResults();
    probes = last.results.length > 0 ? last.results : await runRoutingCorrectnessProbes();
  } catch {
    probes = [];
  }
  let problems: Problem[] = [];
  try {
    problems = getLatestSnapshot()?.problems ?? [];
  } catch {
    problems = [];
  }
  return formatRoutingStatusSummary(probes, problems);
}
