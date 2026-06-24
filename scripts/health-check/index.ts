// Task #4825 — Registro dei checker disponibili per il Health Check "Scan".
import type { Checker } from "./types";
import { runTypecheck } from "./checkers/typecheck";
import { runLogic } from "./checkers/logic";
import { runKnownErrors } from "./checkers/known-errors";
import { runFilePlacement } from "./checkers/file-placement";
import { runImports } from "./checkers/imports";
import { runDeadCode } from "./checkers/dead-code";

export const CHECKERS: Checker[] = [
  { id: "01-typecheck", label: "TypeScript", category: "typecheck", run: runTypecheck },
  { id: "02-imports", label: "Import rotti", category: "imports", run: runImports },
  { id: "03-logic", label: "Anti-pattern logica", category: "logic", run: runLogic },
  { id: "04-known-errors", label: "Errori noti & crash", category: "known-errors", run: runKnownErrors },
  { id: "05-file-placement", label: "Posizionamento file", category: "file-placement", run: runFilePlacement },
  { id: "06-dead-code", label: "Dead code", category: "dead-code", run: runDeadCode },
];

export const CHECKER_IDS = CHECKERS.map((c) => c.id);

export function getCheckerMeta(): Array<{ id: string; label: string; category: string }> {
  return CHECKERS.map((c) => ({ id: c.id, label: c.label, category: c.category }));
}
