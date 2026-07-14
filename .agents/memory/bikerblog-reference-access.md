---
name: BikerBlog reference access
description: Come raggiungere sempre il codice di BikerBlog (repo gemello) da una sessione futura dell'agente.
---

# BikerBlog — accesso durevole al repo gemello

BikerBlog (`https://github.com/Andreamasteri/bikerblog`) è la "costola" di BikerLink:
mentre BikerLink era down, l'ecosistema (agenti AI Horus/Bowie/Quebracho/Nadir/Ares,
AI-Hub, pipeline) è stato sviluppato lì. Va consultato come riferimento per allineamento
e porting.

**Come consultarlo (read-only, on-demand):**

```bash
bash scripts/refresh-bikerblog.sh          # clona o aggiorna in .bikerblog-ref/
bash scripts/refresh-bikerblog.sh --status # stampa solo il commit corrente
```

- La copia vive in `.bikerblog-ref/`, **ignorata da git** — non versionata, non gonfia il
  Repl layer del deploy. Idempotente (clone → poi fetch+reset --hard), stampa l'hash HEAD.
- **Auth:** secret `BIKERBLOG_GITHUB_TOKEN` se presente (fallback per repo privato / rate
  limit), altrimenti clone pubblico (il repo è pubblico oggi). Il token non è mai stampato.

**Why:** l'accesso prima era solo "al volo" (clone in /tmp, effimero) e non documentato;
ogni sessione futura deve poter ritrovare il codice di BikerBlog senza reinventare la ruota.

**How to apply:** prima di lavorare su allineamento/porting degli agenti AI, rinfresca la
copia e leggi da `.bikerblog-ref/`. Canale complementare di sync continua: endpoint
`/_internal/agent-briefing` (`BIKERBLOG_BRIEFING_URL` + `BIKERBLOG_INTERNAL_TOKEN`), vedi
`docs/tc-access-secret-discovery.md`.
