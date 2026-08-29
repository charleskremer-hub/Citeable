/**
 * Guides d'installation des fichiers machines — par fichier, par plateforme.
 *
 * Trois volets par guide, et les trois sont obligatoires (arbitrage Charles,
 * 28/08/2026) : OÙ aller, QUOI coller, COMMENT VÉRIFIER que c'est en place.
 * La vérification compte autant que la pose — sans elle le client ne sait pas
 * s'il a réussi.
 *
 * Honnêteté avant tout : quand une plateforme ne PERMET PAS le geste (Shopify
 * et Wix ne servent pas de fichier arbitraire à la racine, Squarespace ne
 * laisse pas éditer robots.txt), le guide le dit au lieu d'inventer un
 * pas-à-pas qui échouera. Plateforme "inconnu" ⇒ guide générique, jamais un
 * guide deviné.
 *
 * Module PUR : consommé par la page rapport (tier payant uniquement — le
 * verrou est porté par page.tsx/PublishContent, pas ici) et par les tests.
 * Il ne contient AUCUN contenu de fichier machine, seulement le mode d'emploi.
 */

import type { DetectedPlatform } from "./platform-detect";

export type GuideFile = "jsonld" | "llms" | "robots";
export type GuideLocale = "en" | "fr";

export type InstallGuide = {
  /** Où aller, dans l'interface de la plateforme ou chez l'hébergeur. */
  where: string;
  /** Le geste exact : quoi coller, à quel endroit du document. */
  paste: string;
  /** Comment constater soi-même que c'est en place. */
  verify: string;
  /** true = guide générique (plateforme non détectée ou non gérée). */
  generic: boolean;
};

type GuideText = { where: string; paste: string; verify: string };
type PerLocale = { fr: GuideText; en: GuideText };

const VERIFY_JSONLD: PerLocale = {
  fr: {
    where: "",
    paste: "",
    verify:
      "Ouvre ta page d'accueil, affiche le code source (clic droit → « Afficher le code source ») et cherche « application/ld+json » : ton bloc doit apparaître une fois.",
  },
  en: {
    where: "",
    paste: "",
    verify:
      "Open your homepage, view the page source (right click → “View page source”) and search for “application/ld+json”: your block must appear once.",
  },
};

const GENERIC: Record<GuideFile, PerLocale> = {
  jsonld: {
    fr: {
      where: "Le <head> de ta page d'accueil — via l'éditeur de thème de ton site ou ton développeur.",
      paste: "Colle le bloc <script type=\"application/ld+json\"> tel quel, juste avant </head>, sans le modifier.",
      verify: VERIFY_JSONLD.fr.verify,
    },
    en: {
      where: "The <head> of your homepage — via your site's theme editor or your developer.",
      paste: "Paste the <script type=\"application/ld+json\"> block as-is, right before </head>, without editing it.",
      verify: VERIFY_JSONLD.en.verify,
    },
  },
  llms: {
    fr: {
      where: "La racine de ton domaine, via le gestionnaire de fichiers de ton hébergeur ou FTP.",
      paste: "Crée un fichier nommé exactement llms.txt à la racine et colles-y le contenu fourni.",
      verify: "Ouvre https://tondomaine/llms.txt dans un navigateur : tu dois voir exactement le texte collé, pas une page 404.",
    },
    en: {
      where: "Your domain root, via your host's file manager or FTP.",
      paste: "Create a file named exactly llms.txt at the root and paste the provided content into it.",
      verify: "Open https://yourdomain/llms.txt in a browser: you must see exactly the pasted text, not a 404 page.",
    },
  },
  robots: {
    fr: {
      where: "Le fichier robots.txt à la racine de ton domaine, via ton hébergeur ou ton outil SEO.",
      paste: "Ajoute les lignes fournies à la fin de ton robots.txt existant — ne supprime rien d'autre.",
      verify: "Ouvre https://tondomaine/robots.txt : les lignes ajoutées doivent apparaître. GetPick re-vérifie l'accès des crawlers IA à ton prochain re-test.",
    },
    en: {
      where: "The robots.txt file at your domain root, via your host or your SEO tool.",
      paste: "Append the provided lines to your existing robots.txt — don't remove anything else.",
      verify: "Open https://yourdomain/robots.txt: the added lines must appear. GetPick re-checks AI crawler access at your next re-test.",
    },
  },
};

