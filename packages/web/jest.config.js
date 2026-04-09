/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@daviddh/llm-graph-runner$': '<rootDir>/../api/src/index.ts',
    '^@daviddh/graph-types$': '<rootDir>/../graph-types/src/index.ts',
    '^@src/(.*)\\.js$': '<rootDir>/../api/src/$1',
    '^@src/(.*)$': '<rootDir>/../api/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
