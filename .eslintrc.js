module.exports = {
  extends: ['plugin:@typescript-eslint/recommended', '@ehacke/eslint-config', 'plugin:import/typescript'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'simple-import-sort'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'jsdoc/check-param-names': 'off',
    'lodash/prefer-is-nil': 'off',
    'lodash/prefer-lodash-typecheck': 'off',
    'no-console': 'off',
    'sonarjs/cognitive-complexity': 'off',
    'unicorn/expiring-todo-comments': 'error',
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'],
      },
      typescript: {},
    },
    jsdoc: {
      mode: 'typescript',
    },
  },
};
