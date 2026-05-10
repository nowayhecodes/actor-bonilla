/** @type {import('jest').Config} */
module.exports = {
  maxWorkers: 1,
  testTimeout: 30_000,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^.*[/\\\\]validation\\.js$': '<rootDir>/tests/stubs/validation.ts',
    '^.*[/\\\\]validation\\.ts$': '<rootDir>/tests/stubs/validation.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
};
