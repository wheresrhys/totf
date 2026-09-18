import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "app/_v1/**",
      ".claude/worktrees/**",
    ],
  },
  {
    rules: {
      // Forbid the `x as unknown as T` double-assertion pattern (#921):
      // casting through `unknown` switches off assignability checking
      // entirely, so nothing warns when the cast no longer matches reality.
      // A genuine exception (e.g. a fixture with a literal `null` in a
      // column a mapped type strips non-null via `NonNullable`, or a mock
      // that only implements a subset of a real interface) needs a
      // `// eslint-disable-next-line no-restricted-syntax -- <reason>`
      // comment explaining why, rather than a freestanding prose comment —
      // see CLAUDE.md's fixture-casting guidance.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
          message:
            "Avoid `x as unknown as T` — it disables assignability checking entirely. Prefer a direct `x as T` assertion; if a genuine structural mismatch requires the double cast, keep it but justify it with an `eslint-disable-next-line no-restricted-syntax -- <reason>` comment instead of a freeform one.",
        },
      ],
    },
  },
];

export default eslintConfig;
