---
name: OTA high-water mark floor
description: logs/ota-hwm.txt as third independent floor source against OTA number regressions
---

# OTA high-water mark floor

**Rule:** `logs/ota-hwm.txt` stores the highest NEXT_OTA ever successfully published. Both `publish-ota.sh` and `publish-ota-full.sh` read it as a third floor (after EAS GraphQL and buildInfo.ts). The effective base is `max(EAS, buildInfo, HWM)`.

**Why:** If both DB (`ota_releases`) and `constants/buildInfo.ts` are reset simultaneously (full environment restore, botched deploy), the previous two floors both return 0 and NEXT_OTA regresses. The HWM file is never touched automatically — only written after a confirmed successful publish.

**How to apply:**
- Any script that computes NEXT_OTA must read HWM early and include it in the `max()` guard.
- Write the HWM atomically (`echo N > file.tmp && mv file.tmp file`) **after** the publish is confirmed successful — not before.
- If the file is missing (fresh clone, first run), `HWM_CURRENT=0` and the block is a no-op.
- The file is tracked in git via `.gitignore` exception `!logs/ota-hwm.txt`; seeded at 175 (OTA at time of implementation, Jun 2026).
