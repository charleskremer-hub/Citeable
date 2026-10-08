import { emailDeliveryNoticeVisible, type EmailDeliveryNoticeState } from "@/lib/email-delivery-notice";
import { auditCopyFor, type Locale } from "@/lib/i18n";

/**
 * G2 — UN ENVOI RATÉ NE DOIT JAMAIS ÊTRE MUET.
 *
 * Quand le diagnostic que l'utilisateur a RÉCLAMÉ n'a pas pu lui être envoyé,
 * l'écran de fin d'audit le dit et lui donne le lien direct. Avant ce bloc,
 * seul `/admin/emails`, derrière une clé, savait qu'un rapport n'était pas
 * parti : le prospect, lui, attendait un email qui n'arriverait jamais.
 *
 * Le composant porte SA PROPRE décision d'affichage et rend `null` sinon —
 * `page.tsx` tient sous 600 lignes (contrat AC1) et ne doit pas gagner une
 * condition de plus. La règle elle-même est dans `@/lib/email-delivery-notice`
 * pour être exécutée par la suite de tests, pas seulement relue.
 */
export type EmailDeliveryNoticeProps = EmailDeliveryNoticeState & {
  locale: Locale;
  vous?: boolean;
  reportUrl: string;
};

export default function EmailDeliveryNotice({ locale, vous = false, reportUrl, ...state }: EmailDeliveryNoticeProps) {
  if (!emailDeliveryNoticeVisible(state)) return null;
  const copy = auditCopyFor(locale, vous);

  return (
    <div className="mt-5 rounded-2xl border border-[#8A6420]/25 bg-[#8A6420]/10 p-4 text-sm leading-6 text-[#8A6420]">
      <p className="m-0 font-bold">{copy.emailUndeliveredTitle}</p>
      <p className="m-0 mt-1 text-[#8A6420]/85">{copy.emailUndeliveredBody}</p>
      <p className="m-0 mt-2">
        <span className="font-bold">{copy.emailUndeliveredLinkLabel} : </span>
        <a href={reportUrl} className="break-all font-bold text-[#17705B] underline decoration-[#17705B]/40 underline-offset-4">
          {reportUrl}
        </a>
      </p>
    </div>
  );
}
