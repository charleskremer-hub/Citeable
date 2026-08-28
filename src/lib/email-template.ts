/**
 * Gabarit des emails GetPick — HTML pour les clients mail, texte pour le reste.
 *
 * POURQUOI CE FICHIER EXISTE (28/08/2026)
 *
 * Les emails partaient en texte brut, composés à la main, et ils portaient les
 * étiquettes du brief de rédaction dans le corps livré au destinataire :
 * « CTA unique: », « Réassurance : », « Correctif échantillon: », plus un
 * `# 47/100` en markdown qui s'affiche littéralement, dièse compris. Une
 * checklist interne partait telle quelle chez des prospects.
 *
 * Trois règles tenues ici, et testées dans `scripts/email-template.test.ts` :
 *
 *   1. UNE SEULE SOURCE. Le HTML et le texte descendent du MÊME objet
 *      `EmailContent`. Deux rédactions parallèles divergent toujours : l'une
 *      est relue, l'autre pas.
 *   2. AUCUNE ÉTIQUETTE DE BRIEF NI MARKUP dans ce qui est lu. Les noms de
 *      section vivent dans les champs de la structure, jamais dans le texte.
 *   3. HTML COMPATIBLE CLIENTS MAIL. Tables, styles en ligne, largeur 600 px,
 *      aucune police distante, aucun flex/grid — Outlook et Gmail ignorent la
 *      moitié du CSS moderne et le reste se dégrade en bouillie.
 *
 * Le HTML est ACCESSOIRE : un email dont le texte seul ne suffit pas est cassé
 * pour qui bloque le HTML. Le texte se lit seul, toujours.
 */

export type EmailButton = { label: string; url: string };

export type EmailContent = {
  /** Reprise en haut du corps, une phrase. Jamais une étiquette. */
  lead: string;
  /** Chiffre mis en avant, ex. « 47/100 ». Optionnel. */
  figure?: { value: string; caption: string };
  /** Le fait qui justifie l'email. Une à trois phrases, pas davantage. */
  paragraphs: string[];
  /** Encadré optionnel : le correctif, cité tel qu'il sera publié. */
  quote?: { title: string; body: string };
  /** Un seul bouton. Deux boutons, c'est aucun bouton. */
  button: EmailButton;
  /** Ligne discrète sous le bouton. Optionnelle. */
  footnote?: string;
  unsubscribe: { label: string; url: string };
  locale: "en" | "fr";
};

const INK = "#111114";
const MUTED = "#6b6b76";
const LINE = "#e4e4e0";
const CANVAS = "#f6f6f3";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Les guillemets fermants manquaient dans le code d'origine (`“…"`) : une
 * ouvrante typographique et une fermante droite dans la même citation. Une
 * paire, une fonction.
 */
export function quoted(value: string, locale: "en" | "fr") {
  const [open, close] = locale === "fr" ? ["« ", " »"] : ["“", "”"];
  return `${open}${value}${close}`;
}

export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.lead, ""];

  if (content.figure) lines.push(`${content.figure.value} — ${content.figure.caption}`, "");

  for (const paragraph of content.paragraphs) lines.push(paragraph, "");

  if (content.quote) lines.push(`${content.quote.title} :`, content.quote.body, "");

  lines.push(`${content.button.label} : ${content.button.url}`);

  if (content.footnote) lines.push("", content.footnote);

  lines.push("", "—", `GetPick · ${content.unsubscribe.label} : ${content.unsubscribe.url}`);

  return lines
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderEmailHtml(content: EmailContent, subject: string): string {
  const e = escapeHtml;
  const blocks: string[] = [];

  blocks.push(`<p style="margin:0 0 20px;font-size:16px;line-height:26px;color:${INK};">${e(content.lead)}</p>`);

  if (content.figure) {
    blocks.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
        `<tr><td style="padding:18px 20px;background:${CANVAS};border-radius:10px;">` +
        `<div style="font-size:34px;line-height:38px;font-weight:700;color:${INK};letter-spacing:-0.5px;">${e(content.figure.value)}</div>` +
        `<div style="margin-top:6px;font-size:14px;line-height:22px;color:${MUTED};">${e(content.figure.caption)}</div>` +
        `</td></tr></table>`
    );
  }

  for (const paragraph of content.paragraphs) {
    blocks.push(`<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:${INK};">${e(paragraph)}</p>`);
  }

  if (content.quote) {
    blocks.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 24px;">` +
        `<tr><td style="padding:16px 18px;background:${CANVAS};border-left:3px solid ${INK};border-radius:0 8px 8px 0;">` +
        `<div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">${e(content.quote.title)}</div>` +
        `<div style="margin-top:8px;font-size:15px;line-height:25px;color:${INK};">${e(content.quote.body)}</div>` +
        `</td></tr></table>`
    );
  }

  blocks.push(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">` +
      `<tr><td style="background:${INK};border-radius:8px;">` +
      `<a href="${e(content.button.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${e(content.button.label)}</a>` +
      `</td></tr></table>`
  );

  if (content.footnote) {
    blocks.push(`<p style="margin:16px 0 0;font-size:13px;line-height:21px;color:${MUTED};">${e(content.footnote)}</p>`);
  }

  return [
    `<!doctype html>`,
    `<html lang="${content.locale}"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">`,
    `<title>${e(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#ffffff;">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(content.lead)}</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;">`,
    `<tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
    `<tr><td style="padding-bottom:26px;font-size:17px;font-weight:700;letter-spacing:-0.3px;color:${INK};">GetPick</td></tr>`,
    `<tr><td>${blocks.join("")}</td></tr>`,
    `<tr><td style="padding-top:30px;border-top:1px solid ${LINE};font-size:12px;line-height:20px;color:${MUTED};">`,
    `<a href="${e(content.unsubscribe.url)}" style="color:${MUTED};text-decoration:underline;">${e(content.unsubscribe.label)}</a>`,
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

export function renderEmail(content: EmailContent, subject: string) {
  return { text: renderEmailText(content), html: renderEmailHtml(content, subject) };
}
