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

import React from 'react';
import { Progress, Tag, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  Music,
  FileText,
  HelpCircle,
  CheckCircle,
  Pause,
  Clock,
  Play,
  XCircle,
  Loader,
  List,
  Hash,
  Video,
  Sparkles,
} from 'lucide-react';
import {
  TASK_ACTION_FIRST_TAIL_GENERATE,
  TASK_ACTION_GENERATE,
  TASK_ACTION_REFERENCE_GENERATE,
  TASK_ACTION_TEXT_GENERATE,
  TASK_ACTION_REMIX_GENERATE,
} from '../../../constants/common.constant';
import { CHANNEL_OPTIONS } from '../../../constants/channel.constants';
import { stringToColor } from '../../../helpers/render';
import { Avatar, Space } from '@douyinfe/semi-ui';

const colors = [
  'amber',
  'blue',
  'cyan',
  'green',
  'grey',
  'indigo',
  'light-blue',
  'lime',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'violet',
  'yellow',
];

// Render functions
const renderTimestamp = (timestampInSeconds) => {
  const date = new Date(timestampInSeconds * 1000); // 从秒转换为毫秒

  const year = date.getFullYear(); // 获取年份
  const month = ('0' + (date.getMonth() + 1)).slice(-2); // 获取月份，从0开始需要+1，并保证两位数
  const day = ('0' + date.getDate()).slice(-2); // 获取日期，并保证两位数
  const hours = ('0' + date.getHours()).slice(-2); // 获取小时，并保证两位数
  const minutes = ('0' + date.getMinutes()).slice(-2); // 获取分钟，并保证两位数
  const seconds = ('0' + date.getSeconds()).slice(-2); // 获取秒钟，并保证两位数

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`; // 格式化输出
};

function renderDuration(submit_time, finishTime) {
  if (!submit_time || !finishTime) return 'N/A';
  const durationSec = finishTime - submit_time;
  const color = durationSec > 60 ? 'red' : 'green';

  // 返回带有样式的颜色标签
  return (
    <Tag color={color} shape='circle'>
      {durationSec} s
    </Tag>
  );
}

const renderType = (type, t) => {
  switch (type) {
    case 'MUSIC':
      return (
        <Tag color='grey' shape='circle' prefixIcon={<Music size={14} />}>
          {t('生成音乐')}
        </Tag>
      );
    case 'LYRICS':
      return (
        <Tag color='pink' shape='circle' prefixIcon={<FileText size={14} />}>
          {t('生成歌词')}
        </Tag>
      );
    case TASK_ACTION_GENERATE:
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('图生视频')}
        </Tag>
      );
    case TASK_ACTION_TEXT_GENERATE:
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('文生视频')}
        </Tag>
      );
    case TASK_ACTION_FIRST_TAIL_GENERATE:
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('首尾生视频')}
        </Tag>
      );
    case TASK_ACTION_REFERENCE_GENERATE:
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('参照生视频')}
        </Tag>
      );
    case TASK_ACTION_REMIX_GENERATE:
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('视频Remix')}
        </Tag>
      );
    case 'imageGenerate':
      return (
        <Tag color='violet' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('图像生成')}
        </Tag>
      );
    case 'imageEdit':
      return (
        <Tag color='indigo' shape='circle' prefixIcon={<Sparkles size={14} />}>
          {t('图像编辑')}
        </Tag>
      );
    default:
      return (
        <Tag color='white' shape='circle' prefixIcon={<HelpCircle size={14} />}>
          {t('未知')}
        </Tag>
      );
  }
};

const renderPlatform = (platform, t) => {
  let option = CHANNEL_OPTIONS.find(
    (opt) => String(opt.value) === String(platform),
  );
  if (option) {
    return (
      <Tag color={option.color} shape='circle'>
        {option.label}
      </Tag>
    );
  }
  switch (platform) {
    case 'suno':
      return (
        <Tag color='green' shape='circle'>
          Suno
        </Tag>
      );
    case 'playground_image':
      return (
        <Tag color='violet' shape='circle'>
          {t('媒体工坊')}
        </Tag>
      );
    default:
      return (
        <Tag color='white' shape='circle'>
          {t('未知')}
        </Tag>
      );
  }
};

const renderStatus = (type, t) => {
  switch (type) {
    case 'SUCCESS':
      return (
        <Tag
          color='green'
          shape='circle'
          prefixIcon={<CheckCircle size={14} />}
        >
          {t('成功')}
        </Tag>
      );
    case 'NOT_START':
      return (
        <Tag color='grey' shape='circle' prefixIcon={<Pause size={14} />}>
          {t('未启动')}
        </Tag>
      );
    case 'SUBMITTED':
      return (
        <Tag color='yellow' shape='circle' prefixIcon={<Clock size={14} />}>
          {t('队列中')}
        </Tag>
      );
    case 'IN_PROGRESS':
      return (
        <Tag color='blue' shape='circle' prefixIcon={<Play size={14} />}>
          {t('执行中')}
        </Tag>
      );
    case 'FAILURE':
      return (
        <Tag color='red' shape='circle' prefixIcon={<XCircle size={14} />}>
          {t('失败')}
        </Tag>
      );
    case 'QUEUED':
      return (
        <Tag color='orange' shape='circle' prefixIcon={<List size={14} />}>
          {t('排队中')}
        </Tag>
      );
    case 'UNKNOWN':
      return (
        <Tag color='white' shape='circle' prefixIcon={<HelpCircle size={14} />}>
          {t('未知')}
        </Tag>
      );
    case '':
      return (
        <Tag color='grey' shape='circle' prefixIcon={<Loader size={14} />}>
          {t('正在提交')}
        </Tag>
      );
    default:
      return (
        <Tag color='white' shape='circle' prefixIcon={<HelpCircle size={14} />}>
          {t('未知')}
        </Tag>
      );
  }
};

const previewableRelativeUrlPattern = /^\/(?:pg\/media\/files\/|v1\/videos\/|pg\/videos\/)/i;
const protectedMediaRelativeUrlPattern = /^\/pg\/media\/files\//i;
const absoluteHttpUrlPattern = /^https?:\/\//i;
const videoUrlPattern = /\.(mp4|webm|mov|m4v)(\?|#|$)|\/videos\/[^/]+\/content(?:\?|#|$)|\/pg\/media\/files\/.*\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const imageUrlPattern = /\.(png|jpe?g|webp|gif)(\?|#|$)|\/pg\/media\/files\/.*\.(png|jpe?g|webp|gif)(\?|#|$)/i;

function getNestedValue(source, path) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function collectRecordMediaUrl(record) {
  const candidates = [
    record?.cached_url,
    record?.result_url,
    record?.video_url,
    record?.image_url,
    record?.fail_reason,
    getNestedValue(record, ['data', 'cached_url']),
    getNestedValue(record, ['data', 'result_url']),
    getNestedValue(record, ['data', 'video_url']),
    getNestedValue(record, ['data', 'image_url']),
    getNestedValue(record, ['data', 'item', 'url']),
    getNestedValue(record, ['data', 'item', 'cachedUrl']),
    getNestedValue(record, ['item', 'url']),
    getNestedValue(record, ['item', 'cachedUrl']),
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const safeUrl = normalizePreviewMediaUrl(value);
    if (safeUrl) {
      return safeUrl;
    }
  }
  return '';
}

function normalizePreviewMediaUrl(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  try {
    if (previewableRelativeUrlPattern.test(trimmed)) {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return new URL(trimmed, window.location.origin).href;
      }
      return trimmed;
    }

    if (!absoluteHttpUrlPattern.test(trimmed)) {
      return '';
    }

    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function isSameOriginProtectedMediaUrl(value) {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return false;
  }
  try {
    const parsed = new URL(value, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      protectedMediaRelativeUrlPattern.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function isVideoRecord(record, url) {
  const action = record?.action;
  return (
    record?.media_kind === 'video' ||
    record?.playground_video_task === true ||
    String(record?.playground_video_task) === 'true' ||
    action === TASK_ACTION_GENERATE ||
    action === TASK_ACTION_TEXT_GENERATE ||
    action === TASK_ACTION_FIRST_TAIL_GENERATE ||
    action === TASK_ACTION_REFERENCE_GENERATE ||
    action === TASK_ACTION_REMIX_GENERATE ||
    videoUrlPattern.test(url)
  );
}

function isImageRecord(record, url) {
  return (
    record?.media_kind === 'image' ||
    record?.playground_image_task === true ||
    String(record?.playground_image_task) === 'true' ||
    record?.action === 'imageGenerate' ||
    record?.action === 'imageEdit' ||
    imageUrlPattern.test(url)
  );
}

function writePreviewWindowMessage(previewWindow, message) {
  if (!previewWindow) return;
  try {
    previewWindow.document.title = message;
    previewWindow.document.body.style.margin = '24px';
    previewWindow.document.body.style.fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    previewWindow.document.body.textContent = message;
  } catch {
    // Ignore cross-window write failures; the click handler still fails closed.
  }
}

async function openMediaUrl(url) {
  const safeUrl = normalizePreviewMediaUrl(url);
  if (!safeUrl || typeof window === 'undefined') {
    return false;
  }
  if (isSameOriginProtectedMediaUrl(safeUrl)) {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      writePreviewWindowMessage(previewWindow, '正在加载预览...');
    }
    try {
      const response = await fetch(safeUrl, {
        credentials: 'include',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('application/json')) {
        throw new Error(`preview request failed: ${response.status}`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      if (previewWindow) {
        previewWindow.location.replace(objectUrl);
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
      return true;
    } catch {
      writePreviewWindowMessage(
        previewWindow,
        '预览失败，请回到控制台刷新登录状态后重试。',
      );
      return false;
    }
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
  return true;
}

export const getTaskLogsColumns = ({
  t,
  COLUMN_KEYS,
  copyText,
  openContentModal,
  isAdminUser,
  openVideoModal,
  openAudioModal,
}) => {
  return [
    {
      key: COLUMN_KEYS.SUBMIT_TIME,
      title: t('提交时间'),
      dataIndex: 'submit_time',
      render: (text, record, index) => {
        return <div>{text ? renderTimestamp(text) : '-'}</div>;
      },
    },
    {
      key: COLUMN_KEYS.FINISH_TIME,
      title: t('结束时间'),
      dataIndex: 'finish_time',
      render: (text, record, index) => {
        return <div>{text ? renderTimestamp(text) : '-'}</div>;
      },
    },
    {
      key: COLUMN_KEYS.DURATION,
      title: t('花费时间'),
      dataIndex: 'finish_time',
      render: (finish, record) => {
        return <>{finish ? renderDuration(record.submit_time, finish) : '-'}</>;
      },
    },
    {
      key: COLUMN_KEYS.CHANNEL,
      title: t('渠道'),
      dataIndex: 'channel_id',
      render: (text, record, index) => {
        return isAdminUser ? (
          <div>
            <Tag
              color={colors[parseInt(text) % colors.length]}
              size='large'
              shape='circle'
              onClick={() => {
                copyText(text);
              }}
            >
              {text}
            </Tag>
          </div>
        ) : (
          <></>
        );
      },
    },
    {
      key: COLUMN_KEYS.USERNAME,
      title: t('用户'),
      dataIndex: 'username',
      render: (userId, record, index) => {
        if (!isAdminUser) {
          return <></>;
        }
        const displayText = String(record.username || userId || '?');
        return (
          <Space>
            <Avatar
              size='extra-small'
              color={stringToColor(displayText)}
            >
              {displayText.slice(0, 1)}
            </Avatar>
            <Typography.Text>
              {displayText}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      key: COLUMN_KEYS.PLATFORM,
      title: t('平台'),
      dataIndex: 'platform',
      render: (text, record, index) => {
        return <div>{renderPlatform(text, t)}</div>;
      },
    },
    {
      key: COLUMN_KEYS.TYPE,
      title: t('类型'),
      dataIndex: 'action',
      render: (text, record, index) => {
        return <div>{renderType(text, t)}</div>;
      },
    },
    {
      key: COLUMN_KEYS.TASK_ID,
      title: t('任务ID'),
      dataIndex: 'task_id',
      render: (text, record, index) => {
        return (
          <Typography.Text
            ellipsis={{ showTooltip: true }}
            onClick={() => {
              openContentModal(JSON.stringify(record, null, 2));
            }}
          >
            <div>{text}</div>
          </Typography.Text>
        );
      },
    },
    {
      key: COLUMN_KEYS.TASK_STATUS,
      title: t('任务状态'),
      dataIndex: 'status',
      render: (text, record, index) => {
        return <div>{renderStatus(text, t)}</div>;
      },
    },
    {
      key: COLUMN_KEYS.PROGRESS,
      title: t('进度'),
      dataIndex: 'progress',
      render: (text, record, index) => {
        return (
          <div>
            {isNaN(text?.replace('%', '')) ? (
              text || '-'
            ) : (
              <Progress
                stroke={
                  record.status === 'FAILURE'
                    ? 'var(--semi-color-warning)'
                    : null
                }
                percent={text ? parseInt(text.replace('%', '')) : 0}
                showInfo={true}
                aria-label='task progress'
                style={{ minWidth: '160px' }}
              />
            )}
          </div>
        );
      },
    },
    {
      key: COLUMN_KEYS.FAIL_REASON,
      title: t('详情'),
      dataIndex: 'fail_reason',
      fixed: 'right',
      render: (text, record, index) => {
        // Suno audio preview
        const isSunoSuccess =
          record.platform === 'suno' &&
          record.status === 'SUCCESS' &&
          Array.isArray(record.data) &&
          record.data.some((c) => c.audio_url);
        if (isSunoSuccess) {
          return (
            <a
              href='#'
              onClick={(e) => {
                e.preventDefault();
                openAudioModal(record.data);
              }}
            >
              {t('点击预览音乐')}
            </a>
          );
        }

        const isSuccess = record.status === 'SUCCESS';
        const resultUrl = collectRecordMediaUrl(record);
        if (isSuccess && resultUrl && isVideoRecord(record, resultUrl)) {
          return (
            <a
              href='#'
              onClick={(e) => {
                e.preventDefault();
                openVideoModal(resultUrl);
              }}
            >
              {t('点击预览视频')}
            </a>
          );
        }
        if (isSuccess && resultUrl && isImageRecord(record, resultUrl)) {
          return (
            <a
              href={resultUrl}
              target='_blank'
              rel='noopener noreferrer'
              onClick={(e) => {
                e.preventDefault();
                openMediaUrl(resultUrl);
              }}
            >
              {t('点击预览图像')}
            </a>
          );
        }
        if (isSuccess && resultUrl) {
          return (
            <a
              href={resultUrl}
              target='_blank'
              rel='noopener noreferrer'
              onClick={(e) => {
                e.preventDefault();
                openMediaUrl(resultUrl);
              }}
            >
              {t('点击打开结果')}
            </a>
          );
        }
        if (!text) {
          return t('无');
        }
        return (
          <Typography.Text
            ellipsis={{ showTooltip: true }}
            style={{ width: 100 }}
            onClick={() => {
              openContentModal(text);
            }}
          >
            {text}
          </Typography.Text>
        );
      },
    },
  ];
};
