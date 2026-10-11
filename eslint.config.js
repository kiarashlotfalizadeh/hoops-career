// Lint for bugs, not style (Prettier formats): TypeScript's recommended rules plus React's hook rules.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'android', 'ios', 'data', 'coverage', '.claude']),
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // values read from the league (which mutates in place) memoize with useLeagueMemo: check its deps too
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '^useLeagueMemo$' }],
      // flags `let x = fallback` ahead of branches that may overwrite it, a deliberate pattern here
      'no-useless-assignment': 'off',
    },
  },
]);
