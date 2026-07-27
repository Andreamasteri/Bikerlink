# Candidate OTA: release freeze and test/admin channel

This directory is the immutable registry for BikerLink release candidates.

## Current candidate

`BL-20260727-C01` is bound to commit
`8f615afd04b21737a33b48196e666d474708e868`, Neon candidate branch
`br-fancy-cherry-a26jqrce`, EAS channel `staging`, and Android runtime
`11.0.0`.

It is **not published** and is **not approved for production**.

## Safe sequence

1. Deploy the backend from the frozen commit with
   `BIKERLINK_DEPLOY_ENV=staging` and only `DATABASE_URL_CANDIDATE`.
2. Set the staging HTTPS host as `EXPO_PUBLIC_DOMAIN` for the preview build.
   It must never be the production host.
3. Build internal `preview` APK: it is bound to EAS channel `staging`.
4. From the frozen commit, publish only with:

   ```bash
   EXPO_PUBLIC_DOMAIN=staging.example ./scripts/publish-candidate-ota.sh \
     --release-id BL-20260727-C01 --message "..."
   ```

5. Record EAS group/update IDs in the candidate JSON, then test only with
   admin/tester devices. Test cold start, login/session renewal, SSE, offline
   recovery, media and telemetry paths, forced close/reopen, and rollback.
6. Andrea alone authorizes a production promotion. That promotion uses the same
   frozen code and migrations, but production DB data is never copied from the
   candidate.

Any code or migration change requires a new release ID and frozen commit.
