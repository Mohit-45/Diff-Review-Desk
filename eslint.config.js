import eslint from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const bannedCallNames = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'Worker',
];

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.vite/**', '.git/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  jsxA11y.flatConfigs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2023 },
      parserOptions: {
        project: './tsconfig.lint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      'no-empty': 'error',
      'no-empty-function': 'error',
      complexity: ['error', 12],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'no-restricted-syntax': [
        'error',
        { selector: 'TSAnyKeyword', message: 'Do not use any.' },
        { selector: 'TSNonNullExpression', message: 'Do not use non-null assertions.' },
        { selector: 'TSEnumDeclaration', message: 'Use a discriminated union.' },
        { selector: 'TSModuleDeclaration', message: 'Do not use namespaces.' },
        ...bannedCallNames.map((name) => ({
          selector: `CallExpression[callee.name='${name}']`,
          message: `Do not call ${name}.`,
        })),
        { selector: "CallExpression[callee.name='eval']", message: 'Do not use eval.' },
        { selector: "NewExpression[callee.name='Function']", message: 'Do not use new Function.' },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Do not use unseeded randomness.',
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      complexity: 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
    },
  },
  {
    files: ['src/ui/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name=/^(href|src|srcDoc|action)$/]',
          message: 'Do not use this JSX attribute in src/ui.',
        },
      ],
    },
  },
  {
    files: ['src/ui/reportUnexpected.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
