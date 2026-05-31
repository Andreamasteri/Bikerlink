/**
 * send-test-email.ts
 *
 * Script one-shot per verificare l'invio email dopo aggiornamento credenziali.
 * Uso: npx tsx scripts/send-test-email.ts [destinatario@example.com]
 *
 * Se nessun destinatario è passato come argomento, usa GMAIL_USER come fallback.
 * Fallisce esplicitamente (exit 1) se nessun destinatario è disponibile.
 */

import { sendEmailDetailed } from "../server/email";
import { getBaseTemplate } from "../server/email/templates";

const recipient = process.argv[2] ?? process.env.EMAIL_TEST_TO ?? process.env.GMAIL_USER;

if (!recipient) {
  console.error(
    "❌ Nessun destinatario specificato.\n" +
    "Uso: npx tsx scripts/send-test-email.ts <email>\n" +
    "Oppure imposta EMAIL_TEST_TO o GMAIL_USER nell'ambiente."
  );
  process.exit(1);
}

const html = getBaseTemplate(
  `<h2 style="color:#FF6B35;margin-top:0">Test Invio Email ✅</h2>
   <p>Le credenziali Gmail sono state aggiornate e verificate con successo.</p>
   <p>La verifica email alla registrazione e tutte le notifiche via email sono ora operative.</p>
   <p style="color:#aaa;font-size:12px;margin-top:20px;">
     Inviato da BikerLink il ${new Date().toLocaleString("it-IT")}
   </p>`,
  "Credenziali Gmail aggiornate"
);

async function main() {
  console.log(`Invio email di test a: ${recipient}`);
  const result = await sendEmailDetailed(
    recipient!,
    "BikerLink — Test invio email (credenziali aggiornate)",
    html
  );
  if (result.ok) {
    console.log(`✅ Email inviata con successo! messageId=${result.messageId}`);
  } else {
    console.error(`❌ Errore invio: [${result.errorCode}] ${result.error}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
