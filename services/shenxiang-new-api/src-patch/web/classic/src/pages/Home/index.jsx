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

import React, { useContext, useEffect, useState } from 'react';
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
import NoticeModal from '../../components/layout/NoticeModal';
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
  const [noticeVisible, setNoticeVisible] = useState(false);
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

  useEffect(() => {
    const checkNoticeAndShow = async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate !== today) {
        try {
          const res = await API.get('/api/notice');
          const { success, data } = res.data;
          if (success && data && data.trim() !== '') {
            setNoticeVisible(true);
          }
        } catch (error) {
          console.error('获取公告失败:', error);
        }
      }
    };

    checkNoticeAndShow();
  }, []);

  useEffect(() => {
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    document.body.classList.add('sx-home-active');
    return () => {
      document.body.classList.remove('sx-home-active');
    };
  }, []);

  return (
    <div className='classic-page-fill classic-home-page w-full overflow-x-hidden'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
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
                  便宜的 API，不该只给会配置的人用
                </Title>
                <Paragraph className='sx-home-lead'>
                  星人 API 把模型、价格、Base URL、API Key 和客户端接入放在同一个入口。
                  新用户不用读长教程，接入老师会带他把 Codex、Claude Code、Dify
                  或自己的客户系统真正跑起来。
                </Paragraph>

                <div className='sx-home-actions'>
                  <a href='/codex/'>
                    <Button
                      theme='solid'
                      type='primary'
                      size={isMobile ? 'default' : 'large'}
                      icon={<IconPlay />}
                    >
                      找 API 接入老师
                    </Button>
                  </a>
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
                aria-label='星人 API 接入老师预览'
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
                      <span>当前用户停在首页</span>
                      <strong>已识别：Claude Code 接入</strong>
                    </div>
                    <div className='sx-chat-thread'>
                      <p className='sx-chat-bubble sx-chat-bubble-user'>
                        我想把 Claude Code 接到星人 API，应该填哪里？
                      </p>
                      <p className='sx-chat-bubble sx-chat-bubble-agent'>
                        你用 Claude Code，先复制专用地址，不要填通用 /v1。下一步我带你创建 Key。
                      </p>
                      <p className='sx-chat-bubble sx-chat-bubble-agent sx-chat-bubble-muted'>
                        涉及创建、充值、生成和删除前，我会先让你确认。
                      </p>
                    </div>
                    <div className='sx-agent-actions'>
                      <span>打开令牌管理</span>
                      <span>复制 Claude 地址</span>
                      <span>检查模型权限</span>
                    </div>
                  </div>
                  <div className='sx-config-preview'>
                    <div className='sx-config-card sx-config-card-primary'>
                      <span>推荐路径</span>
                      <strong>Claude Code / Codex</strong>
                      <p>先建 Key，再把地址和模型填进客户端。</p>
                    </div>
                    <button
                      type='button'
                      className='sx-config-mini'
                      onClick={() =>
                        handleCopyText(`${normalizedServerAddress}/claude`)
                      }
                    >
                      <span>Claude Base URL</span>
                      <strong>{`${normalizedServerAddress}/claude`}</strong>
                      <IconCopy aria-hidden />
                    </button>
                    <button
                      type='button'
                      className='sx-config-mini'
                      onClick={() => handleCopyText('gpt-5.5')}
                    >
                      <span>推荐模型</span>
                      <strong>gpt-5.5</strong>
                      <IconCopy aria-hidden />
                    </button>
                    <div className='sx-safety-note'>
                      不要把完整 API Key 发给网页聊天。贴过 Key 就建议重置。
                    </div>
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
