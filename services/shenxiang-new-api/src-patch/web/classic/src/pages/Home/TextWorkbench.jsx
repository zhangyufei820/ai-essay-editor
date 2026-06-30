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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Select,
  Spin,
  Toast,
  Tooltip,
} from '@douyinfe/semi-ui';
import {
  IconFile,
  IconPlay,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import { API } from '../../helpers';
import { getDefaultTextModel, toTextModelOptions } from './textModelFilter';

const MAX_TEXT_FILES = 4;
const MAX_TEXT_FILE_SIZE = 160 * 1024;
const TEXT_FILE_ACCEPT = '.txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json';

const primaryNav = [
  { label: '新聊天', icon: '✎', action: 'new' },
  { label: '搜索聊天', icon: '⌕' },
  { label: '文件库', icon: '▥' },
  { label: '项目', icon: '□' },
  { label: '已安排', icon: '◷' },
  { label: '应用', icon: '⌘' },
  { label: '更多', icon: '⋯' },
];

const appLinks = [
  { label: '云端 Codex', href: '/codex/' },
  { label: '模型广场', href: '/pricing' },
  { label: '接入设置', href: '/console/token' },
  { label: '定价', href: '/pricing' },
  { label: '在线客服', href: '/docs/' },
];

const starterPrompts = [
  '整理文件',
  '撰写或编辑',
  '查找资料',
];

const sampleThreads = [
  '文本模型对话',
  '文件内容整理',
  '接入设置说明',
  '模型选择建议',
  '资料摘要',
  '提示词优化',
  '问题排查记录',
  '课程文案修改',
  '项目计划整理',
  '客服回复草稿',
];

const readTextFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        content: String(reader.result || ''),
      });
    };
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file);
  });

function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function buildAttachmentContext(files) {
  if (!files.length) return '';
  return files
    .map((file) => {
      const content = file.content.slice(0, 3600);
      const suffix = file.content.length > 3600 ? '\n...[内容较长，已自动节选]' : '';
      return `\n\n[文件: ${file.name}]\n${content}${suffix}`;
    })
    .join('');
}

