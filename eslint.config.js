// @ts-check
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      reactHooks.configs.flat.recommended,
    ],
    rules: {
      // `any` is a failure signal — the library's public API and internals stay fully typed.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Node-context config files (build scripts, configs) — not part of the shipped library.
    files: ['**/*.config.ts', '**/*.config.js', 'e2e/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]);
