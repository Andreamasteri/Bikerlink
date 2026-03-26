#!/bin/bash
# Reset dei match di test dell'admin per verifica accept/reject
# Admin ID: 63d14222-e80f-481a-a2be-7784e7a397a4
# Match garage (biker_zavorrina_matches): e94a79df, 635c57d2
# Match biker (biker_biker_matches): 744cdb1b, 48dd9adc

set -e

echo "=== Reset match di test a 'new' ==="

node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function reset() {
  const r1 = await pool.query(
    \"UPDATE biker_zavorrina_matches SET status='new' WHERE id IN ('e94a79df-df91-4504-9344-7290c3deae7e','635c57d2-21c6-4cae-bee0-dca3c336b384')\"
  );
  console.log('Garage matches reset:', r1.rowCount);

  const r2 = await pool.query(
    \"UPDATE biker_biker_matches SET status='new' WHERE id IN ('744cdb1b-9404-4573-a1c5-53f9b4c8da73','48dd9adc-160f-41a9-92ea-84bfd3f5446e')\"
  );
  console.log('Biker matches reset:', r2.rowCount);

  const check1 = await pool.query(
    \"SELECT id, status FROM biker_zavorrina_matches WHERE id IN ('e94a79df-df91-4504-9344-7290c3deae7e','635c57d2-21c6-4cae-bee0-dca3c336b384')\"
  );
  const check2 = await pool.query(
    \"SELECT id, status FROM biker_biker_matches WHERE id IN ('744cdb1b-9404-4573-a1c5-53f9b4c8da73','48dd9adc-160f-41a9-92ea-84bfd3f5446e')\"
  );

  console.log('');
  console.log('Stato attuale:');
  [...check1.rows, ...check2.rows].forEach(r => console.log(' -', r.id.substring(0,8) + '...', '->', r.status));
  await pool.end();
}

reset().catch(e => { console.error(e.message); process.exit(1); });
"

echo "=== Done ==="
