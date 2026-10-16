import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "templates/**", ".lixo-quarentena/**", "tests/artifacts/**", "config/test-runtime/**", ".pnpm-store/**", "next-env.d.ts"]),
]);
