// Hook de résolution pour lancer les tests TypeScript avec le runner natif de Node
// (>= 23.6, type stripping activé par défaut) : le code applicatif importe ses modules
// locaux sans extension (`./db`, `./i18n`…), ce que l'ESM de Node ne résout pas.
// On retente avec `.ts` quand la résolution échoue. Aucune dépendance, aucun build.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
