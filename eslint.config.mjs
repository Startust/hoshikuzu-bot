import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
  // 忽略项
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.railway/**',
      'coverage/**',
      'local-tts/.venv/**',
      'local-tts/data/**',
      'local-tts/logs/**',
    ],
  },

  // JS 推荐规则
  js.configs.recommended,

  // TS 推荐规则（Flat config）
  ...tseslint.configs.recommended,

  // 你的项目规则
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // import 排序（很实用）
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // 更贴合 TS/Node
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // 你这种 bot 项目常用：允许 console
      'no-console': 'off',
    },
  },

  // 关闭所有与 Prettier 冲突的 ESLint 风格规则（关键）
  prettier,
];
