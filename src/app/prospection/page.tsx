import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { localeFromHeaders } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Politique de prospection.
 *
 * Ce n'est pas une page de conformité de façade : c'est l'adresse qu'on met dans
 * le pied de chaque email sortant, pour que le destinataire puisse vérifier en
 * dix secondes d'où vient son adresse et comment nous faire taire. C'est aussi ce
 * qui rend la base légale « intérêt légitime » défendable — cette base suppose
 * qu'on ait mis en balance notre intérêt et celui de la personne, et qu'on lui
 * ait donné les moyens de s'y opposer sans effort.
 *
 * Elle décrit un dispositif qui existe vraiment : les tables créées par
 * `001_prospection_compliance` (registre, oppositions, journal des envois). Toute
 * promesse ajoutée ici doit correspondre à quelque chose que le code fait.
 *
 * Responsable de traitement renseigné le 2026-07-29 par Charles : c'était le seul
 * point de la page qui ne pouvait pas être déduit du code, et il est obligatoire
 * pour que la prospection à froid repose sur une base légale opposable.
 *
 * `name` porte la RAISON SOCIALE, pas le nom commercial : c'est KINZE SAS qui est
 * responsable du traitement, « GetPick » n'est que la marque sous laquelle le
 * service est exploité. Écrire « GetPick » ici aurait désigné une entité qui
 * n'existe pas juridiquement, donc une mention inopposable.
 *
 * Le numéro RCS n'est pas renseigné : il n'a pas été fourni et ne se déduit pas.
 * Il n'est pas exigé pour l'identification du responsable de traitement (RGPD
 * art. 13), mais il le serait pour des mentions légales complètes.
 */
const LEGAL_ENTITY = {
  name: "KINZE SAS",
  postalAddress: "30 rue Juliette Lamber, 75017 Paris",
  contactEmail: "charles@freegetpick.com",
};

const LAST_UPDATED = "2026-07-28";

