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
    "mobile/**",
    "temp-mail/**",
    "sms.tenh-pos.com/**",
    "post.tenh-pos.com/**",
    "telegram-safe-inviter/**",
  ]),
]);

export default eslintConfig;
