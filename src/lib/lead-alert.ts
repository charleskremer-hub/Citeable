/**
 * ALERTE LEAD — le fondateur apprend qu'un prospect a laissé son email.
 *
 * Demande de Charles (28/09/2026) : « vérifie que je reçois bien les mails
 * capturés ». Vérification faite : le prospect recevait bien son rapport, mais
 * PERSONNE chez GetPick n'était prévenu. Un lead entrant n'était visible qu'en
 * lisant `/api/funnel` — donc jamais à temps pour le rappeler.
 *
 * Règles :
 * - destinataire = `LEAD_ALERT_TO` (variable Vercel). Jamais d'adresse en dur :
 *   le dépôt est public. Absente ⇒ aucune alerte, aucun plantage.
 * - un audit anonyme n'a pas de lead : pas d'alerte ;
 * - les tests internes/bots PARTENT quand même, préfixés « [test interne] » —
 *   c'est ce qui permet de vérifier la chaîne en prod sans polluer le funnel ;
 * - aucune liste de suppression : c'est un email à nous-mêmes ;
 * - jamais bloquant : une erreur d'alerte ne touche pas l'email du prospect.
 */
import { ANONYMOUS_EMAIL_DOMAIN } from "./anonymous-email";
import { sendMail, type MailMessage, type MailSendResult } from "./mailer";

export type LeadAlertInput = {
  auditId: string;
  prospectEmail: string;
  brandName: string;
  websiteUrl: string;
  score: number;
  category?: string;
  competitors?: string[];
  firstQuestion?: string;
  trafficClass?: string | null;
  prospectEmailSent?: boolean;
  prospectEmailError?: string;
};

export type LeadAlertResult = { sent: boolean; skipped?: string; error?: string };

type Env = Record<string, string | undefined>;

export function leadAlertRecipient(env: Env = process.env): string | null {
  const value = env.LEAD_ALERT_TO?.trim();
  return value && value.includes("@") ? value : null;
}

function isTestTraffic(trafficClass?: string | null) {
  return trafficClass === "internal" || trafficClass === "bot";
}

export function buildLeadAlert(input: LeadAlertInput, siteUrl = "https://www.getpick.ai"): { subject: string; text: string } {
  const base = siteUrl.replace(/\/$/, "");
  const prefix = isTestTraffic(input.trafficClass) ? "[test interne] " : "";
  const subject = `${prefix}Nouveau lead GetPick : ${input.brandName} (${input.score}/100)`;
  const rival = input.competitors?.find((name) => name && name.trim());
  const delivery = input.prospectEmailSent
    ? "Rapport envoyé au prospect : oui"
    : `Rapport envoyé au prospect : NON${input.prospectEmailError ? ` (${input.prospectEmailError})` : ""}`;

  const lines = [
    `Email : ${input.prospectEmail}`,
    `Cabinet : ${input.brandName} — ${input.websiteUrl}`,
    input.category ? `Métier détecté : ${input.category}` : null,
    `Score : ${input.score}/100`,
    rival ? `Rival cité à sa place : ${rival}` : null,
    input.firstQuestion ? `Question testée : « ${input.firstQuestion} »` : null,
    delivery,
    `Trafic : ${input.trafficClass ?? "inconnu"}`,
    "",
    `Rapport : ${base}/audit/${input.auditId}`,
    `Avant d'ouvrir le rapport, marque ton navigateur une fois : ${base}/api/internal (sinon ta visite compte comme un prospect).`,
  ].filter((line): line is string => line !== null);

  return { subject, text: lines.join("\n") };
}

export async function sendLeadAlert(
  input: LeadAlertInput,
  options: { env?: Env; send?: (message: MailMessage) => Promise<MailSendResult>; siteUrl?: string } = {},
): Promise<LeadAlertResult> {
  const env = options.env ?? process.env;
  const to = leadAlertRecipient(env);
  if (!to) return { sent: false, skipped: "LEAD_ALERT_TO not configured" };

  const prospect = input.prospectEmail.trim().toLowerCase();
  if (!prospect.includes("@") || prospect.endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`)) {
    return { sent: false, skipped: "anonymous audit" };
  }

  const { subject, text } = buildLeadAlert(input, options.siteUrl ?? env.NEXT_PUBLIC_SITE_URL ?? undefined);
  try {
    const result = await (options.send ?? ((message: MailMessage) => sendMail(message, { env })))({ to, subject, text });
    return result.sent ? { sent: true } : { sent: false, error: result.error ?? "not sent" };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
