/**
 * Recupero lista file + download dei contenuti dal repo GitHub BikerLink.
 * Tutto in sola lettura via token GitHub (fine-grained Contents:read).
 */

import path from "path";
import {
  GITHUB_REPO,
  INCLUDE_EXTENSIONS,
  EXCLUDE_PREFIXES,
  RELEVANT_JSON,
  MAX_FILE_BYTES,
  DOWNLOAD_CONCURRENCY,
  type DownloadedFile,
} from "./config";

export function githubToken(): string | null {
  return process.env.DIAG_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BikerLink-Study/1.0",
  };
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

function isRelevantPath(p: string, size: number | undefined): boolean {
  if (EXCLUDE_PREFIXES.some((pre) => p === pre || p.startsWith(pre))) return false;
  if (typeof size === "number" && size > MAX_FILE_BYTES) return false;
  const ext = path.extname(p);
  if (!INCLUDE_EXTENSIONS.includes(ext)) return false;
  if (ext === ".json") {
    const base = path.basename(p);
    if (!RELEVANT_JSON.includes(base)) return false;
  }
  return true;
}

/** Ritorna la lista filtrata e ordinata dei path sorgente del repo. */
export async function fetchFileList(branch: string, token: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub trees ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
  }
  const data = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
  if (data.truncated) {
    console.warn("⚠️  GitHub ha troncato l'albero (repo molto grande): alcuni file potrebbero mancare.");
  }
  const files = (data.tree || [])
    .filter((e) => e.type === "blob" && isRelevantPath(e.path, e.size))
    .map((e) => e.path)
    .sort();
  return files;
}

/** Scarica un singolo file raw da GitHub (base64 decode). null se fallisce. */
async function downloadFile(rel: string, branch: string, token: string): Promise<DownloadedFile | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURI(rel)}?ref=${branch}`;
    const res = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { path: rel, content };
  } catch {
    return null;
  }
}

/**
 * Hard-timeout a livello JS: garantisce che la promise risolva entro `ms`
 * anche se il fetch sottostante resta appeso nella lettura del body (caso in
 * cui AbortSignal.timeout non interrompe lo stream). Restituisce `fallback`.
 */
function withHardTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Scarica tutti i file in batch paralleli ≤ DOWNLOAD_CONCURRENCY. */
export async function downloadAll(
  files: string[],
  branch: string,
  token: string,
): Promise<{ downloaded: DownloadedFile[]; failed: string[] }> {
  const downloaded: DownloadedFile[] = [];
  const failed: string[] = [];
  for (let i = 0; i < files.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = files.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map((f) => withHardTimeout(downloadFile(f, branch, token), 25_000, null)),
    );
    results.forEach((r, idx) => {
      if (r) downloaded.push(r);
      else failed.push(batch[idx]);
    });
    process.stdout.write(`\r  ⬇️  scaricati ${downloaded.length}/${files.length} file...`);
  }
  process.stdout.write("\n");
  return { downloaded, failed };
}
