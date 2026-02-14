/**
 * ESLint配置文件 - 天工小程序项目 v3.0
 *
 * 📋 升级说明:
 * - v3.0: 移除JSDoc插件（TypeScript替代JSDoc类型检查）
 * - 保留代码质量规则和变量遮蔽预防
 * - 支持JS/TS共存的渐进式迁移
 *
 * @version 3.0.0
 * @since 2026-02-10
 */

module.exports = {
  // 运行环境
  env: {
    browser: true, // 浏览器全局变量
    es6: true, // ES6语法支持
    node: true // Node.js全局变量
  },

  // 继承推荐规则（prettier放最后以覆盖冲突的格式化规则）
  extends: [
    'eslint:recommended', // ESLint推荐规则
    'prettier' // 关闭与Prettier冲突的ESLint格式化规则
  ],

  // 全局变量（微信小程序）
  globals: {
    wx: 'readonly', // 微信小程序全局对象
    App: 'readonly', // 小程序App构造函数
    Page: 'readonly', // 小程序Page构造函数
    Component: 'readonly', // 小程序Component构造函数
    getApp: 'readonly', // 获取App实例
    getCurrentPages: 'readonly', // 获取当前页面栈
    requirePlugin: 'readonly', // 引入插件
    WechatMiniprogram: 'readonly' // 微信小程序TypeScript命名空间（miniprogram-api-typings）
  },

  // 解析器选项
  parserOptions: {
    ecmaVersion: 2020, // ES2020语法
    sourceType: 'module' // 使用ES模块
  },

  // 规则配置（v3.0: 已移除jsdoc插件，TypeScript替代类型检查）
  rules: {
    // ==================== 🚨 变量遮蔽预防 ====================

    // ✅ 禁止变量遮蔽
    'no-shadow': [
      'error',
      {
        builtinGlobals: false, // 不检查内置全局变量
        hoist: 'all', // 检查所有作用域
        allow: [], // 不允许任何例外
        ignoreOnInitialization: false // 初始化时也检查
      }
    ],

    // ✅ 禁止重复导入
    'no-duplicate-imports': 'error',

    // ==================== 💡 代码质量检查 ====================

    // ✅ 禁止使用var
    'no-var': 'error',

    // ✅ 强制块级作用域
    'block-scoped-var': 'error',

    // ✅ 禁止标签与变量同名
    'no-label-var': 'error',

    // ✅ 变量声明时必须初始化
    'init-declarations': 'error',

    // ✅ 禁止未使用的变量
    'no-unused-vars': [
      'warn',
      {
        vars: 'all', // 检查所有变量
        args: 'after-used', // 检查使用后的参数
        ignoreRestSiblings: true, // 忽略剩余参数
        argsIgnorePattern: '^_' // 忽略下划线开头的参数
      }
    ],

    // ✅ 禁止console（允许warn和error）
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error', 'log'] // 允许这些方法（开发环境需要）
      }
    ],

    // ✅ 禁止debugger（生产环境）
    'no-debugger': 'warn',

    // ==================== 🔧 格式规则（交给Prettier处理） ====================
    // 以下规则由Prettier统一管理，ESLint不再重复检查，避免冲突
    // semi, quotes, indent, comma-dangle, arrow-parens, brace-style
    // 均通过 eslint-config-prettier 自动关闭

    // ==================== 🔧 其他推荐规则 ====================

    // ✅ 强制使用===
    eqeqeq: ['error', 'always'],

    // ✅ 禁止不必要的转义字符
    'no-useless-escape': 'warn',

    // ✅ 要求对象字面量简写语法
    'object-shorthand': ['warn', 'always'],

    // ✅ 要求遵循大括号约定
    curly: ['error', 'all']
  },

  // ==================== 🔴 覆盖配置（特定文件） ====================
  overrides: [
    {
      // 测试文件配置
      files: ['**/*.test.js', '**/*.spec.js', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-console': 'off' // 测试文件允许console
      }
    },
    {
      // 配置文件
      files: ['*.config.js', '.eslintrc.js', 'jest.config.js'],
      rules: {
        // 配置文件无需额外限制
      }
    },
    {
      // TypeScript声明文件 - 关闭no-undef（.d.ts中的declare namespace引用由TS编译器保证正确性）
      files: ['**/*.d.ts'],
      rules: {
        'no-undef': 'off',
        'init-declarations': 'off'
      }
    },
    {
      // TypeScript文件 - 使用@typescript-eslint解析器
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      plugins: ['@typescript-eslint'],
      rules: {
        // TS文件由TypeScript编译器检查类型
        // 关闭ESLint原生no-unused-vars，使用@typescript-eslint版本
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            vars: 'all',
            args: 'after-used',
            ignoreRestSiblings: true,
            argsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
          }
        ],
        // 关闭ESLint原生no-shadow，使用@typescript-eslint版本（避免interface误报）
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': [
          'error',
          {
            builtinGlobals: false,
            hoist: 'all',
            allow: [],
            ignoreOnInitialization: false
          }
        ],
        // 关闭init-declarations，TS类型声明不需要初始化
        'init-declarations': 'off'
      }
    }
  ]
}
