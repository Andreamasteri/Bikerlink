/**
 * E2E Drag-Hitbox Test — FloatingWidget & UptimeWidget su Android
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STATO: PENDING — richiede binario nativo Android (emulatore o device fisico)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Questi test documentano lo scenario E2E completo per la verifica del
 * comportamento hitbox Android del pallino flottante e del widget uptime.
 * Sono marcati `xdescribe` (skip) finché non è disponibile un binario Android
 * (APK di test) in CI.
 *
 * PROBLEMA TESTATO (Android-specific):
 *   Su Android, animare la posizione via `left`/`top` sposta il pixel sullo
 *   schermo ma NON aggiorna l'area di tocco (hitbox): il widget sembra spostarsi
 *   ma risponde solo ai touch nella posizione originale.
 *   Con `transform: [{translateX}, {translateY}]` l'hitbox segue il widget.
 *
 * COME ESEGUIRE:
 *   Prerequisiti:
 *     1. Build nativa con APK di test (EAS build --profile debug-e2e, oppure
 *        `npx expo run:android --configuration Debug`)
 *     2. Emulatore Android avviato: `emulator -avk Pixel_6_API_33`
 *     3. Detox installato: `npm install --save-dev detox @config-plugins/detox`
 *     4. Configurazione in `.detoxrc.js` (vedi file nella root del progetto)
 *
 *   Esecuzione:
 *     npx detox build --configuration android.emu.debug
 *     npx detox test --configuration android.emu.debug e2e/drag-hitbox.e2e.ts
 *
 * TESTID richiesti (già aggiunti ai componenti):
 *   - FloatingWidget.tsx:  testID="floating-widget"  (Animated.View wrapper)
 *   - UptimeWidget.tsx:    testID="uptime-widget"    (Animated.View wrapper)
 *   - FloatingWidget menu: testID="floating-menu"    (Modal container) [da aggiungere]
 *
 * Per il monitor "menu aperto/chiuso" aggiungere al Modal in FloatingWidget:
 *   <Modal ... testID="floating-menu">
 *
 * COPERTURA E2E:
 *   (E1) FloatingWidget — drag + tap nuova posizione → menu aperto
 *   (E2) FloatingWidget — drag + tap VECCHIA posizione → menu CHIUSO (hitbox check)
 *   (E3) UptimeWidget   — drag + tap nuova posizione → navigazione history
 *   (E4) UptimeWidget   — drag + tap VECCHIA posizione → no navigazione (hitbox check)
 *
 * NOTA ARCHITETTURALE:
 *   I test JS-only in components/__tests__/FloatingWidget.drag-hitbox.test.ts e
 *   components/__tests__/UptimeWidget.drag-hitbox.test.ts coprono la pipeline
 *   PanResponder → shared value → transform e le invarianti no-left/top.
 *   Questi test Detox coprono l'unica cosa che i test JS non possono: il
 *   sistema touch nativo Android che filtra gli eventi per coordinata.
 */

// Detox globals (disponibili quando il test runner è `detox test`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const device: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const element: (matcher: any) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const by: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const waitFor: (elem: any) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Restituisce il bounding box (x, y, width, height) di un elemento Detox. */
async function getBounds(testId: string) {
  const attrs = await element(by.id(testId)).getAttributes();
  return attrs.frame as { x: number; y: number; width: number; height: number };
}

