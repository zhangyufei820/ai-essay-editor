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
  IconImage,
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

const mediaStreams = [
  {
    label: '图像',
    model: 'GPT Image 2 / Banana 2',
    text: '海报、商品图、封面、参考图编辑',
    value: '1K / 2K / 4K',
  },
  {
    label: '视频',
    model: 'Veo / Grok Video',
    text: '分镜短片、动态素材、首尾帧任务',
    value: '队列生成',
  },
  {
    label: 'Agent',
    model: 'Codex / Claude Code',
    text: '开发、配置、文档接入、自动化执行',
    value: '同一把 Key',
  },
];

const launchCards = [
  {
    eyebrow: '先体验',
    title: '媒体工坊',
    href: '/console/media-playground',
    text: '在网页里完成图像、视频、参考图和生成记录，不需要先写代码。',
  },
  {
    eyebrow: '跑 Agent',
    title: '云端 Codex',
    href: '/codex/',
    text: '浏览器里运行 Codex Skill，适合调试脚本、改项目、验证 API 接入。',
  },
  {
    eyebrow: '不会配',
    title: 'API 接入老师',
    href: '/codex/',
    text: '把系统名称、客户端和目标说清楚，让它一步步带你填 Base URL 和 Key。',
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
                  <IconImage aria-hidden />
                  <span>多媒体 API · Agent 工具 · 低价中转</span>
                </div>
                <Title
                  heading={1}
                  id='sx-home-title'
                  className='sx-home-title'
                >
                  致力于让更多人以最便宜的 API 价格用上 Agent
                </Title>
                <Paragraph className='sx-home-lead'>
                  先在媒体工坊生成图片和视频，再用同一套 Base URL 与
                  API Key 接入 Codex、Claude Code、Cherry Studio、Dify
                  或你自己的智能客户系统。
                </Paragraph>

                <div className='sx-home-actions'>
                  <Link to='/console/media-playground'>
                    <Button
                      theme='solid'
                      type='primary'
                      size={isMobile ? 'default' : 'large'}
                      icon={<IconImage />}
                    >
                      打开媒体工坊
                    </Button>
                  </Link>
                  <a href='/codex/'>
                    <Button
                      size={isMobile ? 'default' : 'large'}
                      icon={<IconPlay />}
                    >
                      进入云端 Codex
                    </Button>
                  </a>
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
                    <strong>OpenAI-compatible</strong>
                    <em>普通客户端填 /v1</em>
                  </span>
                  <span>
                    <strong>Claude 兼容入口</strong>
                    <em>Claude Code 填 /claude</em>
                  </span>
                  <span>
                    <strong>媒体结果留存 72h</strong>
                    <em>生成后可回看、复制和下载</em>
                  </span>
                </div>
              </div>

              <div
                className='sx-media-stage'
                aria-label='星人 API 多媒体工作台预览'
              >
                <div className='sx-stage-bar'>
                  <div>
                    <span>星人媒体工坊</span>
                    <strong>Media Agent Console</strong>
                  </div>
                  <em>live</em>
                </div>
                <div className='sx-stage-grid'>
                  <div className='sx-stage-canvas'>
                    <div className='sx-stage-canvas-head'>
                      <span>生成预览</span>
                      <strong>gpt-image-2-4K</strong>
                    </div>
                    <div className='sx-art-board'>
                      <div className='sx-art-card sx-art-card-main'>
                        <span>4K poster</span>
                      </div>
                      <div className='sx-art-card sx-art-card-video'>
                        <IconPlay />
                        <span>video cut</span>
                      </div>
                      <div className='sx-art-card sx-art-card-ref'>
                        <span>reference</span>
                      </div>
                    </div>
                  </div>
                  <div className='sx-stage-side'>
                    <div className='sx-prompt-box'>
                      <span>Prompt</span>
                      <p>高级商业海报，真实光影，清晰主体，适合品牌宣传。</p>
                    </div>
                    <div className='sx-param-list'>
                      <span>size</span>
                      <strong>2880 × 2880</strong>
                      <span>status</span>
                      <strong>queued · 72h cache</strong>
                    </div>
                  </div>
                </div>
                <div className='sx-stream-row'>
                  {mediaStreams.map((item) => (
                    <div className='sx-stream-item' key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.model}</strong>
                      <em>{item.text}</em>
                      <small>{item.value}</small>
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
                <span className='sx-section-eyebrow'>从体验到接入</span>
                <Title heading={2} id='sx-launch-title'>
                  一个用户第一次进来，应该先知道自己点哪里
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
                  <span className='sx-section-eyebrow'>接入配置</span>
                  <Title heading={2} id='sx-api-title'>
                    看文档、复制配置、让接入老师带你做
                  </Title>
                  <Paragraph>
                    文档中心负责给出可复制的接口路径；云端 Codex 里的
                    API 接入老师负责把这些配置落到你的客户端、机器人或客户系统里。
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
