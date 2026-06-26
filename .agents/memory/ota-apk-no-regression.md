---
name: Fresh APK cannot regress to an older approved OTA
description: Why a newly-built APK runs its embedded bundle and cannot auto-apply an older looping OTA, even on the same runtimeVersion.
---

# Fresh APK proofing — no regression to old OTA

A new APK built from HEAD bakes the current code as its embedded bundle. To "proof" a fix that is committed but stuck behind OTA approval, building a fresh APK is sufficient — **no runtimeVersion bump is needed** to isolate it from the messy OTA history.

**Why it is safe (two independent layers):**
1. EAS `checkForUpdateAsync` only ever offers the **newest** update on the APK's (channel, runtimeVersion), never an older one. Expo does not downgrade to an update older (by createdAt) than the running/embedded bundle.
2. BikerLink adds **server-authorized gating** (`hooks/useOtaAutoUpdate.ts` + `GET /api/ota/manifest`): a normal device may only apply the update whose easGroupId/easUpdateId matches the **latest *approved*** release; `pending` is explicitly skipped. The EAS channel is NOT the gate — approval status in the DB is.

**Key empirical fact (non-obvious):** pending OTAs are published to channel=`production` (same channel the release-apk profile uses), not a separate `staging` channel as the versioning skill text implies. So channel does not separate pending from approved — the BikerLink approval workflow does, client-side.

**How to apply:** When the latest *approved* OTA predates the fix (loops) but the fix is the newest *pending* OTA, a fresh APK is the clean proof: EAS won't offer the older approved bundle, the gate rejects the newer pending one, so the embedded fix runs. Verify before distributing: newest update on the exact channel+runtime is the fixed/newer one (not the looping approved one).
