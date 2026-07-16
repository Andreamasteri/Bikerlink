/**
 * Raccolta sorgenti esterne per il triage Horus di BikerLink.
 *
 * Esporta:
 *   - collectGitHub()        — Issues (label bug) + Actions runs falliti
 *   - collectSentry()        — Issue non risolti su Sentry EU
 *   - collectGitHubRepoTree() — Albero ricorsivo del repo (path + tipo)
 *
 * Tutte le funzioni degradano con grazia: se i token mancano o l'API non
 * risponde, restituiscono `skipped: true` o testo di errore inline.
 */

const GITHUB_REPO = "Andreamasteri/Bikerlink";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface GitHubSection {
  title: string;
  text: string;
}

export interface SentrySection {
  title: string;
  text: string;
}

// ─── GitHub Issues + Actions ──────────────────────────────────────────────────

export async function collectGitHub(): Promise<{
  sections: GitHubSection[];
  skipped: boolean;
  reason?: string;
}> {
  const token =
    process.env.GITHUB_TOKEN?.trim() || process.env.DIAG_GITHUB_TOKEN?.trim();

  if (!token) {
    return { sections: [], skipped: true, reason: "GITHUB_TOKEN e DIAG_GITHUB_TOKEN non impostati" };
  }

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BikerLink-LogAnalysis/1.0",
  };

  const sections: GitHubSection[] = [];

  // Issues con label bug
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?labels=bug&state=open&per_page=10`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      type Issue = { number: number; title: string; body?: string | null; created_at: string };
      const issues = (await res.json()) as Issue[];
      sections.push({
        title: "GitHub Issues aperti (label: bug)",
        text: issues.length === 0
          ? "(nessun issue aperto con label bug)"
          : issues.map((iss) =>
              `#${iss.number} [${iss.created_at.slice(0, 10)}] ${iss.title}\n${
                iss.body ? "  " + iss.body.slice(0, 300).replace(/\n/g, " ") : ""
              }`,
            ).join("\n\n"),
      });
    } else {
      sections.push({ title: "GitHub Issues aperti (label: bug)", text: `[HTTP ${res.status}]` });
    }
  } catch (err) {
    sections.push({ title: "GitHub Issues aperti (label: bug)", text: `[ERRORE: ${String(err)}]` });
  }

  // Workflow run falliti
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?status=failure&per_page=10`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      type WorkflowRun = { id: number; name: string; head_branch: string; created_at: string; html_url: string; conclusion: string };
      const data = (await res.json()) as { workflow_runs: WorkflowRun[] };
      const runs = data.workflow_runs ?? [];
      sections.push({
        title: "GitHub Actions — run falliti (ultimi 10)",
        text: runs.length === 0
          ? "(nessun workflow fallito recente)"
          : runs.map((r) =>
              `[${r.created_at.slice(0, 16)}] ${r.name} (branch: ${r.head_branch}) — ${r.conclusion}\n  ${r.html_url}`,
            ).join("\n\n"),
      });
    } else {
      sections.push({ title: "GitHub Actions — run falliti (ultimi 10)", text: `[HTTP ${res.status}]` });
    }
  } catch (err) {
    sections.push({ title: "GitHub Actions — run falliti (ultimi 10)", text: `[ERRORE: ${String(err)}]` });
  }

  return { sections, skipped: false };
}

// ─── Sentry ───────────────────────────────────────────────────────────────────

export async function collectSentry(): Promise<{
  sections: SentrySection[];
  skipped: boolean;
  reason?: string;
}> {
  const authToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const baseUrl = process.env.SENTRY_BASE_URL?.trim() || "https://de.sentry.io/api/0";

  const missing: string[] = [];
  if (!authToken) missing.push("SENTRY_AUTH_TOKEN");
  if (!org) missing.push("SENTRY_ORG");
  if (!project) missing.push("SENTRY_PROJECT");
  if (missing.length > 0) {
    return { sections: [], skipped: true, reason: `Secret mancanti: ${missing.join(", ")}` };
  }

  const sections: SentrySection[] = [];
  try {
    const res = await fetch(
      `${baseUrl}/projects/${org}/${project}/issues/?is_unresolved=1&limit=20`,
      {
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.ok) {
      type SentryIssue = { id: string; title: string; culprit?: string; count: string; lastSeen: string; level: string };
      const issues = (await res.json()) as SentryIssue[];
      sections.push({
        title: "Sentry — issue non risolti (ultimi 20)",
        text: issues.length === 0
          ? "(nessun issue non risolto su Sentry)"
          : issues.map((iss) =>
              `[${iss.level.toUpperCase()}] ${iss.title}\n  Culprit: ${iss.culprit ?? "?"} | Count: ${iss.count} | LastSeen: ${iss.lastSeen?.slice(0, 16) ?? "?"}`,
            ).join("\n\n"),
      });
    } else {
      const body = await res.text().catch(() => "");
      sections.push({ title: "Sentry — issue non risolti", text: `[HTTP ${res.status} — ${body.slice(0, 300)}]` });
    }
  } catch (err) {
    sections.push({ title: "Sentry — issue non risolti", text: `[ERRORE: ${String(err)}]` });
  }

  return { sections, skipped: false };
}

// ─── GitHub Repo Tree ─────────────────────────────────────────────────────────

/** Massimo numero di entry dell'albero da includere nel bundle (evita saturazione contesto). */
const MAX_TREE_ENTRIES = 800;

/**
 * Recupera l'albero ricorsivo del repo GitHub (`HEAD`) e lo restituisce come
 * testo compatto `path (tipo)` riga per riga, troncato a MAX_TREE_ENTRIES entry.
 * Se il token manca o la chiamata fallisce, restituisce null (skip graceful).
 */
export async function collectGitHubRepoTree(): Promise<string | null> {
  const token =
    process.env.GITHUB_TOKEN?.trim() || process.env.DIAG_GITHUB_TOKEN?.trim();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "BikerLink-LogAnalysis/1.0",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) return null;

    type TreeItem = { path: string; type: string };
    const data = (await res.json()) as { tree: TreeItem[]; truncated?: boolean };
    const tree = data.tree ?? [];

    const lines = tree.slice(0, MAX_TREE_ENTRIES).map((item) => `${item.path} (${item.type})`);

    const suffix = tree.length > MAX_TREE_ENTRIES
      ? `\n[… troncato: ${tree.length - MAX_TREE_ENTRIES} entry omesse su ${tree.length} totali]`
      : data.truncated
        ? "\n[… albero troncato dall'API GitHub (repo molto grande)]"
        : "";

    return lines.join("\n") + suffix;
  } catch {
    return null;
  }
}
