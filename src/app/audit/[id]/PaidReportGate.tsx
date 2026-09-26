import { AGENT_CHECKOUT_URL, MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import type { Locale } from "@/lib/i18n";
import { SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";
import FunnelCheckoutLink from "./FunnelCheckoutLink";

/**
 * Porte de paiement d'un rapport de tier payant sans abonnement vérifiable
 * (raison `paywall` de src/lib/report-access.ts). Extraite de page.tsx le
 * 08/08/2026, contenu inchangé — y compris le data-testid sur lequel s'appuie
 * e2e/audit-report-gate.spec.ts.
 */
export default function PaidReportGate({ auditId, isAgentReport, locale }: { auditId: string; isAgentReport: boolean; locale: Locale }) {
  return (
    <section className="rounded-[1.5rem] border border-[#123E5C]/30 bg-[#123E5C]/[0.06] p-5 sm:p-6" data-testid="paid-report-gate">
      <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">
        {locale === "fr" ? "Rapport complet" : "Full report"}
      </p>
      <h2 className="m-0 mt-2 text-2xl leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
        {locale === "fr"
          ? "Ton score est calculé. Le détail s'ouvre avec ton abonnement."
          : "Your score is calculated. The detail opens with your subscription."}
      </h2>
      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#5B6B82]">
        {locale === "fr"
          ? "Questions d'achat testées, concurrents cités à ta place, contenus à coller et fichiers techniques : tout est déjà produit pour ta marque."
          : "Buyer questions tested, competitors cited instead of you, ready-to-paste content and technical files: all already produced for your brand."}
      </p>
      <FunnelCheckoutLink
        auditId={auditId}
        href={isAgentReport ? AGENT_CHECKOUT_URL : MONITOR_CHECKOUT_URL}
        source="report_paid_gate"
        className="mt-4 inline-flex rounded-xl bg-[#123E5C] px-5 py-3 text-sm font-black text-white no-underline transition hover:brightness-110"
      >
        {/* Un seul prix public depuis le pivot du 22/09 : le libellé ne nomme plus
            le palier interne du rapport, il nomme l'offre qu'on vend. */}
        {locale === "fr" ? `Ouvrir mon rapport — ${SERVICE_PLAN_PRICE_EUR} € →` : `Open my report — €${SERVICE_PLAN_PRICE_EUR} →`}
      </FunnelCheckoutLink>
      <p className="m-0 mt-3 text-xs font-bold text-[#8FA0B4]">
        {locale === "fr"
          ? "Déjà abonné ? Ouvre ce rapport avec l'adresse de ton abonnement."
          : "Already subscribed? Open this report with your subscription address."}
      </p>
    </section>
  );
}
