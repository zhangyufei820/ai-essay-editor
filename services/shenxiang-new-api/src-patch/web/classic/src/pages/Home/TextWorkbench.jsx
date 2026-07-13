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
} from '@douyinfe/semi-icons';
import {
  ArrowUp,
  BadgeDollarSign,
  CircleHelp,
  Copy,
  Edit3,
  Headphones,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  RotateCcw,
  MoonStar,
  Settings2,
  Square,
  SunMedium,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API, copy } from '../../helpers';
import {
  getDefaultReasoningEffort,
  getDefaultTextModel,
  getReasoningEffortOptions,
  getTextModelGroup,
  toTextModelOptions,
} from './textModelFilter';
import { useThemePreference } from '../../context/Theme';

const MAX_ATTACHMENTS = 6;
const MAX_TEXT_FILE_SIZE = 512 * 1024;
const MAX_BINARY_FILE_SIZE = 8 * 1024 * 1024;
const TEXT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.log',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
];
const WORKBENCH_FILE_ACCEPT = [
  ...TEXT_FILE_EXTENSIONS,
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
].join(',');

const primaryNav = [
  { label: '新聊天', icon: Plus, action: 'new' },
  { label: '控制台', icon: LayoutDashboard, href: '/console' },
  { label: '帮助', icon: CircleHelp, href: '/docs/' },
  { label: '聊天', icon: MessageSquare, action: 'chat', active: true },
  { label: '媒体工坊', icon: Store, href: '/console/media-playground' },
  { label: '云 Codex', icon: KeyRound, href: '/codex/' },
  { label: '接入设置', icon: Settings2, href: '/console/token' },
  { label: '定价', icon: BadgeDollarSign, href: '/pricing' },
  { label: '在线客服', icon: Headphones, action: 'teacher' },
];

const starterPrompts = [
  '整理文件',
  '撰写或编辑',
  '查找资料',
];
const CHAT_HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_HISTORY_LIMIT = 30;
const CHAT_HISTORY_STORAGE_PREFIX = 'aiphui-home-chat-history:v1';
const DISCOUNT_GROUP = 'discount';
const DEFAULT_GROUP = 'default';
const DISCOUNT_PRICING_LABEL = '特价 0.05x';
const DEFAULT_PRICING_LABEL = '原价 1x';
const DISCOUNT_FALLBACK_HEADER = 'X-Aiphui-Discount-Fallback';
const DISCOUNT_FALLBACK_REQUEST_HEADER =
  'X-Aiphui-Discount-Fallback-Request';
const PRICING_GROUP_HEADER = 'X-Aiphui-Pricing-Group';
const DISCOUNT_FALLBACK_MAX_COMPLETION_TOKENS = 4096;

function createConversationId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileExtension(name = '') {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

function isTextLikeFile(file) {
  const type = file.type || '';
  const extension = getFileExtension(file.name);
  return type.startsWith('text/') || TEXT_FILE_EXTENSIONS.includes(extension) || type === 'application/json';
}

function getAttachmentKind(file) {
  const type = file.type || '';
  const extension = getFileExtension(file.name);
  if (isTextLikeFile(file)) return 'text';
  if (type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) return 'image';
  if (type === 'application/pdf' || extension === '.pdf') return 'pdf';
  return 'unsupported';
}

const readTextFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        kind: 'text',
        readable: true,
        content: String(reader.result || ''),
      });
    };
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file);
  });

const readDataUrlFile = (file, kind) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        kind,
        readable: true,
        dataUrl: String(reader.result || ''),
      });
    };
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

function createUnsupportedAttachment(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    kind: 'unsupported',
    readable: false,
  };
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getCurrentUserId(currentUser) {
  const direct = [
    currentUser?.id,
    currentUser?.user_id,
    currentUser?.userId,
    currentUser?.user?.id,
    currentUser?.data?.id,
  ];
  for (const value of direct) {
    if (/^\d+$/.test(String(value || '').trim())) return String(value).trim();
  }

  const directKeys = ['uid', 'user_id', 'userId', 'new-api-user'];
  for (const key of directKeys) {
    const value = localStorage.getItem(key);
    if (/^\d+$/.test(String(value || '').trim())) return String(value).trim();
  }

  const objectKeys = ['user', 'new_api_user', 'userInfo', 'account'];
  for (const key of objectKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const value =
        parsed?.id ||
        parsed?.user_id ||
        parsed?.userId ||
        parsed?.user?.id ||
        parsed?.data?.id;
      if (/^\d+$/.test(String(value || '').trim())) return String(value).trim();
    } catch {
      if (/^\d+$/.test(raw.trim())) return raw.trim();
    }
  }

  return '';
}

function getHistoryStorageKey(currentUser) {
  const userId = getCurrentUserId(currentUser);
  const fallback =
    currentUser?.username ||
    currentUser?.email ||
    currentUser?.display_name ||
    'guest';
  return `${CHAT_HISTORY_STORAGE_PREFIX}:${userId || fallback}`;
}

