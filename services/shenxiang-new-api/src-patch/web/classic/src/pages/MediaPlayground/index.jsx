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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Input,
  TextArea,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Toast,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconCopy,
  IconDelete,
  IconDownload,
  IconExternalOpen,
  IconEyeOpened,
  IconImage,
  IconPlay,
  IconRefresh,
  IconUpload,
} from '@douyinfe/semi-icons';
import { API, copy } from '../../helpers';
import './MediaPlayground.css';

const { Text, Title, Paragraph } = Typography;

const GOOGLE_NANO_BANANA_2_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
];

const IMAGE_MODELS = [
  {
    value: 'gpt-image-2-4K',
    label: 'GPT Image 2',
    badge: '4K',
    vendor: '星人图像',
    sizes: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    resolutions: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    defaultSize: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'high',
    maxCount: 4,
    countParam: 'n',
    sizeParam: 'size',
    backgroundOptions: ['auto', 'opaque'],
    edit: true,
    hint: '适合高质量海报、产品图和需要透明背景的素材。',
  },
  {
    value: 'banana-2',
    label: 'Banana 2',
    badge: '4K',
    vendor: '星人图像',
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K', '2K'],
    qualities: ['auto'],
    formats: ['url'],
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '2K',
    defaultQuality: 'auto',
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    edit: true,
    hint: '适合快速高分辨率创意图、场景草图和视觉方案探索。',
  },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    badge: '4K',
    vendor: '星人图像',
    sizes: [
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    aspectRatios: [
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    resolutions: ['512', '1K', '2K', '4K'],
    qualities: ['auto'],
    formats: ['url'],
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '4K',
    defaultQuality: 'auto',
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    edit: true,
    hint: '适合高阶视觉方案、复杂场景草图和高分辨率创意图。',
  },
  {
    value: 'ecommerce-banana-2',
    label: '电商特价banana-2',
    badge: '1K',
    vendor: 'Gemini',
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K'],
    qualities: ['auto'],
    formats: ['url'],
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'auto',
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    edit: true,
    hint: '电商特价 Banana 2，仅支持 1K 输出，可编辑图像，按 0.085/张计费。',
  },
  {
    value: 'grok-imagine-image',
    label: 'Grok Image Pro',
    badge: 'Pro',
    vendor: '星人图像',
    sizes: ['960x960', '720x1280', '1280x720', '1168x784', '784x1168'],
    aspectRatios: [
      'auto',
      '1:1',
      '3:4',
      '4:3',
      '9:16',
      '16:9',
      '2:3',
      '3:2',
      '9:19.5',
      '19.5:9',
      '9:20',
      '20:9',
      '1:2',
      '2:1',
    ],
    resolutions: ['1k', '2k'],
    qualities: ['low', 'medium', 'high'],
    formats: ['url', 'b64_json'],
    defaultSize: '960x960',
    defaultAspectRatio: '1:1',
    defaultResolution: '2k',
    defaultQuality: 'high',
    maxCount: 10,
    countParam: 'n',
    sizeParam: 'aspect_ratio',
    edit: true,
    hint: '适合真实感、社媒封面和快速创意探索。支持尺寸、宽高比、质量和 1k/2k 分辨率。',
  },
];

const SIZE_TO_ASPECT_RATIO = {
  '960x960': '1:1',
  '720x1280': '9:16',
  '1280x720': '16:9',
  '1168x784': '3:2',
  '784x1168': '2:3',
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  '2048x2048': '1:1',
  '2048x1152': '16:9',
  '3840x2160': '16:9',
  '2160x3840': '9:16',
};

const GPT_IMAGE_2_SIZE_BY_RESOLUTION = {
  '1K': {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '16:9': '1536x864',
    '9:16': '864x1536',
  },
  '2K': {
    '1:1': '2048x2048',
    '2:3': '1152x1728',
    '3:2': '1728x1152',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '1:1': '2880x2880',
    '2:3': '2160x3240',
    '3:2': '3240x2160',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

const IMAGE_GENERATION_GROUP = {
  value: 'default',
  label: '图像生成分组',
};

const IMAGE_EDIT_REFERENCE_LIMIT = 10;
const VIDEO_REFERENCE_LIMIT = 5;
const MEDIA_RESULT_STORAGE_KEY = 'shenxiang-media-playground-results:v1';
const MEDIA_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

function isGrokImageModel(model) {
  return model === 'grok-imagine-image';
}

function isGeminiImageModel(model) {
  return (
    model === 'banana-2' ||
    model === 'gemini-3-pro-image-preview' ||
    model === 'ecommerce-banana-2'
  );
}

function isGptImage2Model(model) {
  return model === 'gpt-image-2-4K';
}

function clampCount(value, model) {
  const max = Math.max(1, model.maxCount || 1);
  return Math.min(Math.max(1, Number(value) || 1), max);
}

function imageAspectRatioFor(size, aspectRatio) {
  return aspectRatio && aspectRatio !== 'auto'
    ? aspectRatio
    : SIZE_TO_ASPECT_RATIO[size] || size;
}

function imageResponseFormat(aspectRatio, imageSize) {
  return {
    image: {
      aspectRatio,
      ...(imageSize && imageSize !== 'auto' ? { imageSize } : {}),
    },
  };
}

function gptImage2SizeFor(aspectRatio, imageSize) {
  const normalizedResolution = imageSize && imageSize !== 'auto' ? imageSize : '1K';
  return (
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.[aspectRatio] ||
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.['1:1'] ||
    '1024x1024'
  );
}

const VIDEO_MODELS = [
  {
    value: 'grok-video-super-720p',
    label: 'Grok Video',
    badge: '720P',
    vendor: '星人视频',
    sizes: ['1280x720', '720x1280'],
    durations: [5, 10, 15],
    defaultSize: '1280x720',
    defaultDuration: 5,
    defaultFps: 24,
    hint: '适合短视频镜头、氛围片段和动态展示。',
  },
  {
    value: 'seedance-2.0',
    label: 'Seedance 2.0',
    badge: '2.0',
    vendor: '星人视频',
    sizes: ['1280x720', '720x1280', '1024x1024'],
    durations: [5, 10, 15],
    defaultSize: '1280x720',
    defaultDuration: 15,
    defaultFps: 24,
    hint: '适合图生视频、人物动作和首尾帧控制。',
  },
];

const PROMPT_PRESETS = [
  {
    label: '商业海报',
    value:
      '一张高级商业海报，主体清晰，构图克制，真实摄影质感，柔和棚拍光，适合品牌宣传。',
  },
  {
    label: '产品大片',
    value:
      '一个高端产品陈列在干净的工作室中，细腻材质，浅景深，真实光影，电商主图质感。',
  },
  {
    label: '人物肖像',
    value:
      '一位自信的年轻创业者半身肖像，城市夜景背景，电影级布光，真实皮肤纹理，高级杂志封面风格。',
  },
  {
    label: '短视频镜头',
    value:
      '一个流畅的商业短视频镜头，镜头缓慢推进，主体保持稳定，光影自然，画面高级。',
  },
];

const DEFAULT_PROMPT = PROMPT_PRESETS[0].value;
const EMPTY_MODELS = [];
const IMAGE_REQUEST_TIMEOUT_MS = 240000;
const IMAGE_WAIT_MESSAGE =
  '正在生成图像，高分辨率模型可能需要 1-3 分钟，请保持页面打开。';

function toSelectOptions(values) {
  return values.map((value) => ({ value, label: String(value) }));
}

function sizeOptionLabel(value, model) {
  if (model.sizeParam === 'size' || model.sizeParam === 'aspect_ratio') {
    return SIZE_TO_ASPECT_RATIO[value] || String(value);
  }
  return String(value);
}

function toSizeSelectOptions(values, model) {
  return values.map((value) => ({
    value,
    label: sizeOptionLabel(value, model),
  }));
}

function userFacingGenerationError(error) {
  const message = error?.message || '生成失败';
  const lower = String(message).toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (
    lower.includes('prompt_blocked') ||
    lower.includes('content_policy_violation') ||
    lower.includes('rejected by the safety system') ||
    lower.includes('safety_violations=')
  ) {
    return '提示词或参考图被安全策略拒绝，请调整内容后重试。';
  }
  if (
    code === 'econnaborted' ||
    lower.includes('timeout') ||
    lower.includes('network error')
  ) {
    return '本次生成等待时间过长，请稍后刷新媒体工坊查看结果；如果没有结果，再降低分辨率或重试。';
  }
  return message;
}

function isPersistentMediaURL(url) {
  if (!url) return false;
  return url.startsWith('/') || /^https?:\/\//i.test(url);
}

function restoreStoredResults() {
  try {
    const raw = window.localStorage.getItem(MEDIA_RESULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((item) => {
      const url = item?.cachedUrl || item?.url;
      return (
        item?.id &&
        ['image', 'video'].includes(item.kind) &&
        typeof item.createdAt === 'number' &&
        now - item.createdAt < MEDIA_RESULT_TTL_MS &&
        isPersistentMediaURL(url)
      );
    });
  } catch (error) {
    return [];
  }
}

function persistResults(results) {
  try {
    const now = Date.now();
    const storable = results
      .filter((item) => now - (item.createdAt || now) < MEDIA_RESULT_TTL_MS)
      .map((item) => {
        const durableUrl = item.cachedUrl || item.url;
        if (!isPersistentMediaURL(durableUrl)) return null;
        return {
          ...item,
          url: isPersistentMediaURL(item.url) ? item.url : durableUrl,
          displayUrl: isPersistentMediaURL(item.displayUrl)
            ? item.displayUrl
            : durableUrl,
          cachedUrl: item.cachedUrl,
        };
      })
      .filter(Boolean)
      .slice(0, 60);
    window.localStorage.setItem(MEDIA_RESULT_STORAGE_KEY, JSON.stringify(storable));
  } catch (error) {
    // Local persistence is a convenience; generation should not fail if it is unavailable.
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function dataURLToBlobURL(dataURL) {
  try {
    const [meta, base64] = dataURL.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (error) {
    return dataURL;
  }
}

function normalizeURL(url) {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  return url;
}

function isBrowserPreviewableURL(url) {
  if (!url) return false;
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    /^https?:\/\//i.test(url)
  );
}

function pickPreviewURL(result) {
  const urls = getPreviewURLs(result);
  return urls[0] || '';
}

function getPreviewURLs(result) {
  const urls = [
    result.cachedUrl,
    result.displayUrl,
    result.url,
  ]
    .map(normalizeURL)
    .filter(Boolean)
    .filter(isBrowserPreviewableURL);
  return Array.from(new Set(urls));
}

function extractImageResults(response) {
  const data = response?.data || [];
  return data
    .map((item, index) => {
      const url =
        item.url ||
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      if (!url) return null;
      return {
        id: `image-${Date.now()}-${index}`,
        kind: 'image',
        url,
        displayUrl: url.startsWith('data:') ? dataURLToBlobURL(url) : url,
        revisedPrompt: item.revised_prompt,
        status: 'ready',
        createdAt: Date.now(),
      };
    })
    .filter(Boolean);
}

function getVideoTaskId(response) {
  return (
    response?.id ||
    response?.task_id ||
    response?.taskId ||
    response?.data?.id ||
    response?.data?.task_id ||
    response?.data?.taskId ||
    ''
  );
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'succeeded', 'success'].includes(value)) return 'completed';
  if (['failed', 'failure', 'error'].includes(value)) return 'failed';
  if (['in_progress', 'processing', 'running'].includes(value))
    return 'processing';
  return value || 'queued';
}

function getVideoStatus(response) {
  return normalizeStatus(
    response?.status ||
      response?.task_status ||
      response?.taskStatus ||
      response?.data?.status ||
      response?.data?.task_status ||
      response?.data?.taskStatus ||
      response?.metadata?.status,
  );
}

function getVideoProgress(response) {
  return (
    response?.progress ||
    response?.data?.progress ||
    response?.metadata?.progress ||
    0
  );
}

function isUsableMediaURL(url) {
  return isBrowserPreviewableURL(String(url || '').trim());
}

function pickVideoURL(value, depth = 0) {
  if (!value || depth > 6) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isUsableMediaURL(trimmed) ? trimmed : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickVideoURL(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  const directKeys = [
    'url',
    'video',
    'video_url',
    'videoUrl',
    'output_url',
    'outputUrl',
    'result_url',
    'resultUrl',
    'download_url',
    'downloadUrl',
    'file_url',
    'fileUrl',
    'signed_url',
    'signedUrl',
    'uri',
    'link',
    'href',
    'fail_reason',
    'failReason',
  ];
  for (const key of directKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = pickVideoURL(value[key], depth + 1);
      if (found) return found;
    }
  }

  const containerKeys = [
    'metadata',
    'data',
    'result',
    'response',
    'output',
    'outputs',
    'content',
    'items',
    'videos',
    'files',
    'artifact',
    'artifacts',
  ];
  for (const key of containerKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = pickVideoURL(value[key], depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function extractVideoURL(response) {
  return pickVideoURL(response);
}

function createVideoResult(response, url, taskId = '') {
  const id = taskId || getVideoTaskId(response) || `direct-${Date.now()}`;
  return {
    id: `video-${id}`,
    kind: 'video',
    url,
    displayUrl: url,
    taskId,
    status: 'completed',
    createdAt: Date.now(),
  };
}

function downloadURL(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function StatPill({ label, value }) {
  return (
    <div className='mp-stat-pill'>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionTitle({ children, meta }) {
  return (
    <div className='mp-section-title'>
      <span>{children}</span>
      {meta ? <em>{meta}</em> : null}
    </div>
  );
}

function NativeSelect({ label, value, options, onChange, disabled = false }) {
  return (
    <label className='mp-field'>
      <span>{label}</span>
      <Select
        value={value}
        optionList={options}
        onChange={onChange}
        disabled={disabled}
        dropdownClassName='mp-select-dropdown'
        style={{ width: '100%' }}
      />
    </label>
  );
}

function FileDrop({ label, file, onFile, compact = false }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) onFile(nextFile);
  };

  return (
    <div className={compact ? 'mp-upload mp-upload-compact' : 'mp-upload'}>
      <label
        className={isDragging ? 'mp-upload-card is-dragging' : 'mp-upload-card'}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className='mp-upload-preview'>
            <img src={previewUrl} alt={`${label}预览`} />
          </div>
        ) : (
          <div className='mp-upload-placeholder'>
            <IconUpload size='extra-large' />
          </div>
        )}
        <span className='mp-upload-title'>{label}</span>
        <span className='mp-upload-hint'>
          {file ? file.name : '拖入图片，或点击上传 PNG / JPG / WebP'}
        </span>
        <input
          type='file'
          accept='image/png,image/jpeg,image/webp'
          className='mp-upload-input'
          onChange={(event) => onFile(event.target.files?.[0] || null)}
        />
      </label>
    </div>
  );
}

function MultiFileDrop({ label, files, maxFiles, onFiles, onRemove }) {
  const [isDragging, setIsDragging] = useState(false);
  const previewFile = files[0] || null;
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(previewFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [previewFile]);

  const handleFiles = (fileList) => {
    onFiles(fileList);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div className='mp-upload'>
      <label
        className={isDragging ? 'mp-upload-card is-dragging' : 'mp-upload-card'}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className='mp-upload-preview'>
            <img src={previewUrl} alt={`${label}预览`} />
          </div>
        ) : (
          <div className='mp-upload-placeholder'>
            <IconUpload size='extra-large' />
          </div>
        )}
        <span className='mp-upload-title'>{label}</span>
        <span className='mp-upload-hint'>
          已选 {files.length} / {maxFiles} 张，拖入或点击上传 PNG / JPG / WebP
        </span>
        <input
          type='file'
          multiple
          accept='image/png,image/jpeg,image/webp'
          className='mp-upload-input'
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      {files.length > 0 ? (
        <div className='mp-upload-file-list'>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className='mp-upload-file-item'
            >
              <span>
                {index + 1}. {file.name}
              </span>
              <Button
                size='small'
                theme='borderless'
                onClick={() => onRemove(index)}
              >
                移除
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({ result, onRemove }) {
  const previewUrls = getPreviewURLs(result);
  const [activeUrlIndex, setActiveUrlIndex] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const displayUrl = previewUrls[activeUrlIndex] || '';
  const originalUrl = normalizeURL(result.url);
  const cacheFailed = result.cacheStatus === 'failed';
  const previewUnavailable = previewFailed || !displayUrl;
  const usedFallbackPreview = activeUrlIndex > 0;
  const statusText = cacheFailed
    ? '临时缓存不可用，作品已生成，请用原始链接保存。'
    : '浏览器暂时无法直接预览，请打开原始链接保存。';

  useEffect(() => {
    setActiveUrlIndex(0);
    setPreviewFailed(false);
  }, [result.id, result.cachedUrl, result.displayUrl, result.url]);

  const handlePreviewError = () => {
    if (activeUrlIndex + 1 < previewUrls.length) {
      setActiveUrlIndex(activeUrlIndex + 1);
      return;
    }
    setPreviewFailed(true);
  };

  return (
    <div className='mp-result-card'>
      <div className='mp-result-frame'>
        {displayUrl && result.kind === 'image' ? (
          <img
            key={displayUrl}
            src={displayUrl}
            alt='生成结果'
            onLoad={() => setPreviewFailed(false)}
            onError={handlePreviewError}
          />
        ) : displayUrl ? (
          <video
            key={displayUrl}
            src={displayUrl}
            controls
            playsInline
            onLoadedData={() => setPreviewFailed(false)}
            onError={handlePreviewError}
          />
        ) : null}
        {(cacheFailed || usedFallbackPreview) && !previewUnavailable ? (
          <div className='mp-media-notice'>
            已使用原始链接预览，请尽快下载保存。
          </div>
        ) : null}
        {previewUnavailable ? (
          <div className='mp-media-error'>
            <IconEyeOpened />
            <strong>作品已生成，预览暂不可用</strong>
            <span>{statusText}</span>
            <Space spacing={8}>
              {originalUrl ? (
                <Button
                  size='small'
                  icon={<IconExternalOpen />}
                  onClick={() => window.open(originalUrl, '_blank')}
                >
                  打开原始链接
                </Button>
              ) : null}
              <Button
                size='small'
                icon={<IconCopy />}
                onClick={async () => {
                  const ok = await copy(originalUrl || displayUrl);
                  if (ok) Toast.success('链接已复制');
                }}
              >
                复制链接
              </Button>
            </Space>
          </div>
        ) : null}
      </div>
      <div className='mp-result-meta'>
        <div>
          <Tag color={result.kind === 'image' ? 'blue' : 'purple'}>
            {result.kind === 'image' ? '图像' : '视频'}
          </Tag>
          <Tag color='orange'>24 小时内有效</Tag>
        </div>
        <Space spacing={8}>
          <Tooltip content='复制可访问链接'>
            <Button
              icon={<IconCopy />}
              onClick={async () => {
                const ok = await copy(displayUrl || originalUrl);
                if (ok) Toast.success('链接已复制');
              }}
            />
          </Tooltip>
          <Tooltip content='立即下载'>
            <Button
              type='primary'
              icon={<IconDownload />}
              onClick={() =>
                downloadURL(
                  displayUrl || originalUrl,
                  result.kind === 'image'
                    ? 'xingren-image.png'
                    : 'xingren-video.mp4',
                )
              }
            />
          </Tooltip>
          <Tooltip content='从列表移除'>
            <Button icon={<IconDelete />} onClick={() => onRemove(result.id)} />
          </Tooltip>
        </Space>
      </div>
      {result.revisedPrompt ? (
        <p className='mp-revised-prompt'>{result.revisedPrompt}</p>
      ) : null}
    </div>
  );
}

const MediaPlayground = () => {
  const [mode, setMode] = useState('image');
  const [imageWorkflow, setImageWorkflow] = useState('generate');
  const [videoWorkflow, setVideoWorkflow] = useState('text');
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].value);
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value);
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [models, setModels] = useState(EMPTY_MODELS);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState(IMAGE_MODELS[0].defaultSize);
  const [quality, setQuality] = useState(IMAGE_MODELS[0].defaultQuality);
  const [format, setFormat] = useState('png');
  const [aspectRatio, setAspectRatio] = useState(
    IMAGE_MODELS[0].defaultAspectRatio || 'auto',
  );
  const [resolution, setResolution] = useState(
    IMAGE_MODELS[0].defaultResolution || 'auto',
  );
  const [background, setBackground] = useState('auto');
  const [inputFidelity, setInputFidelity] = useState('auto');
  const [compression, setCompression] = useState(100);
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(VIDEO_MODELS[0].defaultDuration);
  const [fps, setFps] = useState(VIDEO_MODELS[0].defaultFps);
  const [seed, setSeed] = useState('');
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [lastFrameFile, setLastFrameFile] = useState(null);
  const [maskFile, setMaskFile] = useState(null);
  const [results, setResults] = useState([]);
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');

  const activeImageModel = useMemo(
    () =>
      IMAGE_MODELS.find((item) => item.value === imageModel) || IMAGE_MODELS[0],
    [imageModel],
  );
  const activeVideoModel = useMemo(
    () =>
      VIDEO_MODELS.find((item) => item.value === videoModel) || VIDEO_MODELS[0],
    [videoModel],
  );
  const activeModel = mode === 'image' ? activeImageModel : activeVideoModel;
  const currentModelId = mode === 'image' ? imageModel : videoModel;
  const modelAllowed =
    models.length === 0 || models.some((item) => item === currentModelId);
  const effectiveGroup =
    mode === 'image' ? IMAGE_GENERATION_GROUP.value : group;
  const visibleGroupOptions =
    mode === 'image' ? [IMAGE_GENERATION_GROUP] : groups;
  const referenceFileLimit =
    mode === 'image' ? IMAGE_EDIT_REFERENCE_LIMIT : VIDEO_REFERENCE_LIMIT;
  const imageRatioOptions =
    activeImageModel.aspectRatios?.length
      ? activeImageModel.aspectRatios
      : activeImageModel.sizes || [];
  const imageRatioValue = activeImageModel.aspectRatios?.length
    ? aspectRatio
    : size;

  function handleImageRatioChange(value) {
    if (activeImageModel.aspectRatios?.length) {
      setAspectRatio(value);
      if (activeImageModel.sizes?.includes(value)) setSize(value);
      return;
    }
    setSize(value);
    setAspectRatio(value);
  }

  useEffect(() => {
    API.get('/api/user/self/groups')
      .then((res) => {
        const data = res.data?.data || {};
        const options = Object.entries(data).map(([value, info]) => ({
          label: info?.desc || value,
          value,
        }));
        setGroups(options);
        setGroup((current) => current || options[0]?.value || '');
      })
      .catch(() => {});

    API.get('/api/user/models')
      .then((res) => setModels(res.data?.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSize(activeModel.defaultSize || activeModel.sizes?.[0] || '1024x1024');
    if (mode === 'image') {
      setQuality(
        activeImageModel.defaultQuality ||
          activeImageModel.qualities?.[0] ||
          'auto',
      );
      setFormat(activeImageModel.formats?.[0] || 'png');
      setAspectRatio(
        activeImageModel.defaultAspectRatio ||
          activeImageModel.aspectRatios?.[0] ||
          SIZE_TO_ASPECT_RATIO[activeModel.defaultSize] ||
          'auto',
      );
      setResolution(
        activeImageModel.defaultResolution ||
          activeImageModel.resolutions?.[0] ||
          'auto',
      );
    } else {
      setDuration(
        activeVideoModel.defaultDuration ||
          activeVideoModel.durations?.[0] ||
          5,
      );
      setFps(activeVideoModel.defaultFps || 24);
    }
  }, [activeModel, activeImageModel, activeVideoModel, mode]);

  useEffect(() => {
    setReferenceFiles((files) =>
      files.length > referenceFileLimit
        ? files.slice(0, referenceFileLimit)
        : files,
    );
  }, [referenceFileLimit]);

  useEffect(() => {
    setResults(restoreStoredResults());
    setResultsLoaded(true);
  }, []);

  useEffect(() => {
    if (!resultsLoaded) return;
    persistResults(results);
  }, [results, resultsLoaded]);

  function addReferenceFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    const available = referenceFileLimit - referenceFiles.length;
    if (available <= 0) {
      Toast.warning(`最多支持上传 ${referenceFileLimit} 张参考图。`);
      return;
    }
    const accepted = incoming.slice(0, available);
    setReferenceFiles((current) =>
      [...current, ...accepted].slice(0, referenceFileLimit),
    );
    if (incoming.length > accepted.length) {
      Toast.warning(
        `最多支持上传 ${referenceFileLimit} 张参考图，已保留前 ${referenceFileLimit} 张。`,
      );
    }
  }

  function removeReferenceFile(index) {
    setReferenceFiles((files) =>
      files.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  const requestPayload = useMemo(() => {
    if (mode === 'image') {
      const effectiveCount = clampCount(count, activeImageModel);
      const effectiveAspectRatio = imageAspectRatioFor(size, aspectRatio);
      const payload = {
        model: imageModel,
        group: effectiveGroup,
        prompt,
      };
      if (isGrokImageModel(imageModel)) {
        payload.n = effectiveCount;
        if (effectiveAspectRatio) payload.aspect_ratio = effectiveAspectRatio;
        if (resolution && resolution !== 'auto') payload.resolution = resolution;
        if (format && format !== 'url') payload.response_format = format;
        return payload;
      }
      if (isGeminiImageModel(imageModel)) {
        const responseFormat = imageResponseFormat(effectiveAspectRatio, resolution);
        payload.responseFormat = responseFormat;
        payload.generationConfig = {
          responseModalities: ['TEXT', 'IMAGE'],
          responseFormat,
        };
        if (negativePrompt.trim())
          payload.extra_fields = { negative_prompt: negativePrompt.trim() };
        return payload;
      }
      const isGptImage2 = isGptImage2Model(imageModel);
      payload.n = effectiveCount;
      payload.size = isGptImage2
        ? gptImage2SizeFor(effectiveAspectRatio, resolution)
        : size;
      if (isGptImage2 && resolution && resolution !== 'auto')
        payload.resolution = resolution;
      if (quality) payload.quality = quality;
      if (format && format !== 'url') payload.output_format = format;
      if (activeImageModel.sizeParam === 'size' && format !== 'png' && format !== 'url')
        payload.output_compression = compression;
      if (
        activeImageModel.backgroundOptions?.includes(background) &&
        background !== 'auto'
      )
        payload.background = background;
      if (imageWorkflow === 'edit' && activeImageModel.supportsInputFidelity)
        payload.input_fidelity = inputFidelity;
      if (negativePrompt.trim())
        payload.extra_fields = { negative_prompt: negativePrompt.trim() };
      return payload;
    }

    const [width, height] = size.split('x').map((value) => Number(value));
    const payload = {
      model: videoModel,
      group: effectiveGroup,
      prompt,
      duration,
      seconds: String(duration),
      size,
      width,
      height,
      fps,
      response_format: 'url',
      enhance_prompt: enhancePrompt,
      watermark,
    };
    if (seed.trim()) payload.seed = Number(seed);
    if (negativePrompt.trim())
      payload.metadata = { negative_prompt: negativePrompt.trim() };
    if (videoWorkflow === 'image') {
      payload.image = '上传的第一张参考图会在提交时自动填入';
      payload.images = ['最多 5 张参考图会在提交时自动填入'];
    }
    if (videoWorkflow === 'first-last') {
      payload.image = '上传的第一张首帧 / 参考图会在提交时自动填入';
      payload.images = [
        '最多 5 张首帧 / 参考图会在提交时自动填入',
        '上传的尾帧图片会在提交时自动填入',
      ];
      payload.metadata = {
        ...(payload.metadata || {}),
        last_frame_image: '上传的尾帧图片会在提交时自动填入',
        frames: [
          { role: 'first_frame', image: '上传的第一张首帧图片会在提交时自动填入' },
          { role: 'last_frame', image: '上传的尾帧图片会在提交时自动填入' },
        ],
      };
    }
    return payload;
  }, [
    background,
    compression,
    count,
    duration,
    effectiveGroup,
    enhancePrompt,
    format,
    fps,
    imageModel,
    imageWorkflow,
    inputFidelity,
    mode,
    negativePrompt,
    prompt,
    quality,
    aspectRatio,
    resolution,
    seed,
    size,
    videoModel,
    videoWorkflow,
    watermark,
    activeImageModel,
  ]);

  async function cacheMedia(result) {
    if (!result.url) return result;
    try {
      const res = await API.post(
        '/pg/media/cache',
        { url: result.url, kind: result.kind },
        { skipErrorHandler: true },
      );
      if (res.data?.success && res.data?.data?.url) {
        return {
          ...result,
          cachedUrl: res.data.data.url,
          displayUrl: res.data.data.url,
          cacheStatus: 'ready',
        };
      }
      return {
        ...result,
        cacheStatus: 'failed',
        cacheMessage: res.data?.message || '临时下载缓存失败。',
      };
    } catch (error) {
      return {
        ...result,
        cacheStatus: 'failed',
        cacheMessage:
          error?.response?.data?.message ||
          error.message ||
          '临时下载缓存失败。',
      };
    }
  }

  async function submitImage() {
    let response;
    if (imageWorkflow === 'edit') {
      const form = new FormData();
      Object.entries(requestPayload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        form.set(
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        );
      });
      referenceFiles.forEach((file) => form.append('image', file));
      if (maskFile) form.set('mask', maskFile);
      response = await API.post('/pg/images/edits', form, {
        skipErrorHandler: true,
        timeout: IMAGE_REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } else {
      response = await API.post('/pg/images/generations', requestPayload, {
        skipErrorHandler: true,
        timeout: IMAGE_REQUEST_TIMEOUT_MS,
      });
    }
    const payload = response.data;
    if (payload?.error?.message) throw new Error(payload.error.message);
    const generated = extractImageResults(payload);
    if (generated.length === 0) throw new Error('没有拿到可展示的图像链接。');
    const cached = await Promise.all(generated.map(cacheMedia));
    setResults((prev) => [...cached, ...prev]);
    const failed = cached.filter(
      (item) => item.cacheStatus === 'failed',
    ).length;
    if (failed > 0) {
      Toast.warning('图像已生成，但部分临时预览缓存失败，请打开原始链接保存。');
    } else {
      Toast.success('图像已生成，请立即下载保存。');
    }
  }

  async function pollVideo(taskId) {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const res = await API.get(`/pg/videos/${encodeURIComponent(taskId)}`, {
        skipErrorHandler: true,
        disableDuplicate: true,
      });
      const status = getVideoStatus(res.data);
      const progress = getVideoProgress(res.data);
      const url = extractVideoURL(res.data);
      setTaskMessage(`视频任务 ${status}，进度 ${progress}%`);
      if (url) return createVideoResult(res.data, url, taskId);
      if (status === 'failed')
        throw new Error(res.data?.error?.message || '视频任务失败。');
      if (status === 'completed') {
        throw new Error('视频完成但没有返回视频地址。');
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('视频生成等待超时，请稍后到任务日志查看结果。');
  }

  async function submitVideo() {
    const payload = { ...requestPayload };
    if (videoWorkflow === 'image' || videoWorkflow === 'first-last') {
      const referenceFrames = await Promise.all(
        referenceFiles.map((file) => fileToDataURL(file)),
      );
      payload.image = referenceFrames[0];
      payload.images = referenceFrames;
    }
    if (videoWorkflow === 'first-last') {
      const lastFrame = await fileToDataURL(lastFrameFile);
      const referenceFrames = Array.isArray(payload.images)
        ? payload.images
        : [payload.image];
      payload.images = [...referenceFrames, lastFrame];
      payload.metadata = {
        ...(payload.metadata || {}),
        last_frame_image: lastFrame,
        frames: [
          ...referenceFrames.map((image, index) => ({
            role: index === 0 ? 'first_frame' : 'reference_frame',
            image,
          })),
          { role: 'last_frame', image: lastFrame },
        ],
      };
    }
    const res = await API.post('/pg/videos', payload, {
      skipErrorHandler: true,
    });
    if (res.data?.error?.message) throw new Error(res.data.error.message);
    const directUrl = extractVideoURL(res.data);
    if (directUrl) {
      const result = createVideoResult(res.data, directUrl);
      const cached = await cacheMedia(result);
      setResults((prev) => [cached, ...prev]);
      Toast.success('视频已生成，请立即下载保存。');
      return;
    }
    const taskId = getVideoTaskId(res.data);
    if (!taskId) throw new Error('视频任务提交成功但没有返回任务 ID。');
    setTaskMessage(`视频任务已提交：${taskId}，正在等待结果...`);
    const result = await pollVideo(taskId);
    const cached = await cacheMedia(result);
    setResults((prev) => [cached, ...prev]);
    Toast.success('视频已生成，请立即下载保存。');
  }

  async function handleSubmit() {
    if (!modelAllowed) return Toast.error('当前用户分组暂未开放这个模型。');
    if (!prompt.trim()) return Toast.error('请先写一句你想生成什么。');
    if (mode === 'image' && imageWorkflow === 'edit' && referenceFiles.length === 0)
      return Toast.error('图像修改需要先上传参考图。');
    if (mode === 'video' && videoWorkflow !== 'text' && referenceFiles.length === 0)
      return Toast.error('图生视频需要先上传首帧或参考图。');
    if (mode === 'video' && videoWorkflow === 'first-last' && !lastFrameFile)
      return Toast.error('首尾帧视频需要同时上传首帧和尾帧。');

    setSubmitting(true);
    setTaskMessage(
      mode === 'video' ? '正在提交视频任务...' : IMAGE_WAIT_MESSAGE,
    );
    try {
      if (mode === 'image') await submitImage();
      else await submitVideo();
    } catch (error) {
      Toast.error(userFacingGenerationError(error));
    } finally {
      setSubmitting(false);
      setTaskMessage('');
    }
  }

  const handleRemoveResult = (id) =>
    setResults((prev) => prev.filter((item) => item.id !== id));
  const modelOptions = mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS;

  return (
    <div className='mp-page classic-page-fill'>
      <div className='mp-shell'>
        <section className='mp-hero'>
          <div>
            <Tag color='blue' prefixIcon={<IconImage />}>
              星人媒体工坊
            </Tag>
            <Title heading={2}>图像与视频创作台</Title>
            <Paragraph>从提示词到成片下载，统一在一个工作台完成。</Paragraph>
          </div>
          <div className='mp-hero-stats'>
            <StatPill label='保留' value='24 小时' />
            <StatPill label='图像' value='5 模型' />
            <StatPill label='视频' value='2 模型' />
          </div>
        </section>

        <section className='mp-workbench'>
          <aside className='mp-panel mp-controls'>
            <div
              className='mp-mode-switch'
              role='tablist'
              aria-label='生成类型'
            >
              <button
                className={mode === 'image' ? 'active' : ''}
                onClick={() => setMode('image')}
                type='button'
              >
                <IconImage /> 图像
              </button>
              <button
                className={mode === 'video' ? 'active' : ''}
                onClick={() => setMode('video')}
                type='button'
              >
                <IconPlay /> 视频
              </button>
            </div>

            <SectionTitle meta={activeModel.vendor}>模型</SectionTitle>
            <div className='mp-model-grid'>
              {modelOptions.map((item) => {
                const selected = currentModelId === item.value;
                return (
                  <button
                    key={item.value}
                    type='button'
                    className={
                      selected ? 'mp-model-card active' : 'mp-model-card'
                    }
                    onClick={() =>
                      mode === 'image'
                        ? setImageModel(item.value)
                        : setVideoModel(item.value)
                    }
                  >
                    <span>{item.label}</span>
                    <Tag color={selected ? 'blue' : 'grey'}>{item.badge}</Tag>
                    <small>{item.hint}</small>
                  </button>
                );
              })}
            </div>

            <SectionTitle>生成方式</SectionTitle>
            {mode === 'image' ? (
              <div className='mp-toggle-row'>
                {[
                  { key: 'generate', label: '文生图' },
                  {
                    key: 'edit',
                    label: activeImageModel.edit
                      ? '图像修改'
                      : '图像修改不可用',
                    disabled: !activeImageModel.edit,
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    disabled={item.disabled}
                    className={imageWorkflow === item.key ? 'active' : ''}
                    onClick={() => setImageWorkflow(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className='mp-toggle-row'>
                {[
                  { key: 'text', label: '文生视频' },
                  { key: 'image', label: '图生视频' },
                  { key: 'first-last', label: '首尾帧' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    className={videoWorkflow === item.key ? 'active' : ''}
                    onClick={() => setVideoWorkflow(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {mode === 'image' &&
            imageWorkflow === 'edit' &&
            activeImageModel.supportsInputFidelity ? (
              <NativeSelect
                label='参考图保真度'
                value={inputFidelity}
                options={toSelectOptions(['auto', 'low', 'high'])}
                onChange={setInputFidelity}
              />
            ) : null}

            <div className='mp-field-grid'>
              {mode === 'video' ? (
                <NativeSelect
                  label='分组'
                  value={effectiveGroup}
                  options={visibleGroupOptions}
                  onChange={setGroup}
                />
              ) : null}
              {mode === 'image' && activeImageModel.resolutions?.length ? (
                <NativeSelect
                  label='画面尺寸'
                  value={resolution}
                  options={toSelectOptions(activeImageModel.resolutions)}
                  onChange={setResolution}
                />
              ) : (
                <NativeSelect
                  label={mode === 'image' ? '画面尺寸' : '视频尺寸'}
                  value={size}
                  options={toSizeSelectOptions(activeModel.sizes, activeModel)}
                  onChange={setSize}
                />
              )}
              {mode === 'image' && imageRatioOptions.length ? (
                <NativeSelect
                  label='画面比例'
                  value={imageRatioValue}
                  options={toSelectOptions(imageRatioOptions)}
                  onChange={handleImageRatioChange}
                />
              ) : null}
              {mode === 'image' ? (
                <NativeSelect
                  label='清晰度'
                  value={quality}
                  options={toSelectOptions(activeImageModel.qualities)}
                  onChange={setQuality}
                />
              ) : (
                <NativeSelect
                  label='时长'
                  value={duration}
                  options={activeVideoModel.durations.map((value) => ({
                    value,
                    label: `${value} 秒`,
                  }))}
                  onChange={setDuration}
                />
              )}
              {mode === 'image' ? (
                <NativeSelect
                  label='输出格式'
                  value={format}
                  options={toSelectOptions(activeImageModel.formats)}
                  onChange={setFormat}
                />
              ) : (
                <NativeSelect
                  label='帧率'
                  value={fps}
                  options={[
                    { value: 24, label: '24 fps' },
                    { value: 30, label: '30 fps' },
                  ]}
                  onChange={setFps}
                />
              )}
            </div>

            {mode === 'image' ? (
              <>
                {activeImageModel.backgroundOptions?.length ? (
                  <NativeSelect
                    label='背景'
                    value={background}
                    options={toSelectOptions(activeImageModel.backgroundOptions)}
                    onChange={setBackground}
                  />
                ) : null}
                <div className='mp-slider-field'>
                  <div>
                    <span>生成数量</span>
                    <b>{clampCount(count, activeImageModel)} 张</b>
                  </div>
                  <Slider
                    min={1}
                    max={activeImageModel.maxCount || 1}
                    step={1}
                    value={clampCount(count, activeImageModel)}
                    onChange={(value) => setCount(clampCount(value, activeImageModel))}
                  />
                </div>
                {format !== 'png' && format !== 'url' ? (
                  <div className='mp-slider-field'>
                    <div>
                      <span>压缩质量</span>
                      <b>{compression}</b>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      value={compression}
                      onChange={setCompression}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <label className='mp-field'>
                  <span>Seed</span>
                  <Input
                    value={seed}
                    onChange={setSeed}
                    placeholder='留空随机'
                  />
                </label>
                <div className='mp-switch-line'>
                  <div>
                    <strong>智能润色提示词</strong>
                    <span>适合小白用户，默认开启</span>
                  </div>
                  <Switch checked={enhancePrompt} onChange={setEnhancePrompt} />
                </div>
                <div className='mp-switch-line'>
                  <div>
                    <strong>添加水印</strong>
                    <span>默认关闭，方便直接保存成品</span>
                  </div>
                  <Switch checked={watermark} onChange={setWatermark} />
                </div>
                {videoWorkflow !== 'text' ? (
                  <MultiFileDrop
                    label={
                      videoWorkflow === 'first-last'
                        ? '上传首帧 / 参考图'
                        : '上传参考图 / 首帧'
                    }
                    files={referenceFiles}
                    maxFiles={referenceFileLimit}
                    onFiles={addReferenceFiles}
                    onRemove={removeReferenceFile}
                  />
                ) : null}
                {videoWorkflow === 'first-last' ? (
                  <FileDrop
                    label='上传尾帧图片'
                    file={lastFrameFile}
                    onFile={setLastFrameFile}
                  />
                ) : null}
              </>
            )}
          </aside>

          <main className='mp-canvas-panel'>
            <div className='mp-prompt-card'>
              <div className='mp-prompt-head'>
                <div>
                  <SectionTitle meta='Prompt'>画面描述</SectionTitle>
                  <Text type='tertiary'>主体、镜头、光线、风格、用途。</Text>
                </div>
                <Space spacing={8} wrap>
                  {PROMPT_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size='small'
                      onClick={() => setPrompt(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </Space>
              </div>
              <TextArea
                value={prompt}
                autosize={{ minRows: 6, maxRows: 12 }}
                onChange={setPrompt}
                placeholder='例如：一张高级商业海报，主体清晰，真实光影，适合品牌宣传。'
                className='mp-prompt-input'
              />
              <Input
                value={negativePrompt}
                onChange={setNegativePrompt}
                placeholder='不想出现的内容：低清晰度、畸形手指、文字错误、过曝等'
                className='mp-negative-input'
              />
              {mode === 'image' && imageWorkflow === 'edit' ? (
                <div className='mp-field-grid'>
                  <MultiFileDrop
                    label='上传参考图'
                    files={referenceFiles}
                    maxFiles={referenceFileLimit}
                    onFiles={addReferenceFiles}
                    onRemove={removeReferenceFile}
                  />
                  <FileDrop
                    label='上传遮罩图，可选'
                    file={maskFile}
                    onFile={setMaskFile}
                    compact
                  />
                </div>
              ) : null}
              <div className='mp-action-row'>
                <Button
                  theme='solid'
                  type='primary'
                  size='large'
                  icon={mode === 'image' ? <IconImage /> : <IconPlay />}
                  loading={submitting}
                  disabled={!modelAllowed}
                  onClick={handleSubmit}
                  className='mp-generate-button'
                >
                  {mode === 'image' ? '生成图像' : '生成视频'}
                </Button>
              </div>
              {!modelAllowed ? (
                <Banner
                  type='danger'
                  closeIcon={null}
                  description='当前用户分组暂未开放这个模型。'
                />
              ) : null}
            </div>

            <div className='mp-gallery-head'>
              <div>
                <Title heading={4}>结果画布</Title>
                <Text type='tertiary'>
                  生成完成后会自动缓存为本站临时链接，便于预览和下载。
                </Text>
              </div>
              <Space spacing={8}>
                <Button
                  icon={<IconRefresh />}
                  onClick={() => setResults([])}
                  disabled={results.length === 0}
                >
                  清空
                </Button>
              </Space>
            </div>

            {taskMessage ? (
              <div className='mp-progress-line'>
                <Spin size='small' />
                <span>{taskMessage}</span>
              </div>
            ) : null}

            {results.length === 0 ? (
              <div className='mp-empty-canvas'>
                <div className='mp-empty-mark'>
                  <IconUpload />
                </div>
                <Title heading={4}>等待第一个作品</Title>
                <Paragraph>
                  选择模型后点击生成。你会在这里看到可预览、可复制、可下载的临时结果。
                </Paragraph>
              </div>
            ) : (
              <div className='mp-result-grid'>
                {results.map((result) => (
                  <ResultCard
                    key={result.id}
                    result={result}
                    onRemove={handleRemoveResult}
                  />
                ))}
              </div>
            )}
            <div className='mp-retention-note'>
              生成后的临时预览文件保留 24 小时，到期自动清理；请在有效期内下载保存。
            </div>
          </main>
        </section>
      </div>
    </div>
  );
};

export default MediaPlayground;
