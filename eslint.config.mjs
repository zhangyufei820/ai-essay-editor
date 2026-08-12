import nextVitals from "eslint-config-next/core-web-vitals"

const nextReactPlugin = nextVitals.find((item) => item.plugins?.react)?.plugins?.react
const nextReactHooksPlugin = nextVitals.find((item) => item.plugins?.["react-hooks"])?.plugins?.["react-hooks"]

const config = [
  ...nextVitals,
  {
    plugins: {
      ...(nextReactPlugin ? { react: nextReactPlugin } : {}),
      ...(nextReactHooksPlugin ? { "react-hooks": nextReactHooksPlugin } : {}),
    },
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "import/no-anonymous-default-export": "off",
      "react/no-unescaped-entities": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
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
