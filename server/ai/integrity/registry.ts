// Task #2537 — Registry famiglie App Integrity.
// Una famiglia = un pack (file) che esporta default IntegrityCheck[].
import type { AppIntegrityCheck, Family } from "./types";
import codePack from "./packs/code";
import apiPack from "./packs/api";
import uiPack from "./packs/ui";
import i18nPack from "./packs/i18n";
import configPack from "./packs/config";
import assetsPack from "./packs/assets";
import depsPack from "./packs/deps";
import envPack from "./packs/env";
import workflowsPack from "./packs/workflows";

const PACKS: Record<Family, AppIntegrityCheck[]> = {
  code: codePack,
  api: apiPack,
  ui: uiPack,
  i18n: i18nPack,
  config: configPack,
  assets: assetsPack,
  deps: depsPack,
  env: envPack,
  workflows: workflowsPack,
};

let cached: AppIntegrityCheck[] | null = null;

export function loadAllChecks(force = false): AppIntegrityCheck[] {
  if (!force && cached) return cached;
  const out: AppIntegrityCheck[] = [];
  for (const pack of Object.values(PACKS)) {
    if (!Array.isArray(pack)) continue;
    for (const c of pack) {
      if (c && typeof c.id === "string" && typeof c.query === "function") out.push(c);
    }
  }
  cached = out;
  return cached;
}

export function loadFamilyChecks(family: Family): AppIntegrityCheck[] {
  return PACKS[family] ?? [];
}

export function invalidateChecksCache(): void { cached = null; }
