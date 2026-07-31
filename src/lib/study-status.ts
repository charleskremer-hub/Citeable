/**
 * ÉTAT DU JEU DE DONNÉES DE L'ÉTUDE 21 MARQUES — SOURCE DE VÉRITÉ UNIQUE.
 *
 * Pourquoi ce module existe. Jusqu'au 30/07/2026 au soir, l'appel d'évaluation
 * envoyait le nom de la marque auditée avec la question d'achat, puis on prenait
 * la réponse du modèle à « l'as-tu citée ? » pour une mesure. Tous les chiffres
 * publiés de l'étude — scores, comptes de mentions, rivaux nommés — sortent de
 * cet instrument. Ils ne sont pas discutables : ils sont faux par construction.
 *
 * L'état est déclaré ICI et nulle part ailleurs. `src/app/study/page.tsx`,
 * `src/lib/i18n.ts` et le test `scripts/study-retraction.test.ts` le lisent.
 * `public/llms.txt` est un fichier statique : il n'est pas dérivé, c'est le test
 * qui le raccroche à cette constante.
 *
 * REPUBLIER : passer `status` à "published" et renseigner `datasetDate` avec la
 * date du jeu de données produit par le rerun. Le test lève alors les bans tout
 * seul et exige que `datasetDate` soit strictement postérieure à
 * `instrumentFixedOn` — aucune ligne de test n'est à modifier.
 *
 * Pas de `as const` sur `STUDY_DATA_STATUS` : le type large est ce qui permet au
 * test de comparer `status` aux deux valeurs sans que TypeScript déclare la
 * comparaison impossible. Un `as const` narrowerait `status` à "withdrawn" et
 * rendrait la bascule impossible sans éditer le test.
 */

export type StudyDataStatus = {
  status: "withdrawn" | "published";
  /** Date ISO à laquelle les chiffres ont été retirés des surfaces publiées. */
  withdrawnOn: string;
  /** Date ISO du correctif de l'instrument de mesure. */
  instrumentFixedOn: string;
  /** Motif du retrait, en une phrase. */
  reason: string;
  /** Date ISO du jeu de données publié. Obligatoire quand `status` vaut "published". */
  datasetDate?: string;
};

/**
 * Le motif, dans les deux langues des surfaces publiées. `reason` de la
 * constante EST la version EN : une seule rédaction, pas deux à maintenir.
 */
const REASON_GIST = {
  en: "the audited brand name was sent to the model along with the buying question",
  fr: "le nom de la marque auditée partait vers le modèle avec la question d'achat",
};

export const STUDY_RETRACTION_REASON = {
  /**
   * Noyau du motif, court exprès : c'est la forme qui tient dans une
   * `openGraph.description`. Le test l'exige sur CHACUNE des quatre surfaces —
   * un retrait sans motif n'est pas un aveu, c'est un effacement.
   */
  gist: REASON_GIST,
  en: `${REASON_GIST.en}, so what we recorded was the model repeating a word we had just handed it`,
  fr: `${REASON_GIST.fr}, donc ce qu'on enregistrait était le modèle répétant un mot qu'on venait de lui souffler`,
};

export const STUDY_DATA_STATUS: StudyDataStatus = {
  status: "withdrawn",
  withdrawnOn: "2026-07-31",
  instrumentFixedOn: "2026-07-30",
  reason: STUDY_RETRACTION_REASON.en,
};

const { withdrawnOn, instrumentFixedOn } = STUDY_DATA_STATUS;

/**
 * La note de retrait, identique de sens en EN et FR, construite depuis la
 * constante pour que les dates ne dérivent jamais d'une surface à l'autre.
 *
 * Dates rendues en ISO-8601 partout, y compris en français : « 31 juillet 2026 »
 * ferait apparaître un « 31 » nu, qui est aussi un score de l'ancien instrument
 * — le ban du test ne pourrait plus distinguer la date du chiffre retiré.
 */
export const studyRetractionNote = {
  en: `Figures withdrawn on ${withdrawnOn}. They were produced by a measurement we fixed on ${instrumentFixedOn}: ${STUDY_RETRACTION_REASON.en}. A rerun on the corrected, blind measurement is under way; nothing is republished until it has landed.`,
  fr: `Chiffres retirés le ${withdrawnOn}. Ils ont été produits par une mesure corrigée le ${instrumentFixedOn} : ${STUDY_RETRACTION_REASON.fr}. Un rerun sur la mesure corrigée, à l'aveugle, est en cours ; rien n'est republié tant qu'il n'a pas rendu.`,
};

const PAGE_URL = "https://www.getpick.ai/study";
const ORIGINALLY_PUBLISHED = "2026-07-19";

/**
 * Toute la copy de `/study`. La page n'écrit aucune phrase en propre : elle rend
 * ce module. C'est ce qui permet au test de scanner les quatre surfaces
 * (metadata, openGraph, JSON-LD, corps) sans rendre le JSX — le runner
 * `node --test` du repo ne transforme pas le JSX.
 */
