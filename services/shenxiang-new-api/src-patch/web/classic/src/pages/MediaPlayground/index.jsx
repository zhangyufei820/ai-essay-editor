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

const openMediaUrl = (url) => {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const agentSelectorValue = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

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
    value: 'image 2电商商品图快速通道(1.5K)',
    label: 'image 2电商商品图快速通道(1.5K)',
    badge: '1.5K',
    vendor: '星人图像',
    sizes: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    resolutions: ['auto'],
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    defaultSize: '1:1',
    defaultResolution: 'auto',
    defaultQuality: 'high',
    maxCount: 4,
    countParam: 'n',
    sizeParam: 'size',
    backgroundOptions: ['auto', 'opaque'],
    supportsInputFidelity: true,
    supportsOutputCompression: true,
    edit: true,
    hint: '电商商品图快速通道，实测约 1.5K 输出，单次调用 ¥0.055/张。',
  },
  {
    value: 'ecommerce-banana-2',
    label: '电商特价banana-2',
    badge: '1K',
    vendor: '星人图像',
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
const MEDIA_RESULT_TTL_MS = 72 * 60 * 60 * 1000;

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
  return (
    model === 'gpt-image-2-4K' ||
    model === 'image 2电商商品图快速通道(1.5K)'
  );
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

function geminiImageConfig(aspectRatio, imageSize) {
  const imageConfig = {};
  if (aspectRatio && aspectRatio !== 'auto') {
    imageConfig.aspectRatio = aspectRatio;
  }
  if (imageSize && imageSize !== 'auto') {
    imageConfig.imageSize = String(imageSize).toUpperCase();
  }
  return imageConfig;
}

function geminiExtraBodyImageConfig(aspectRatio, imageSize) {
  const imageConfig = {};
  if (aspectRatio && aspectRatio !== 'auto') {
    imageConfig.aspect_ratio = aspectRatio;
  }
  if (imageSize && imageSize !== 'auto') {
    imageConfig.image_size = String(imageSize).toUpperCase();
  }
  return {
    google: {
      image_config: imageConfig,
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
  {
    value: 'seedance-nsfw',
    label: 'Seedance 私测视频',
    badge: '私测',
    vendor: '星人视频',
    private: true,
    sizes: ['1280x720', '720x1280', '1024x1024'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultSize: '1280x720',
    defaultDuration: 4,
    defaultFps: 24,
    hint: '仅供管理员验证私测视频模型连通性，支持 4-15 秒整数。',
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
  '图像任务已提交，后台会持久化结果，可用任务 ID 查询。';
const IMAGE_LONG_WAIT_MS = 70 * 1000;
const IMAGE_LONG_WAIT_MESSAGE =
  '图像任务仍在生成中，耗时接近 70 秒。请不要重复提交，可继续等待或稍后用任务 ID 查询结果。';

function toSelectOptions(values) {
  return values.map((value) => ({ value, label: String(value) }));
}

function toResolutionSelectOptions(values) {
  return values.map((value) => ({
    value,
    label: value === 'auto' ? '默认' : String(value),
  }));
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
  if (
    lower.includes('no access to model') ||
    lower.includes('has no access to model') ||
    lower.includes('token has no access')
  ) {
    return '当前账号暂未开通该模型，请联系管理员或切换模型。';
  }
  if (
    lower.includes('upstream') ||
    lower.includes('provider') ||
    lower.includes('supplier') ||
    lower.includes('channel') ||
    lower.includes('dragtokens') ||
    lower.includes('relaydance') ||
    String(message).includes('上游') ||
    String(message).includes('供应商') ||
    String(message).includes('渠道')
  ) {
    return '模型服务暂时不可用，请稍后重试。';
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

function promptWithReferenceImages(value, count) {
  if (count <= 0) return value;
  const markers = Array.from({ length: count }, (_, index) => `@image${index + 1}`);
  const missing = markers.filter((marker) => !String(value || '').includes(marker));
  if (missing.length === 0) return value;
  return `${missing.join(' ')} ${value || ''}`.trim();
}

function normalizeURL(url) {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  return url;
}

function toAbsoluteMediaURL(url) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${url}`;
  }
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

function getImageTaskId(response) {
  return response?.data?.task_id || response?.task_id || '';
}

function getImageTaskStatus(response) {
  const status = String(response?.data?.status || response?.status || '').toLowerCase();
  if (['success', 'completed', 'succeeded'].includes(status)) return 'completed';
  if (['failure', 'failed', 'error'].includes(status)) return 'failed';
  if (['in_progress', 'processing', 'running'].includes(status)) return 'processing';
  return status || 'queued';
}

function getImageTaskProgress(response) {
  const raw = response?.data?.progress || response?.progress || '';
  const match = String(raw).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function imageTaskToResult(task) {
  if (!task) return null;
  const item = task.item || task.data?.item || {};
  const url =
    item.cachedUrl ||
    item.displayUrl ||
    item.url ||
    task.result_url ||
    task.data?.cached_url ||
    '';
  if (!url) return null;
  return {
    id: `image-${task.task_id}`,
    kind: 'image',
    url,
    displayUrl: item.displayUrl || item.cachedUrl || url,
    cachedUrl: item.cachedUrl || url,
    revisedPrompt: item.revisedPrompt,
    taskId: task.task_id,
    status: 'ready',
    cacheStatus: 'ready',
    createdAt: Date.now(),
  };
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

function NativeSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  agentKey,
}) {
  return (
    <label className='mp-field' data-xr-agent={agentKey || undefined}>
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

function OptionChips({
  label,
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
  agentKey,
}) {
  return (
    <div
      className={compact ? 'mp-chip-field is-compact' : 'mp-chip-field'}
      data-xr-agent={agentKey || undefined}
    >
      <span>{label}</span>
      <div
        className={
          options.length > 6 ? 'mp-chip-row is-scrollable' : 'mp-chip-row'
        }
      >
        {options.map((option) => {
          const optionValue = option.value ?? option;
          const optionLabel = option.label ?? option;
          const active = String(value) === String(optionValue);
          return (
            <button
              key={String(optionValue)}
              type='button'
              disabled={disabled}
              className={active ? 'mp-param-chip active' : 'mp-param-chip'}
              data-xr-agent={
                agentKey ? `${agentKey}-${agentSelectorValue(optionValue)}` : undefined
              }
              onClick={() => onChange(optionValue)}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </div>
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
  const openUrl = originalUrl || displayUrl;
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
          <button
            type='button'
            className='mp-result-open-media'
            onClick={() => openMediaUrl(openUrl)}
            aria-label='查看原图'
          >
            <img
              key={displayUrl}
              src={displayUrl}
              alt='生成结果'
              onLoad={() => setPreviewFailed(false)}
              onError={handlePreviewError}
            />
          </button>
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
                  onClick={() => openMediaUrl(originalUrl)}
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
          <Tag color='orange'>72 小时内有效</Tag>
        </div>
        <Space spacing={8}>
          <Tooltip content='查看原图'>
            <Button
              icon={<IconExternalOpen />}
              disabled={!openUrl}
              onClick={() => openMediaUrl(openUrl)}
            />
          </Tooltip>
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
  const [imageTaskLookup, setImageTaskLookup] = useState('');
  const [submitStartedAt, setSubmitStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  useEffect(() => {
    if (!submitting || !submitStartedAt) {
      setElapsedSeconds(0);
      return undefined;
    }
    const updateElapsed = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - submitStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [submitting, submitStartedAt]);

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
        const imageConfig = geminiImageConfig(effectiveAspectRatio, resolution);
        if (effectiveAspectRatio) payload.aspect_ratio = effectiveAspectRatio;
        if (resolution && resolution !== 'auto') {
          payload.resolution = resolution;
          payload.image_size = String(resolution).toUpperCase();
        }
        payload.responseFormat = responseFormat;
        payload.generationConfig = {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig,
          responseFormat,
        };
        payload.extra_body = geminiExtraBodyImageConfig(
          effectiveAspectRatio,
          resolution,
        );
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

  async function cacheReferenceImage(file, role, index) {
    const dataUrl = await fileToDataURL(file);
    const res = await API.post(
      '/pg/media/cache',
      {
        url: dataUrl,
        kind: 'image',
        metadata: {
          role: 'reference',
          reference_role: role,
          reference_index: index + 1,
          hidden: true,
          source: 'video_input',
          model: videoModel,
          workflow: videoWorkflow,
        },
      },
      { skipErrorHandler: true },
    );
    if (!res.data?.success || !res.data?.data?.url) {
      throw new Error(res.data?.message || '参考图缓存失败。');
    }
    return toAbsoluteMediaURL(res.data.data.url);
  }

  async function applyVideoReferenceImages(payload) {
    if (videoWorkflow !== 'image' && videoWorkflow !== 'first-last') return payload;

    const references = await Promise.all(
      referenceFiles.map(async (file, index) => ({
        role: index === 0 ? 'first_frame' : 'reference_image',
        url: await cacheReferenceImage(
          file,
          index === 0 ? 'first_frame' : 'reference_image',
          index,
        ),
      })),
    );
    if (videoWorkflow === 'first-last' && lastFrameFile) {
      references.push({
        role: 'last_frame',
        url: await cacheReferenceImage(lastFrameFile, 'last_frame', references.length),
      });
    }
    if (references.length === 0) return payload;

    const metadata = {
      ...(payload.metadata || {}),
      content: references.map((item) => ({
        type: 'image_url',
        image_url: { url: item.url },
        role: item.role,
      })),
      frames: references.map((item) => ({
        role: item.role,
        image: item.url,
      })),
      image_reference_count: references.length,
    };
    if (videoWorkflow === 'first-last') {
      metadata.last_frame_image = references[references.length - 1]?.url;
    }

    return {
      ...payload,
      prompt: promptWithReferenceImages(payload.prompt || '', references.length),
      image: references[0].url,
      images: references.map((item) => item.url),
      metadata,
    };
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
      response = await API.post('/pg/images/tasks/edits', form, {
        skipErrorHandler: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } else {
      response = await API.post('/pg/images/tasks/generations', requestPayload, {
        skipErrorHandler: true,
      });
    }
    const payload = response.data;
    if (payload?.error?.message) throw new Error(payload.error.message);
    if (!payload?.success) throw new Error(payload?.message || '图像任务提交失败。');
    const taskId = getImageTaskId(payload);
    if (!taskId) throw new Error('图像任务提交成功但没有返回任务 ID。');
    setImageTaskLookup(taskId);
    setTaskMessage(`图像任务已提交：${taskId}，正在等待持久化结果...`);
    const result = await pollImageTask(taskId);
    setResults((prev) => [result, ...prev]);
    Toast.success('图像已生成，请立即下载保存。');
  }

  async function pollImageTask(taskId) {
    const startedAt = Date.now();
    const deadline = Date.now() + 30 * 60 * 1000;
    let longWaitNotified = false;
    while (Date.now() < deadline) {
      const res = await API.get(`/pg/images/tasks/${encodeURIComponent(taskId)}`, {
        skipErrorHandler: true,
        disableDuplicate: true,
      });
      if (res.data?.error?.message) throw new Error(res.data.error.message);
      if (!res.data?.success || !res.data?.data) {
        throw new Error(res.data?.message || '图像任务查询失败。');
      }
      const status = getImageTaskStatus(res.data);
      const progress = getImageTaskProgress(res.data);
      const elapsedMs = Date.now() - startedAt;
      if (!longWaitNotified && elapsedMs >= IMAGE_LONG_WAIT_MS) {
        longWaitNotified = true;
        Toast.info(IMAGE_LONG_WAIT_MESSAGE);
      }
      const longWaitSuffix =
        elapsedMs >= IMAGE_LONG_WAIT_MS ? '，生成耗时较长，请继续等待或稍后用任务 ID 查询' : '';
      setTaskMessage(`图像任务 ${res.data.data.task_id}：${status}，进度 ${progress}%${longWaitSuffix}`);
      if (status === 'completed') {
        const result = imageTaskToResult(res.data.data);
        if (result) return result;
        throw new Error('图像任务完成但没有返回持久化图片。');
      }
      if (status === 'failed') {
        throw new Error(
          res.data.data.fail_reason ||
            res.data.data.data?.error ||
            '图像任务失败。',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('图像生成等待超时，请稍后用任务 ID 查询结果。');
  }

  async function lookupImageTask() {
    const taskId = imageTaskLookup.trim();
    if (!taskId) {
      Toast.error('请输入任务 ID。');
      return;
    }
    setSubmitting(true);
    setTaskMessage(`正在查询图像任务：${taskId}`);
    try {
      const res = await API.get(`/pg/images/tasks/${encodeURIComponent(taskId)}`, {
        skipErrorHandler: true,
        disableDuplicate: true,
      });
      if (res.data?.error?.message) throw new Error(res.data.error.message);
      if (!res.data?.success || !res.data?.data) {
        throw new Error(res.data?.message || '图像任务查询失败。');
      }
      const status = getImageTaskStatus(res.data);
      if (status === 'completed') {
        const result = imageTaskToResult(res.data.data);
        if (!result) throw new Error('图像任务完成但没有返回持久化图片。');
        setResults((prev) => [result, ...prev.filter((item) => item.id !== result.id)]);
        Toast.success('已找到图像任务结果。');
        return;
      }
      if (status === 'failed') {
        throw new Error(
          res.data.data.fail_reason ||
            res.data.data.data?.error ||
            '图像任务失败。',
        );
      }
      Toast.info(`图像任务仍在处理中：${status}`);
    } catch (error) {
      Toast.error(userFacingGenerationError(error));
    } finally {
      setSubmitting(false);
      setTaskMessage('');
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
    const payload = await applyVideoReferenceImages({ ...requestPayload });
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
    setSubmitStartedAt(Date.now());
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
      setSubmitStartedAt(null);
    }
  }

  const handleRemoveResult = (id) =>
    setResults((prev) => prev.filter((item) => item.id !== id));
  const modelOptions = (mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS).filter(
    (item) => !item.private || models.some((model) => model === item.value),
  );
  const workflowLabel =
    mode === 'image'
      ? imageWorkflow === 'edit'
        ? '图像修改'
        : '文生图'
      : videoWorkflow === 'first-last'
        ? '首尾帧'
        : videoWorkflow === 'image'
          ? '图生视频'
          : '文生视频';
  const sizeLabel =
    mode === 'image'
      ? resolution && resolution !== 'auto'
        ? resolution
        : size
      : size;
  const ratioLabel =
    mode === 'image'
      ? imageRatioValue || '默认'
      : String(size || '').replace('x', ' × ');
  const qualityLabel =
    mode === 'image' ? quality || '默认' : `${duration} 秒 · ${fps} fps`;
  const amountLabel =
    mode === 'image'
      ? `${clampCount(count, activeImageModel)} 张`
      : watermark
        ? '含水印'
        : '无水印';
  const formatLabel = mode === 'image' ? String(format || 'url').toUpperCase() : 'URL / MP4';
  const inspectorItems = [
    { label: '当前模型', value: activeModel.label },
    { label: '生成方式', value: workflowLabel },
    { label: mode === 'image' ? '画面尺寸' : '视频尺寸', value: sizeLabel },
    { label: mode === 'image' ? '画面比例' : '画面规格', value: ratioLabel },
    { label: mode === 'image' ? '清晰度' : '时长 / 帧率', value: qualityLabel },
    { label: mode === 'image' ? '输出数量' : '水印', value: amountLabel },
    { label: '输出格式', value: formatLabel },
  ];
  const referenceLabel =
    mode === 'image'
      ? imageWorkflow === 'edit'
        ? `${referenceFiles.length} / ${referenceFileLimit} 张`
        : '不需要'
      : videoWorkflow === 'text'
        ? '不需要'
        : `${referenceFiles.length} / ${referenceFileLimit} 张`;
  const lastFrameLabel =
    mode === 'video' && videoWorkflow === 'first-last'
      ? lastFrameFile
        ? '已上传'
        : '未上传'
      : '不需要';
  const readinessItems = [
    { label: '模型', done: modelAllowed, value: modelAllowed ? '已开放' : '无权限' },
    { label: '提示词', done: Boolean(prompt.trim()), value: prompt.trim() ? '已填写' : '待填写' },
    {
      label: '参考图',
      done:
        (mode === 'image' && imageWorkflow !== 'edit') ||
        (mode === 'video' && videoWorkflow === 'text') ||
        referenceFiles.length > 0,
      value: referenceLabel,
    },
    {
      label: '尾帧',
      done: !(mode === 'video' && videoWorkflow === 'first-last') || Boolean(lastFrameFile),
      value: lastFrameLabel,
    },
  ];
  const activePromptPreset =
    PROMPT_PRESETS.find((preset) => preset.value === prompt)?.label || '自定义描述';
  const outputSpec =
    mode === 'image'
      ? `${ratioLabel} · ${sizeLabel} · ${qualityLabel}`
      : `${ratioLabel} · ${qualityLabel}`;
  const stageItems = [
    { label: '任务', value: workflowLabel },
    { label: '提示', value: prompt.trim() ? '已填写' : '待填写' },
    { label: '参数', value: outputSpec },
    { label: '生成', value: submitting ? `${elapsedSeconds} 秒` : '可提交' },
    { label: '结果', value: results.length ? `${results.length} 个` : '待生成' },
  ];

  return (
    <div className='mp-page classic-page-fill'>
      <div className='mp-shell'>
        <section className='mp-hero'>
          <div>
            <Tag color='blue' prefixIcon={<IconImage />} className='mp-hero-kicker'>
              星人媒体工坊
            </Tag>
            <Title heading={2}>媒体创作工作台</Title>
            <Paragraph>
              任务、提示词、参数、生成和结果按同一条操作线排列。
            </Paragraph>
          </div>
          <div className='mp-hero-stats'>
            <StatPill label='保留' value='72 小时' />
            <StatPill label='当前模式' value={mode === 'image' ? '图像' : '视频'} />
            <StatPill label='输出规格' value={outputSpec} />
          </div>
        </section>

        <div className='mp-stage-strip' aria-label='媒体创作流程'>
          {stageItems.map((item, index) => (
            <div key={item.label} className='mp-stage-item'>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
          ))}
        </div>

        <section className='mp-workbench'>
          <aside className='mp-panel mp-controls'>
            <div className='mp-panel-label'>01 · 任务</div>
            <div
              className='mp-mode-switch'
              role='tablist'
              aria-label='生成类型'
            >
              <button
                className={mode === 'image' ? 'active' : ''}
                onClick={() => setMode('image')}
                type='button'
                data-xr-agent='media-mode-image'
              >
                <IconImage /> 图像
              </button>
              <button
                className={mode === 'video' ? 'active' : ''}
                onClick={() => setMode('video')}
                type='button'
                data-xr-agent='media-mode-video'
              >
                <IconPlay /> 视频
              </button>
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
                    data-xr-agent={`media-image-workflow-${item.key}`}
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
                    data-xr-agent={`media-video-workflow-${item.key}`}
                    onClick={() => setVideoWorkflow(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

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
                    data-xr-agent={`media-model-${agentSelectorValue(item.value)}`}
                    onClick={() =>
                      mode === 'image'
                        ? setImageModel(item.value)
                        : setVideoModel(item.value)
                    }
                  >
                    <div className='mp-model-card-head'>
                      <span className='mp-model-name'>{item.label}</span>
                      <Tag color={selected ? 'blue' : 'grey'}>{item.badge}</Tag>
                    </div>
                    <div className='mp-model-meta'>
                      <span>{item.vendor}</span>
                      {item.maxCount ? <span>最多 {item.maxCount} 张</span> : null}
                      {item.sizes?.length ? <span>{item.sizes.length} 规格</span> : null}
                    </div>
                    <small>{item.hint}</small>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className='mp-canvas-panel'>
            <div className='mp-prompt-card'>
              <div className='mp-panel-label'>02 · 提示</div>
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
                      theme={activePromptPreset === preset.label ? 'solid' : 'light'}
                      type={activePromptPreset === preset.label ? 'primary' : 'tertiary'}
                      onClick={() => setPrompt(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </Space>
              </div>
              <div className='mp-prompt-input-wrap'>
                <TextArea
                  value={prompt}
                  autosize={{ minRows: 6, maxRows: 12 }}
                  onChange={setPrompt}
                  placeholder='例如：一张高级商业海报，主体清晰，真实光影，适合品牌宣传。'
                  className='mp-prompt-input'
                  data-xr-agent='media-prompt'
                />
                <div className='mp-prompt-tools'>
                  <Tooltip content='复制提示词'>
                    <Button
                      size='small'
                      theme='borderless'
                      icon={<IconCopy />}
                      disabled={!prompt.trim()}
                      onClick={async () => {
                        const ok = await copy(prompt);
                        if (ok) Toast.success('提示词已复制');
                      }}
                    />
                  </Tooltip>
                  <Tooltip content='清空提示词'>
                    <Button
                      size='small'
                      theme='borderless'
                      icon={<IconDelete />}
                      disabled={!prompt}
                      onClick={() => setPrompt('')}
                    />
                  </Tooltip>
                </div>
              </div>
              <Input
                value={negativePrompt}
                onChange={setNegativePrompt}
                placeholder='不想出现的内容：低清晰度、畸形手指、文字错误、过曝等'
                className='mp-negative-input'
                data-xr-agent='media-negative-prompt'
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

              {mode === 'video' && videoWorkflow !== 'text' ? (
                <div className='mp-field-grid'>
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
                  {videoWorkflow === 'first-last' ? (
                    <FileDrop
                      label='上传尾帧图片'
                      file={lastFrameFile}
                      onFile={setLastFrameFile}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className='mp-parameter-panel'>
                <div className='mp-parameter-head'>
                  <SectionTitle meta='03 · Params'>生成参数</SectionTitle>
                  <span>{workflowLabel} · {outputSpec}</span>
                </div>
                <div className='mp-param-priority'>
                  {mode === 'video' ? (
                    <NativeSelect
                      label='分组'
                      value={effectiveGroup}
                      options={visibleGroupOptions}
                      onChange={setGroup}
                      agentKey='media-group'
                    />
                  ) : null}
                  {mode === 'image' && activeImageModel.resolutions?.length ? (
                    <OptionChips
                      label='画面尺寸'
                      value={resolution}
                      options={toResolutionSelectOptions(activeImageModel.resolutions)}
                      onChange={setResolution}
                      compact
                      agentKey='media-resolution'
                    />
                  ) : (
                    <OptionChips
                      label={mode === 'image' ? '画面尺寸' : '视频尺寸'}
                      value={size}
                      options={toSizeSelectOptions(activeModel.sizes, activeModel)}
                      onChange={setSize}
                      agentKey='media-size'
                    />
                  )}
                  {mode === 'image' && imageRatioOptions.length ? (
                    <OptionChips
                      label='画面比例'
                      value={imageRatioValue}
                      options={toSelectOptions(imageRatioOptions)}
                      onChange={handleImageRatioChange}
                      agentKey='media-aspect-ratio'
                    />
                  ) : null}
                  {mode === 'image' ? (
                    <OptionChips
                      label='清晰度'
                      value={quality}
                      options={toSelectOptions(activeImageModel.qualities)}
                      onChange={setQuality}
                      compact
                      agentKey='media-quality'
                    />
                  ) : (
                    <OptionChips
                      label='时长'
                      value={duration}
                      options={activeVideoModel.durations.map((value) => ({
                        value,
                        label: `${value} 秒`,
                      }))}
                      onChange={setDuration}
                      compact
                      agentKey='media-duration'
                    />
                  )}
                </div>

                <div className='mp-param-secondary'>
                  {mode === 'image' ? (
                    <OptionChips
                      label='输出格式'
                      value={format}
                      options={toSelectOptions(activeImageModel.formats)}
                      onChange={setFormat}
                      compact
                      agentKey='media-format'
                    />
                  ) : (
                    <OptionChips
                      label='帧率'
                      value={fps}
                      options={[
                        { value: 24, label: '24 fps' },
                        { value: 30, label: '30 fps' },
                      ]}
                      onChange={setFps}
                      compact
                      agentKey='media-fps'
                    />
                  )}
                  {mode === 'image' &&
                  imageWorkflow === 'edit' &&
                  activeImageModel.supportsInputFidelity ? (
                    <OptionChips
                      label='参考图保真度'
                      value={inputFidelity}
                      options={toSelectOptions(['auto', 'low', 'high'])}
                      onChange={setInputFidelity}
                      compact
                      agentKey='media-input-fidelity'
                    />
                  ) : null}
                  {mode === 'image' && activeImageModel.backgroundOptions?.length ? (
                    <OptionChips
                      label='背景'
                      value={background}
                      options={toSelectOptions(activeImageModel.backgroundOptions)}
                      onChange={setBackground}
                      compact
                      agentKey='media-background'
                    />
                  ) : null}
                  {mode === 'video' ? (
                    <label className='mp-field'>
                      <span>Seed</span>
                      <Input
                        value={seed}
                        onChange={setSeed}
                        placeholder='留空随机'
                      />
                    </label>
                  ) : null}
                </div>

                {mode === 'image' ? (
                  <div className='mp-inline-controls'>
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
                        data-xr-agent='media-count'
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
                          data-xr-agent='media-compression'
                          onChange={setCompression}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className='mp-inline-controls'>
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
                  </div>
                )}
              </div>

              <div className='mp-action-row'>
                <span className='mp-panel-label'>04 · 生成</span>
                <Button
                  theme='solid'
                  type='primary'
                  size='large'
                  icon={mode === 'image' ? <IconImage /> : <IconPlay />}
                  loading={submitting}
                  disabled={!modelAllowed}
                  onClick={handleSubmit}
                  className='mp-generate-button'
                  data-xr-agent='media-generate'
                >
                  {mode === 'image' ? '生成图像' : '生成视频'}
                </Button>
                <div className='mp-action-context'>
                  <strong>{activeModel.label}</strong>
                  <span>{workflowLabel} · {outputSpec}</span>
                </div>
              </div>
              {taskMessage ? (
                <div className='mp-wait-panel' role='status' aria-live='polite'>
                  <div className='mp-wait-orbit'>
                    <Spin size='large' />
                  </div>
                  <div className='mp-wait-copy'>
                    <strong>{mode === 'image' ? '图像生成中' : '视频生成中'}</strong>
                    <span>{taskMessage}</span>
                  </div>
                  <div className='mp-wait-meter'>
                    <div>
                      <span>已等待</span>
                      <strong>{elapsedSeconds} 秒</strong>
                    </div>
                    <div>
                      <span>常规预期</span>
                      <strong>至少 30 秒</strong>
                    </div>
                    <div>
                      <span>下一步</span>
                      <strong>结果会进入下方画布</strong>
                    </div>
                  </div>
                  <div className='mp-wait-actions'>
                    <span>可以先构思下一版提示词，当前任务会按提交瞬间的内容执行。</span>
                    <span>保持页面打开，完成后可直接复制链接或下载。</span>
                  </div>
                </div>
              ) : null}
              {mode === 'image' ? (
                <div className='mp-task-lookup'>
                  <Input
                    value={imageTaskLookup}
                    placeholder='task_id'
                    onChange={setImageTaskLookup}
                  />
                  <Button
                    theme='borderless'
                    type='tertiary'
                    icon={<IconRefresh />}
                    disabled={submitting}
                    onClick={lookupImageTask}
                  >
                    查询
                  </Button>
                </div>
              ) : null}
              {!modelAllowed ? (
                <Banner
                  type='danger'
                  closeIcon={null}
                  description='当前用户分组暂未开放这个模型。'
                />
              ) : null}
            </div>

            <section className='mp-results-section'>
              <div className='mp-gallery-head'>
                <div>
                  <span className='mp-panel-label'>05 · 结果</span>
                  <Title heading={4}>结果画布</Title>
                  <Text type='tertiary'>
                    生成完成后会自动缓存为本站 72 小时临时链接，便于预览和下载。
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

              {results.length === 0 ? (
                <div className={submitting ? 'mp-empty-canvas is-rendering' : 'mp-empty-canvas'}>
                  <div className='mp-empty-mark'>
                    {submitting ? <Spin size='large' /> : <IconUpload />}
                  </div>
                  <Title heading={4}>
                    {submitting ? '正在生成第一个作品' : '等待第一个作品'}
                  </Title>
                  <Paragraph>
                    {submitting
                      ? '当前任务正在执行，完成后作品会自动落到这里。'
                      : '选择模型后点击生成。你会在这里看到可预览、可复制、可下载的临时结果。'}
                  </Paragraph>
                  {submitting ? (
                    <div className='mp-render-preview' aria-hidden='true'>
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                  <div className='mp-empty-spec'>
                    <span>{activeModel.label}</span>
                    <span>{workflowLabel}</span>
                    <span>{outputSpec}</span>
                  </div>
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
                生成后的临时预览文件保留 72 小时，到期自动清理；请在有效期内下载保存。
              </div>
            </section>
          </main>

          <aside className='mp-panel mp-inspector' aria-label='当前生成方案'>
            <div className='mp-panel-label'>状态</div>
            <SectionTitle meta='Live'>当前方案</SectionTitle>
            <div className='mp-inspector-hero'>
              <div className='mp-inspector-badge'>
                {mode === 'image' ? <IconImage /> : <IconPlay />}
              </div>
              <div>
                <strong>{workflowLabel}</strong>
                <span>{activeModel.vendor} · {activeModel.badge}</span>
              </div>
            </div>
            <div className='mp-readiness'>
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className={item.done ? 'is-ready' : 'is-missing'}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className='mp-inspector-list'>
              {inspectorItems.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            {taskMessage ? (
              <div className='mp-inspector-wait'>
                <strong>生成中 · {elapsedSeconds} 秒</strong>
                <span>不用重复点击生成。完成后结果会自动出现在画布顶部。</span>
              </div>
            ) : null}
            <div className='mp-inspector-note'>
              生成前重点确认模型、比例、清晰度和输出数量；临时预览结果保留 72 小时。
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

export default MediaPlayground;
