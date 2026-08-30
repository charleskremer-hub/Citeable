import { NextRequest, NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { ensureAuditSchema, pool } from "@/lib/db";
import { checkFreeAuditQuota, findFreshFreeGeminiAudit, brandDedupeDomain, createCachedFreeAuditForLead, recipientLocaleFromSignals, runQueuedAudit, validateAuditInputAllowAnonymous } from "@/lib/audit-engine";
import { recordFunnelEvent } from "@/lib/funnel";
import { localeFromUnknown } from "@/lib/i18n";
import { requestTrafficClass } from "@/lib/traffic-filter";
import { resolveAuditTierWithEntitlement } from "@/lib/entitlement";

export const maxDuration = 60;

/**
 * Clé de dédup du `email_captured` de la porte d'entrée.
 *
 * Pourquoi PAS `email_captured:<auditId>` comme dans /api/claim-audit : chaque
 * soumission du formulaire crée une NOUVELLE ligne `audits` — y compris le
 * chemin caché, qui clone l'audit source pour le lead (voir
 * `createCachedFreeAuditForLead`). Une double soumission produirait deux
 * auditId distincts, donc deux lignes : le compteur mesurerait des clics, pas
 * des adresses données. La clé porte donc l'adresse (hachée : la table funnel
 * ne stocke aucune donnée personnelle, l'adresse en clair vit dans
 * `email_captures`) et le jour UTC — une adresse donnée deux fois le même jour
 * compte une fois, la même adresse revenue plus tard compte à nouveau.
 * Aucune collision avec les clés `email_captured:<uuid>` de /api/claim-audit :
 * le segment `capture:` n'est pas un uuid. Aucun client ne peut viser cette
 * clé : `email_captured` est dans `SERVER_ONLY_FUNNEL_EVENTS`, les clés client
 * qui empiètent sont re-préfixées (voir `namespacedDedupeKey`).
 */
function emailCapturedDedupeKey(email: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const emailHash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `email_captured:capture:${emailHash}:${day}`;
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();

    // MARQUAGE, jamais blocage — voir /api/run-audit : aucun code HTTP, aucun
    // quota, aucune branche ne dépend de cette valeur.
    const { trafficClass } = requestTrafficClass(req.headers);

    const payload = await req.json();
    // La porte du champ << site >> vit DANS la validation : email deguise en
    // site, URL a identifiants ou hote injoignable sont refuses ici — zero
    // ligne `email_captures`, zero ligne `audits`, zero evenement funnel,
    // zero appel Gemini/Serper.
    const { email, brandName, websiteUrl, anonymous } = await validateAuditInputAllowAnonymous(payload);
    // Le droit est resolu APRES la validation, parce qu'il a besoin de l'email :
    // c'est la cle de la table des abonnements. Cle interne -> abonnement actif ->
    // sinon `free`. Toute panne de base retombe sur `free` (voir entitlement.ts) :
    // Neon indisponible ne doit ni offrir le produit payant, ni jeter une 500 sur
    // une route publique.
    const { tier: auditTier, downgradedFrom: tierDowngradedFrom } =
      await resolveAuditTierWithEntitlement(payload, req.headers, anonymous ? null : email);
    const locale = payload && typeof payload === "object" && "locale" in payload ? localeFromUnknown((payload as Record<string, unknown>).locale) : recipientLocaleFromSignals(email, websiteUrl);
    const dedupeDomain = brandDedupeDomain(websiteUrl);

    // Un audit anonyme n'a pas de lead à enregistrer : l'email est collecté plus
    // tard, une fois le verdict montré (/api/claim-audit).
    if (!anonymous) {
      await pool.query(
        `INSERT INTO email_captures (email, brand_name, website_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
         SET brand_name = EXCLUDED.brand_name,
             website_url = EXCLUDED.website_url`,
        [email, brandName, websiteUrl]
      );
    }

    if (auditTier === "free") {
      const cachedAudit = await findFreshFreeGeminiAudit(brandName, websiteUrl);

      if (cachedAudit) {
        const cachedLeadAudit = await createCachedFreeAuditForLead({ cachedAuditId: cachedAudit.id, email, brandName, websiteUrl, locale, trafficClass });
        const auditId = cachedLeadAudit?.audit_id ?? cachedAudit.id;

        await recordFunnelEvent({
          eventName: "audit_started",
          auditId,
          source: "capture_email_cached",
          metadata: { brandName, websiteUrl, auditTier, tierDowngradedFrom, cachedFromAuditId: cachedAudit.id, locale, trafficClass },
          dedupeKey: `audit_started:${auditId}`,
        });
        await recordFunnelEvent({
          eventName: "audit_completed",
          auditId,
          source: "capture_email_cached",
          metadata: { brandName, websiteUrl, auditTier, tierDowngradedFrom, cachedFromAuditId: cachedAudit.id, locale, trafficClass },
          dedupeKey: `audit_completed:${auditId}`,
        });
        // Le visiteur vient de donner son adresse à la porte : c'est une
        // capture, même servie depuis le cache. Jamais sur le chemin anonyme —
        // là, l'adresse n'existe pas encore, /api/claim-audit la capturera.
        if (!anonymous) {
          await recordFunnelEvent({
            eventName: "email_captured",
            auditId,
            source: "capture_email_cached",
            metadata: { brandName, websiteUrl, auditTier, tierDowngradedFrom, cachedFromAuditId: cachedAudit.id, locale, trafficClass },
            dedupeKey: emailCapturedDedupeKey(email),
          });
        }

        return NextResponse.json(
          {
            ok: true,
            audit_id: auditId,
            website_url: cachedLeadAudit?.website_url ?? cachedAudit.website_url,
            redirect_url: `/audit/${auditId}`,
            status: "completed",
            audit_tier: auditTier,
            cached: true,
            cached_from_audit_id: cachedLeadAudit?.cached_from_audit_id ?? cachedAudit.id,
            email_sent: cachedLeadAudit?.email_sent,
            email_error: cachedLeadAudit?.email_error,
            scheduled_post_audit_emails: cachedLeadAudit?.scheduled_post_audit_emails ?? [],
            locale,
          },
          { status: 200 }
        );
      }

      const quota = await checkFreeAuditQuota(email, websiteUrl);

      if (!quota.allowed) {
        return NextResponse.json({ error: quota.error, limit_type: quota.limitType, retry_after_hours: quota.retryAfterHours }, { status: 429 });
      }
    }

    const audit = await pool.query<{ id: string }>(
      `INSERT INTO audits (email, brand_name, website_url, dedupe_domain, raw_results)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, brandName, websiteUrl, dedupeDomain, { status: "running", queuedAt: new Date().toISOString(), auditTier, locale, anonymous, trafficClass }]
    );

    const auditId = audit.rows[0].id;

    await recordFunnelEvent({
      eventName: "audit_started",
      auditId,
      source: "capture_email",
      metadata: { brandName, websiteUrl, auditTier, tierDowngradedFrom, locale, trafficClass },
      dedupeKey: `audit_started:${auditId}`,
    });

    // Même règle que le chemin caché : un email réel = une capture comptée,
    // rattachée à l'audit pour l'attribution nominative.
    if (!anonymous) {
      await recordFunnelEvent({
        eventName: "email_captured",
        auditId,
        source: "capture_email",
        metadata: { brandName, websiteUrl, auditTier, tierDowngradedFrom, locale, trafficClass },
        dedupeKey: emailCapturedDedupeKey(email),
      });
    }

    after(async () => {
      const result = await runQueuedAudit(auditId);

      if (result.status === "failed") {
        console.error(`[getpick] audit ${auditId} failed after capture: ${result.error}`);
      }
    });

    console.log(`[getpick] audit queued immediately: ${auditId} for ${email}`);

    return NextResponse.json(
      {
        ok: true,
        audit_id: auditId,
        website_url: websiteUrl,
        redirect_url: `/audit/${auditId}`,
        status: "queued",
        audit_tier: auditTier,
        locale,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    // Refus du gate d'entree : 4xx + code stable, que le front mappe vers un
    // message localise. Reconnu par propriete (`gateCode`) et non par import :
    // les tests de route mockent `audit-engine` avec une liste fermee d'exports.
    const maybeGateCode = error instanceof Error ? (error as Error & { gateCode?: unknown }).gateCode : undefined;
    const gateCode = typeof maybeGateCode === "string" ? maybeGateCode : null;

    if (gateCode) {
      return NextResponse.json({ error: message, error_code: gateCode }, { status: 422 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