export const studyPageCopy = {
  url: PAGE_URL,
  originallyPublished: ORIGINALLY_PUBLISHED,

  metaTitle: `21-brand study — figures withdrawn on ${withdrawnOn} | GetPick`,
  metaDescription: `We withdrew every figure of this study on ${withdrawnOn}. The measurement that produced them was defective and was fixed on ${instrumentFixedOn}: ${STUDY_RETRACTION_REASON.en}. A rerun on the corrected measurement is under way.`,

  ogTitle: "21-brand study — figures withdrawn, and here is why",
  ogDescription: `Figures withdrawn on ${withdrawnOn} — ${STUDY_RETRACTION_REASON.gist.en}. The measurement was fixed on ${instrumentFixedOn}; a rerun is under way.`,

  articleHeadline: "We withdrew the figures of our 21-brand study. Here is what broke.",
  articleDescription: `${studyRetractionNote.en} The page stays online, in place of the study, so that anyone who quoted those figures can find out that they no longer stand.`,

  eyebrow: {
    en: `Figures withdrawn on ${withdrawnOn}`,
    fr: `Chiffres retirés le ${withdrawnOn}`,
  },

  headline: {
    en: "We withdrew the figures of this study. Here is why.",
    fr: "On a retiré les chiffres de cette étude. Voici pourquoi.",
  },

  /** Corps de la page, EN puis FR. La note de retrait est le premier paragraphe de chaque bloc. */
  body: {
    en: [
      studyRetractionNote.en,
      "This page used to carry an audit of 21 direct-to-consumer brands: a score per brand, and the name of the rival the assistants recommended instead. Every one of those numbers, and every one of those rival names, came out of the same defective call. We are withdrawing them, and saying so, rather than letting them circulate.",
      "The defect, stated plainly. To find out whether an assistant recommended a brand, we handed it that brand name inside the very request we were measuring, then asked whether it recommended it. The model put the name back into its answer. We were not measuring a brand's visibility — we were measuring a model's willingness to repeat a word we had just fed it. The rival names came out of that same primed call, so they fall with the scores.",
      "No figure published here survives the correction, so we are not adjusting them at the margin. We are rerunning the whole study on the corrected measurement, where the buying question goes out blind — exactly as a shopper would type it — and the mention is observed by us in the free-form answer. This page becomes a study again when that rerun has landed, and not before.",
      "We are leaving the page online instead of deleting it. The address is indexed, cited, and referenced in our llms.txt; a 404 would erase the record without telling anyone. If you have quoted these figures anywhere, they should be withdrawn there too.",
    ],
    fr: [
      studyRetractionNote.fr,
      "Cette page portait l'audit de 21 marques DTC : un score par marque, et le nom du rival recommandé à sa place par les assistants. Tous ces chiffres, et tous ces noms de rivaux, sortent du même appel défectueux. Nous les retirons, et nous le disons, plutôt que de les laisser circuler.",
      "Le défaut, énoncé simplement. Pour savoir si un assistant recommandait une marque, nous lui donnions le nom de cette marque dans la requête même que nous mesurions, puis nous lui demandions s'il la recommandait. Le modèle replaçait ce nom dans sa réponse. Nous ne mesurions pas la visibilité d'une marque : nous mesurions la disposition d'un modèle à répéter un mot qu'on venait de lui souffler. Les noms de rivaux sortaient du même appel amorcé : ils tombent avec les scores.",
      "Aucun chiffre publié ici ne survit à la correction, nous ne les ajustons donc pas à la marge. Nous rejouons l'étude entière sur la mesure corrigée, où la question d'achat part à l'aveugle — exactement comme la taperait un acheteur — et où la mention est constatée par nous dans la réponse libre. Cette page redeviendra une étude quand ce rerun aura rendu, pas avant.",
      "Nous laissons la page en ligne au lieu de la supprimer. L'adresse est indexée, citée et référencée dans notre llms.txt ; un 404 effacerait la trace sans prévenir personne. Si vous avez repris ces chiffres quelque part, ils sont à y retirer aussi.",
    ],
  },

  frenchHeading: "En français",

  cta: {
    en: "Run an audit on the corrected measurement →",
    fr: "Lancer un audit sur la mesure corrigée →",
  },
};

/**
 * JSON-LD `Article`. Construit ici pour que le test puisse scanner la surface
 * structurée telle qu'elle est expédiée, et pas une approximation.
 *
 * `@type: "Article"` et `datePublished` d'origine conservés : c'est le même
 * document, corrigé, pas un autre. `correction` porte le démenti dans le graphe
 * lui-même — c'est ce qu'un moteur lit quand il a déjà mis le chiffre en cache.
 */
export const studyArticleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: studyPageCopy.articleHeadline,
  datePublished: ORIGINALLY_PUBLISHED,
  dateModified: withdrawnOn,
  url: PAGE_URL,
  author: { "@type": "Organization", name: "GetPick", url: "https://www.getpick.ai" },
  publisher: { "@type": "Organization", name: "GetPick" },
  about: "Withdrawal of the figures of a study on the AI visibility of direct-to-consumer brands",
  description: studyPageCopy.articleDescription,
  correction: {
    "@type": "CorrectionComment",
    text: studyRetractionNote.en,
    datePublished: withdrawnOn,
  },
};
