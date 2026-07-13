const baseConfig = require("./jest.config")

module.exports = {
  ...baseConfig,
  collectCoverage: true,
  collectCoverageFrom: [
    "lib/auth/find-user-by-email.ts",
    "lib/email-otp-store.ts",
    "lib/health-readiness.ts",
    "lib/local-file-response.ts",
    "lib/logger.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    "**/__tests__/auth-user-email-lookup.test.ts",
    "**/__tests__/email-otp-store.test.ts",
    "**/__tests__/health-readiness.test.ts",
    "**/__tests__/local-file-response.test.ts",
    "**/__tests__/logger.test.ts",
  ],
}
