import type { Metadata } from "next";
import { ensureAuditSchema, pool } from "@/lib/db";

// Page admin toujours fraîche : requête la base à chaque chargement (Reload = live).
export const dynamic = "force-dynamic";

// Jamais indexée : c'est un tableau de bord interne derrière une clé.
export const metadata: Metadata = {
  title: "GetPick — Emails d'audit",
  robots: { index: false, follow: false },
};

const ADMIN_KEY = process.env.FUNNEL_ADMIN_KEY;

/** Comparaison à temps constant (même logique que /api/funnel). */
function secretMatches(provided: string | null | undefined, expected: string | undefined) {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

type StatusRow = { status: string; step: string; n: string };
type RecentRow = {
  email: string;
  step: string;
  status: string;
  reason: string | null;
  provider_status: string | null;
  provider_message_id: string | null;
  created_at: Date;
};

const BG = "#09090B";
const PANEL = "#141417";
const LINE = "#26262B";
const ACCENT = "#CAFF3C";
const WARN = "#FF8F6B";
const MUTED = "#8A8A93";

function statusColor(status: string) {
  if (status === "sent") return ACCENT;
  if (status === "failed") return "#FF5C5C";
  if (status === "suppressed") return WARN;
  return MUTED;
}

function fmt(dt: Date) {
  return new Date(dt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: "100vh", background: BG, color: "#F4F4F5", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>{children}</div>
    </main>
  );

  if (!secretMatches(key, ADMIN_KEY)) {
    return shell(
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 32 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Accès protégé</h1>
        <p style={{ color: MUTED, marginTop: 12, lineHeight: 1.6 }}>
          Ajoute ta clé admin dans l&apos;URL : <code style={{ color: ACCENT }}>/admin/emails?key=TA_CLE</code>
          <br />
          (la valeur de <code>FUNNEL_ADMIN_KEY</code> sur Vercel).
        </p>
      </div>
    );
  }

  await ensureAuditSchema();

  const byStatus = await pool.query<StatusRow>(
    `SELECT status, step, COUNT(*)::text AS n
     FROM audit_email_delivery_log
     WHERE created_at >= now() - interval '14 days'
     GROUP BY status, step
     ORDER BY status, step`
  );

  const recent = await pool.query<RecentRow>(
    `SELECT email, step, status, reason, provider_status, provider_message_id, created_at
     FROM audit_email_delivery_log
     ORDER BY created_at DESC
     LIMIT 40`
  );

  const totals = byStatus.rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + Number(r.n);
    return acc;
  }, {});
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const sent = totals.sent ?? 0;
  const rate = grand > 0 ? Math.round((sent / grand) * 100) : 0;

  const cards: Array<{ label: string; value: string; color: string }> = [
    { label: "Envoyés (14 j)", value: String(sent), color: ACCENT },
    { label: "Supprimés", value: String(totals.suppressed ?? 0), color: WARN },
    { label: "Échecs", value: String(totals.failed ?? 0), color: "#FF5C5C" },
    { label: "Taux d'envoi", value: `${rate}%`, color: "#F4F4F5" },
  ];

  return shell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0, letterSpacing: -0.4 }}>
          <span style={{ color: ACCENT }}>GetPick</span> — Emails d&apos;audit
        </h1>
        <span style={{ color: MUTED, fontSize: 13 }}>Recharge la page pour rafraîchir · 14 derniers jours</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 16px" }}>
            <div style={{ color: MUTED, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 30, fontWeight: 700, marginTop: 8 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {(totals.suppressed ?? 0) > 0 && (
        <div style={{ background: "rgba(255,143,107,0.08)", border: `1px solid ${WARN}`, borderRadius: 12, padding: "12px 16px", marginBottom: 24, color: WARN, fontSize: 14 }}>
          {totals.suppressed} email(s) supprimé(s) avant envoi sur 14 j — bloqués par une règle (domaine interne, liste de suppression, audit anonyme). Détail dans la colonne « raison ».
        </div>
      )}

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: MUTED }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Quand</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Email</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Étape</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Statut</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Raison / provider</th>
            </tr>
          </thead>
          <tbody>
            {recent.rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, color: MUTED, textAlign: "center" }}>Aucun envoi enregistré pour l&apos;instant.</td>
              </tr>
            )}
            {recent.rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: "11px 16px", color: MUTED, whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                <td style={{ padding: "11px 16px" }}>{r.email}</td>
                <td style={{ padding: "11px 16px", color: MUTED }}>{r.step}</td>
                <td style={{ padding: "11px 16px" }}>
                  <span style={{ color: statusColor(r.status), fontWeight: 600 }}>{r.status}</span>
                </td>
                <td style={{ padding: "11px 16px", color: MUTED }}>
                  {r.reason ?? (r.provider_message_id ? `${r.provider_status ?? "ok"} · ${r.provider_message_id.slice(0, 12)}…` : (r.provider_status ?? "—"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: MUTED, fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
        <strong style={{ color: "#F4F4F5" }}>sent</strong> = accepté par Resend (vérifie la délivrabilité réelle sur resend.com) ·{" "}
        <strong style={{ color: "#F4F4F5" }}>suppressed</strong> = bloqué avant envoi ·{" "}
        <strong style={{ color: "#F4F4F5" }}>failed</strong> = tentative en erreur. Étapes : audit_result (rapport), j1_value / j2_value (relances), weekly_monitoring.
      </p>
    </>
  );
}
