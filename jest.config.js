/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/.claude/',
    '<rootDir>/.cleanup-backups/',
    '<rootDir>/vendor/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/.claude/',
    '/.cleanup-backups/',
    '/__tests__/media-playground-model-config.test.ts$',
  ],
  watchPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/.cleanup-backups/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      },
    }],
  },
}