/** Centro di un bounding box. */
function center(frame: { x: number; y: number; width: number; height: number }) {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

// ════════════════════════════════════════════════════════════════════════════
// (E1-E2) FloatingWidget — drag-hitbox
// ════════════════════════════════════════════════════════════════════════════

xdescribe("FloatingWidget — drag-hitbox Android E2E [PENDING: richiede APK]", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // Assicurare che l'utente sia loggato e il widget sia visibile.
    // Adattare in base al flusso di login dell'app (es. mock auth tramite
    // deep link o variabile d'ambiente di test).
  });

  afterEach(async () => {
    // Chiudi il menu se rimasto aperto
    try {
      await element(by.id("floating-menu")).tap();
    } catch {
      // ignore: menu già chiuso
    }
  });

  /**
   * (E1) Drag FloatingWidget a nuova posizione → tap nuova posizione → menu aperto.
   *
   * Scenario "next tap lands on moved widget":
   *   1. Rileva posizione corrente del widget (A)
   *   2. Trascina di (dx=150, dy=100) → nuova posizione (B)
   *   3. Tap alle coordinate di B
   *   4. Asserzione: il menu di navigazione è visibile
   */
  it("(E1) tap alla nuova posizione dopo drag apre il menu", async () => {
    const widgetElem = element(by.id("floating-widget"));

    // Posizione iniziale
    const frameBefore = await getBounds("floating-widget");
    const posA = center(frameBefore);

    // Drag di 150px destra, 100px su
    await widgetElem.swipe("right", "slow", 0.4, posA.x, posA.y);
    await new Promise(r => setTimeout(r, 400)); // lascia il tempo all'animazione

    // Posizione dopo drag
    const frameAfter = await getBounds("floating-widget");
    const posB = center(frameAfter);

    // Sanity: il widget si è spostato
    const moved = Math.abs(posB.x - posA.x) > 20 || Math.abs(posB.y - posA.y) > 20;
    expect(moved).toBe(true);

    // Tap alla nuova posizione — deve aprire il menu
    await element(by.id("floating-widget")).tap();

    // Il menu deve essere visibile
    await waitFor(element(by.id("floating-menu"))).toBeVisible().withTimeout(2000);
  });

  /**
   * (E2) ASSERZIONE NEGATIVA: tap alla VECCHIA posizione (A) dopo drag → menu NON aperto.
   *
   * Questo è il test che NON può essere scritto in Node/Vitest:
   *   - Su Android con `left`/`top`: il widget si sposta visivamente ma l'hitbox
   *     resta in A → tap in A apre il menu (BUG).
   *   - Su Android con `transform`: l'hitbox si sposta in B → tap in A non lo
   *     raggiunge → menu rimane chiuso (COMPORTAMENTO CORRETTO).
   */
  it("(E2) tap alla VECCHIA posizione dopo drag NON apre il menu (hitbox si è spostato)", async () => {
    const widgetElem = element(by.id("floating-widget"));

    // Posizione iniziale
    const frameBefore = await getBounds("floating-widget");
    const posA = center(frameBefore);

    // Drag verso l'angolo in basso a sinistra
    await widgetElem.swipe("left", "slow", 0.4, posA.x, posA.y);
    await new Promise(r => setTimeout(r, 400));

    // Tap alla VECCHIA posizione (A) — NON deve aprire il menu
    await device.tap({ x: posA.x, y: posA.y });
    await new Promise(r => setTimeout(r, 500));

    // Il menu NON deve essere visibile
    await waitFor(element(by.id("floating-menu")))
      .not.toBeVisible()
      .withTimeout(1000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (E3-E4) UptimeWidget — drag-hitbox
// ════════════════════════════════════════════════════════════════════════════

xdescribe("UptimeWidget — drag-hitbox Android E2E [PENDING: richiede APK]", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // Navigare alla schermata admin dove UptimeWidget è visibile
    // (es. tap sulla tab admin, oppure deep link).
  });

  /**
   * (E3) Drag UptimeWidget a nuova posizione → tap nuova posizione → navigation.
   *
   * openHistory() chiama router.push("/admin/restart-history").
   * Su Detox si può verificare il cambiamento di schermata tramite testID
   * della nuova schermata oppure controllare che un elemento specifico diventi
   * visibile.
   */
  it("(E3) tap alla nuova posizione dopo drag naviga a restart-history", async () => {
    const widgetElem = element(by.id("uptime-widget"));

    const frameBefore = await getBounds("uptime-widget");
    const posA = center(frameBefore);

    // Drag verso l'angolo in alto a sinistra
    await widgetElem.swipe("left", "slow", 0.3, posA.x, posA.y);
    await new Promise(r => setTimeout(r, 400));

    const frameAfter = await getBounds("uptime-widget");
    const posB = center(frameAfter);

    const moved = Math.abs(posB.x - posA.x) > 20 || Math.abs(posB.y - posA.y) > 20;
    expect(moved).toBe(true);

    // Tap alla nuova posizione
    await element(by.id("uptime-widget")).tap();

    // La schermata "restart-history" deve essere visibile
    // (Adattare il testID al titolo/elemento della schermata di destinazione)
    await waitFor(element(by.id("restart-history-screen")))
      .toBeVisible()
      .withTimeout(3000);
  });

  /**
   * (E4) ASSERZIONE NEGATIVA: tap alla VECCHIA posizione dopo drag → no navigazione.
   *
   * Con `transform` corretto, l'hitbox si sposta con il widget visivo.
   * Un tap nelle vecchie coordinate non raggiunge il widget → nessuna navigazione.
   */
  it("(E4) tap alla VECCHIA posizione dopo drag NON naviga (hitbox si è spostato)", async () => {
    const widgetElem = element(by.id("uptime-widget"));

    const frameBefore = await getBounds("uptime-widget");
    const posA = center(frameBefore);

    // Drag verso destra
    await widgetElem.swipe("right", "slow", 0.3, posA.x, posA.y);
    await new Promise(r => setTimeout(r, 400));

    // Tap alla VECCHIA posizione
    await device.tap({ x: posA.x, y: posA.y });
    await new Promise(r => setTimeout(r, 500));

    // La schermata corrente non deve essere cambiata
    // (Verificare che il widget uptime sia ancora visibile = stessa schermata)
    await waitFor(element(by.id("uptime-widget")))
      .toBeVisible()
      .withTimeout(1000);
  });
});