const COPY = {
  fr: {
    title: "Politique de prospection",
    metaTitle: "Politique de prospection — GetPick",
    metaDescription:
      "D'où vient votre adresse, à quel titre nous vous écrivons, ce que nous conservons et comment vous y opposer en un clic.",
    intro:
      "Vous avez reçu un email de notre part et vous voulez savoir pourquoi. Cette page répond à la question sans détour : d'où vient votre adresse, à quel titre nous vous écrivons, ce que nous gardons, et comment nous faire arrêter.",
    sections: [
      {
        heading: "Pourquoi vous avez reçu ce message",
        body: [
          "Nous écrivons à des marques dont un test public montre qu'un assistant IA recommande un concurrent nommé à leur place sur des questions d'achat de leur catégorie. Le message vous est adressé en votre qualité professionnelle, à une adresse professionnelle, sur un sujet qui relève de votre fonction.",
          "Nous n'écrivons pas à des adresses personnelles, et nous n'achetons aucun fichier.",
        ],
      },
      {
        heading: "D'où vient votre adresse",
        body: [
          "De sources publiques, et uniquement d'elles : la page contact ou les mentions légales de votre propre site, un annuaire ou un registre de certification auquel votre marque adhère, ou une publication professionnelle. La source exacte et la date de collecte de chaque adresse sont enregistrées dans notre registre de prospection — si vous nous les demandez, nous vous répondons avec l'URL précise.",
          "Nous ne devinons pas d'adresses à partir d'un modèle du type prénom.nom@domaine.",
        ],
      },
      {
        heading: "Ce que nous conservons",
        body: [
          "Votre adresse professionnelle, le nom de votre marque et son domaine, le nom du contact quand il est publié, la source et la date de collecte, la base légale, et l'historique des messages envoyés et de leurs retours (envoyé, ouvert, cliqué, répondu, en erreur).",
          "Nous ne conservons pas le corps intégral de vos réponses : seul un extrait est journalisé, le message complet reste dans la boîte mail.",
        ],
      },
      {
        heading: "Sur quelle base légale",
        body: [
          "L'intérêt légitime (article 6.1.f du RGPD), dans le cadre d'une prospection entre professionnels. Cette base suppose une mise en balance : notre intérêt à vous présenter un constat vérifiable sur votre visibilité, contre votre droit à ne pas être sollicité. C'est cette page, le lien de désinscription présent dans chaque message et le traitement immédiat de toute opposition qui font pencher la balance — et si elle ne penche pas pour vous, un clic suffit.",
        ],
      },
      {
        heading: "Combien de temps",
        body: [
          "Trois ans à compter du dernier contact, conformément à la recommandation de la CNIL pour la prospection B2B. L'échéance est calculée automatiquement à chaque envoi, elle n'est pas tenue à la main.",
          "Une opposition, en revanche, est conservée sans limite de durée : c'est la seule façon de garantir qu'un sourcing futur ne vous recontacte pas. Nous gardons l'adresse pour ne plus jamais vous écrire, pas pour vous écrire.",
        ],
      },
      {
        heading: "Comment vous y opposer",
        body: [
          "Le lien de désinscription en bas de chaque message suffit — il est traité automatiquement, sans réponse à rédiger ni justification à donner. Vous pouvez aussi répondre au message ou écrire à l'adresse ci-dessous en demandant l'arrêt.",
          "Dans les deux cas, votre adresse est inscrite immédiatement sur notre liste d'opposition, interrogée avant chaque envoi. Il n'y a pas de délai de grâce pendant lequel un message resterait en file.",
        ],
      },
      {
        heading: "Vos autres droits",
        body: [
          "Accès, rectification, effacement, limitation et portabilité s'exercent à la même adresse. Nous répondons sous un mois. Vous pouvez également introduire une réclamation auprès de la CNIL.",
        ],
      },
      {
        heading: "Qui d'autre voit ces données",
        body: [
          "Nos prestataires techniques, chacun pour une seule fonction : Instantly (envoi des séquences d'email), Neon (base de données), Vercel (hébergement du site), Resend (emails transactionnels : rapports d'audit et relances), PostHog (mesure d'audience, sur son instance européenne, via notre propre domaine).",
          "Nous ne vendons, ne louons et n'échangeons aucune donnée de prospection.",
        ],
      },
    ],
    contactHeading: "Nous écrire",
    updated: "Dernière mise à jour",
    back: "← Retour à l'accueil",
  },
  en: {
    title: "Outbound policy",
    metaTitle: "Outbound policy — GetPick",
    metaDescription:
      "Where your address came from, why we wrote to you, what we keep, and how to opt out in one click.",
    intro:
      "You got an email from us and you want to know why. This page answers it plainly: where your address came from, on what grounds we wrote to you, what we keep, and how to make it stop.",
    sections: [
      {
        heading: "Why you received this message",
        body: [
          "We write to brands where a public test shows an AI assistant recommending a named competitor in their place, on buying questions in their own category. The message is addressed to you in your professional capacity, at a professional address, about a subject within your role.",
          "We do not write to personal addresses, and we buy no lists.",
        ],
      },
      {
        heading: "Where your address came from",
        body: [
          "Public sources, and only those: the contact page or legal notice of your own site, a directory or certification register your brand belongs to, or a trade publication. The exact source and collection date of every address are stored in our outbound register — ask us and we will reply with the precise URL.",
          "We do not guess addresses from a firstname.lastname@domain pattern.",
        ],
      },
      {
        heading: "What we keep",
        body: [
          "Your professional address, your brand name and domain, the contact name where it is published, the source and date of collection, the legal basis, and the history of messages sent and what came back (sent, opened, clicked, replied, bounced).",
          "We do not keep the full body of your replies: only a snippet is logged, the complete message stays in the mailbox.",
        ],
      },
      {
        heading: "On what legal basis",
        body: [
          "Legitimate interest (GDPR article 6(1)(f)), in a business-to-business context. That basis requires a balancing test: our interest in showing you a verifiable finding about your visibility, against your right not to be contacted. This page, the unsubscribe link in every message, and immediate handling of any objection are what tip the balance — and if it does not tip your way, one click is enough.",
        ],
      },
      {
        heading: "For how long",
        body: [
          "Three years from the last contact, following the French data protection authority's guidance for B2B outbound. The expiry is computed automatically on every send; it is not maintained by hand.",
          "An objection, by contrast, is kept indefinitely: it is the only way to guarantee a future sourcing run will not reach you again. We keep the address in order never to write to you, not in order to write to you.",
        ],
      },
      {
        heading: "How to opt out",
        body: [
          "The unsubscribe link at the bottom of every message is enough — it is processed automatically, with no reply to write and no reason to give. You can also reply to the message, or write to the address below asking us to stop.",
          "Either way, your address goes straight onto our suppression list, which is checked before every send. There is no grace period during which a queued message could still go out.",
        ],
      },
      {
        heading: "Your other rights",
        body: [
          "Access, rectification, erasure, restriction and portability are exercised at the same address. We answer within one month. You may also lodge a complaint with your national data protection authority.",
        ],
      },
      {
        heading: "Who else sees this data",
        body: [
          "Our technical providers, each for a single function: Instantly (email sequence sending), Neon (database), Vercel (site hosting), Resend (transactional email: audit reports and follow-ups), PostHog (product analytics, on its European instance, proxied through our own domain).",
          "We do not sell, rent or trade any outbound data.",
        ],
      },
    ],
    contactHeading: "Contact us",
    updated: "Last updated",
    back: "← Back to home",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const copy = COPY[localeFromHeaders(await headers())];

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: "https://www.getpick.ai/prospection" },
    // Page de référence citée dans nos emails : elle doit être lisible, pas
    // classée. On ne veut pas qu'elle concurrence les pages produit en SEO.
    robots: { index: true, follow: true },
  };
}

export default async function ProspectionPolicyPage() {
  const locale = localeFromHeaders(await headers());
  const copy = COPY[locale];

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
        <Link href="/" className="text-sm text-[#686879] no-underline hover:text-[#F0F0EC]">
          {copy.back}
        </Link>

        <h1
          className="mt-8 mb-4 text-4xl tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {copy.title}
        </h1>

        <p className="m-0 text-lg leading-relaxed text-[#A0A0AE]">{copy.intro}</p>

        {copy.sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="mb-3 text-xl tracking-[-0.02em]">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-0 mb-3 leading-relaxed text-[#A0A0AE]">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section className="mt-10 rounded-xl border border-white/[0.08] px-5 py-4">
          <h2 className="mb-3 text-xl tracking-[-0.02em]">{copy.contactHeading}</h2>
          <p className="m-0 leading-relaxed text-[#A0A0AE]">
            {LEGAL_ENTITY.name}
            {LEGAL_ENTITY.postalAddress ? ` — ${LEGAL_ENTITY.postalAddress}` : ""}
            <br />
            <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="text-[#CAFF3C]">
              {LEGAL_ENTITY.contactEmail}
            </a>
          </p>
        </section>

        <p className="mt-10 text-sm text-[#444454]">
          {copy.updated} : {LAST_UPDATED}
        </p>
      </main>
    </div>
  );
}
