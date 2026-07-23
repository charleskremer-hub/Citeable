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
    // Sorties de build et copies de worktrees d'agents : générées, jamais du
    // code source à linter (elles portaient 311 erreurs de bruit).
    ".next-agent-build/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
