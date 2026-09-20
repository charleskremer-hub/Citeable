// Verrou : aucun appel Gemini n'authentifie par l'URL, chaque appel porte
// `x-goog-api-key`, le modèle est épinglé, et une réponse tronquée est détectée
// AVANT d'être lue.
//
// LE RISQUE. Documentation Google à jour au 16/09/2026
// (ai.google.dev/gemini-api/docs/api-key) : depuis le 28/05/2026 toute nouvelle
// clé AI Studio est une « auth key » (préfixe `AQ.`) que `?key=` n'authentifie
// PAS, et « On September 2026: the Gemini API will reject requests from standard
// keys ». Un appel resté en `?key=` avec une standard key échoue en 401 — et le
// produit ne le dit pas : `answerEngineForTier` rend simplement des questions non
// vérifiées. Le 20/09, l'en-tête `x-goog-api-key` a été validé par un appel réel
// avec une clé `AQ.` (journal `AGENT_RUNS.md`, CEO 7ᵉ passage).
//
// POURQUOI CE TEST LIT LA SOURCE. Une fonction qui construit la bonne URL ne
// prouve pas que l'appel l'utilise : c'est la forme exacte des fautes du 14/09 et
// du 16/09 — code juste, câblage mort, tests au vert.
//
// POURQUOI CETTE VERSION-CI. La première rédaction de ce fichier a été démolie
// par l'audit adversarial du 20/09 : **quatre régressions passaient au vert**,
// dont la clé remise dans l'URL par CONCATÉNATION (`"...?alt=json&key=" + apiKey`),
// que le regex `/generateContent\?key=/` ne voyait pas. Deux leçons inscrites ici :
//   1. un verrou qui cherche la FORME EXACTE de la faute passée ne verrouille que
//      cette forme. On interdit la PROPRIÉTÉ (« aucun `key=` près de l'endpoint »),
//      pas l'orthographe.
//   2. un verrou qui compte des littéraux d'URL comptait 1 site après le refactor
//      en `geminiEndpoint()` alors qu'il y a 3 `fetch` réels — la jambe ne pouvait
//      plus tomber. On compte donc les CORPS DE REQUÊTE Gemini (`contents:`), qui
//      sont en rapport 1:1 avec les appels.
//
// Fonctions pures, ZÉRO réseau. Lancer : node scripts/run-tests.mjs (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Modèles éprouvés AU CONTRÔLE le 20/09 contre l'API réelle
// (`outbound/lot7_stabilite.py`). Épingler hors de cette liste doit échouer :
// `gemini-3.8-flash` (le modèle saturé que l'alias `…-latest` servait) en est
// volontairement absent.
const MODELES_AUTORISES = new Set(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"]);

const BUDGET_MINIMUM = 2048;

/** Retire commentaires de ligne et de bloc : un garde-fou ne doit jamais être satisfait par un commentaire. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const FILES = [
  { relative: "../src/lib/audit-engine.ts", geminiBodies: 3 },
  { relative: "../src/lib/audit-agent-chat.ts", geminiBodies: 1 },
] as const;

const SOURCES = FILES.map((file) => {
  const raw = readFileSync(resolve(here, file.relative), "utf8");
  return { ...file, raw, code: stripComments(raw) };
});

/** Index de chaque corps de requête Gemini. `contents:` est la clé du corps Gemini ; OpenAI utilise `messages:`. */
function geminiBodyIndexes(code: string) {
  return [...code.matchAll(/contents:\s*\[/g)].map((match) => match.index ?? 0);
}

test("aucune clé n'est passée par l'URL, sous AUCUNE forme", () => {
  for (const { relative, code } of SOURCES) {
    for (const match of code.matchAll(/generativelanguage\.googleapis\.com/g)) {
      const start = match.index ?? 0;
      // On borne l'inspection au LITTÉRAL D'URL lui-même — du délimiteur ouvrant
      // au délimiteur fermant — plus une courte queue pour attraper une
      // concaténation (`"…" + apiKey`). Une fenêtre en nombre de caractères
      // serait à la fois trop large (elle verrait l'en-tête légitime, qui porte
      // `apiKey`) et trop courte (un paramètre ajouté plus loin lui échapperait).
      const openers = ["`", '"', "'"].map((quote) => code.lastIndexOf(quote, start)).filter((index) => index >= 0);
      const open = openers.length > 0 ? Math.max(...openers) : start;
      const quote = code[open];
      const close = code.indexOf(quote, open + 1);
      const literal = code.slice(open, close > open ? close + 1 : start + 300);
      // La queue ne retient que ce qui PROLONGE l'expression d'URL — `+ apiKey`,
      // `.concat(...)` — et s'arrête au premier `;` ou saut de ligne. Sans cette
      // borne, elle mordait sur la fonction voisine `geminiHeaders(apiKey)` et
      // rendait le test rouge sur du code correct.
      const after = code.slice(close > open ? close + 1 : start).split(/[;\n]/)[0] ?? "";
      const tail = /^\s*(?:\+|\.concat\()/.test(after) ? after : "";
      const urlExpression = literal + tail;

      assert.ok(
        !/[?&]\s*key\s*=/.test(urlExpression),
        `${relative} : un paramètre \`key=\` est construit dans l'URL Gemini (${JSON.stringify(literal.slice(0, 120))}). Les auth keys AI Studio ne sont PAS authentifiées par l'URL, et une clé en query string se retrouve dans les journaux d'accès.`,
      );
      assert.ok(
        !/apiKey|API_KEY/.test(urlExpression),
        `${relative} : la clé apparaît dans l'expression d'URL Gemini — elle doit vivre dans l'en-tête \`x-goog-api-key\`, jamais dans l'URL.`,
      );
    }
  }
});

test("chaque corps de requête Gemini est accompagné de l'en-tête x-goog-api-key", () => {
  for (const { relative, code, geminiBodies } of SOURCES) {
    const bodies = geminiBodyIndexes(code);
    // Le compte attendu est ÉCRIT : ajouter un site d'appel Gemini oblige à
    // revenir ici, et en retirer un fait tomber le test au lieu de le vider.
    assert.equal(
      bodies.length,
      geminiBodies,
      `${relative} : ${bodies.length} corps de requête Gemini trouvé(s), ${geminiBodies} attendu(s). Si c'est voulu, mets le compte à jour ici — le verrou ne doit pas se vider en silence.`,
    );

    for (const index of bodies) {
      // Les en-têtes précèdent le corps dans un appel `fetch` ; 1200 caractères
      // couvrent largement l'écart, sans atteindre l'appel voisin.
      const before = code.slice(Math.max(0, index - 1200), index);
      assert.ok(
        /geminiHeaders\(|["']x-goog-api-key["']\s*:/.test(before),
        `${relative} : un corps de requête Gemini (offset ${index}) n'est précédé d'aucun en-tête x-goog-api-key.`,
      );
    }
  }
});

test("le modèle par défaut est épinglé sur une version éprouvée au contrôle", () => {
  for (const { relative, code } of SOURCES) {
    const declaration = code.match(/const DEFAULT_GEMINI_MODEL\s*=\s*"([^"]+)"/);
    assert.ok(declaration, `${relative} : DEFAULT_GEMINI_MODEL introuvable.`);
    const model = declaration[1];
    assert.ok(
      !/-latest$/i.test(model),
      `${relative} : DEFAULT_GEMINI_MODEL vaut "${model}" — un alias bascule de modèle sans commit et vise le plus récent, donc le plus saturé.`,
    );
    assert.ok(
      MODELES_AUTORISES.has(model),
      `${relative} : "${model}" n'est pas dans la liste des modèles éprouvés au contrôle (${[...MODELES_AUTORISES].join(", ")}). Épingler un modèle non mesuré, c'est remplacer un alias par un pari.`,
    );
  }
});

test("GEMINI_MODEL ne peut pas réintroduire un alias -latest", () => {
  for (const { relative, code } of SOURCES) {
    const fn = code.match(/function currentGeminiModel\(\)[\s\S]*?\n}/);
    assert.ok(fn, `${relative} : currentGeminiModel introuvable.`);
    // Le code est débarrassé de ses commentaires : la garde doit être exécutable,
    // pas documentaire.
    assert.match(
      fn[0],
      /-latest\$[^]{0,40}test\(configured\)/,
      `${relative} : currentGeminiModel n'écarte pas un GEMINI_MODEL en \`…-latest\` — la garde du défaut serait contournable par une variable d'environnement.`,
    );
  }
});

test("aucun budget de sortie Gemini n'est inférieur à 2048, et aucun n'est masqué derrière une constante", () => {
  // Les modèles « thinking » consomment maxOutputTokens AVANT d'écrire la réponse :
  // un budget serré rend un JSON coupé et l'appel est perdu. 2048 est la valeur
  // éprouvée au contrôle du 20/09. Le plafond ne facture rien par lui-même —
  // seuls les tokens produits sont comptés — il évite des appels gaspillés.
  for (const { relative, code, geminiBodies } of SOURCES) {
    const budgets = [...code.matchAll(/maxOutputTokens:\s*([^,\s}]+)/g)].map((match) => match[1]);
    assert.ok(
      budgets.length >= geminiBodies,
      `${relative} : ${budgets.length} budget(s) de sortie pour ${geminiBodies} appel(s) Gemini — un appel sans budget explicite hérite d'un défaut que nous ne contrôlons pas.`,
    );
    for (const budget of budgets) {
      assert.match(
        budget,
        /^\d+$/,
        `${relative} : maxOutputTokens vaut \`${budget}\` — une valeur non littérale rend ce verrou aveugle. Écris le nombre.`,
      );
      assert.ok(
        Number.parseInt(budget, 10) >= BUDGET_MINIMUM,
        `${relative} : maxOutputTokens vaut ${budget} — trop court pour un modèle qui raisonne avant de répondre.`,
      );
    }
  }
});

test("la troncature est contrôlée AVANT que la réponse soit lue", () => {
  // Un JSON coupé parse en objet partiel : lu d'abord, il produit un verdict faux
  // au lieu d'un réessai. L'ordre est donc la garantie, pas la simple présence
  // d'un `finishReason` quelque part dans le fichier.
  for (const { relative, code } of SOURCES) {
    const checks = [...code.matchAll(/geminiTruncated\(|finishReason\s*===\s*"MAX_TOKENS"/g)].map((m) => m.index ?? 0);
    assert.ok(checks.length > 0, `${relative} : aucun contrôle de troncature exécutable (finishReason / MAX_TOKENS).`);

    for (const match of code.matchAll(/geminiAnswerText\(\s*parsed\s*\)/g)) {
      const readAt = match.index ?? 0;
      assert.ok(
        checks.some((checkAt) => checkAt < readAt && readAt - checkAt < 900),
        `${relative} : une lecture \`geminiAnswerText(parsed)\` (offset ${readAt}) n'est précédée d'aucun contrôle de troncature. Déplacer le contrôle après la lecture annule la garantie.`,
      );
    }
  }
});

test("le fichier de production ne contient plus l'alias historique", () => {
  for (const { relative, code } of SOURCES) {
    assert.ok(
      !/gemini-flash-latest/.test(code),
      `${relative} : l'alias \`gemini-flash-latest\` est revenu dans le code exécutable.`,
    );
  }
});
