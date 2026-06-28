---
name: Deep schema parity (dev↔prod)
description: How the deep-definition schema parity guard works and why prod is captured offline.
---

# Deep schema parity guard

`scripts/check-deep-schema-parity.ts` compares full schema DEFINITIONS (not names)
dev↔prod across 7 pg_catalog categories (columns/constraints/indexes/enums/
triggers/extensions/sequences) via per-category sha256 + overall hash.

**Why an offline prod snapshot:** Replit prod has NO connection string; the prod
replica is read-only via the database skill (`executeSql({environment:"production"})`).
So prod signatures are captured offline into `server/data/deep-schema-parity.prod.json`
and the script `compare`s dev (live) vs that JSON. To re-capture: run each
SIGNATURE_QUERY wrapped as
`SELECT translate(encode(convert_to(json_agg(...)::text,'UTF8'),'base64'),E'\n','') ...`
(base64 + newline-strip avoids CSV comma ambiguity and output truncation; raw
174KB columns JSON parses fine this way).

**Known infra-managed diffs (allow-listed per-object, never whole category):**
spatial_ref_sys_pkey (constraint AND its backing unique index — PostGIS PK added
internally by Replit at publish, we aren't table owner), extensions:postgis
(3.3.3 prod vs 3.5.3 dev), user_sessions_exit_type_check/_chk (cosmetic deparse).

**Gotcha:** scripts/ is NOT covered by the validation typecheck workflows
(tsconfig.client.json excludes `scripts`, server/tsconfig only covers server/shared);
root tsconfig.json includes it but the full-project tsc OOM-kills. Typecheck scripts
in isolation with a tmp tsconfig (skipLibCheck, types:[node]).
