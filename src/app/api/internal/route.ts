import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_COOKIE } from "@/lib/traffic-filter";

/**
 * `GET /api/internal` — marquer CE navigateur comme interne, en un clic.
 *
 * POURQUOI CETTE ROUTE EXISTE, ET POURQUOI MAINTENANT. Le 14/08/2026, entre
 * 23:19:38 et 23:35:47 UTC, `report_viewed.human` — la north star, ventilée par
 * `counts_by_traffic_class` dans `GET /api/funnel` — est passé de 0 à 1. C'était
 * la première valeur non nulle depuis la mise en place de la classification le
 * 30/07. Or AUCUN email de prospection n'était parti depuis 22 jours : personne
 * n'avait de raison d'ouvrir un rapport ce soir-là, sauf nous. L'explication la
 * plus probable — et de loin — est que quelqu'un de chez GetPick a ouvert un
 * rapport depuis son propre navigateur. Une north star dont la seule valeur non
 * nulle de l'histoire est probablement produite par l'équipe elle-même ne mesure
 * rien : elle décrit notre propre activité, pas l'intérêt d'un prospect.
 *
 * POURQUOI CE N'EST PAS UN INCIDENT ISOLÉ MAIS UN TROU STRUCTUREL. Des trois
 * filtres internes de `traffic-filter.ts`, le cookie est le plus fiable —
 * déclaratif, zéro heuristique, zéro faux positif, et il survit à une IP
 * dynamique (box, VPN, 4G). C'est aussi le seul qui n'était, en pratique, JAMAIS
 * posé : le geste documenté était de coller `document.cookie = "gp_internal=1;
 * path=/; max-age=31536000"` dans la console devtools. Infaisable sur mobile, à
 * refaire à chaque navigateur, à chaque profil, à chaque expiration. Le filtre
 * par IP, lui, ne filtrait rien du tout : `INTERNAL_IPS` n'est pas définie dans
 * l'environnement Vercel. Résultat : toute vue de rapport par l'équipe atterrit
 * dans `human`, donc dans la north star. Un filtre qui demande une console
 * devtools est un filtre qu'on ne pose pas.
 *
 * POURQUOI ÇA NE PEUT PAS ATTENDRE. La classification n'est PAS rétroactive :
 * `traffic_class_since` publie la date de rupture, et tout ce qui a été écrit
 * avant reste `unknown` à jamais (voir `trafficClassOrUnknown`). Une vue interne
 * mal classée aujourd'hui ne se répare pas demain — elle reste `human` pour
 * toujours. Chaque jour sans marquage praticable brûle définitivement la
 * lisibilité des événements de ce jour-là. D'où une route, ouverte dans un
 * navigateur, y compris un téléphone, en un clic.
 *
 * PAS D'AUTHENTIFICATION — arbitré, et délibéré. La route n'est liée de nulle
 * part (ni nav, ni sitemap, ni robots.txt, ni llms.txt) et porte un
 * `X-Robots-Tag: noindex, nofollow`. Le pire cas est qu'un inconnu, ayant deviné
 * une URL liée nulle part, s'exclue LUI-MÊME de la mesure : ça SOUS-compte la
 * north star au lieu de la gonfler. Or le mode de défaillance qu'on corrige ici
 * est exactement l'inverse — un compteur gonflé par nous-mêmes. Ajouter un
 * secret rendrait le geste plus lourd que la console devtools qu'on remplace, et
 * on retomberait dans le filtre qu'on ne pose jamais.
 */

export const dynamic = "force-dynamic";

/** Un an, en secondes. Même durée que le geste devtools qu'on remplace. */
const ONE_YEAR_SECONDS = 31536000;

/**
 * `Path=/` sur la pose ET sur le retrait.
 *
 * Un cookie ne se supprime que par un `Set-Cookie` portant EXACTEMENT le même
 * `Path` que celui de la pose : avec un `Path` différent le navigateur garde les
 * deux cookies, continue d'envoyer l'ancien, et `/api/internal?off=1` répondrait
 * « c'est retiré » alors que rien ne l'est. D'où une seule constante, utilisée
 * par les deux branches — on ne peut pas les faire diverger.
 */
