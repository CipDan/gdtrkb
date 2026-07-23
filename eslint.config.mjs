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
    // db/postgraphile is a separate deployable (its own package.json, plain
    // CommonJS Node script for the PostGraphile container) — not part of the
    // Next.js app this config targets.
    "db/**",
  ]),
]);

export default eslintConfig;