function sanitizeHistoryText(value, maxLength = 6000) {
  const text = contentToPlainText(value).trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[内容较长，已自动节选]`;
}

function normalizePricingLabel(value) {
  return value === DISCOUNT_PRICING_LABEL || value === DEFAULT_PRICING_LABEL
    ? value
    : '';
}

function sanitizeHistoryMessage(message) {
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null;
  if (message.pending) return null;
  const displayContent = sanitizeHistoryText(message.displayContent || message.content, 1200);
  const apiContent = sanitizeHistoryText(message.apiContent || displayContent, 4000);
  const pricingLabel = normalizePricingLabel(message.pricingLabel);
  return {
    id: message.id || `${message.role}-${Date.now()}`,
    role: message.role,
    title: message.title || (message.role === 'user' ? '你' : '助手'),
    content: sanitizeHistoryText(message.content, 6000),
    displayContent,
    apiContent,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(({ content, dataUrl, ...file }) => file)
      : [],
    ...(pricingLabel ? { pricingLabel } : {}),
  };
}

function conversationTitleFromMessages(messages) {
  const firstUser = messages.find((message) => message.role === 'user');
  const text = sanitizeHistoryText(firstUser?.displayContent || firstUser?.content || '', 80)
    .replace(/\s+/g, ' ')
    .trim();
  return text || '新聊天';
}

function pruneConversations(conversations, now = Date.now()) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter((item) => item && item.id && Array.isArray(item.messages) && item.messages.length > 0)
    .filter((item) => now - Number(item.updatedAt || 0) <= CHAT_HISTORY_RETENTION_MS)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, CHAT_HISTORY_LIMIT);
}

function readStoredConversations(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const payload = JSON.parse(raw);
    return pruneConversations(payload?.items || payload);
  } catch {
    return [];
  }
}

function writeStoredConversations(storageKey, items) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      retentionDays: 7,
      savedAt: Date.now(),
      items: pruneConversations(items),
    }));
  } catch {
    // localStorage may be full or blocked; the active chat should keep working.
  }
}

function buildConversationRecord(id, messages, model) {
  const savedMessages = messages.map(sanitizeHistoryMessage).filter(Boolean);
  if (!id || !savedMessages.length) return null;
  const now = Date.now();
  return {
    id,
    title: conversationTitleFromMessages(savedMessages),
    model,
    messageCount: savedMessages.length,
    createdAt: now,
    updatedAt: now,
    messages: savedMessages,
  };
}

function formatConversationAge(updatedAt) {
  const elapsed = Math.max(0, Date.now() - Number(updatedAt || 0));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getAttachmentLabel(file) {
  if (file.kind === 'text') return '已读取';
  if (file.kind === 'image') return '可读取图片';
  if (file.kind === 'pdf') return '可读取 PDF';
  return '当前不读取';
}

function buildTextAttachmentContext(files) {
  const textFiles = files.filter((file) => file.kind === 'text' && file.content);
  if (!textFiles.length) return '';
  return textFiles
    .map((file) => {
      const content = file.content.slice(0, 6200);
      const suffix = file.content.length > 6200 ? '\n...[内容较长，已自动节选]' : '';
      return `\n\n[文件: ${file.name}]\n${content}${suffix}`;
    })
    .join('');
}

function buildUserRequestContent(text, files) {
  const trimmed = text.trim();
  const textWithContext = `${trimmed}${buildTextAttachmentContext(files)}` || '请根据附件内容继续。';
  const mediaParts = [];

  files.forEach((file) => {
    if (!file.readable || !file.dataUrl) return;
    if (file.kind === 'image') {
      mediaParts.push({
        type: 'image_url',
        image_url: {
          url: file.dataUrl,
        },
      });
      return;
    }
    if (file.kind === 'pdf') {
      mediaParts.push({
        type: 'file',
        file: {
          filename: file.name,
          file_data: file.dataUrl,
        },
      });
    }
  });

  if (!mediaParts.length) return textWithContext;
  return [
    {
      type: 'text',
      text: textWithContext,
    },
    ...mediaParts,
  ];
}

function contentToPlainText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text') return item.text || '';
      if (item?.type === 'image_url') return `[图片: ${item?.image_url?.url ? '已附加' : '未读取'}]`;
      if (item?.type === 'file') return `[文件: ${item?.file?.filename || '已附加'}]`;
      return item?.text || '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractAssistantText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] || {};
  const content = firstChoice?.message?.content ?? firstChoice?.delta?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.text || item?.content || '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof payload?.text === 'string') return payload.text.trim();
  if (typeof payload?.content === 'string') return payload.content.trim();
  return '';
}

function extractAssistantDelta(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] || {};
  const content =
    firstChoice?.delta?.content ??
    firstChoice?.message?.content ??
    payload?.delta?.content ??
    payload?.text ??
    payload?.content;

  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.text || item?.content || '';
      })
      .filter(Boolean)
      .join('');
  }
  return '';
}

function getResponsePricingMetadata(response) {
  const fallbackHeader = response?.headers?.get(DISCOUNT_FALLBACK_HEADER) || '';
  const pricingGroup = String(
    response?.headers?.get(PRICING_GROUP_HEADER) || '',
  )
    .trim()
    .toLowerCase();
  return {
    fallbackAttempted: fallbackHeader.trim() === '1',
    pricingGroup,
  };
}

function getPricingLabel(group) {
  if (group === DISCOUNT_GROUP) return DISCOUNT_PRICING_LABEL;
  if (group === DEFAULT_GROUP) return DEFAULT_PRICING_LABEL;
  return '';
}

async function readResponseError(response) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const message =
    payload?.error?.message ||
    payload?.message ||
    text ||
    `请求失败：${response.status}`;
  const data = payload || { message };
  const metadata = getResponsePricingMetadata(response);
  const error = new Error(message);
  error.name = 'ChatResponseError';
  error.status = response.status;
  error.code = payload?.error?.code ?? payload?.code ?? '';
  error.data = data;
  error.fallbackAttempted = metadata.fallbackAttempted;
  error.pricingGroup = metadata.pricingGroup;
  error.response = {
    status: response.status,
    data,
    headers: response.headers,
  };
  return error;
}

function isExplicitDiscountGroupAccessDenied(error) {
  return /(?:无权访问该分组|無權存取該分組|no permission to access this group)/i.test(
    String(error?.message || ''),
  );
}

function shouldFallbackDiscountRequest(error, { signal, hasVisibleOutput }) {
  if (
    signal?.aborted ||
    hasVisibleOutput ||
    error?.fallbackAttempted ||
    error?.pricingGroup === DEFAULT_GROUP
  ) {
    return false;
  }

  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.data?.error?.code || '')
    .trim()
    .toLowerCase();
  if (status === 503 && code === 'model_not_found') return true;
  // Legacy distributor responses may omit access_denied, so the exact localized group-denial text remains mandatory.
  const isGroupAccessCode =
    !code || code === 'access_denied' || code === 'new_api_error';
  return (
    status === 403 &&
    isGroupAccessCode &&
    isExplicitDiscountGroupAccessDenied(error)
  );
}

async function readStreamingResponse(response, onText) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || contentType.includes('application/json')) {
    const payload = await response.json();
    if (payload?.error?.message) throw new Error(payload.error.message);
    const answer = extractAssistantText(payload);
    if (answer) onText(answer);
    return answer;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let answer = '';

  const applyPayload = (raw) => {
    const data = raw.trim();
    if (!data || data === '[DONE]') return data === '[DONE]';
    try {
      const payload = JSON.parse(data);
      if (payload?.error?.message) throw new Error(payload.error.message);
      const delta = extractAssistantDelta(payload);
      if (delta) {
        answer += delta;
        onText(answer);
      }
    } catch (error) {
      if (error instanceof SyntaxError) return false;
      throw error;
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (!trimmed.startsWith('data:')) continue;
      if (applyPayload(trimmed.slice(5))) return answer;
    }
  }

  if (buffer.trim().startsWith('data:')) applyPayload(buffer.trim().slice(5));
  return answer;
}

function getChatFailureMessage(error) {
  const data = error?.response?.data || error?.data || {};
  const message =
    data?.error?.message ||
    data?.message ||
    error?.message ||
    '这次回复没有完成，请稍后再试。';
  return String(message)
    .replace(/\u4e0a\u6e38|\u4f9b\u5e94\u5546|\u63a5\u53e3\u5730\u5740/g, '模型服务')
    .replace(/upstream/gi, '模型服务')
    .replace(/supplier/gi, '模型服务')
    .replace(/provider/gi, '模型服务')
    .replace(/\bapi\b/gi, '服务')
    .trim();
}

function InlineMarkdown({ text }) {
  const parts = String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
          return <code key={`inline-${index}`}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
          return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
      })}
    </>
  );
}

const CODE_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'let',
  'new',
  'null',
  'return',
  'switch',
  'throw',
  'true',
  'try',
  'undefined',
  'var',
  'while',
]);

function highlightCodeLine(line) {
  const tokens = String(line).match(/\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|\s+|./g) || [];
  return tokens.map((token, index) => {
    let className = '';
    if (/^(\/\/|#)/.test(token)) className = 'is-comment';
    else if (/^(['"`])/.test(token)) className = 'is-string';
    else if (/^\d/.test(token)) className = 'is-number';
    else if (CODE_KEYWORDS.has(token)) className = 'is-keyword';
    return className ? <span className={className} key={`${token}-${index}`}>{token}</span> : token;
  });
}

