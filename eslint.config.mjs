import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sorties de build et copies de travail des agents. Toutes deux ignorées par
    // git (`.gitignore` l.18 et `.claude/`), donc jamais revues ni corrigées —
    // mais eslint les scannait, et elles portaient à elles seules la TOTALITÉ
    // des erreurs de lint du repo (311/311). Un lint dont le rouge ne vient que
    // de fichiers qu'on ne peut pas corriger n'est plus un signal : on prend
    // l'habitude de le lire « toujours rouge », et la vraie régression passe
    // avec. Le code source, lui, reste scanné entièrement.
    ".next-agent-build/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
