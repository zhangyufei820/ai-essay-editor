import nextVitals from "eslint-config-next/core-web-vitals"

const config = [
  ...nextVitals,
  {
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
      "next-env.d.ts",
    ],
  },
]

export default config
