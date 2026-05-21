import { getBaseTemplate } from "./templates";
import { sendEmail } from "../email";

export async function sendVerificationEmail(to: string, nickname: string, token: string): Promise<boolean> {
  const subject = "BikerLink - Codice di verifica email";
  const content = `
    <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
    <p style="color: #ccc; line-height: 1.6;">
      Benvenuto su BikerLink! Per completare la registrazione, inserisci il seguente codice di verifica nell'app:
    </p>

    <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff;">${token}</span>
    </div>

    <p style="color: #999; font-size: 13px; line-height: 1.5;">
      Il codice scade tra 30 minuti.<br/>
      Se non hai richiesto questa verifica, ignora questa email.
    </p>
  `;

  return sendEmail(to, subject, getBaseTemplate(content));
}

export async function sendPasswordResetEmail(to: string, nickname: string, code: string): Promise<boolean> {
  const subject = "BikerLink - Recupero password";
  const content = `
    <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
    <p style="color: #ccc; line-height: 1.6;">
      Hai richiesto il recupero della password del tuo account BikerLink.<br/>
      Inserisci il seguente codice nell'app per reimpostare la password:
    </p>

    <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #fff;">${code}</span>
    </div>

    <p style="color: #999; font-size: 13px; line-height: 1.5;">
      Il codice scade tra 1 ora.<br/>
      Se non hai richiesto il recupero password, ignora questa email. Il tuo account è al sicuro.
    </p>
  `;

  return sendEmail(to, subject, getBaseTemplate(content));
}

export async function sendPasswordResetConfirmationEmail(to: string, nickname: string): Promise<boolean> {
  const subject = "BikerLink - Password aggiornata";
  const content = `
    <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
    <p style="color: #ccc; line-height: 1.6;">
      La tua password è stata aggiornata con successo. Ora sei di nuovo in pista! 🏍️
    </p>
    <p style="color: #999; font-size: 13px; line-height: 1.5;">
      Se non hai effettuato questa modifica, contatta subito il supporto.
    </p>
  `;

  return sendEmail(to, subject, getBaseTemplate(content));
}
