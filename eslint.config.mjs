import nextVitals from "eslint-config-next/core-web-vitals"

const nextReactPlugin = nextVitals.find((item) => item.plugins?.react)?.plugins?.react

const config = [
  ...nextVitals,
  {
    plugins: nextReactPlugin ? { react: nextReactPlugin } : {},
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "import/no-anonymous-default-export": "off",
      "react/no-unescaped-entities": "warn",
      "react-hooks/error-boundaries": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      ".Codex/**",
      ".claude/**",
      ".superpowers/**",
      ".cleanup-backups/**",
      "vendor/**",
      "**/.venv/**",
      "**/.local-source/**",
      "**/__pycache__/**",
      "services/**/node_modules/**",
      "services/shenxiang-new-api/**",
      "services/shenxiang-codex-workspace/**",
      "next-env.d.ts",
    ],
  },
]

export default config
