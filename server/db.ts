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
  idleTimeoutMillis: 30000,
  // Aumentato da 5s a 10s per dare più margine al pool sotto pressione.
  connectionTimeoutMillis: 10000,
  // Limite esplicito di connessioni — evita saturation burst.
  max: 10,
  // statement_timeout di 15s come default: i worker non tengono connessioni
  // appese indefinitamente in caso di query lente o lock.
  statement_timeout: 15000,
});

pool.on("error", (err) => {
  console.error("[DB] Pool connection error (ignorato per evitare crash):", err.message);
});

export const db = drizzle(pool, { schema });
