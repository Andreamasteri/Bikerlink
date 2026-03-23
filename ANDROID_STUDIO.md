# BikerLink — Build APK con Android Studio

## Prerequisiti
- Android Studio (scarica da https://developer.android.com/studio)
- JDK 17+ (installato automaticamente con Android Studio)
- Android SDK API 34 (installato dal SDK Manager di Android Studio)
- Node.js 18+ (scarica da https://nodejs.org/ — versione LTS)

## Clona il progetto

```bash
git clone https://github.com/Andreamasteri/Bikerlink.git
cd Bikerlink
```

## 1. Installa le dipendenze Node.js (OBBLIGATORIO — senza questo il build si blocca)

Dalla **root** del progetto clonato (NON dalla cartella `android/`):

```bash
node --version    # verifica: deve essere v18.x.x o superiore
npm install       # scarica tutti i moduli React Native e Expo (~2-3 minuti)
```

Perché è obbligatorio: il file `android/app/build.gradle` esegue comandi `node`
per trovare i path di React Native. Se `node_modules/` non esiste, Gradle non
trova i pacchetti e il build si blocca senza un messaggio di errore chiaro.

## 2. Configurazione ambiente (OBBLIGATORIO)

Crea il file `.env` nella root del progetto:

```bash
cp .env.example .env
```

Il file dice all'app dove si trova il backend (`biker-link.replit.app`).
Un fallback è integrato nel codice per i build locali, ma il file `.env` esplicito
è richiesto per garantire il corretto funzionamento in tutti gli scenari di build.

## 3. Apri in Android Studio

1. Avvia Android Studio
2. **Open** → seleziona la cartella `android/` dentro il progetto clonato
   (non la root del progetto, ma la sottocartella `android/`)
3. Attendi il sync Gradle (può richiedere qualche minuto alla prima apertura)
4. Se richiesto, installa le SDK/componenti mancanti dal popup

## Build APK debug (per test)

1. Menu **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Attendi la compilazione
3. Clicca su **locate** nel popup in basso a destra
4. APK si trova in: `android/app/build/outputs/apk/debug/app-debug.apk`

## Build APK release (per distribuzione)

> **ATTENZIONE — Keystore**: la configurazione attuale usa il keystore di debug
> anche per la build release (default di expo prebuild). Va bene per test locali,
> ma **non distribuire pubblicamente** un APK firmato con il debug keystore.
> Prima della distribuzione, crea un keystore di produzione e configuralo in
> `android/app/build.gradle` sotto `signingConfigs.release`.

1. Menu **Build** → **Generate Signed Bundle / APK**
2. Seleziona **APK**
3. **Crea un nuovo keystore di produzione** (non usare quello debug già presente):
   - Scegli un percorso sicuro fuori dalla cartella del progetto
   - Annotati alias, password keystore e password chiave — non si recuperano!
4. Build type: **release**
5. APK si trova in: `android/app/build/outputs/apk/release/app-release.apk`

## Installa APK su dispositivo Android

1. Copia l'APK sul telefono (via USB o cloud)
2. Su Android: **Impostazioni** → **Sicurezza** → attiva **Origini sconosciute**
   (o "Installa app sconosciute" su Android 8+)
3. Apri il file APK dal file manager del telefono

## Warning Gradle — cosa significano

Durante il build potresti vedere questi warning (sono normali, non bloccanti):

- `"Properties should be assigned using the 'propName = value' syntax"`
- `"Retrieving attribute with a null key"`

Sono avvisi di compatibilità futura generati dal plugin React Native/Expo.
Non impediscono il build con Gradle 8.x. Diventano errori solo in Gradle 10.0+.
Puoi ignorarli tranquillamente.

## Note importanti

- La cartella `android/` è generata automaticamente da `expo prebuild`.
  Non modificare manualmente i file dentro `android/` — verranno sovrascritti
  al prossimo prebuild.
- Il backend dell'app è su `https://biker-link.replit.app`
- Per aggiornamenti del codice JS: modifica i file nella root del progetto,
  poi riesegui `npx expo prebuild --platform android` e rebuilda in Android Studio.
