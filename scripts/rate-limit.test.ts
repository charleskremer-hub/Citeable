import assert from "node:assert/strict";
import test from "node:test";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { namespacedDedupeKey } from "@/lib/funnel";
import { hashIp, requestRateLimitKey } from "@/lib/traffic-filter";

/**
 * Unitaires du plafond de débit et de l'espace de nommage des clés de dédup.
 *
 * `@/lib/funnel` importe `@/lib/db`, qui construit un `Pool` pg à l'import — sans
 * jamais se connecter tant qu'aucune requête n'est émise. `namespacedDedupeKey`
 * est une fonction pure : aucune requête n'est déclenchée ici.
 */

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

test("le plafond est atteint puis tient, et la fenêtre suivante repart à zéro", () => {
  const limiter = createFixedWindowLimiter({ limit: 10, windowMs: 60_000 });
  const start = 1_000_000;

  assert.deepEqual(limiter.take("a", 4, start), { allowed: 4, throttled: 0 });
  assert.deepEqual(limiter.take("a", 4, start + 1), { allowed: 4, throttled: 0 });
  // 8 consommés : seuls 2 des 5 demandés passent.
  assert.deepEqual(limiter.take("a", 5, start + 2), { allowed: 2, throttled: 3 });
  assert.deepEqual(limiter.take("a", 1, start + 3), { allowed: 0, throttled: 1 });

  // La fenêtre est fixe : elle expire 60 s après la PREMIÈRE prise.
  assert.deepEqual(limiter.take("a", 10, start + 60_001), { allowed: 10, throttled: 0 });
});

test("les seaux sont indépendants d'une clé à l'autre", () => {
  const limiter = createFixedWindowLimiter({ limit: 2, windowMs: 60_000 });
  const start = 1_000_000;

  assert.deepEqual(limiter.take("a", 2, start), { allowed: 2, throttled: 0 });
  assert.deepEqual(limiter.take("b", 2, start), { allowed: 2, throttled: 0 });
  assert.deepEqual(limiter.take("a", 1, start), { allowed: 0, throttled: 1 });
});

test("le nombre de clés est borné : une IP tournante ne fait pas grossir la mémoire", () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000, maxKeys: 50 });
  const start = 1_000_000;

  for (let index = 0; index < 5_000; index += 1) {
    limiter.take(`ip-${index}`, 1, start);
  }

  // On ne peut pas lire la Map de l'extérieur : ce qu'on vérifie, c'est qu'après
  // 5 000 clés le limiteur répond toujours, et qu'il n'a pas commencé à refuser
  // du trafic légitime (échec OUVERT assumé, documenté dans le module).
  assert.deepEqual(limiter.take("ip-nouvelle", 1, start), { allowed: 1, throttled: 0 });
});

test("un coût nul ou négatif ne consomme rien", () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000 });
  assert.deepEqual(limiter.take("a", 0, 1), { allowed: 0, throttled: 0 });
  assert.deepEqual(limiter.take("a", -3, 1), { allowed: 0, throttled: 0 });
  assert.deepEqual(limiter.take("a", 1, 1), { allowed: 1, throttled: 0 });
});

test("la clé de comptage dérive de l'IP, et deux IP ne se confondent pas", () => {
  const first = requestRateLimitKey(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
  const same = requestRateLimitKey(headers({ "x-forwarded-for": "203.0.113.9" }));
  const other = requestRateLimitKey(headers({ "x-forwarded-for": "198.51.100.4" }));

  assert.equal(first, same, "seule la première entrée de x-forwarded-for est le client");
  assert.notEqual(first, other);
  // Jamais l'IP en clair : la clé ne doit rien laisser lire, même en mémoire.
  assert.equal(first.includes("203.0.113.9"), false);
  assert.equal(requestRateLimitKey(headers({})), "no-ip");
});

test("la clé de comptage n'est PAS l'empreinte stable dérivée de IP_HASH_SALT", () => {
  // Le sel de comptage est tiré au démarrage du process et n'est configuré nulle
  // part : la clé ne doit pas pouvoir être rapprochée d'une empreinte stockée
  // ailleurs, ni reproduite par qui connaît `IP_HASH_SALT`.
  const previous = process.env.IP_HASH_SALT;
  process.env.IP_HASH_SALT = "sel-stable-de-production";
  try {
    const stable = hashIp("203.0.113.9", process.env.IP_HASH_SALT);
    const ephemeral = requestRateLimitKey(headers({ "x-forwarded-for": "203.0.113.9" }));

    assert.equal(typeof stable, "string");
    assert.notEqual(ephemeral, stable);
    assert.equal(ephemeral.length, 16, "empreinte tronquée, non réversible sans le sel");
  } finally {
    if (previous === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = previous;
  }
});

test("la clé de dédup humaine est celle du client, les autres classes sont isolées", () => {
  const clientKey = "report_viewed:abc:nosession-2026-07-29";

  assert.equal(namespacedDedupeKey("human", clientKey), clientKey);
  assert.equal(namespacedDedupeKey("bot", clientKey), `bot:${clientKey}`);
  assert.equal(namespacedDedupeKey("internal", clientKey), `internal:${clientKey}`);
  assert.equal(namespacedDedupeKey("unknown", clientKey), `unknown:${clientKey}`);

  // Sans clé côté client, il n'y a rien à dédupliquer — et surtout pas une clé
  // fabriquée qui ferait disparaître des événements légitimes.
  assert.equal(namespacedDedupeKey("human", null), null);
  assert.equal(namespacedDedupeKey("bot", null), null);
});