const TextWorkbench = ({ isMobile }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme-mode') || localStorage.getItem('theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
    return true;
  });
  const fileInputRef = useRef(null);
  const threadRef = useRef(null);

  const isLoggedIn = !!user;
  const displayName = user?.username || user?.display_name || user?.email || '已登录用户';
  const modelOptions = useMemo(() => toTextModelOptions(models), [models]);
  const activeModel = selectedModel || getDefaultTextModel(models);
  const canOrganize = input.trim() || attachments.length > 0;

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    if (!isLoggedIn) {
      setModels([]);
      setSelectedModel(getDefaultTextModel([]));
      return;
    }

    setModelsLoading(true);
    setModelError('');
    API.get('/api/user/models')
      .then((res) => {
        const data = res?.data?.data || [];
        const nextModels = Array.isArray(data) ? data : [];
        setModels(nextModels);
        setSelectedModel(getDefaultTextModel(nextModels));
      })
      .catch((error) => {
        setModelError(error?.message || '模型列表暂时不可用');
        setSelectedModel(getDefaultTextModel([]));
      })
      .finally(() => setModelsLoading(false));
  }, [isLoggedIn]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const setTheme = (nextDark) => {
    document.documentElement.classList.toggle('dark', nextDark);
    localStorage.setItem('theme-mode', nextDark ? 'dark' : 'light');
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    setIsDark(nextDark);
  };

  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const room = MAX_TEXT_FILES - attachments.length;
    if (room <= 0) {
      Toast.warning(`最多上传 ${MAX_TEXT_FILES} 个纯文本文件。`);
      return;
    }

    const accepted = incoming.slice(0, room).filter((file) => {
      const lower = file.name.toLowerCase();
      const isTextLike =
        file.type.startsWith('text/') ||
        lower.endsWith('.txt') ||
        lower.endsWith('.md') ||
        lower.endsWith('.csv') ||
        lower.endsWith('.json');
      if (!isTextLike) {
        Toast.warning(`${file.name} 当前不支持。`);
        return false;
      }
      if (file.size > MAX_TEXT_FILE_SIZE) {
        Toast.warning(`${file.name} 超过 ${formatBytes(MAX_TEXT_FILE_SIZE)}。`);
        return false;
      }
      return true;
    });

    try {
      const parsed = await Promise.all(accepted.map(readTextFile));
      setAttachments((prev) => [...prev, ...parsed]);
    } catch (error) {
      Toast.error(error?.message || '文件读取失败');
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  };

  const resetConversation = () => {
    setMessages([]);
    setInput('');
    setAttachments([]);
  };

  const organizeMessage = () => {
    if (!isLoggedIn) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '需要登录',
          content: '登录后可以读取你的可用模型，并继续使用聊天工作站。',
        },
      ]);
      return;
    }

    if (!canOrganize) {
      Toast.warning('先输入问题，或上传一个纯文本文件。');
      return;
    }

    const attachmentContext = buildAttachmentContext(attachments);
    const userMessage = `${input.trim()}${attachmentContext}` || '请根据文件内容继续。';
    const fileCount = attachments.length;

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        title: activeModel,
        content: userMessage,
      },
      {
        role: 'assistant',
        title: 'AIPHUI',
        content: `已整理好这条消息。当前模型：${activeModel}；文件：${fileCount} 个。你可以继续补充，或换一个模型重新整理。`,
      },
    ]);
    setInput('');
    setAttachments([]);
  };

  const applyStarter = (label) => {
    const next = {
      整理文件: '请把我上传的文件整理成清晰的要点和行动清单。',
      撰写或编辑: '请帮我把下面这段内容改得更清楚、更自然。',
      查找资料: '请根据下面的问题，列出需要查找的资料和判断标准。',
    }[label];
    setInput(next || label);
  };

  return (
    <section
      className={isDark ? 'sx-gpt-shell is-dark' : 'sx-gpt-shell is-light'}
      aria-label='AIPHUI 聊天工作站'
    >
      <aside className='sx-gpt-sidebar' aria-label='侧边栏'>
        <div className='sx-gpt-brand'>
          <strong>AIPHUI Pro</strong>
          <button type='button' aria-label='收起侧边栏'>◫</button>
        </div>

        <nav className='sx-gpt-nav' aria-label='主导航'>
          {primaryNav.map((item, index) => (
            <button
              type='button'
              className={index === 0 ? 'is-active' : ''}
              key={item.label}
              onClick={item.action === 'new' ? resetConversation : undefined}
            >
              <span className='sx-gpt-nav-icon'>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className='sx-gpt-apps' aria-label='常用入口'>
          {appLinks.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>

        <div className='sx-gpt-recent'>
          <span>最近</span>
          <div>
            {sampleThreads.map((title, index) => (
              <button
                type='button'
                className={index === 0 ? 'has-dot' : ''}
                key={title}
              >
                {title}
              </button>
            ))}
          </div>
        </div>

        <div className='sx-gpt-account'>
          <div className='sx-gpt-account-avatar'>
            {isLoggedIn ? displayName.slice(0, 1).toUpperCase() : 'A'}
          </div>
          <div>
            <strong>{isLoggedIn ? displayName : '未登录'}</strong>
            {isLoggedIn ? <span>Pro</span> : <Link to='/login'>登录后使用</Link>}
          </div>
        </div>
      </aside>

      <main className={messages.length ? 'sx-gpt-main has-thread' : 'sx-gpt-main is-empty'}>
        <div className='sx-gpt-topbar'>
          <div className='sx-gpt-model-status'>
            {modelsLoading ? (
              <>
                <Spin size='small' />
                <span>读取模型中</span>
              </>
            ) : (
              <span>{modelError || activeModel}</span>
            )}
          </div>
          <Tooltip content={isDark ? '白天模式' : '暗黑模式'}>
            <button
              type='button'
              className='sx-gpt-theme'
              onClick={() => setTheme(!isDark)}
              aria-label='切换明暗模式'
            >
              {isDark ? '☼' : '☾'}
            </button>
          </Tooltip>
        </div>

        <div className='sx-gpt-stage' ref={threadRef}>
          {messages.length ? (
            <div className='sx-gpt-thread'>
              {messages.map((message, index) => (
                <article
                  className={`sx-gpt-message sx-gpt-message-${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <div className='sx-gpt-message-name'>{message.title}</div>
                  <div className='sx-gpt-bubble'>{message.content}</div>
                </article>
              ))}
            </div>
          ) : (
            <div className='sx-gpt-landing'>
              <h1>今天有什么计划？</h1>
            </div>
          )}

          <div
            className={isDragging ? 'sx-gpt-composer-area is-dragging' : 'sx-gpt-composer-area'}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            {attachments.length ? (
              <div className='sx-gpt-files'>
                {attachments.map((file) => (
                  <button
                    type='button'
                    key={file.id}
                    onClick={() => removeAttachment(file.id)}
                    title='点击移除'
                  >
                    <IconFile />
                    <span>{file.name}</span>
                    <em>{formatBytes(file.size)}</em>
                  </button>
                ))}
              </div>
            ) : null}

            <div className='sx-gpt-composer'>
              <input
                ref={fileInputRef}
                className='sx-gpt-file-input'
                type='file'
                multiple
                accept={TEXT_FILE_ACCEPT}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <Tooltip content='上传文件'>
                <button
                  type='button'
                  className='sx-gpt-upload'
                  onClick={() => fileInputRef.current?.click()}
                  aria-label='上传文件'
                >
                  <span aria-hidden='true'>+</span>
                </button>
              </Tooltip>

              <textarea
                value={input}
                rows={1}
                placeholder='有问题，尽管问'
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    organizeMessage();
                  }
                }}
              />

              <Select
                className='sx-gpt-model-select'
                value={selectedModel}
                loading={modelsLoading}
                disabled={!isLoggedIn || modelsLoading}
                optionList={modelOptions}
                placeholder={modelsLoading ? '模型' : '选择模型'}
                onChange={(value) => setSelectedModel(value)}
                style={{ width: isMobile ? 116 : 178 }}
              />

              <Button
                className='sx-gpt-send'
                theme='solid'
                type='primary'
                icon={<IconPlay />}
                onClick={organizeMessage}
                disabled={!canOrganize && isLoggedIn}
                aria-label={isLoggedIn ? '整理消息' : '登录后使用'}
              />
            </div>

            <div className='sx-gpt-quick-actions'>
              {starterPrompts.map((prompt) => (
                <button
                  type='button'
                  key={prompt}
                  onClick={() => applyStarter(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </section>
  );
};

export default TextWorkbench;
