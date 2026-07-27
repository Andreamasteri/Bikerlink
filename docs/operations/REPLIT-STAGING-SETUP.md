# BikerLink — Backend staging su Replit

Il backend staging è un deployment Replit separato, creato dal commit candidato.
Non riusa il deployment pubblico e non riceve credenziali di produzione.

## Variabili obbligatorie nello staging

| Variabile | Valore |
|---|---|
| `BIKERLINK_DEPLOY_ENV` | `staging` |
| `DATABASE_URL_CANDIDATE` | connection URI del branch Neon `candidate` |
| `SESSION_SECRET` | secret separato dallo staging |
| `EXPO_PUBLIC_DOMAIN` | dominio HTTPS del deployment staging |

Non impostare nello staging: `DATABASE_URL`, `PROD_DATABASE_URL`,
`DATABASE_URL_PROD` o segreti di produzione.

Il server fallisce al boot se `BIKERLINK_DEPLOY_ENV=staging` non trova
`DATABASE_URL_CANDIDATE`: non esiste un fallback verso produzione.

## Creazione del deployment

1. In Replit, crea un deployment/app separato dal repository BikerLink fissato
   al commit candidato.
2. Imposta le variabili qui sopra nel nuovo deployment.
3. Pubblica e verifica `/healthz`.
4. Esegui lo smoke live contro il dominio staging.
5. Configura EAS `preview` con `EXPO_PUBLIC_DOMAIN` uguale al dominio staging
   prima di distribuire la build/canale agli admin.

## Regola di promozione

Candidate e staging servono solo a validare una release. Dopo approvazione, lo
stesso commit e le stesse migration vengono eseguiti nel deployment production
con `DATABASE_URL` di Production; non si copia mai il database candidate in
Production.