const COOKIE_PATH = "/";

/**
 * `Secure` UNIQUEMENT hors production locale.
 *
 * Un cookie `Secure` posé sur `http://localhost` est ignoré par le navigateur
 * SANS AUCUN message : la page dirait « ce navigateur est marqué INTERNE » et le
 * cookie n'existerait pas. C'est exactement la classe de panne silencieuse que
 * cette route existe pour supprimer, donc on lit l'environnement au moment de la
 * requête plutôt que de figer la valeur au chargement du module.
 */
function cookieAttributes(): string[] {
  const attributes = [`Path=${COOKIE_PATH}`, "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes;
}

/**
 * PAS de `HttpOnly`, et c'est délibéré.
 *
 * `PostHogInit.tsx` lit ce cookie EN JAVASCRIPT (`document.cookie`) pour ne pas
 * charger PostHog sur nos propres navigateurs. Un `HttpOnly` rendrait le cookie
 * invisible au client : le filtrage serveur continuerait de fonctionner, PostHog
 * se rechargerait sur nos navigateurs, et les deux mesures divergeraient sans
 * que rien n'échoue. Une moitié du besoin cassée en silence.
 */
function setCookieOn(): string {
  return [`${INTERNAL_COOKIE}=1`, ...cookieAttributes(), `Max-Age=${ONE_YEAR_SECONDS}`].join("; ");
}

function setCookieOff(): string {
  return [`${INTERNAL_COOKIE}=`, ...cookieAttributes(), "Max-Age=0"].join("; ");
}

/**
 * HTML minimal, sans dépendance, sans CSS externe, sans JS : la page est ouverte
 * à la main dans un navigateur (souvent un téléphone), elle doit dire en clair
 * l'état obtenu et rappeler l'URL inverse. Rien à échouer au chargement.
 */
function page(input: { title: string; state: string; explanation: string; reverseHref: string; reverseLabel: string }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${input.title}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem 1.25rem; line-height: 1.5; max-width: 40rem; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
p { margin: 0 0 1rem; }
code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 0.2rem; }
</style>
</head>
<body>
<h1>${input.state}</h1>
<p>${input.explanation}</p>
<p>Pour faire l'inverse : <a href="${input.reverseHref}">${input.reverseLabel}</a></p>
</body>
</html>
`;
}

function html(body: string, cookie: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": cookie,
      // Une réponse qui pose un cookie ne doit jamais être servie depuis un
      // cache : un `?off=1` mis en cache reposerait le retrait à l'infini, et un
      // cache partagé pourrait servir notre `Set-Cookie` à quelqu'un d'autre.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(req: NextRequest) {
  const off = req.nextUrl.searchParams.get("off");
  // Tolérant à la saisie : la route est tapée à la main, souvent sur un
  // téléphone. Toute valeur de `off` autre que « 0 » (et que la chaîne vide)
  // vaut retrait — `?off=1`, `?off=true`, `?off` se comportent pareil. On préfère
  // un retrait involontaire, qui se répare en rouvrant l'URL, à un « marqué
  // interne » cru à tort, qui pollue la north star sans se réparer.
  const wantsOff = off !== null && off !== "" && off !== "0";

  if (wantsOff) {
    return html(
      page({
        title: "GetPick — navigateur non interne",
        state: "Ce navigateur n'est plus marqué interne",
        explanation:
          "Le cookie gp_internal a été retiré. Tes prochaines visites comptent comme du trafic humain normal, et PostHog se charge à nouveau : tu vois le produit exactement comme le voit un prospect.",
        reverseHref: "/api/internal",
        reverseLabel: "/api/internal",
      }),
      setCookieOff()
    );
  }

  return html(
    page({
      title: "GetPick — navigateur interne",
      state: "Ce navigateur est marqué INTERNE",
      explanation:
        "Le cookie gp_internal est posé pour un an. Tes visites sont classées « internal » et n'entrent plus dans report_viewed.human, et PostHog ne se charge plus ici. À refaire sur chaque navigateur et chaque profil que tu utilises.",
      reverseHref: "/api/internal?off=1",
      reverseLabel: "/api/internal?off=1",
    }),
    setCookieOn()
  );
}
