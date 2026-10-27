// Lint for bugs, not style (Prettier formats): TypeScript's recommended rules plus React's hook rules.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The formatter that joins two figures with a hyphen: a made-attempted ("34-90"). (A season, "2026-27",
// is left to seasonLabel: it is in stored text too.)
const JOINS = new Set(['madeAtt']);
// Whether a template literal joins figures with a hyphen: "${w}-${l}", "#${lo}-${hi}", "${x}-0", "1-${n}".
const joinsFigures = (t) =>
  t.quasis.some((q, i) => {
    const s = q.value.cooked ?? '';
    return /\d-\d/.test(s) || (i < t.expressions.length && /(^|\d)-$/.test(s) && (i > 0 || /\d-$/.test(s))) || (i > 0 && /^-\d/.test(s));
  });
/**
 * A record, a score, a series or a range on screen never breaks at its hyphen (DESIGN: `keepFigures`).
 * Flags a figure join written straight into the markup, as an element's child or a display prop, and not
 * through keepFigures / keep / fitHead or a component that keeps its own (the hops through `a ? b : c`,
 * `a && b` and a template around it are followed; a call anywhere on the way ends the check).
 */
const keepFigures = {
  meta: { type: 'problem', messages: { keep: 'A hyphen-joined figure on screen: wrap it in keepFigures (core/format) or keep (components/ui).' } },
  create(context) {
    const rendered = (node) => {
      let n = node;
      while (n.parent && ['ConditionalExpression', 'LogicalExpression', 'TemplateLiteral', 'TSAsExpression'].includes(n.parent.type)) n = n.parent;
      const p = n.parent;
      if (p?.type !== 'JSXExpressionContainer') return false;
      if (p.parent.type === 'JSXElement' || p.parent.type === 'JSXFragment') return true;
      // (a component's display prop: on a plain element `title` is a tooltip, not the screen)
      const el = p.parent.parent?.name;
      return p.parent.type === 'JSXAttribute' && /^[A-Z]/.test(el?.name ?? '') && ['sub', 'meta', 'over', 'line', 'head', 'dek', 'note', 'title'].includes(p.parent.name.name);
    };
    return {
      TemplateLiteral(node) {
        if (joinsFigures(node) && rendered(node)) context.report({ node, messageId: 'keep' });
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && JOINS.has(node.callee.name) && rendered(node)) context.report({ node, messageId: 'keep' });
      },
    };
  },
};

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
  {
    files: ['src/ui/**/*.tsx'],
    plugins: { hoops: { rules: { 'keep-figures': keepFigures } } },
    rules: { 'hoops/keep-figures': 'error' },
  },
]);
