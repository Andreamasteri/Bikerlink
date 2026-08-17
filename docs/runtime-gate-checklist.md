# AI runtime gate checklist (inactive)

This checklist is mandatory before enabling queues or flags, changing GPU or
resource assignments, running real smoke tests, enabling AI-Hub routing, or
rolling out to any environment.

Run direct checks on:

- PC Windows: Quebracho runtime
- ThinkCentre: Bowie, Horus and Nadir runtime
- Ares host: Ares local runtime and Cloudflare Workers AI connection boundary

For each host and agent record, without storing secret values:

- host name and reachability
- active process and worker/service identity
- GPU index, GPU model and free VRAM
- loaded model or audio runtime
- resource group
- queue
- endpoint
- secret name present and usable (presence only, never the value)

The check must reconcile runtime observations with the role registry and
resources configuration. A discrepancy is a blocker for activation; this
document does not activate any feature or worker.
