#!/usr/bin/env node
/**
 * 环境变量完整性校验脚本
 *
 * 在每次部署前运行，验证 .env.production 包含所有必要变量。
 * 缺失任何关键变量则退出码为 1，禁止部署。
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', '.env.production');

// 必须存在的变量（缺失则禁止部署）
const REQUIRED_VARS = [
  // Supabase（核心）
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',

  // Dify（核心）
  'DIFY_BASE_URL',
  'DIFY_GENERAL_CHAT_API_KEY',
  'DIFY_API_KEY_GPT5',
  'DIFY_API_KEY_CLAUDE',
  'DIFY_API_KEY_GEMINI',
  'DIFY_API_KEY_OPENCLAW',
  'DIFY_API_KEY_GROK42',
  'DIFY_TEACHING_PRO_API_KEY',
  'ESSAY_CORRECTION_API_KEY',
  'DIFY_QUANQUANMATH_API_KEY',
  'DIFY_QUANQUANENGLISH_API_KEY',
  'DIFY_VOCAB_CARD_API_KEY',
  'DIFY_PROBLEM_API_KEY',
  'DIFY_BEIKE_PRO_API_KEY',
  'DIFY_BANZHUREN_API_KEY',
  'DIFY_ALL_IN_ONE_AGENT_API_KEY',
  'DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY',
  'DIFY_AI_WRITING_PAPER_API_KEY',
  'DIFY_EXPERIMENT_REPORT_API_KEY',
  'DIFY_WORKFLOW_SKILL_API_KEY',
  'DIFY_GPT_IMAGE_API_KEY',
  'VIVAAPI_IMAGE_BASE_URL',
  'VIVAAPI_IMAGE_MODEL',
  'VIVAAPI_IMAGE_API_KEY',

  // 支付
  'XUNHUPAY_APPID',
  'XUNHUPAY_APPSECRET',

  // 公用
  'NEXT_PUBLIC_APP_URL',

  // Next.js multi-instance / rolling deployment consistency
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',

  // Tools desk / media gateways. These are production-critical because
  // missing values break visible tools even when the main chat app is healthy.
  'DIFY_IMAGE_PROMPT_REVERSE_API_KEY',
  'DIFY_WORKSHEET_DIAGNOSIS_API_KEY',
  'DIFY_WORKSHEET_DIAGNOSIS_TIMEOUT_MS',
  'ESSAY_AI_SUITE_URL',
  'ESSAY_AI_SUITE_API_TOKEN',
  'OMNIVOICE_GATEWAY_URL',
  'OMNIVOICE_GATEWAY_API_KEY',
];

const REQUIRED_ONE_OF = [
  {
    label: 'web search provider',
    keys: ['TAVILY_API_KEY', 'DIFY_WEB_SEARCH_API_KEY'],
  },
];

// 不应该是 fallback 默认值的变量
const FORBIDDEN_FALLBACK = [
  { key: 'DIFY_BASE_URL', forbidden: 'https://api.dify.ai/v1' },
];

// 历史默认 Dify Key 已废弃。生产中只允许为空；.env.example 允许保留占位符。
const DEPRECATED_EMPTY_OR_PLACEHOLDER_VARS = [
  { key: 'DIFY_API_KEY', placeholder: 'deprecated_do_not_use_for_fallback' },
];

// 每个 Dify 应用必须使用独立 App API Key；不允许复制其它应用 Key 顶替。
const DISTINCT_DIFY_APP_KEYS = [
  'ESSAY_CORRECTION_API_KEY',
  'DIFY_GENERAL_CHAT_API_KEY',
  'DIFY_API_KEY_GPT5',
  'DIFY_API_KEY_CLAUDE',
  'DIFY_API_KEY_GEMINI',
  'DIFY_API_KEY_OPENCLAW',
  'DIFY_API_KEY_GROK42',
  'DIFY_TEACHING_PRO_API_KEY',
  'DIFY_QUANQUANMATH_API_KEY',
  'DIFY_QUANQUANENGLISH_API_KEY',
  'DIFY_VOCAB_CARD_API_KEY',
  'DIFY_PROBLEM_API_KEY',
  'DIFY_BEIKE_PRO_API_KEY',
  'DIFY_BANZHUREN_API_KEY',
  'DIFY_ALL_IN_ONE_AGENT_API_KEY',
  'DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY',
  'DIFY_AI_WRITING_PAPER_API_KEY',
  'DIFY_EXPERIMENT_REPORT_API_KEY',
  'DIFY_WORKFLOW_SKILL_API_KEY',
  'DIFY_GPT_IMAGE_API_KEY',
  'DIFY_IMAGE_PROMPT_REVERSE_API_KEY',
  'DIFY_WORKSHEET_DIAGNOSIS_API_KEY',
  'DIFY_WEB_SEARCH_API_KEY',
  'DIFY_PRESENTATION_API_KEY',
  'DIFY_SPARKPAGE_API_KEY',
];

function parseEnvFile(content) {
  const vars = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function check() {
  console.log('🔍 检查环境变量完整性...\n');

  if (!fs.existsSync(ENV_FILE)) {
    console.error(`❌ 环境变量文件不存在: ${ENV_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  const vars = parseEnvFile(content);

  const missing = [];
  for (const key of REQUIRED_VARS) {
    if (!(key in vars) || !vars[key]) {
      missing.push(key);
    }
  }

  const missingGroups = [];
  for (const group of REQUIRED_ONE_OF) {
    if (!group.keys.some((key) => vars[key])) {
      missingGroups.push(group);
    }
  }

  const forbidden = [];
  for (const { key, forbidden: val } of FORBIDDEN_FALLBACK) {
    if (vars[key] === val) {
      forbidden.push({ key, value: val });
    }
  }

  const deprecatedConfigured = [];
  for (const { key, placeholder } of DEPRECATED_EMPTY_OR_PLACEHOLDER_VARS) {
    if (vars[key] && vars[key] !== placeholder) {
      deprecatedConfigured.push({ key });
    }
  }

  const duplicatedSecrets = [];
  const seenDifyValues = new Map();
  for (const key of DISTINCT_DIFY_APP_KEYS) {
    if (!vars[key]) continue;
    const existing = seenDifyValues.get(vars[key]);
    if (existing) {
      duplicatedSecrets.push({ key, otherKey: existing });
    } else {
      seenDifyValues.set(vars[key], key);
    }
  }

  if (vars.DIFY_API_KEY) {
    for (const key of DISTINCT_DIFY_APP_KEYS) {
      if (vars[key] && vars[key] === vars.DIFY_API_KEY) {
        duplicatedSecrets.push({ key, otherKey: 'DIFY_API_KEY' });
      }
    }
  }

  console.log(`📄 已加载 ${Object.keys(vars).length} 个变量\n`);

  let hasError = false;

  if (missing.length > 0) {
    hasError = true;
    console.error('❌ 缺失必需变量:');
    for (const key of missing) {
      console.error(`   - ${key}`);
    }
    console.error('');
  }

  if (missingGroups.length > 0) {
    hasError = true;
    console.error('❌ 缺失可选组中的至少一个变量:');
    for (const group of missingGroups) {
      console.error(`   - ${group.label}: ${group.keys.join(' 或 ')}`);
    }
    console.error('');
  }

  if (forbidden.length > 0) {
    hasError = true;
    console.error('❌ 变量使用了 fallback 默认值（需要配置为真实值）:');
    for (const { key, value } of forbidden) {
      console.error(`   - ${key} = ${value}`);
    }
    console.error('');
  }

  if (deprecatedConfigured.length > 0) {
    hasError = true;
    console.error('❌ 已废弃的默认 Dify Key 被配置为真实值，禁止作为 fallback 入口:');
    for (const { key } of deprecatedConfigured) {
      console.error(`   - ${key} 必须留空；每个应用只能使用自己的专用 Key`);
    }
    console.error('');
  }

  if (duplicatedSecrets.length > 0) {
    hasError = true;
    console.error('❌ 模型专用 Key 与其他应用 Key 重复，可能导致应用串线:');
    for (const { key, otherKey } of duplicatedSecrets) {
      console.error(`   - ${key} 与 ${otherKey} 的值相同`);
    }
    console.error('');
  }

  if (!hasError) {
    console.log('✅ 所有环境变量校验通过\n');
    process.exit(0);
  } else {
    console.error('❌ 环境变量校验失败，禁止部署！\n');
    console.error(`请在 ${ENV_FILE} 中补充上述变量后重试。\n`);
    process.exit(1);
  }
}

check();
