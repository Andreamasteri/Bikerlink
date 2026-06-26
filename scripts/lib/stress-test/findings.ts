/**
 * Motore di rilevamento debolezze e incongruenze (Task #4970).
 *
 * Valuta le regole della sezione "Rilevamento debolezze" del SKILL.md su:
 * latenza (spike + trend), pool (saturazione), errori (clustering per codice),
 * lock/deadlock (pg_stat_activity / pg_locks), query lente, seq scan (EXPLAIN),
 * integrità dati sandbox. Ogni regola produce uno o più Finding con severità,
 * evidenza e raccomandazione.
 *
 * Le soglie sono CENTRALIZZATE in THRESHOLDS: per estendere o ritarare il test
 * basta cambiarle qui (vedi "Come estendere" nel SKILL.md).
 */
import type { Finding, Pool, TickSnapshot } from "./types";
import type { IntegrityResult } from "./sandbox";

/**
 * Soglie ritarate dopo il primo run reale (Task #4975). Le motivazioni complete
 * sono nella sezione "Calibrazione soglie" del SKILL.md. In sintesi: il DB
 * managed Replit ha jitter sub-secondo costante anche a basso carico (run reale:
 * p90≈344ms, p95≈777ms sugli endpoint DB-bound, con blip isolati a 5-11s) e la
 * fase `saturation` (in `all`) satura il pool ~1/4 del tempo PER DESIGN: le
 * soglie iniziali (p99 500/2000, pool 20/50) producevano falsi positivi a ogni
 * tick/run. Sono state alzate per separare il rumore di piattaforma dai segnali
 * reali, e la soglia seq-scan abbassata sotto le dimensioni del seed sandbox.
 */
export const THRESHOLDS = {
  /** p99 (ms) oltre cui un tick è warning / critical. Alzata da 500/2000:
   *  il DB managed tocca regolarmente sub-secondo per jitter normale; 1s separa
   *  la pressione reale dal rumore, 3s sta vicino al statement_timeout (8-10s). */
  p99WarnMs: 1_000,
  p99CriticalMs: 3_000,
  /** error rate aggregato di un tick oltre cui warning / critical. Invariata:
   *  il run reale non ha prodotto una distribuzione di errori DB pulita (i 502
   *  erano app/AI), e i cluster per-codice gestiscono la sfumatura (POOL_TIMEOUT
   *  atteso in saturation). 1%/5% restano una calibrazione standard difendibile. */
  errorRateWarn: 0.01,
  errorRateCritical: 0.05,
  /** % di tick con pool pieno oltre cui warning / critical. Alzata da 20/50:
   *  in `all` la fase saturation (~1/4 del run, pool max=workers/2) riempie il
   *  pool per design; 30/60 tollerano quel quarto e segnalano solo l'eccesso. */
  poolFullPctWarn: 30,
  poolFullPctCritical: 60,
  /** Degradazione % del p99 (ultimo terzo vs primo terzo) oltre cui warning.
   *  Alzata da 50/150: cold-cache iniziale + blip di piattaforma fanno oscillare
   *  la media di un terzo >50% senza degrado reale; 75/200 filtrano il jitter. */
  latencyTrendWarnPct: 75,
  latencyTrendCriticalPct: 200,
  /** Righe stimate oltre cui un Seq Scan in EXPLAIN è sospetto. Abbassata da
   *  5000: i seed sandbox sono embeddings=1000 / spatial=5000, quindi a 5000 la
   *  regola non scattava mai. 2000 sta sopra la tabella embeddings (1000 righe,
   *  dove il planner sceglie legittimamente seq scan → niente falso positivo) e
   *  sotto la spatial (5000), così un GIST inutilizzato viene finalmente colto. */
  seqScanRowsThreshold: 2_000,
} as const;

/** Query read campione su cui girare EXPLAIN per cercare seq scan. */
const EXPLAIN_SAMPLES: { label: string; sql: string }[] = [
  {
    label: "spatial ST_DWithin",
    sql: `SELECT COUNT(*) FROM _stress_spatial
          WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(5, 45), 4326)::geography, 50000)`,
  },
  {
    label: "hnsw similarity",
    sql: `SELECT id FROM _stress_embeddings
          ORDER BY embedding <=> (SELECT embedding FROM _stress_embeddings LIMIT 1)
          LIMIT 10`,
  },
];

