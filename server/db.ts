import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/db";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  // 10s < timeout lato Replit managed DB (~20s) → connessioni rilasciate prima
  // che il server le droppi, evitando "Connection terminated unexpectedly".
  idleTimeoutMillis: 10000,
  // 3s: quando il pool è saturo o il DB è irraggiungibile, ogni tentativo di
  // connessione fallisce entro 3s invece di 10s. Con 4 query sequenziali nel
  // login handler il worst-case è 12s — ben sotto il proxy timeout (~30s).
  connectionTimeoutMillis: 3000,
  // Limite esplicito di connessioni — evita saturation burst.
  max: 10,
  // 5s: le query non tengono connessioni appese indefinitamente in caso di
  // query lente o lock. Ridotto da 15s → 5s per il login hardening: il
  // circuit breaker si apre dopo 3 ping-failure dal watchdog, ma fino ad
  // allora ogni query individuale deve fallire entro ≤5s.
  statement_timeout: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Pool connection error (ignorato per evitare crash):", err.message);
});

export const db = drizzle(pool, { schema });
