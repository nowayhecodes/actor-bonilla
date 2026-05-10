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
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/benchmark.ts',
    '!src/validation.ts',
    '!src/thread-pool.ts',
    '!src/threaded-actor-system.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/'],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 78,
      lines: 85,
      functions: 78,
    },
  },
};
