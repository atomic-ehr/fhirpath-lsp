module.exports = {
  root: true,
  env: {
    node: true,
    es6: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: [
    'eslint:recommended'
  ],
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'no-undef': 'off' // TypeScript handles this
  },
  ignorePatterns: [
    'out/**',
    'node_modules/**',
    '**/*.d.ts',
    'examples/**',
    '**/*.ts' // Skip TypeScript files for now
  ]
};