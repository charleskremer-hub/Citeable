// Hook de résolution pour lancer les tests TypeScript avec le runner natif de Node
// (>= 23.6, type stripping activé par défaut) : le code applicatif importe ses modules
// locaux sans extension (`./db`, `./i18n`…) et ses alias `@/…`, ce que l'ESM de Node
// ne résout pas seul. On retente avec `.ts` (résolution relative) et on réécrit
// l'alias `@/` vers `src/`. Aucune dépendance, aucun build.
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Alias `@/foo` → chemin absolu vers src/foo (avec repli `.ts`).
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(resolve(srcDir, specifier.slice(2))).href;
      try {
        return nextResolve(base, context);
      } catch {
        return nextResolve(`${base}.ts`, context);
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      // Repli `.js` pour les specifiers BARE sans extension : `next` ne déclare
      // pas de champ `exports`, donc `import { NextResponse } from "next/server"`
      // — que le bundler Next résout tout seul — échoue sous l'ESM de Node pur
      // (« Did you mean next/server.js ? »). Indispensable pour importer un
      // `route.ts` dans un test.
      if (!specifier.startsWith(".") && !specifier.startsWith("/") && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw error;
    }
  },
});
