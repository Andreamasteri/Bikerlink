import React from "react";
import { SectionErrorState } from "@/components/profile/SectionErrorState";

/**
 * Task #53 — quando GET /api/telemetry/stats fallisce (es. sotto pressione
 * del pool DB), il pannello Telemetria non deve sparire silenziosamente:
 * mostriamo un piccolo stato di errore con retry così l'utente capisce che
 * è un problema temporaneo e non che i suoi dati sono andati persi.
 *
 * Task #82 — la card è ora un componente riutilizzabile (SectionErrorState);
 * questo resta un thin wrapper con il testo specifico della Telemetria.
 */
export function TelemetryErrorState({ onRetry }: { onRetry: () => void }) {
  return <SectionErrorState title="Telemetria non disponibile" onRetry={onRetry} />;
}
