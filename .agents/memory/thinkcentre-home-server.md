---
name: ThinkCentre home server
description: Cos'è il "ThinkCentre" — il server locale di casa che ospita i servizi self-hosted di BikerLink
---

# ThinkCentre = server locale di casa

Quando l'utente o i docs parlano di "ThinkCentre" (o "server di casa"), si riferiscono
a un mini-PC **Lenovo ThinkCentre 910q** (i5-7500T, 32 GB RAM, Ubuntu) tenuto in casa
dall'utente che ospita i servizi **self-hosted** dell'app.

**Servizio principale che ci gira: GraphHopper** (motore di routing self-hosted).

Per i docs (`docs/*-server-setup.md`) sullo stesso ThinkCentre girano anche:
- **Ollama** (LLM locale — provider AI primario per route parsing + traduzioni) → `OLLAMA_URL`
- **Whisper** (ASR / trascrizione vocale) → `WHISPER_URL`
- **Nominatim** (geocoding OSM self-hosted) → `NOMINATIM_URL`

**Why:** l'utente chiama "salute/health del ThinkCentre" lo stato di questi servizi
self-hosted. Non è un host cloud: se il server di casa è spento/irraggiungibile, l'app
fa fallback ai provider cloud (Gemini/OpenAI per AI, OSM pubblico per geocoding, ecc.).

**How to apply:** la dashboard admin ha una card inline unificata "Server di casa
(ThinkCentre)" che fa il probe di tutti e 4 i servizi in un colpo (endpoint admin che
li interroga in parallelo, URL mascherati, token mai esposti). Restano anche gli
indicatori per-servizio sparsi (routing-health, ai-hub, maps).

**Whisper health quirk:** whisper.cpp non ha endpoint di health dedicato. Un probe va
considerato "online" per qualsiasi risposta HTTP < 500 (un 404/405 = server su, path/verbo
diverso); solo 5xx o errore di rete/timeout = offline. Probare `/` con GET, non `/inference`
(che è POST). Lo stesso vale per chiunque aggiunga health-check a servizi senza `/health`.
