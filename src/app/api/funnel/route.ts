import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { FUNNEL_EVENTS, isFunnelEventName, recordFunnelEvent } from "@/lib/funnel";
import { classifyTraffic, clientIpFromHeaders, parseInternalIps } from "@/lib/traffic-filter";

export const dynamic = "force-dynamic";

type FunnelCountRow = {
  event_name: string;
  count: string;
};

type FunnelEventRow = {
  id: string;
  event_name: string;
  audit_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

function clientContext(req: NextRequest) {
  return {
    path: req.nextUrl.pathname,
    referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  };
}

/**
 * Comparaison à temps constant pour éviter de laisser fuiter la clé octet par octet.
 */
function secretMatches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * GET public = compteurs agrégés UNIQUEMENT.
 *
 * `recent_events` exposait 100 événements bruts (audit_id, source, metadata →
 * noms de marques auditées, scores, URLs de rapports) à qui appelait l'URL :
 * fuite business + données clients identifiables (RGPD). Les compteurs suffisent
 * au monitoring et ne révèlent aucun client.
 *
 * Le détail reste accessible avec le header `x-funnel-key` == FUNNEL_ADMIN_KEY.
 * Si la variable d'env n'est pas définie, le mode détaillé est simplement
 * indisponible — jamais ouvert par défaut.
 */
export async function GET(req: NextRequest) {
  await ensureAuditSchema();

  const adminKey = process.env.FUNNEL_ADMIN_KEY;
  const detailed = secretMatches(req.headers.get("x-funnel-key"), adminKey);

  const countsResult = await pool.query<FunnelCountRow>(
    `SELECT event_name, COUNT(*)::text AS count
     FROM audit_funnel_events
     WHERE created_at >= now() - interval '14 days'
     GROUP BY event_name`
  );

  const counts = Object.fromEntries(FUNNEL_EVENTS.map((eventName) => [eventName, 0])) as Record<(typeof FUNNEL_EVENTS)[number], number>;

  for (const row of countsResult.rows) {
    if (isFunnelEventName(row.event_name)) {
      counts[row.event_name] = Number(row.count);
    }
  }

  if (!detailed) {
    return NextResponse.json(
      { ok: true, window: "14d", counts },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const recentResult = await pool.query<FunnelEventRow>(
    `SELECT id, event_name, audit_id, source, metadata, created_at
     FROM audit_funnel_events
     ORDER BY created_at DESC
     LIMIT 100`
  );

  return NextResponse.json(
    {
      ok: true,
      window: "14d",
      counts,
      recent_events: recentResult.rows.map((row) => ({
        id: row.id,
        event_name: row.event_name,
        audit_id: row.audit_id,
        source: row.source,
        metadata: row.metadata ?? {},
        created_at: row.created_at.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST = enregistrement des événements émis par le NAVIGATEUR.
 *
 * Cette route est le seul point d'entrée client du funnel, donc le seul endroit
 * où le tri du trafic a un sens : les événements serveur (`audit_started`,
 * `audit_completed`, `followup_*`) passent directement par `recordFunnelEvent`
 * et ne sont pas concernés.
 *
 * Le tri est un REFUS SILENCIEUX, jamais une erreur HTTP : un crawler qui reçoit
 * un 4xx réessaie, et un navigateur interne n'a rien à corriger. On répond 200
 * avec le compte de ce qui a été écarté et pourquoi, ce qui rend le débruitage
 * lisible depuis les logs sans avoir à tenir un journal CSV à la main comme le
 * 28/07.
 */
export async function POST(req: NextRequest) {
  await ensureAuditSchema();

  const payload = await req.json().catch(() => null);
  const events = Array.isArray(payload?.events) ? payload.events : [payload];

  const verdict = classifyTraffic({
    userAgent: req.headers.get("user-agent"),
    cookieHeader: req.headers.get("cookie"),
    ip: clientIpFromHeaders(req.headers),
    internalIps: parseInternalIps(process.env.INTERNAL_IPS),
    ipSalt: process.env.IP_HASH_SALT,
  });

  if (!verdict.accepted) {
    return NextResponse.json(
      { ok: true, recorded: 0, skipped: events.length, skipped_reason: verdict.rejectedBy },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  let recorded = 0;

  for (const item of events) {
    if (!item || typeof item !== "object" || !isFunnelEventName((item as { event_name?: unknown }).event_name)) continue;

    const body = item as {
      event_name: (typeof FUNNEL_EVENTS)[number];
      audit_id?: unknown;
      source?: unknown;
      metadata?: unknown;
      dedupe_key?: unknown;
    };

    await recordFunnelEvent({
      eventName: body.event_name,
      auditId: typeof body.audit_id === "string" ? body.audit_id : null,
      source: typeof body.source === "string" ? body.source : "client",
      metadata: {
        ...clientContext(req),
        // Empreinte salée, jamais l'IP : de quoi reconnaître un même visiteur
        // sans stocker de donnée personnelle. Vaut `null` tant que `IP_HASH_SALT`
        // n'est pas défini — on préfère ne rien écrire qu'écrire un condensat
        // que n'importe qui peut inverser par force brute sur l'espace IPv4.
        ipHash: verdict.ipHash,
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
      },
      dedupeKey: typeof body.dedupe_key === "string" ? body.dedupe_key : null,
    });
    recorded += 1;
  }

  return NextResponse.json({ ok: true, recorded }, { headers: { "Cache-Control": "no-store" } });
}
