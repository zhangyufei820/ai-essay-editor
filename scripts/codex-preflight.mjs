#!/usr/bin/env node
import process from 'node:process';

const input = process.argv.slice(2).join(' ').toLowerCase();

const scopes = [
  {
    name: 'cloud-codex',
    match: ['云 codex', '云codex', 'cloud codex', '/codex', 'codex workspace', 'shenxiang-codex-workspace', 'upload_manifest'],
    targetStack: 'cloud Codex service platform',
    targetPaths: 'services/shenxiang-codex-workspace/**',
    forbiddenPaths: 'main-site app code, isolated New API data plane, user secrets, internal guidance artifacts',
    evidenceFirst: 'task workspace -> UPLOAD_MANIFEST.md -> workspace logs -> /codex/api/chat/stream -> relay logs if needed',
    doneCard: 'Cloud Codex Service Done',
    verification: 'pytest or compileall; 127.0.0.1:3140/health; https://api.aiphui.top/codex/; task-workspace smoke',
  },
  {
    name: 'main-site',
    match: ['shenxiang.school', '主站', 'main site', 'ai_task_runs', 'credit_transactions', 'dify'],
    targetStack: 'main site Next.js',
    targetPaths: 'app/**, components/**, lib/**, scripts/**, docs/**',
    forbiddenPaths: '/opt/shenxiang-new-api, isolated New API data plane, cloud Codex runtime unless explicitly requested',
    evidenceFirst: 'OpenResty logs -> ai_task_runs -> credit_transactions.billing_metadata -> shenxiang-nextjs/Dify logs',
    doneCard: 'Main Site Done',
    verification: 'npm/Jest/build as relevant; https://shenxiang.school/api/health; real user path or runtime evidence',
  },
  {
    name: 'isolated-new-api',
    match: ['new api', 'new-api', 'api.aiphui.top', '媒体工坊', 'media playground', '月卡', 'channel', 'token'],
    targetStack: 'isolated New API',
    targetPaths: 'services/shenxiang-new-api/** and explicitly named related gateway services',
    forbiddenPaths: '/data/ai-essay-editor, main-site config, Supabase, unrelated containers',
    evidenceFirst: 'New API MySQL logs -> token/channel/user/order tables -> app/gateway logs',
    doneCard: 'Isolated New API Done',
    verification: 'target tests; 127.0.0.1:3120; https://api.aiphui.top; main-site health non-regression; related logs/billing rows',
  },
  {
    name: 'main-site-skill-gateway',
    match: ['super-all-in-one-agent', '全能智能体', 'codex-skill-gateway', 'generatedfilepreview'],
    targetStack: 'main-site Codex skill gateway',
    targetPaths: 'services/codex-skill-gateway/** and related main-site generated-file routes',
    forbiddenPaths: 'services/shenxiang-codex-workspace unless explicitly scoped there',
    evidenceFirst: 'main-site route chain -> gateway logs -> generated file preview -> browser rendering',
    doneCard: 'Main Site Done plus gateway-specific preview proof',
    verification: 'gateway tests; main-site health; browser preview with console check',
  },
  {
    name: 'storyops',
    match: ['storyops', 'novel2fdx', 'sprint 1', 'fdx', 'storyforge'],
    targetStack: 'StoryOps local repo',
    targetPaths: '/Volumes/未命名/novel2fdx-storyops',
    forbiddenPaths: 'raw source mutation, product logic outside requested sprint',
    evidenceFirst: 'actual repo root -> AGENTS.md -> Makefile targets -> protected-path checks',
    doneCard: 'StoryOps Done',
    verification: 'make setup; make lint; make test; sf db verify',
  },
];

const selected = scopes.find((scope) => scope.match.some((term) => input.includes(term))) ?? {
  name: 'unclassified',
  targetStack: 'needs narrow routing from docs/CODEX-TASK-ROUTER.md',
  targetPaths: 'read AGENTS.md, CODEX-SKILL-SOP.md, PROJECT-ARCHITECTURE.md, CODEX-TASK-ROUTER.md first',
  forbiddenPaths: 'production, secrets, database, Docker infrastructure until scope is locked',
  evidenceFirst: 'choose evidence chain from docs/CODEX-TASK-ROUTER.md',
  doneCard: 'choose Done Card after scope lock',
  verification: 'choose relevant test/build/runtime path after scope lock',
};

const card = {
  scope_lock: selected.name,
  target_stack: selected.targetStack,
  target_paths: selected.targetPaths,
  forbidden_paths: selected.forbiddenPaths,
  evidence_first: selected.evidenceFirst,
  done_card: selected.doneCard,
  verification: selected.verification,
  cleanup:
    selected.name === 'cloud-codex'
      ? 'service-platform changes need commit/deploy; user task workspaces do not need local repo commit hygiene'
      : 'after verified repair: commit, deploy, production-verify, then confirm local/server worktree cleanliness or explain unrelated dirty files',
};

console.log(JSON.stringify(card, null, 2));
