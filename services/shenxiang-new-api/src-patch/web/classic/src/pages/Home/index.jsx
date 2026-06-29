/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Typography } from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import {
  IconGithubLogo,
  IconPlay,
  IconFile,
  IconCopy,
  IconExternalOpen,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import {
  OpenAI,
  Claude,
  Gemini,
  DeepSeek,
  Qwen,
  Midjourney,
  Grok,
} from '@lobehub/icons';

const { Title, Paragraph } = Typography;

const assistantPills = [
  {
    label: 'Codex',
    text: '模型、Key、Base URL 一起配好',
  },
  {
    label: 'Claude Code',
    text: '专用入口直接复制',
  },
  {
    label: 'Dify / 客户系统',
    text: '按真实业务场景落地',
  },
];

const homeAssistantQuickPrompts = [
  'Codex 桌面怎么接 AIPHUI？',
  'Claude Code 应该填哪个地址？',
  'Dify 里 Base URL 怎么配置？',
];

const initialHomeAssistantMessages = [
  {
    role: 'assistant',
    content:
      '你好，我是星人 API 接入老师。你可以直接告诉我想接 Codex、Claude Code、Dify，或者把报错贴过来，我会按你的客户端给下一步。',
  },
];

const buildHomeAssistantContext = () => ({
  url: `${window.location.origin}${window.location.pathname}`,
  path: window.location.pathname || '/',
  title: document.title || 'New API',
  route_title: '星人 API 首页',
  route_hint:
    '用户正在首页右侧的 API 接入老师窗口咨询 Codex、Claude Code、Dify 或业务系统接入。',
  headings: [
    '把低价模型，接进你每天用的 Agent',
    '星人 API 接入老师',
  ],
  buttons: [
    '直接问接入老师',
    '创建 API Key',
    '复制 Base URL',
    '打开文档中心',
  ],
  fields: ['向 API 接入老师提问'],
  controls: [
    '直接问接入老师|chat',
    '创建 API Key|link|to:令牌管理',
    '复制 Base URL|button',
  ],
  visible_text:
    '星人 API 首页提供低价模型、Base URL、API Key、Codex、Claude Code、Dify 和客户系统接入。用户可以在首页直接向 API 接入老师提问。',
});

const launchCards = [
  {
    eyebrow: '先问清楚',
    title: 'API 接入老师',
    href: '/codex/',
    text: '说出你要接的客户端和目标，它会先判断路径，再带你点页面、拿配置。',
  },
  {
    eyebrow: '拿到凭证',
    title: '令牌管理',
    href: '/console/token',
    text: '创建可控的 API Key，按模型权限、余额和用途分开管理。',
  },
  {
    eyebrow: '确认能跑',
    title: '模型广场',
    href: '/pricing',
    text: '先看可用模型和价格，再决定把哪一个接进 Codex、Claude Code 或业务系统。',
  },
];

const setupRows = [
  { label: '普通客户端', suffix: '/v1' },
  { label: 'Claude Code', suffix: '/claude' },
  { label: '推荐模型', value: 'gpt-5.5' },
];

const homeAssistantRoutes = {
  token: {
    title: '令牌管理',
    href: '/console/token',
    keywords: ['令牌', '密钥', 'key', 'api key', 'token', '创建 key', '创建key'],
  },
  media: {
    title: '媒体工坊',
    href: '/console/media-playground',
    keywords: ['媒体', '图片', '图像', '画图', '生成图', '视频', 'media'],
  },
  pricing: {
    title: '模型广场',
    href: '/pricing',
    keywords: ['价格', '模型', '模型广场', '费用', '扣费', '权限', 'pricing'],
  },
  wallet: {
    title: '充值中心',
    href: '/console/topup',
    keywords: ['充值', '余额', '钱包', '支付', 'topup'],
  },
  docs: {
    title: '接入文档',
    href: '/docs/',
    keywords: ['文档', '教程', 'base url', '接口说明', 'docs'],
  },
  logs: {
    title: '用量日志',
    href: '/console/log',
    keywords: ['日志', '记录', '用量', '消耗', '扣费', '任务', '生成记录'],
  },
  codexCloud: {
    title: '云 Codex',
    href: '/codex',
    keywords: ['云 codex', '云codex', '云端 codex', '云端codex', 'codex workspace'],
  },
};

const homeAssistantHasAny = (text, keywords) =>
  keywords.some((keyword) => text.includes(keyword));

const homeAssistantFindRoute = (text) => {
  const lower = text.toLowerCase();
  return Object.entries(homeAssistantRoutes).find(([, route]) =>
    homeAssistantHasAny(
      lower,
      route.keywords.map((keyword) => keyword.toLowerCase()),
    ),
  );
};

const homeAssistantIntentFromRules = (text) => {
  const lower = text.toLowerCase();
  const hasLog = homeAssistantHasAny(lower, [
    '日志',
    '记录',
    '用量',
    '消耗',
    '扣费',
    '任务',
    '生成记录',
  ]);
  const hasMedia = homeAssistantHasAny(lower, [
    '图片',
    '图像',
    '媒体',
    '画图',
    '生成图',
    '视频',
    'image',
    'media',
  ]);
  const asksOpen = homeAssistantHasAny(lower, [
    '查看',
    '打开',
    '进入',
    '下载',
    '导出',
    '最近',
    '今天',
    '带我',
    '帮我',
  ]);

  if (hasLog && (hasMedia || asksOpen)) {
    return {
      intent: 'site.usage_log',
      confidence: 1,
      media_focused: hasMedia,
      source: 'rule',
    };
  }
  if (
    hasMedia &&
    homeAssistantHasAny(lower, [
      '生成',
      '制作',
      '画',
      '提示词',
      '媒体工坊',
      '文生图',
      '图生图',
    ])
  ) {
    return { intent: 'site.media_image', confidence: 0.95, source: 'rule' };
  }
  if (homeAssistantHasAny(lower, ['创建 key', '创建key', 'api key', '令牌', '密钥'])) {
    return { intent: 'site.create_key', confidence: 0.92, source: 'rule' };
  }
  const routeEntry = homeAssistantFindRoute(text);
  if (routeEntry && homeAssistantHasAny(lower, ['打开', '进入', '查看', '在哪', '哪里', '跳转'])) {
    return {
      intent: 'site.route',
      confidence: 0.9,
      route: routeEntry[0],
      source: 'rule',
    };
  }
  return null;
};

const modelBadges = [
  { label: 'OpenAI', icon: <OpenAI size={28} /> },
  { label: 'Claude', icon: <Claude.Color size={28} /> },
  { label: 'Gemini', icon: <Gemini.Color size={28} /> },
  { label: 'DeepSeek', icon: <DeepSeek.Color size={28} /> },
  { label: 'Qwen', icon: <Qwen.Color size={28} /> },
  { label: 'Midjourney', icon: <Midjourney size={28} /> },
  { label: 'Grok', icon: <Grok size={28} /> },
];

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [assistantMessages, setAssistantMessages] = useState(() => [
    ...initialHomeAssistantMessages,
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const assistantThreadRef = useRef(null);
  const assistantInputRef = useRef(null);
  const isMobile = useIsMobile();
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const normalizedServerAddress = serverAddress.replace(/\/$/, '');
  const publicBaseUrl = `${normalizedServerAddress}/v1`;
  const docsHref = docsLink || '/docs/';
  const quickSetupRows = setupRows.map((row) => ({
    ...row,
    value:
      row.value ||
      `${normalizedServerAddress}${row.suffix === '/v1' ? '/v1' : '/claude'}`,
  }));

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;
    if (success) {
      let content = data;
      if (!data.startsWith('https://')) {
        content = marked.parse(data);
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);

      // 如果内容是 URL，则发送主题模式
      if (data.startsWith('https://')) {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.onload = () => {
            iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
            iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
          };
        }
      }
    } else {
      showError(message);
      setHomePageContent('加载首页内容失败...');
    }
    setHomePageContentLoaded(true);
  };

  const handleCopyText = async (text) => {
    const ok = await copy(text);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  const addHomeAssistantReply = (content) => {
    setAssistantMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content,
      },
    ]);
  };

  const routeHomeAssistantIntent = (intent, question) => {
    if (!intent?.intent || intent.intent === 'guidance.online') {
      return false;
    }
    if (intent.confidence !== undefined && Number(intent.confidence) < 0.72) {
      return false;
    }

    if (intent.intent === 'site.usage_log') {
      addHomeAssistantReply(
        `我先按站内操作处理，不把它当成 Codex 报错。\n\n要看最近图像生成日志，打开「用量日志」：/console/log\n\n进入后重点看：时间、模型/类型、状态、消耗、请求 ID/任务 ID。如果你要下载，先在日志页筛选最近记录和图像/媒体相关记录，再使用页面里的导出或下载入口。`,
      );
      return true;
    }
    if (intent.intent === 'site.media_image') {
      addHomeAssistantReply(
        `这是媒体工坊任务。\n\n打开「媒体工坊」：/console/media-playground\n\n建议路径：选择图像模式，填提示词，选模型、尺寸和清晰度。最后的生成按钮会真实提交任务并消耗额度，所以提交前先确认参数。`,
      );
      return true;
    }
    if (intent.intent === 'site.create_key') {
      addHomeAssistantReply(
        `这是创建 API Key，不一定是 Codex 接入。\n\n打开「令牌管理」：/console/token\n\n如果是给 Codex 用，再告诉我你的电脑是 Windows 还是 Mac，我会继续生成 config.toml 和环境变量命令。`,
      );
      return true;
    }
    if (intent.intent === 'site.route') {
      const route = homeAssistantRoutes[intent.route] || homeAssistantFindRoute(question)?.[1];
      if (!route) return false;
      addHomeAssistantReply(
        `入口是「${route.title}」：${route.href}\n\n你可以直接点页面导航进入；如果当前未登录，先登录后再打开这个入口。`,
      );
      return true;
    }
    if (intent.intent === 'site.page_operation') {
      addHomeAssistantReply(
        `这是站内页面操作。我会先告诉你路径，避免误点会扣费或改账号的按钮。\n\n如果是查看信息，优先从用量日志、模型广场、令牌管理或媒体工坊进入；如果是提交、充值、删除、重置这类动作，先确认账号和额度再操作。`,
      );
      return true;
    }
    return false;
  };

  const classifyHomeAssistantIntent = async (question) => {
    const ruleIntent = homeAssistantIntentFromRules(question);
    if (ruleIntent && ruleIntent.confidence >= 0.86) {
      return ruleIntent;
    }

    try {
      const response = await fetch('/api/xingren-onboarding-assistant/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          message: question,
          context: buildHomeAssistantContext(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        return ruleIntent;
      }
      return {
        intent: payload.intent,
        confidence: Number(payload.confidence || 0),
        route: payload.route || '',
        media_focused: !!payload.media_focused,
        source: 'model',
      };
    } catch {
      return ruleIntent;
    }
  };

  const askHomeAssistant = async (value) => {
    const question = value.trim();
    if (!question || assistantLoading) {
      return;
    }

    const history = assistantMessages.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setAssistantInput('');
    setAssistantError('');
    setAssistantMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
    ]);
    setAssistantLoading(true);

    try {
      const intent = await classifyHomeAssistantIntent(question);
      if (routeHomeAssistantIntent(intent, question)) {
        return;
      }

      const response = await fetch('/api/xingren-onboarding-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          message: question,
          history,
          context: buildHomeAssistantContext(),
          screenshot: null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || '在线接入老师暂时不可用。');
      }
      addHomeAssistantReply(
        payload.reply ||
          '我没有拿到有效回复。你可以换一种说法，或直接问 Codex / Claude Code / Dify 的接入步骤。',
      );
    } catch (error) {
      const message =
        error?.message || '在线接入老师暂时没有连上模型，请稍后再试。';
      setAssistantError(message);
      addHomeAssistantReply(message);
    } finally {
      setAssistantLoading(false);
    }
  };

  const submitHomeAssistant = (event) => {
    event.preventDefault();
    askHomeAssistant(assistantInput);
  };

  const focusHomeAssistant = () => {
    assistantInputRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    assistantInputRef.current?.focus();
  };

  useEffect(() => {
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    document.body.classList.add('sx-home-active');
    return () => {
      document.body.classList.remove('sx-home-active');
    };
  }, []);

  useEffect(() => {
    if (assistantThreadRef.current) {
      assistantThreadRef.current.scrollTop =
        assistantThreadRef.current.scrollHeight;
    }
  }, [assistantMessages, assistantLoading]);

  return (
    <div className='classic-page-fill classic-home-page w-full overflow-x-hidden'>
      {homePageContentLoaded && homePageContent === '' ? (
        <div className='classic-home-default w-full overflow-x-hidden'>
          <main className='classic-home-hero sx-home-shell'>
            <section className='sx-home-hero' aria-labelledby='sx-home-title'>
              <div className='sx-home-copy'>
                <div className='sx-home-kicker'>
                  <IconFile aria-hidden />
                  <span>低价 API · 接入老师 · Agent 客户端</span>
                </div>
                <Title
                  heading={1}
                  id='sx-home-title'
                  className='sx-home-title'
                >
                  把低价模型，接进你每天用的 Agent
                </Title>
                <Paragraph className='sx-home-lead'>
                  打开首页就能问接入老师：Codex 怎么填、Claude Code 用哪个地址、Dify
                  怎么配置、401/403 怎么排查。少翻教程，先把客户端跑通。
                </Paragraph>

                <div className='sx-home-actions'>
                  <Button
                    theme='solid'
                    type='primary'
                    size={isMobile ? 'default' : 'large'}
                    icon={<IconPlay />}
                    onClick={focusHomeAssistant}
                  >
                    直接问接入老师
                  </Button>
                  <Link to='/console/token'>
                    <Button
                      size={isMobile ? 'default' : 'large'}
                      icon={<IconCopy />}
                    >
                      创建 API Key
                    </Button>
                  </Link>
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    icon={<IconCopy />}
                    onClick={() => handleCopyText(publicBaseUrl)}
                  >
                    复制 Base URL
                  </Button>
                </div>

                <div className='sx-home-proof' aria-label='核心能力'>
                  <span>
                    <strong>先判断入口</strong>
                    <em>不同客户端给不同接法</em>
                  </span>
                  <span>
                    <strong>同一把 Key 跑 Agent</strong>
                    <em>Codex / Claude Code / Dify</em>
                  </span>
                  <span>
                    <strong>价格先讲清楚</strong>
                    <em>模型、权限、余额都可查</em>
                  </span>
                </div>
              </div>

              <div
                className='sx-assistant-stage'
                aria-label='星人 API 接入老师'
              >
                <div className='sx-stage-bar sx-assistant-bar'>
                  <div>
                    <span>星人 API 接入老师</span>
                    <strong>API Onboarding Agent</strong>
                  </div>
                  <em>online</em>
                </div>
                <div className='sx-assistant-layout'>
                  <div className='sx-chat-preview'>
                    <div className='sx-chat-head'>
                      <span>首页直接对话</span>
                      <strong>Codex / Claude Code / Dify</strong>
                    </div>
                    <div className='sx-chat-thread' ref={assistantThreadRef}>
                      {assistantMessages.map((message, index) => (
                        <p
                          className={`sx-chat-bubble ${
                            message.role === 'user'
                              ? 'sx-chat-bubble-user'
                              : 'sx-chat-bubble-agent'
                          }`}
                          key={`${message.role}-${index}`}
                        >
                          {message.content}
                        </p>
                      ))}
                      {assistantLoading ? (
                        <p className='sx-chat-bubble sx-chat-bubble-agent sx-chat-bubble-muted'>
                          接入老师正在看你的问题...
                        </p>
                      ) : null}
                    </div>
                    <div className='sx-agent-actions'>
                      {homeAssistantQuickPrompts.map((prompt) => (
                        <button
                          type='button'
                          key={prompt}
                          disabled={assistantLoading}
                          onClick={() => askHomeAssistant(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <form className='sx-chat-form' onSubmit={submitHomeAssistant}>
                      <label
                        className='sx-chat-label'
                        htmlFor='sx-home-assistant-input'
                      >
                        向 API 接入老师提问
                      </label>
                      <div className='sx-chat-input-row'>
                        <textarea
                          id='sx-home-assistant-input'
                          ref={assistantInputRef}
                          className='sx-chat-input'
                          value={assistantInput}
                          rows={isMobile ? 3 : 2}
                          maxLength={600}
                          disabled={assistantLoading}
                          placeholder='例如：Codex 桌面怎么接 AIPHUI？'
                          onChange={(event) =>
                            setAssistantInput(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              askHomeAssistant(assistantInput);
                            }
                          }}
                        />
                        <button
                          type='submit'
                          className='sx-chat-submit'
                          disabled={
                            assistantLoading || assistantInput.trim() === ''
                          }
                        >
                          {assistantLoading ? '思考中' : '发送'}
                        </button>
                      </div>
                      {assistantError ? (
                        <p className='sx-chat-error' role='status'>
                          {assistantError}
                        </p>
                      ) : null}
                    </form>
                  </div>
                </div>
                <div className='sx-assistant-pills'>
                  {assistantPills.map((item) => (
                    <div className='sx-assistant-pill' key={item.label}>
                      <span>{item.label}</span>
                      <em>{item.text}</em>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section
              className='sx-home-section sx-home-launch'
              aria-labelledby='sx-launch-title'
            >
              <div className='sx-section-copy'>
                <span className='sx-section-eyebrow'>产品路径</span>
                <Title heading={2} id='sx-launch-title'>
                  入口少一点，接入快一点
                </Title>
              </div>
              <div className='sx-launch-grid'>
                {launchCards.map((card) => (
                  <a className='sx-launch-card' href={card.href} key={card.title}>
                    <span>{card.eyebrow}</span>
                    <strong>{card.title}</strong>
                    <p>{card.text}</p>
                    <IconExternalOpen aria-hidden />
                  </a>
                ))}
              </div>
            </section>

            <section
              className='sx-home-section sx-home-api'
              aria-labelledby='sx-api-title'
            >
              <div className='sx-api-panel'>
                <div className='sx-api-copy'>
                  <span className='sx-section-eyebrow'>可复制配置</span>
                  <Title heading={2} id='sx-api-title'>
                    少给一堆教程，多给能直接粘贴的配置
                  </Title>
                  <Paragraph>
                    常用客户端只需要确认入口、模型和 Key。页面把通用地址、Claude Code
                    专用地址和推荐模型放在一起；接入老师负责把它们落到真实客户端里。
                  </Paragraph>
                  <div className='sx-api-actions'>
                    <a href={docsHref}>
                      <Button icon={<IconFile />}>打开文档中心</Button>
                    </a>
                    <Link to='/console/token'>
                      <Button theme='solid' type='primary' icon={<IconPlay />}>
                        创建 API Key
                      </Button>
                    </Link>
                    {isDemoSiteMode && statusState?.status?.version ? (
                      <Button
                        icon={<IconGithubLogo />}
                        onClick={() =>
                          window.open(
                            'https://github.com/QuantumNous/new-api',
                            '_blank',
                          )
                        }
                      >
                        {statusState.status.version}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className='sx-api-config' aria-label='API 快速配置'>
                  {quickSetupRows.map((item) => (
                    <button
                      type='button'
                      className='sx-api-config-row'
                      key={item.label}
                      onClick={() => handleCopyText(item.value)}
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <IconCopy aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
              <div className='sx-model-strip' aria-label='支持的模型生态'>
                {modelBadges.map((item) => (
                  <div className='sx-model-badge' key={item.label}>
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                ))}
                <div className='sx-model-badge sx-model-badge-more'>30+</div>
              </div>
            </section>
          </main>
        </div>
      ) : (
        <div className='classic-page-fill overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              className='w-full h-full border-none'
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
