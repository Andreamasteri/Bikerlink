import pg from "pg";

async function main() {
  const url = process.env.DATABASE_URL_DEV;
  if (!url) { console.error("DATABASE_URL_DEV not set"); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  const r = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log(`Tables on Neon DB (${r.rows.length} total):`);
  console.log(r.rows.map((x: { table_name: string }) => x.table_name).join("\n"));
  client.release();
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