/**
 * Guides spécifiques. Seuls les gestes VRAIS de chaque plateforme figurent ici ;
 * quand la plateforme ne permet pas le geste, le guide le dit.
 */
const SPECIFIC: Partial<Record<Exclude<DetectedPlatform, "inconnu">, Partial<Record<GuideFile, PerLocale>>>> = {
  shopify: {
    jsonld: {
      fr: {
        where: "Admin Shopify → Boutique en ligne → Thèmes → « … » → Modifier le code → fichier theme.liquid.",
        paste: "Colle le bloc <script type=\"application/ld+json\"> juste avant </head>, puis Enregistrer.",
        verify: VERIFY_JSONLD.fr.verify,
      },
      en: {
        where: "Shopify admin → Online Store → Themes → “…” → Edit code → theme.liquid file.",
        paste: "Paste the <script type=\"application/ld+json\"> block right before </head>, then Save.",
        verify: VERIFY_JSONLD.en.verify,
      },
    },
    llms: {
      fr: {
        where: "Shopify ne sert pas de fichier libre à la racine du domaine : llms.txt ne peut pas être posé sans app tierce.",
        paste: "Si tu utilises une app de gestion de fichiers/SEO qui sait servir /llms.txt, colles-y le contenu fourni ; sinon, passe cette étape — les deux autres fichiers comptent davantage.",
        verify: "Ouvre https://tondomaine/llms.txt : si tu vois le texte collé, c'est en place ; une 404 signifie que ta config Shopify ne le sert pas.",
      },
      en: {
        where: "Shopify doesn't serve arbitrary root files: llms.txt can't be placed without a third-party app.",
        paste: "If you use a file/SEO app that can serve /llms.txt, paste the provided content there; otherwise skip this step — the other two files matter more.",
        verify: "Open https://yourdomain/llms.txt: if you see the pasted text it's live; a 404 means your Shopify setup doesn't serve it.",
      },
    },
    robots: {
      fr: {
        where: "Admin Shopify → Boutique en ligne → Thèmes → Modifier le code → Ajouter un modèle → robots.txt.liquid.",
        paste: "Dans robots.txt.liquid, ajoute les lignes fournies (Shopify documente ce modèle) puis Enregistrer.",
        verify: "Ouvre https://tondomaine/robots.txt : les crawlers IA listés ne doivent plus être bloqués. GetPick re-vérifie à ton prochain re-test.",
      },
      en: {
        where: "Shopify admin → Online Store → Themes → Edit code → Add template → robots.txt.liquid.",
        paste: "In robots.txt.liquid, add the provided lines (Shopify documents this template) then Save.",
        verify: "Open https://yourdomain/robots.txt: the listed AI crawlers must no longer be blocked. GetPick re-checks at your next re-test.",
      },
    },
  },
  woocommerce: {
    jsonld: {
      fr: {
        where: "WordPress admin → Apparence → Éditeur de fichiers du thème → header.php, ou une extension de snippets (ex. WPCode).",
        paste: "Colle le bloc <script type=\"application/ld+json\"> avant </head> (ou en snippet « header »), puis publie.",
        verify: VERIFY_JSONLD.fr.verify,
      },
      en: {
        where: "WordPress admin → Appearance → Theme file editor → header.php, or a snippets plugin (e.g. WPCode).",
        paste: "Paste the <script type=\"application/ld+json\"> block before </head> (or as a “header” snippet), then publish.",
        verify: VERIFY_JSONLD.en.verify,
      },
    },
    llms: {
      fr: {
        where: "La racine de ton hébergement WordPress (le dossier où vit wp-config.php), via FTP ou le gestionnaire de fichiers de l'hébergeur.",
        paste: "Crée un fichier nommé exactement llms.txt à cette racine et colles-y le contenu fourni.",
        verify: "Ouvre https://tondomaine/llms.txt : tu dois voir exactement le texte collé, pas une 404.",
      },
      en: {
        where: "Your WordPress hosting root (the folder where wp-config.php lives), via FTP or your host's file manager.",
        paste: "Create a file named exactly llms.txt at that root and paste the provided content into it.",
        verify: "Open https://yourdomain/llms.txt: you must see exactly the pasted text, not a 404.",
      },
    },
    robots: {
      fr: {
        where: "Ton extension SEO (Yoast : Outils → Éditeur de fichiers) ou le fichier robots.txt à la racine via FTP.",
        paste: "Ajoute les lignes fournies à la fin du robots.txt — ne supprime rien d'autre.",
        verify: "Ouvre https://tondomaine/robots.txt : les lignes doivent apparaître. GetPick re-vérifie à ton prochain re-test.",
      },
      en: {
        where: "Your SEO plugin (Yoast: Tools → File editor) or the root robots.txt via FTP.",
        paste: "Append the provided lines to the end of robots.txt — don't remove anything else.",
        verify: "Open https://yourdomain/robots.txt: the lines must appear. GetPick re-checks at your next re-test.",
      },
    },
  },
  wix: {
    jsonld: {
      fr: {
        where: "Wix → Paramètres → Code personnalisé (Custom Code) → Ajouter du code au Head.",
        paste: "Colle le bloc <script type=\"application/ld+json\">, applique-le à « Toutes les pages » ou à la page d'accueil, puis Appliquer.",
        verify: VERIFY_JSONLD.fr.verify,
      },
      en: {
        where: "Wix → Settings → Custom Code → Add code to Head.",
        paste: "Paste the <script type=\"application/ld+json\"> block, apply it to “All pages” or the homepage, then Apply.",
        verify: VERIFY_JSONLD.en.verify,
      },
    },
    llms: {
      fr: {
        where: "Wix ne sert pas de fichier libre à la racine du domaine : llms.txt ne peut pas être posé nativement.",
        paste: "Passe cette étape — les deux autres fichiers comptent davantage sur Wix.",
        verify: "Ouvre https://tondomaine/llms.txt : une 404 confirme que Wix ne le sert pas ; il n'y a rien à corriger de ton côté.",
      },
      en: {
        where: "Wix doesn't serve arbitrary root files: llms.txt can't be placed natively.",
        paste: "Skip this step — the other two files matter more on Wix.",
        verify: "Open https://yourdomain/llms.txt: a 404 confirms Wix doesn't serve it; there's nothing to fix on your side.",
      },
    },
    robots: {
      fr: {
        where: "Wix → Paramètres → Outils SEO → Éditeur de robots.txt.",
        paste: "Ajoute les lignes fournies à la fin du fichier, puis Enregistrer.",
        verify: "Ouvre https://tondomaine/robots.txt : les lignes doivent apparaître. GetPick re-vérifie à ton prochain re-test.",
      },
      en: {
        where: "Wix → Settings → SEO Tools → robots.txt editor.",
        paste: "Append the provided lines to the end of the file, then Save.",
        verify: "Open https://yourdomain/robots.txt: the lines must appear. GetPick re-checks at your next re-test.",
      },
    },
  },
  squarespace: {
    jsonld: {
      fr: {
        where: "Squarespace → Paramètres → Avancé → Injection de code → champ En-tête (Header).",
        paste: "Colle le bloc <script type=\"application/ld+json\"> dans le champ Header, puis Enregistrer.",
        verify: VERIFY_JSONLD.fr.verify,
      },
      en: {
        where: "Squarespace → Settings → Advanced → Code Injection → Header field.",
        paste: "Paste the <script type=\"application/ld+json\"> block into the Header field, then Save.",
        verify: VERIFY_JSONLD.en.verify,
      },
    },
    llms: {
      fr: {
        where: "Squarespace ne sert pas de fichier libre à la racine du domaine : llms.txt ne peut pas être posé nativement.",
        paste: "Passe cette étape — les deux autres fichiers comptent davantage sur Squarespace.",
        verify: "Ouvre https://tondomaine/llms.txt : une 404 confirme que Squarespace ne le sert pas ; rien à corriger de ton côté.",
      },
      en: {
        where: "Squarespace doesn't serve arbitrary root files: llms.txt can't be placed natively.",
        paste: "Skip this step — the other two files matter more on Squarespace.",
        verify: "Open https://yourdomain/llms.txt: a 404 confirms Squarespace doesn't serve it; nothing to fix on your side.",
      },
    },
    robots: {
      fr: {
        where: "Squarespace gère robots.txt lui-même et ne permet pas de l'éditer.",
        paste: "Aucun geste possible dans Squarespace ; si un crawler IA est bloqué, c'est un réglage Squarespace (paramètres de crawl IA), pas ton fichier.",
        verify: "Vérifie Paramètres → Crawlers IA dans Squarespace, puis GetPick re-vérifie l'accès à ton prochain re-test.",
      },
      en: {
        where: "Squarespace manages robots.txt itself and doesn't allow editing it.",
        paste: "No action is possible inside Squarespace; if an AI crawler is blocked, it's a Squarespace setting (AI crawler settings), not your file.",
        verify: "Check Settings → AI crawlers in Squarespace, then GetPick re-checks access at your next re-test.",
      },
    },
  },
  prestashop: {
    jsonld: {
      fr: {
        where: "Le template d'en-tête de ton thème PrestaShop (themes/<ton-thème>/templates/_partials/head.tpl), via FTP ou l'éditeur de ton hébergeur.",
        paste: "Colle le bloc <script type=\"application/ld+json\"> avant </head>, puis vide le cache PrestaShop (Paramètres avancés → Performances).",
        verify: VERIFY_JSONLD.fr.verify,
      },
      en: {
        where: "Your PrestaShop theme's head template (themes/<your-theme>/templates/_partials/head.tpl), via FTP or your host's editor.",
        paste: "Paste the <script type=\"application/ld+json\"> block before </head>, then clear the PrestaShop cache (Advanced Parameters → Performance).",
        verify: VERIFY_JSONLD.en.verify,
      },
    },
    llms: {
      fr: {
        where: "La racine de ton installation PrestaShop (le dossier où vit le robots.txt), via FTP ou le gestionnaire de fichiers de l'hébergeur.",
        paste: "Crée un fichier nommé exactement llms.txt à cette racine et colles-y le contenu fourni.",
        verify: "Ouvre https://tondomaine/llms.txt : tu dois voir exactement le texte collé, pas une 404.",
      },
      en: {
        where: "Your PrestaShop installation root (the folder where robots.txt lives), via FTP or your host's file manager.",
        paste: "Create a file named exactly llms.txt at that root and paste the provided content into it.",
        verify: "Open https://yourdomain/llms.txt: you must see exactly the pasted text, not a 404.",
      },
    },
    robots: {
      fr: {
        where: "Le fichier robots.txt à la racine de ton installation PrestaShop, via FTP (attention : le régénérer depuis l'admin l'écraserait).",
        paste: "Ajoute les lignes fournies à la fin du fichier — ne supprime rien d'autre.",
        verify: "Ouvre https://tondomaine/robots.txt : les lignes doivent apparaître. GetPick re-vérifie à ton prochain re-test.",
      },
      en: {
        where: "The robots.txt file at your PrestaShop installation root, via FTP (careful: regenerating it from the admin would overwrite it).",
        paste: "Append the provided lines to the end of the file — don't remove anything else.",
        verify: "Open https://yourdomain/robots.txt: the lines must appear. GetPick re-checks at your next re-test.",
      },
    },
  },
};

/**
 * Rend le guide pour UN fichier et UNE plateforme détectée.
 * Plateforme "inconnu" (ou volet manquant) ⇒ guide générique, `generic: true`.
 * Jamais de guide spécifique pour une plateforme non détectée.
 */
export function installGuide(file: GuideFile, platform: DetectedPlatform, locale: GuideLocale): InstallGuide {
  if (platform !== "inconnu") {
    const specific = SPECIFIC[platform]?.[file]?.[locale];
    if (specific) return { ...specific, generic: false };
  }
  return { ...GENERIC[file][locale], generic: true };
}