function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const label = language || '代码';
  const lines = String(code).split('\n');

  const handleCopy = async () => {
    const ok = await copy(code);
    setCopied(ok);
    Toast[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败');
    if (ok) window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className='sx-gpt-code-block'>
      <div className='sx-gpt-code-header'>
        <span>{label}</span>
        <button type='button' onClick={handleCopy} aria-label='复制代码'>
          <Copy size={14} />
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre>
        <code className={language ? `language-${language}` : ''}>
          {lines.map((line, index) => (
            <React.Fragment key={`line-${index}`}>
              {highlightCodeLine(line)}
              {index < lines.length - 1 ? '\n' : ''}
            </React.Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

function MarkdownContent({ content }) {
  const source = contentToPlainText(content);
  const blocks = source.split(/```([^\n`]*)\n?([\s\S]*?)```/g);

  return (
    <div className='sx-gpt-markdown'>
      {blocks.map((block, index) => {
        if (index % 3 === 1) return null;
        if (index % 3 === 2) {
          const language = String(blocks[index - 1] || '').trim();
          return <CodeBlock key={`code-${index}`} code={block.replace(/\n$/, '')} language={language} />;
        }

        return String(block || '')
          .split(/\n{2,}/)
          .filter((paragraph) => paragraph.trim())
          .map((paragraph, paragraphIndex) => {
            const trimmed = paragraph.trim();
            const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
              const HeadingTag = `h${Math.min(heading[1].length + 2, 4)}`;
              return (
                <HeadingTag key={`heading-${index}-${paragraphIndex}`}>
                  <InlineMarkdown text={heading[2]} />
                </HeadingTag>
              );
            }
            const listLines = trimmed.split('\n').filter((line) => /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line));
            if (listLines.length > 1 && listLines.length === trimmed.split('\n').length) {
              const isOrdered = /^\s*\d+\.\s+/.test(listLines[0]);
              const Tag = isOrdered ? 'ol' : 'ul';
              return (
                <Tag key={`list-${index}-${paragraphIndex}`}>
                  {listLines.map((line, lineIndex) => (
                    <li key={`item-${lineIndex}`}>
                      <InlineMarkdown text={line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '')} />
                    </li>
                  ))}
                </Tag>
              );
            }
            return (
              <p key={`paragraph-${index}-${paragraphIndex}`}>
                <InlineMarkdown text={trimmed} />
              </p>
            );
          });
      })}
    </div>
  );
}

function AttachmentChips({ files, onRemove }) {
  if (!files?.length) return null;
  return (
    <div className='sx-gpt-files'>
      {files.map((file) => {
        const content = (
          <>
            <IconFile />
            <span>{file.name}</span>
            <em>{getAttachmentLabel(file)} · {formatBytes(file.size)}</em>
          </>
        );
        if (!onRemove) {
          return (
            <span
              key={file.id}
              title={getAttachmentLabel(file)}
              className={file.readable ? 'sx-gpt-file-chip' : 'sx-gpt-file-chip is-muted'}
            >
              {content}
            </span>
          );
        }
        return (
          <button
            type='button'
            key={file.id}
            onClick={() => onRemove(file.id)}
            title='点击移除'
            className={file.readable ? '' : 'is-muted'}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

const TextWorkbench = ({ isMobile }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDark, setIsDark] = useThemePreference();
  const fileInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const threadRef = useRef(null);
  const requestControllerRef = useRef(null);

  const isLoggedIn = !!user;
  const displayName = user?.username || user?.display_name || user?.email || '已登录用户';
  const modelOptions = useMemo(() => toTextModelOptions(models), [models]);
  const activeModel = selectedModel || getDefaultTextModel(models);
  const activeModelGroup = getTextModelGroup(activeModel);
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortOptions(activeModel),
    [activeModel],
  );
  const activeReasoningEffort = reasoningEffortOptions.some(
    (option) => option.value === reasoningEffort,
  )
    ? reasoningEffort
    : getDefaultReasoningEffort(activeModel);
  const historyStorageKey = useMemo(() => getHistoryStorageKey(user), [user]);
  const canOrganize = input.trim() || attachments.length > 0;
  const hasConversation = messages.some((message) => message.role === 'user' || message.role === 'assistant');
  const lastAssistantIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') return index;
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const stored = readStoredConversations(historyStorageKey);
    setSavedConversations(stored);
    if (!messages.length && stored[0]?.messages?.length) {
      setCurrentConversationId(stored[0].id);
      setMessages(stored[0].messages);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (!currentConversationId || !messages.length) return;
    if (messages.some((message) => message.pending)) return;

    const record = buildConversationRecord(currentConversationId, messages, activeModel);
    if (!record) return;

    setSavedConversations((prev) => {
      const existing = prev.find((item) => item.id === record.id);
      if (existing && JSON.stringify(existing.messages) === JSON.stringify(record.messages)) {
        return prev;
      }
      const nextRecord = {
        ...record,
        createdAt: existing?.createdAt || record.createdAt,
      };
      const next = pruneConversations([
        nextRecord,
        ...prev.filter((item) => item.id !== record.id),
      ]);
      writeStoredConversations(historyStorageKey, next);
      return next;
    });
  }, [activeModel, currentConversationId, historyStorageKey, messages]);

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
    const defaultEffort = getDefaultReasoningEffort(activeModel);
    setReasoningEffort((currentEffort) => {
      if (!defaultEffort) return '';
      return reasoningEffortOptions.some(
        (option) => option.value === currentEffort,
      )
        ? currentEffort
        : defaultEffort;
    });
  }, [activeModel, reasoningEffortOptions]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const composer = composerInputRef.current;
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 122)}px`;
  }, [input]);

  const abortActiveRequest = () => {
    requestControllerRef.current?.abort();
  };

  const openApiTeacher = () => {
    window.dispatchEvent(new CustomEvent('aiphui:open-api-teacher'));
    window.setTimeout(() => {
      const panel = document.querySelector('.xr-api-assistant-panel');
      const launcher = document.querySelector('.xr-api-assistant-launcher');
      if (!panel && launcher instanceof HTMLElement) launcher.click();
    }, 0);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      Toast.warning(`最多上传 ${MAX_ATTACHMENTS} 个文件。`);
      return;
    }

    const readers = incoming.slice(0, room).map((file) => {
      const kind = getAttachmentKind(file);
      if (kind === 'unsupported') {
        Toast.warning(`${file.name} 已附加，但当前会话暂不读取这种格式。`);
        return Promise.resolve(createUnsupportedAttachment(file));
      }
      const maxSize = kind === 'text' ? MAX_TEXT_FILE_SIZE : MAX_BINARY_FILE_SIZE;
      if (file.size > maxSize) {
        Toast.warning(`${file.name} 超过 ${formatBytes(maxSize)}，已跳过。`);
        return null;
      }
      if (kind === 'text') return readTextFile(file);
      return readDataUrlFile(file, kind);
    }).filter(Boolean);

    try {
      const parsed = await Promise.all(readers);
      setAttachments((prev) => [...prev, ...parsed]);
    } catch (error) {
      Toast.error(error?.message || '文件读取失败');
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  };

  const resetConversation = () => {
    abortActiveRequest();
    setCurrentConversationId('');
    setMessages([]);
    setInput('');
    setAttachments([]);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const openConversation = (conversation) => {
    if (!conversation?.messages?.length) return;
    abortActiveRequest();
    setCurrentConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput('');
    setAttachments([]);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const deleteConversation = (conversationId, event) => {
    event?.stopPropagation();
    setSavedConversations((prev) => {
      const next = prev.filter((item) => item.id !== conversationId);
      writeStoredConversations(historyStorageKey, next);
      return next;
    });
    if (currentConversationId === conversationId) {
      resetConversation();
    }
  };

  const handleNavAction = (action) => {
    if (action === 'new') {
      resetConversation();
      return;
    }
    if (action === 'teacher') {
      openApiTeacher();
      return;
    }
    composerInputRef.current?.focus();
  };

  const copyMessage = async (message) => {
    const ok = await copy(message.displayContent || contentToPlainText(message.content));
    Toast[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败');
  };

  const buildHistory = (sourceMessages = []) =>
    sourceMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .filter((message) => !message.pending)
      .map((message) => ({
        role: message.role,
        content: message.apiContent || message.content,
      }));

  const streamConversation = async ({
    displayContent,
    userRequestContent,
    attachmentsSnapshot = [],
    historySource = messages,
    clearComposer = true,
    appendUserMessage = true,
    assistantMessageId = '',
  }) => {
    const initialModelGroup = activeModelGroup;
    let effectivePricingLabel = getPricingLabel(initialModelGroup);
    let hasVisibleOutput = false;
    let fallbackWarningShown = false;
    const nextConversationId = currentConversationId || createConversationId();
    if (!currentConversationId) {
      setCurrentConversationId(nextConversationId);
    }

    const userMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      title: '你',
      content: displayContent,
      apiContent: userRequestContent,
      displayContent,
      attachments: attachmentsSnapshot.map(({ content, dataUrl, ...file }) => file),
    };
    const pendingId = assistantMessageId || `assistant-${Date.now()}`;
    const history = buildHistory(historySource);

    setMessages((prev) => {
      if (!appendUserMessage && assistantMessageId) {
        return prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                title: activeModel,
                content: '正在思考...',
                pending: true,
                pricingLabel: effectivePricingLabel,
              }
            : message,
        );
      }

      return [
        ...prev,
        userMessageItem,
        {
          id: pendingId,
          role: 'assistant',
          title: activeModel,
          content: '正在思考...',
          pending: true,
          pricingLabel: effectivePricingLabel,
        },
      ];
    });

    if (clearComposer) {
      setInput('');
      setAttachments([]);
    }

    setIsSubmitting(true);

    const updateAssistantMessage = (content, pending = true) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                title: activeModel,
                content,
                pending,
                pricingLabel: effectivePricingLabel,
              }
            : message,
        ),
      );
    };

    const markOriginalPriceFallback = () => {
      effectivePricingLabel = DEFAULT_PRICING_LABEL;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                pricingLabel: effectivePricingLabel,
              }
            : message,
        ),
      );
      if (!fallbackWarningShown) {
        fallbackWarningShown = true;
        Toast.warning(
          '特价通道暂不可用，已切换至原价 1x；成功回复按原价计费。',
        );
      }
    };

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 180000);

    try {
      const userId = getCurrentUserId(user);
      const headers = {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      };
      if (userId) headers['New-Api-User'] = userId;

      const requestChatResponse = (group, fallbackRequest = false) =>
        fetch('/pg/chat/completions', {
          method: 'POST',
          headers: {
            ...headers,
            ...(fallbackRequest
              ? { [DISCOUNT_FALLBACK_REQUEST_HEADER]: '1' }
              : {}),
          },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify({
            model: activeModel,
            ...(activeReasoningEffort
              ? { reasoning_effort: activeReasoningEffort }
              : {}),
            ...(group ? { group } : {}),
            ...(initialModelGroup === DISCOUNT_GROUP
              ? {
                  max_completion_tokens:
                    DISCOUNT_FALLBACK_MAX_COMPLETION_TOKENS,
                }
              : {}),
            stream: true,
            messages: [
              ...history,
              {
                role: 'user',
                content: userRequestContent,
              },
            ],
          }),
        });

      let response = await requestChatResponse(initialModelGroup);
      let responseError = response.ok
        ? null
        : await readResponseError(response);
      const initialResponseMetadata = getResponsePricingMetadata(response);
      const backendUsedFallback =
        initialModelGroup === DISCOUNT_GROUP &&
        (initialResponseMetadata.fallbackAttempted ||
          initialResponseMetadata.pricingGroup === DEFAULT_GROUP);

      if (backendUsedFallback) {
        markOriginalPriceFallback();
      }

      if (
        responseError &&
        initialModelGroup === DISCOUNT_GROUP &&
        shouldFallbackDiscountRequest(responseError, {
          signal: controller.signal,
          hasVisibleOutput,
        })
      ) {
        response = await requestChatResponse(DEFAULT_GROUP, true);
        const frontendFallbackMetadata = getResponsePricingMetadata(response);
        if (
          response.ok ||
          frontendFallbackMetadata.fallbackAttempted ||
          frontendFallbackMetadata.pricingGroup === DEFAULT_GROUP
        ) {
          markOriginalPriceFallback();
        }
        responseError = response.ok ? null : await readResponseError(response);
      }

      if (responseError) throw responseError;

      const answer = await readStreamingResponse(response, (nextText) => {
        hasVisibleOutput ||= Boolean(nextText?.trim());
        updateAssistantMessage(nextText || '正在回复...', true);
      });
      if (!answer.trim()) throw new Error('模型没有返回可展示的内容。');
      updateAssistantMessage(answer.trim(), false);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  title: activeModel,
                  content: hasVisibleOutput
                    ? (message.content || '').trim() || '已停止生成。'
                    : '已停止生成。',
                  pending: false,
                }
              : message,
          ),
        );
        return;
      }

      const message = getChatFailureMessage(error);
      Toast.error(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                role: 'assistant',
                title: activeModel,
                content: `这次没有完成：${message}`,
                pending: false,
                pricingLabel: effectivePricingLabel,
              }
            : item,
        ),
      );
    } finally {
      window.clearTimeout(timeout);
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  const retryLatestAnswer = () => {
    if (isSubmitting || lastAssistantIndex < 0) return;

    let userIndex = -1;
    for (let index = lastAssistantIndex - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user' && !messages[index]?.pending) {
        userIndex = index;
        break;
      }
    }

    if (userIndex < 0) {
      Toast.warning('找不到可重试的提问。');
      return;
    }

    const sourceMessage = messages[userIndex];
    streamConversation({
      displayContent: sourceMessage.displayContent || contentToPlainText(sourceMessage.content),
      userRequestContent: sourceMessage.apiContent || sourceMessage.content,
      attachmentsSnapshot: sourceMessage.attachments || [],
      historySource: messages.slice(0, userIndex),
      clearComposer: false,
      appendUserMessage: false,
      assistantMessageId: messages[lastAssistantIndex]?.id || '',
    }).catch(() => {});
  };

  const editMessage = (message) => {
    setInput(message.displayContent || contentToPlainText(message.content));
    setAttachments([]);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const organizeMessage = async () => {
    if (isSubmitting) return;

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
      Toast.warning('先输入问题，或上传一个文件。');
      return;
    }

    const readableAttachments = attachments.filter((file) => file.readable);
    const unsupportedOnly = attachments.length > 0 && readableAttachments.length === 0 && !input.trim();
    if (unsupportedOnly) {
      Toast.warning('这个格式当前会话暂不读取，请补充文字说明或换成图片、PDF、文本文件。');
      return;
    }

    const displayContent = input.trim() || '请根据附件内容继续。';
    const userRequestContent = buildUserRequestContent(input, readableAttachments);
    await streamConversation({
      displayContent,
      userRequestContent,
      attachmentsSnapshot: attachments,
      historySource: messages,
      clearComposer: true,
    });
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
      className={`${isDark ? 'sx-gpt-shell is-dark' : 'sx-gpt-shell is-light'}${
        isSidebarCollapsed ? ' is-sidebar-collapsed' : ''
      }`}
      aria-label='AIPHUI 聊天工作站'
    >
      <aside className='sx-gpt-sidebar' aria-label='侧边栏'>
        <div className='sx-gpt-brand'>
          <strong>AIPHUI Workspace</strong>
          <button
            type='button'
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={() => setIsSidebarCollapsed((value) => !value)}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className='sx-gpt-nav' aria-label='主导航'>
          {primaryNav.map((item) => {
            const Icon = item.icon || Store;
            const content = (
              <>
                <span className='sx-gpt-nav-icon'>
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <span className='sx-gpt-nav-label'>{item.label}</span>
              </>
            );

            if (item.href) {
              return (
                <a
                  className={item.active ? 'is-active' : ''}
                  href={item.href}
                  key={item.label}
                  title={item.label}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                type='button'
                className={item.active ? 'is-active' : ''}
                key={item.label}
                onClick={() => handleNavAction(item.action)}
                title={item.label}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <section className='sx-gpt-history' aria-label='最近聊天记录'>
          <div className='sx-gpt-history-head'>
            <strong>最近聊天</strong>
            <span>保留 7 天</span>
          </div>
          {savedConversations.length ? (
            <div className='sx-gpt-history-list'>
              {savedConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={
                    conversation.id === currentConversationId
                      ? 'sx-gpt-history-item is-active'
                      : 'sx-gpt-history-item'
                  }
                >
                  <button
                    type='button'
                    className='sx-gpt-history-open'
                    onClick={() => openConversation(conversation)}
                    title={conversation.title}
                  >
                    <span>{conversation.title}</span>
                    <em>
                      {formatConversationAge(conversation.updatedAt)} · {conversation.messageCount || conversation.messages.length} 条
                    </em>
                  </button>
                  <button
                    type='button'
                    className='sx-gpt-history-delete'
                    onClick={(event) => deleteConversation(conversation.id, event)}
                    aria-label={`删除聊天记录：${conversation.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className='sx-gpt-history-empty'>发送第一条消息后，会在这里保留 7 天。</p>
          )}
        </section>

        <div className='sx-gpt-account'>
          <div className='sx-gpt-account-avatar'>
            {isLoggedIn ? displayName.slice(0, 1).toUpperCase() : 'A'}
          </div>
          <div>
            <strong>{isLoggedIn ? displayName : '未登录'}</strong>
            {!isLoggedIn && <Link to='/login'>登录后使用</Link>}
          </div>
        </div>
      </aside>

      <main className={messages.length ? 'sx-gpt-main has-thread' : 'sx-gpt-main is-empty'}>
        <div className='sx-gpt-topbar'>
          <div className='sx-gpt-topbar-left'>
            <Tooltip content='新聊天'>
              <button
                type='button'
                className='sx-gpt-topbar-button'
                aria-label='新聊天'
                onClick={resetConversation}
              >
                <Plus size={16} />
              </button>
            </Tooltip>
            <Tooltip content='上传文件'>
              <button
                type='button'
                className='sx-gpt-topbar-button'
                aria-label='上传文件'
                onClick={openFilePicker}
              >
                <Paperclip size={16} />
              </button>
            </Tooltip>
            <Tooltip content='在线客服'>
              <button
                type='button'
                className='sx-gpt-topbar-button'
                aria-label='在线客服'
                onClick={openApiTeacher}
              >
                <Headphones size={16} />
              </button>
            </Tooltip>
          </div>
          <div className='sx-gpt-topbar-status'>
            {isSubmitting ? (
              <>
                <Spin size='small' />
                <span>正在回复</span>
              </>
            ) : modelsLoading ? (
              <>
                <Spin size='small' />
                <span>读取模型中</span>
              </>
            ) : (
              <span>{modelError || activeModel}</span>
            )}
            <em>{hasConversation ? `${messages.length} 条消息` : '新聊天'}</em>
          </div>
          <div className='sx-gpt-topbar-right'>
            {isSubmitting ? (
              <Tooltip content='停止生成'>
                <button
                  type='button'
                  className='sx-gpt-topbar-button'
                  aria-label='停止生成'
                  onClick={abortActiveRequest}
                >
                  <Square size={15} />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content={isDark ? '白天模式' : '暗黑模式'}>
              <button
                type='button'
                className='sx-gpt-theme'
                onClick={() => setIsDark((value) => !value)}
                aria-label='切换明暗模式'
              >
                {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className='sx-gpt-stage' ref={threadRef}>
          {messages.length ? (
            <div className='sx-gpt-thread'>
              {messages.map((message, index) => (
                <article
                  className={`sx-gpt-message sx-gpt-message-${message.role}`}
                  key={message.id || `${message.role}-${index}`}
                >
                  <div className='sx-gpt-message-name'>
                    {message.title}
                    {message.pricingLabel ? ` · ${message.pricingLabel}` : ''}
                  </div>
                  <div className={message.pending ? 'sx-gpt-bubble is-pending' : 'sx-gpt-bubble'}>
                    {message.role === 'assistant' ? (
                      <MarkdownContent content={message.content} />
                    ) : (
                      <InlineMarkdown text={message.displayContent || message.content} />
                    )}
                  </div>
                  {message.attachments?.length ? (
                    <AttachmentChips files={message.attachments} />
                  ) : null}
                  {message.role === 'user' ? (
                    <div className='sx-gpt-message-actions' aria-label='消息操作'>
                      <button type='button' onClick={() => copyMessage(message)}>
                        <Copy size={13} />
                        <span>复制</span>
                      </button>
                      <button type='button' onClick={() => editMessage(message)}>
                        <Edit3 size={13} />
                        <span>再次编辑</span>
                      </button>
                    </div>
                  ) : (
                    <div className='sx-gpt-message-actions' aria-label='消息操作'>
                      <button type='button' onClick={() => copyMessage(message)}>
                        <Copy size={13} />
                        <span>复制</span>
                      </button>
                      {index === lastAssistantIndex ? (
                        <button type='button' onClick={retryLatestAnswer} disabled={isSubmitting}>
                          <RotateCcw size={13} />
                          <span>重新生成</span>
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className='sx-gpt-landing'>
              <div className='sx-gpt-landing-copy'>
                <p className='sx-gpt-landing-kicker'>AIPHUI 工作站</p>
                <h1>新聊天</h1>
                <p>文本对话、文件读取、模型切换、复制和再次编辑，都放在这里。</p>
              </div>
            </div>
          )}
        </div>

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
          <AttachmentChips files={attachments} onRemove={removeAttachment} />

          <div className='sx-gpt-composer'>
            <input
              ref={fileInputRef}
              className='sx-gpt-file-input'
              type='file'
              multiple
              accept={WORKBENCH_FILE_ACCEPT}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Tooltip content='上传文件'>
              <button
                type='button'
                className='sx-gpt-upload'
                onClick={openFilePicker}
                aria-label='上传文件'
              >
                <Upload size={16} />
              </button>
            </Tooltip>

            <textarea
              ref={composerInputRef}
              value={input}
              rows={1}
              placeholder='有问题，尽管问'
              disabled={isSubmitting}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  organizeMessage();
                }
              }}
            />

            <div
              className={
                reasoningEffortOptions.length
                  ? 'sx-gpt-model-controls has-reasoning'
                  : 'sx-gpt-model-controls'
              }
            >
              <Select
                className='sx-gpt-model-select'
                value={selectedModel}
                loading={modelsLoading}
                disabled={!isLoggedIn || modelsLoading || isSubmitting}
                optionList={modelOptions}
                placeholder={modelsLoading ? '模型' : '选择模型'}
                onChange={(value) => setSelectedModel(value)}
                style={{ width: isMobile ? 116 : 178 }}
              />
              {reasoningEffortOptions.length ? (
                <Select
                  className='sx-gpt-reasoning-select'
                  value={activeReasoningEffort}
                  disabled={!isLoggedIn || modelsLoading || isSubmitting}
                  optionList={reasoningEffortOptions}
                  aria-label='思考强度'
                  onChange={(value) => setReasoningEffort(value)}
                  style={{ width: isMobile ? 116 : 126 }}
                />
              ) : null}
            </div>

            <Button
              className={isSubmitting ? 'sx-gpt-send is-stop' : 'sx-gpt-send'}
              theme='solid'
              type='primary'
              icon={isSubmitting ? <Square size={18} strokeWidth={2.7} /> : <ArrowUp size={18} strokeWidth={2.7} />}
              onClick={isSubmitting ? abortActiveRequest : organizeMessage}
              loading={false}
              disabled={!isSubmitting && isLoggedIn && !canOrganize}
              aria-label={isSubmitting ? '停止生成' : isLoggedIn ? '发送消息' : '登录后使用'}
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
          {activeModelGroup === DISCOUNT_GROUP ? (
            <div className='sx-gpt-message-name' role='note'>
              OpenAI 特价模型优先按 0.05x；特价通道不可用且尚未输出时自动切换原价
              1x，回复会标明实际倍率。
            </div>
          ) : null}
          {activeReasoningEffort ? (
            <div className='sx-gpt-reasoning-note' role='note'>
              思考强度：{reasoningEffortOptions.find((option) => option.value === activeReasoningEffort)?.label}；推理
              Token 按所选模型的输出价与当前分组倍率结算，强度越高可能消耗更多。
            </div>
          ) : null}
        </div>
      </main>
    </section>
  );
};

export default TextWorkbench;