export interface LockSample {
  ts: string;
  /** Numero di backend in stato 'active' con wait_event di tipo Lock. */
  lockWaiters: number;
  /** PID bloccati da almeno un altro backend (da pg_locks). */
  blockedPids: number;
  /** Durata massima (s) di una query attiva campionata. */
  maxActiveDurationS: number;
}

/**
 * Campiona lock e contesa via il monitoring pool (max=1, isolato dal pool di
 * test): pg_stat_activity per i waiter e pg_locks per i PID bloccati.
 */
export async function sampleLocks(monPool: Pool): Promise<LockSample> {
  const client = await monPool.connect();
  try {
    const act = await client.query<{ lock_waiters: string; max_dur: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE state = 'active' AND wait_event_type = 'Lock') AS lock_waiters,
        COALESCE(MAX(EXTRACT(EPOCH FROM (now() - query_start)) FILTER (WHERE state = 'active')), 0) AS max_dur
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
    `);
    const blocked = await client.query<{ blocked: string }>(`
      SELECT COUNT(DISTINCT pid) AS blocked
      FROM pg_locks WHERE NOT granted
    `);
    return {
      ts: new Date().toISOString(),
      lockWaiters: Number(act.rows[0]?.lock_waiters ?? 0),
      blockedPids: Number(blocked.rows[0]?.blocked ?? 0),
      maxActiveDurationS: Math.round(Number(act.rows[0]?.max_dur ?? 0)),
    };
  } finally {
    client.release();
  }
}

export interface SeqScanFinding {
  label: string;
  estRows: number;
  planSnippet: string;
}

/**
 * Esegue EXPLAIN (FORMAT JSON) sulle query read campione e segnala Seq Scan su
 * tabelle con molte righe stimate — indizio di indice mancante o non usato.
 */
export async function explainSampleReads(monPool: Pool): Promise<SeqScanFinding[]> {
  const out: SeqScanFinding[] = [];
  const client = await monPool.connect();
  try {
    for (const sample of EXPLAIN_SAMPLES) {
      try {
        const r = await client.query<{ "QUERY PLAN": unknown }>(`EXPLAIN (FORMAT JSON) ${sample.sql}`);
        const plan = (r.rows[0]?.["QUERY PLAN"] as Array<{ Plan: PlanNode }> | undefined)?.[0]?.Plan;
        if (!plan) continue;
        const seq = findSeqScan(plan, THRESHOLDS.seqScanRowsThreshold);
        if (seq) out.push({ label: sample.label, estRows: seq.estRows, planSnippet: seq.nodeType });
      } catch {
        // EXPLAIN può fallire se la tabella sandbox è già stata droppata: ignora.
      }
    }
  } finally {
    client.release();
  }
  return out;
}

interface PlanNode {
  "Node Type"?: string;
  "Plan Rows"?: number;
  Plans?: PlanNode[];
}

function findSeqScan(node: PlanNode, threshold: number): { estRows: number; nodeType: string } | null {
  if (node["Node Type"] === "Seq Scan" && (node["Plan Rows"] ?? 0) >= threshold) {
    return { estRows: node["Plan Rows"] ?? 0, nodeType: node["Node Type"] };
  }
  for (const child of node.Plans ?? []) {
    const found = findSeqScan(child, threshold);
    if (found) return found;
  }
  return null;
}

export interface BuildFindingsInput {
  history: TickSnapshot[];
  totalQueries: number;
  totalErrors: number;
  totalErrorCodes: Record<string, number>;
  lockSamples: LockSample[];
  seqScans: SeqScanFinding[];
  integrity: IntegrityResult | null;
}

/** Compone la lista finale di findings dalle metriche raccolte. */
export function buildFindings(input: BuildFindingsInput): Finding[] {
  const f: Finding[] = [];
  f.push(...latencyFindings(input.history));
  f.push(...latencyTrendFinding(input.history));
  f.push(...poolFindings(input.history));
  f.push(...errorFindings(input.totalQueries, input.totalErrors, input.totalErrorCodes));
  f.push(...lockFindings(input.lockSamples));
  f.push(...seqScanFindings(input.seqScans));
  const integ = integrityFinding(input.integrity);
  if (integ) f.push(integ);
  if (f.length === 0) {
    f.push({
      severity: "info",
      category: "summary",
      description: "Nessuna debolezza rilevata sotto le soglie configurate.",
      evidence: { totalQueries: input.totalQueries, totalErrors: input.totalErrors },
      recommendation: "Il DB ha retto il carico. Valuta di alzare workers/durata per spingere oltre.",
    });
  }
  return f;
}

function latencyFindings(history: TickSnapshot[]): Finding[] {
  const worst = history.reduce<TickSnapshot | null>((acc, t) => (!acc || t.p99Ms > acc.p99Ms ? t : acc), null);
  if (!worst) return [];
  if (worst.p99Ms >= THRESHOLDS.p99CriticalMs) {
    return [{
      severity: "critical",
      category: "latency",
      description: `Spike p99 critico (${worst.p99Ms}ms) nella fase '${worst.phase}'.`,
      evidence: { tick: worst.tick, ts: worst.ts, p99Ms: worst.p99Ms, p95Ms: worst.p95Ms, maxMs: worst.maxMs },
      recommendation: "Indaga le query lente del tick; verifica indici e contesa pool nello stesso intervallo.",
    }];
  }
  if (worst.p99Ms >= THRESHOLDS.p99WarnMs) {
    return [{
      severity: "warn",
      category: "latency",
      description: `p99 elevato (${worst.p99Ms}ms) nella fase '${worst.phase}'.`,
      evidence: { tick: worst.tick, ts: worst.ts, p99Ms: worst.p99Ms },
      recommendation: "Monitora se il p99 peggiora con le ore (vedi trend) prima di intervenire.",
    }];
  }
  return [];
}

function latencyTrendFinding(history: TickSnapshot[]): Finding[] {
  if (history.length < 6) return [];
  const third = Math.floor(history.length / 3);
  const first = avg(history.slice(0, third).map((t) => t.p99Ms));
  const last = avg(history.slice(-third).map((t) => t.p99Ms));
  if (first <= 0) return [];
  const deltaPct = Math.round(((last - first) / first) * 100);
  if (deltaPct >= THRESHOLDS.latencyTrendCriticalPct) {
    return [{
      severity: "critical",
      category: "latency",
      description: `Degradazione latenza nel tempo: p99 +${deltaPct}% (da ${round(first)}ms a ${round(last)}ms).`,
      evidence: { firstThirdP99: round(first), lastThirdP99: round(last), deltaPct },
      recommendation: "Sospetta accumulo (bloat/dead tuples, cache fredda, lock crescenti). Controlla autovacuum.",
    }];
  }
  if (deltaPct >= THRESHOLDS.latencyTrendWarnPct) {
    return [{
      severity: "warn",
      category: "latency",
      description: `Trend di degradazione latenza: p99 +${deltaPct}% nel corso del test.`,
      evidence: { firstThirdP99: round(first), lastThirdP99: round(last), deltaPct },
      recommendation: "Tieni d'occhio bloat e autovacuum; ripeti il test più lungo per confermare.",
    }];
  }
  return [];
}

function poolFindings(history: TickSnapshot[]): Finding[] {
  const fullTicks = history.filter((t) => t.poolFullPct >= 50).length;
  const pctTicks = history.length ? (fullTicks / history.length) * 100 : 0;
  const maxWaiting = history.reduce((m, t) => Math.max(m, t.poolWaiting), 0);
  if (pctTicks >= THRESHOLDS.poolFullPctCritical) {
    return [{
      severity: "critical",
      category: "pool",
      description: `Pool saturo in modo sostenuto: ${round(pctTicks)}% dei tick con pool pieno.`,
      evidence: { saturatedTickPct: round(pctTicks), maxWaiting },
      recommendation: "Riduci la concorrenza dei job o introduci backpressure; il pool è il collo di bottiglia.",
    }];
  }
  if (pctTicks >= THRESHOLDS.poolFullPctWarn || maxWaiting > 0) {
    return [{
      severity: "warn",
      category: "pool",
      description: `Finestre di saturazione pool (${round(pctTicks)}% tick, max ${maxWaiting} in attesa).`,
      evidence: { saturatedTickPct: round(pctTicks), maxWaiting },
      recommendation: "Saturazione transitoria accettabile sotto stress; verifica che non coincida con spike p99.",
    }];
  }
  return [];
}

function errorFindings(total: number, errors: number, codes: Record<string, number>): Finding[] {
  const out: Finding[] = [];
  const rate = total ? errors / total : 0;
  if (rate >= THRESHOLDS.errorRateCritical) {
    out.push({
      severity: "critical",
      category: "errors",
      description: `Error rate complessivo critico: ${(rate * 100).toFixed(2)}% (${errors}/${total}).`,
      evidence: { errorRate: round4(rate), errors, total, codes },
      recommendation: "Cluster di errori sotto carico: vedi i codici dominanti e la sezione lock/timeout.",
    });
  } else if (rate >= THRESHOLDS.errorRateWarn) {
    out.push({
      severity: "warn",
      category: "errors",
      description: `Error rate complessivo elevato: ${(rate * 100).toFixed(2)}%.`,
      evidence: { errorRate: round4(rate), errors, total, codes },
      recommendation: "Identifica il codice dominante; spesso è 57014 (timeout) o POOL_TIMEOUT da saturazione.",
    });
  }
  // Cluster per codice noto problematico.
  const known: Record<string, string> = {
    "40P01": "deadlock_detected — transazioni che si bloccano a vicenda",
    "57014": "statement_timeout — query oltre il limite di tempo",
    "53300": "too_many_connections — esaurite le connessioni del DB",
    POOL_TIMEOUT: "saturazione pool client — connect() in timeout",
  };
  for (const [code, desc] of Object.entries(known)) {
    const n = codes[code] ?? 0;
    if (n > 0) {
      out.push({
        severity: code === "40P01" || code === "53300" ? "critical" : "warn",
        category: "errors",
        description: `Ricorrenza errore ${code}: ${n} occorrenze (${desc}).`,
        evidence: { code, count: n },
        recommendation: recommendForCode(code),
      });
    }
  }
  return out;
}

function recommendForCode(code: string): string {
  switch (code) {
    case "40P01": return "Rivedi l'ordine di acquisizione lock nelle transazioni concorrenti.";
    case "57014": return "Ottimizza/indicizza le query lente o alza statement_timeout solo se giustificato.";
    case "53300": return "Riduci le connessioni concorrenti dei job; il DB managed ha un tetto fisso.";
    case "POOL_TIMEOUT": return "Pool client troppo piccolo per la concorrenza richiesta: applica backpressure.";
    default: return "Indaga il codice errore Postgres corrispondente.";
  }
}

function lockFindings(samples: LockSample[]): Finding[] {
  if (samples.length === 0) return [];
  const maxBlocked = samples.reduce((m, s) => Math.max(m, s.blockedPids), 0);
  const maxWaiters = samples.reduce((m, s) => Math.max(m, s.lockWaiters), 0);
  const maxDur = samples.reduce((m, s) => Math.max(m, s.maxActiveDurationS), 0);
  if (maxBlocked === 0 && maxWaiters === 0) return [];
  return [{
    severity: maxBlocked > 0 ? "warn" : "info",
    category: "lock",
    description: `Contesa lock rilevata: max ${maxBlocked} PID bloccati, ${maxWaiters} in wait su Lock.`,
    evidence: { maxBlockedPids: maxBlocked, maxLockWaiters: maxWaiters, maxActiveDurationS: maxDur },
    recommendation: "Lock waits brevi sono normali sotto write storm; indaga se i PID bloccati persistono.",
  }];
}

function seqScanFindings(seqScans: SeqScanFinding[]): Finding[] {
  return seqScans.map((s) => ({
    severity: "warn" as const,
    category: "index",
    description: `Seq Scan su query '${s.label}' (~${s.estRows} righe stimate): indice mancante o non usato.`,
    evidence: { label: s.label, estRows: s.estRows, node: s.planSnippet },
    recommendation: "Verifica che l'indice (HNSW/GIST) esista, sia valido e che ANALYZE sia aggiornato.",
  }));
}

function integrityFinding(integ: IntegrityResult | null): Finding | null {
  if (!integ) return null;
  const lost = integ.expectedRows - integ.totalRows;
  if (integ.duplicateIds > 0 || integ.nullPayloads > 0 || lost > 0) {
    return {
      severity: "critical",
      category: "integrity",
      description: "Incongruenza dati sotto concorrenza nelle tabelle _stress_.",
      evidence: {
        expectedRows: integ.expectedRows,
        actualRows: integ.totalRows,
        lostWrites: Math.max(0, lost),
        duplicateIds: integ.duplicateIds,
        nullPayloads: integ.nullPayloads,
      },
      recommendation: "Write perse/duplicate sotto carico: indaga isolamento transazioni e retry non idempotenti.",
    };
  }
  return {
    severity: "info",
    category: "integrity",
    description: "Integrità write verificata: conteggi coerenti, nessun duplicato o payload nullo.",
    evidence: { rows: integ.totalRows },
    recommendation: "Nessuna azione.",
  };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
