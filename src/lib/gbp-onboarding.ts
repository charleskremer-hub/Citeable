/**
 * OFFRE « CONNECTE TA FICHE GOOGLE » — le seul geste du cabinet (29/09/2026).
 *
 * Décision CEO validée par Charles (« GO ») après bench : les IA lisent d'abord
 * la fiche Google (Gemini, AI Overviews) et les annuaires (ChatGPT : Yelp,
 * PagesJaunes…), pas une page tierce. Le cabinet n'a rien de technique à faire :
 * il ajoute GetPick comme ADMINISTRATEUR de sa fiche (même geste que partager un
 * document). Ensuite GetPick complète la fiche, publie chaque mois, tient les
 * annuaires alignés et mesure ce que l'IA lit et cite.
 *
 * Tant que Google n'a pas ouvert l'API des fiches à GetPick (fiche GetPick
 * vérifiée depuis 60 jours + formulaire), c'est ce parcours manuel qui s'applique.
 */
export function gbpManagerEmail(env: Record<string, string | undefined> = process.env): string {
  const value = env.GBP_MANAGER_EMAIL?.trim();
  return value && value.includes("@") ? value : "hello@getpick.ai";
}

/** Étapes exactes (aide Google « Gérer les propriétaires et les gestionnaires »). */
export function gbpManagerSteps(managerEmail: string): string[] {
  return [
    "Ouvre business.google.com et sélectionne la fiche de ton cabinet.",
    "Clique sur « Plus » → « Paramètres de la fiche d'établissement » → « Utilisateurs et accès ».",
    "Clique sur « Ajouter », saisis l'adresse ci-dessous.",
    "Sous « Accès », choisis « Administrateur », puis « Inviter ».",
  ].concat([`Adresse à inviter : ${managerEmail}`]);
}

export const ONBOARDING_PATH = "/connecter";

export function buildWelcomeEmail(args: { customerEmail: string; managerEmail: string; siteUrl?: string }) {
  const base = (args.siteUrl ?? "https://www.getpick.ai").replace(/\/$/, "");
  const subject = "Bienvenue chez GetPick — une seule étape, 1 minute";
  const text = [
    "Bonjour,",
    "",
    "Merci pour ta confiance. Il reste une seule étape, sans rien de technique : nous ajouter comme administrateur de ta fiche Google.",
    "",
    ...gbpManagerSteps(args.managerEmail).map((step, index) => `${index + 1}. ${step}`),
    "",
    `Le pas-à-pas illustré : ${base}${ONBOARDING_PATH}`,
    "",
    "Dès que l'invitation arrive, on s'occupe de tout : ta fiche complétée pour les questions de tes clients sous 48 h, tes annuaires alignés, et chaque mois ce que l'IA a lu et qui elle cite.",
    "",
    "Une question ? Réponds simplement à cet email.",
    "",
    "Charles — GetPick",
  ].join("\n");
  return { subject, text };
}
