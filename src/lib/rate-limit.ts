/**
 * Compteur à fenêtre fixe, en mémoire du process.
 *
 * Pourquoi ici plutôt qu'un Redis / un KV : `POST /api/funnel` est appelé par
 * `navigator.sendBeacon` depuis la page publique du rapport, donc il ne peut pas
 * être authentifié, et il ne doit RIEN persister sur l'appelant (voir le
 * commentaire de la route). Un compteur en mémoire ne stocke rien, ne survit pas
 * à l'instance, et coupe le seul scénario qui compte : une boucle depuis un hôte
 * unique qui écrit des milliers de lignes dans la colonne `human`.
 *
 * Ses limites, dites franchement : sur un runtime serverless chaque instance a
 * son propre compteur, donc un flood réparti sur N instances obtient N fenêtres.
 * Ça ne rend pas le compteur infalsifiable — ça fait passer « 10 000 lignes en
 * quelques secondes depuis un `curl` en boucle » à « quelques dizaines par
 * minute et par instance ». C'est un plafond, pas une authentification.
 */

export type RateLimitDecision = {
  /** Nombre d'unités acceptées sur les `cost` demandées. */
  allowed: number;
  /** Nombre d'unités refusées (`cost - allowed`). */
  throttled: number;
};

type Window = { count: number; resetAt: number };

export type FixedWindowLimiter = {
  take(key: string, cost?: number, now?: number): RateLimitDecision;
  /** Vide les compteurs. Utilisé par les tests, jamais en production. */
  reset(): void;
};

export function createFixedWindowLimiter({
  limit,
  windowMs,
  maxKeys = 5000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): FixedWindowLimiter {
  const windows = new Map<string, Window>();

  /**
   * Le nombre de clés est borné pour qu'un attaquant qui fait varier son IP ne
   * puisse pas faire grossir la Map indéfiniment. On purge d'abord les fenêtres
   * expirées ; si ça ne suffit pas, on repart de zéro. Repartir de zéro est un
   * échec OUVERT assumé : refuser du trafic légitime pour protéger un compteur
   * de mesure serait le pire des deux mondes.
   */
  function evictIfNeeded(now: number) {
    if (windows.size <= maxKeys) return;
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
    if (windows.size > maxKeys) windows.clear();
  }

  return {
    take(key: string, cost = 1, now = Date.now()): RateLimitDecision {
      if (cost <= 0) return { allowed: 0, throttled: 0 };

      const current = windows.get(key);
      const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };

      const allowed = Math.max(0, Math.min(cost, limit - window.count));
      window.count += allowed;
      windows.set(key, window);
      evictIfNeeded(now);

      return { allowed, throttled: cost - allowed };
    },
    reset() {
      windows.clear();
    },
  };
}
