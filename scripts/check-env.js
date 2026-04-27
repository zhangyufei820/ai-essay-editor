#!/usr/bin/env node
/**
 * 环境变量完整性校验脚本
 *
 * 在每次部署前运行，验证 .env.production 包含所有必要变量。
 * 缺失任何关键变量则退出码为 1，禁止部署。
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env.production');

// 必须存在的变量（缺失则禁止部署）
const REQUIRED_VARS = [
  // Supabase（核心）
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',

  // Dify（核心）
  'DIFY_BASE_URL',
  'DIFY_API_KEY',
  'DIFY_API_KEY_GPT5',
  'DIFY_API_KEY_CLAUDE',
  'DIFY_API_KEY_GEMINI',
  'DIFY_API_KEY_OPENCLAW',
  'DIFY_TEACHING_PRO_API_KEY',
  'ESSAY_CORRECTION_API_KEY',

  // 支付
  'XUNHUPAY_APPID',
  'XUNHUPAY_APPSECRET',

  // 公用
  'NEXT_PUBLIC_APP_URL',

  // Next.js multi-instance / rolling deployment consistency
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
];

// 不应该是 fallback 默认值的变量
const FORBIDDEN_FALLBACK = [
  { key: 'DIFY_BASE_URL', forbidden: 'https://api.dify.ai/v1' },
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
    console.error(`❌ .env.production 文件不存在: ${ENV_FILE}`);
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

  const forbidden = [];
  for (const { key, forbidden: val } of FORBIDDEN_FALLBACK) {
    if (vars[key] === val) {
      forbidden.push({ key, value: val });
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

  if (forbidden.length > 0) {
    hasError = true;
    console.error('❌ 变量使用了 fallback 默认值（需要配置为真实值）:');
    for (const { key, value } of forbidden) {
      console.error(`   - ${key} = ${value}`);
    }
    console.error('');
  }

  if (!hasError) {
    console.log('✅ 所有环境变量校验通过\n');
    process.exit(0);
  } else {
    console.error('❌ 环境变量校验失败，禁止部署！\n');
    console.error('请在 .env.production 中补充上述变量后重试。\n');
    process.exit(1);
  }
}

check();
