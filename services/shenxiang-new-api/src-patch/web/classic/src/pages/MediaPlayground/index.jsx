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
  Banner,
  Button,
  Input,
  Modal,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Toast,
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
import { useNavigate } from 'react-router-dom';
import { API, copy } from '../../helpers';
import './MediaPlayground.css';
import '../../styles/media-tokens.css';
import {
  PromptComposer,
  ReversePromptPanel,
  ModelSelector,
} from '../../components/media-workbench';

const { Text, Title, Paragraph } = Typography;

const OPENAI_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '1:3',
  '3:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '9:21',
  '21:9',
];

const GPT_IMAGE_2_RESOLUTIONS = ['auto', '1K', '2K', '4K', 'custom'];

const GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS = [
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

const GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS = ['512', '1K', '2K', '4K'];

const GOOGLE_GEMINI_PRO_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];

const XAI_GROK_IMAGE_ASPECT_RATIOS = [
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
    sizes: OPENAI_IMAGE_ASPECT_RATIOS,
    aspectRatios: OPENAI_IMAGE_ASPECT_RATIOS,
    resolutions: GPT_IMAGE_2_RESOLUTIONS,
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
    priceLabel: '¥0.108/张',
    billingLabel: '按张计费',
    hint: '适合高质量海报、产品图和商品素材。官方最大边 3840，4K 横竖图使用 3840x2160 / 2160x3840，可自定义合法 WxH。',
  },
  {
    value: '特价 image-2',
    label: '特价 image-2',
    badge: '4K',
    vendor: '星人图像',
    sizes: OPENAI_IMAGE_ASPECT_RATIOS,
    aspectRatios: OPENAI_IMAGE_ASPECT_RATIOS,
    resolutions: GPT_IMAGE_2_RESOLUTIONS,
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
    statusLabel: '稳定',
    priceLabel: '1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10',
    billingLabel: '按张计费',
    hint: '特价 image-2 重新上线，支持 1K / 2K / 4K 和合法自定义 WxH；费用：1K ¥0.03，2K ¥0.06，4K ¥0.10。',
  },
  {
    value: 'banana-2',
    label: 'Banana 2',
    badge: '4K',
    vendor: '星人图像',
    sizes: GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS,
    aspectRatios: GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS,
    resolutions: GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS,
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
    priceLabel: '¥0.162/张',
    billingLabel: '按张计费',
    hint: '适合快速高分辨率创意图、场景草图和视觉方案探索。支持 512 / 1K / 2K / 4K 和极端比例。',
  },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    badge: '4K',
    vendor: '星人图像',
    sizes: GOOGLE_GEMINI_PRO_IMAGE_ASPECT_RATIOS,
    aspectRatios: GOOGLE_GEMINI_PRO_IMAGE_ASPECT_RATIOS,
    resolutions: ['1K', '2K', '4K'],
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
    priceLabel: '¥0.238/张',
    billingLabel: '按张计费',
    hint: '适合高阶视觉方案、复杂场景草图和高分辨率创意图。4K 会按 Gemini 官方比例表输出，如 16:9 为 5504x3072。',
  },
  {
    value: 'image 2电商商品图快速通道(1.5K)',
    label: 'image 2电商商品图快速通道(1.5K)',
    badge: '1.5K',
    vendor: '星人图像',
    sizes: OPENAI_IMAGE_ASPECT_RATIOS,
    aspectRatios: OPENAI_IMAGE_ASPECT_RATIOS,
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
    priceLabel: '¥0.055/张',
    billingLabel: '按张计费',
    hint: '电商商品图快速通道，实测约 1.5K 输出，单次调用 ¥0.055/张。',
  },
  {
    value: 'ecommerce-banana-2',
    label: '电商特价banana-2',
    badge: '1K',
    vendor: '星人图像',
    sizes: GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS,
    aspectRatios: GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS,
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
    priceLabel: '¥0.085/张',
    billingLabel: '按张计费',
    hint: '电商特价 Banana 2，仅支持 1K 输出，可编辑图像，按 0.085/张计费。',
  },
  {
    value: 'grok-imagine-image',
    label: 'Grok Image Pro',
    badge: 'Pro',
    vendor: '星人图像',
    sizes: XAI_GROK_IMAGE_ASPECT_RATIOS,
    aspectRatios: XAI_GROK_IMAGE_ASPECT_RATIOS,
    resolutions: ['1k', '2k'],
    qualities: ['low', 'medium', 'high'],
    formats: ['url', 'b64_json'],
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: '2k',
    defaultQuality: 'high',
    maxCount: 10,
    countParam: 'n',
    sizeParam: 'aspect_ratio',
    edit: true,
    priceLabel: '¥0.324/张',
    billingLabel: '按张计费',
    hint: '适合真实感、社媒封面和快速创意探索。官方按比例 + 1k/2k 分辨率控制，不公布固定像素表。',
  },
];

function modelOptionDisplayLabel(model) {
  const tags = [model.statusLabel, model.priceLabel].filter(Boolean);
  return tags.length ? `${model.label} · ${tags.join(' · ')}` : model.label;
}

function toModelSelectOptions(models) {
  return models.map((item) => ({
    label: modelOptionDisplayLabel(item),
    value: item.value,
  }));
}

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
    '1:3': '512x1536',
    '3:1': '1536x512',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '3:4': '1008x1344',
    '4:3': '1344x1008',
    '4:5': '1024x1280',
    '5:4': '1280x1024',
    '16:9': '1536x864',
    '9:16': '864x1536',
    '9:21': '672x1568',
    '21:9': '1568x672',
  },
  '2K': {
    '1:1': '2048x2048',
    '1:3': '688x2064',
    '3:1': '2064x688',
    '2:3': '1376x2064',
    '3:2': '2064x1376',
    '3:4': '1536x2048',
    '4:3': '2048x1536',
    '4:5': '1664x2080',
    '5:4': '2080x1664',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '9:21': '912x2128',
    '21:9': '2128x912',
  },
  '4K': {
    '1:1': '2880x2880',
    '1:3': '1280x3840',
    '3:1': '3840x1280',
    '2:3': '2176x3264',
    '3:2': '3264x2176',
    '3:4': '2160x2880',
    '4:3': '2880x2160',
    '4:5': '2304x2880',
    '5:4': '2880x2304',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '9:21': '1632x3808',
    '21:9': '3808x1632',
  },
};

const GPT_IMAGE_2_MIN_PIXELS = 655360;
const GPT_IMAGE_2_MAX_PIXELS = 8294400;
const GPT_IMAGE_2_MAX_SIDE = 3840;
const GPT_IMAGE_2_MIN_SIDE = 16;
const GPT_IMAGE_2_MAX_RATIO = 3;

const GOOGLE_GEMINI_PRO_IMAGE_SIZE_BY_RESOLUTION = {
  '1K': {
    '1:1': '1024x1024',
    '2:3': '848x1264',
    '3:2': '1264x848',
    '3:4': '896x1200',
    '4:3': '1200x896',
    '4:5': '928x1152',
    '5:4': '1152x928',
    '9:16': '768x1376',
    '16:9': '1376x768',
    '21:9': '1584x672',
  },
  '2K': {
    '1:1': '2048x2048',
    '2:3': '1696x2528',
    '3:2': '2528x1696',
    '3:4': '1792x2400',
    '4:3': '2400x1792',
    '4:5': '1856x2304',
    '5:4': '2304x1856',
    '9:16': '1536x2752',
    '16:9': '2752x1536',
    '21:9': '3168x1344',
  },
  '4K': {
    '1:1': '4096x4096',
    '2:3': '3392x5056',
    '3:2': '5056x3392',
    '3:4': '3584x4800',
    '4:3': '4800x3584',
    '4:5': '3712x4608',
    '5:4': '4608x3712',
    '9:16': '3072x5504',
    '16:9': '5504x3072',
    '21:9': '6336x2688',
  },
};

const GOOGLE_IMAGE_EDIT_SIZE_BY_RESOLUTION = {
  '1K': {
    square: '1024x1024',
    portrait: '1024x1024',
    landscape: '1024x1024',
  },
  '2K': {
    square: '2048x2048',
    portrait: '2048x2048',
    landscape: '2048x2048',
  },
  '4K': {
    square: '2048x2048',
    portrait: '2048x4096',
    landscape: '4096x2048',
  },
};

const IMAGE_GENERATION_GROUP = {
  value: 'default',
  label: '图像生成分组',
};

const IMAGE_EDIT_REFERENCE_LIMIT = 10;
const VIDEO_REFERENCE_LIMIT = 5;
const VIDEO_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
const VIDEO_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'];
const VIDEO_REFERENCE_ACCEPT = [
  ...VIDEO_IMAGE_TYPES,
  ...VIDEO_VIDEO_TYPES,
  ...VIDEO_AUDIO_TYPES,
].join(',');
const GROK_VIDEO_PRICE_PER_CALL = 6.5;
const SEEDANCE_SD2_FAST_PRICE_PER_SECOND = 0.25;
const GROK_VIDEO_15_PRICE_PER_CALL = 0.2;
const SEEDANCE_LD17_PRICE_PER_CALL = 6.48;
const MEDIA_RESULT_STORAGE_KEY = 'shenxiang-media-playground-results:v1';
const MEDIA_RESULT_TTL_MS = 72 * 60 * 60 * 1000;
const VIDEO_LONG_WAIT_MS = 70 * 1000;
const VIDEO_BACKGROUND_WAIT_MS = 10 * 60 * 1000;
const VIDEO_MAX_PAGE_POLL_MS = 45 * 60 * 1000;
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_BACKGROUND_POLL_INTERVAL_MS = 15000;

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

function isGoogleImageEditModel(model) {
  return isGeminiImageModel(model);
}

function isGptImage2Model(model) {
  return (
    model === 'gpt-image-2-4K' ||
    model === '特价 image-2' ||
    model === 'image 2电商商品图快速通道(1.5K)'
  );
}

function imageModelConfig(modelValue) {
  return IMAGE_MODELS.find((item) => item.value === modelValue) || null;
}

function videoModelConfig(modelValue) {
  return VIDEO_MODELS.find((item) => item.value === modelValue) || null;
}

function resultImageModelValue(result) {
  const raw = String(
    result?.model ||
      result?.modelValue ||
      result?.modelLabel ||
      result?.metadata?.model ||
      result?.data?.model ||
      '',
  ).trim();
  if (!raw) return '';
  if (imageModelConfig(raw)) return raw;
  const byLabel = IMAGE_MODELS.find((item) => item.label === raw);
  return byLabel?.value || raw;
}

function resultVideoModelValue(result) {
  const raw = String(
    result?.model ||
      result?.modelValue ||
      result?.modelLabel ||
      result?.metadata?.model ||
      result?.data?.model ||
      '',
  ).trim();
  if (!raw) return '';
  if (videoModelConfig(raw)) return raw;
  const byLabel = VIDEO_MODELS.find((item) => item.label === raw);
  return byLabel?.value || raw;
}

function resultModelLabel(result, fallbackImageModel, fallbackVideoModel) {
  if (result?.kind === 'image') {
    const modelValue = resultImageModelValue(result);
    return (
      result?.modelLabel ||
      imageModelConfig(modelValue)?.label ||
      modelValue ||
      fallbackImageModel?.label ||
      '图片模型'
    );
  }
  const modelValue = resultVideoModelValue(result);
  return (
    result?.modelLabel ||
    videoModelConfig(modelValue)?.label ||
    modelValue ||
    fallbackVideoModel?.label ||
    '视频模型'
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

function gcd(left, right) {
  let a = Math.abs(Number(left) || 0);
  let b = Math.abs(Number(right) || 0);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function parsePixelSize(value) {
  const match = String(value || '').trim().match(/^(\d{2,5})\s*x\s*(\d{2,5})$/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function normalizePixelSize(value) {
  const parsed = parsePixelSize(value);
  return parsed ? `${parsed.width}x${parsed.height}` : '';
}

function aspectRatioLabelForPixelSize(value) {
  const parsed = parsePixelSize(value);
  if (!parsed) return '';
  const divisor = gcd(parsed.width, parsed.height);
  return `${parsed.width / divisor}:${parsed.height / divisor}`;
}

function gptImage2CustomSizeError(value) {
  const parsed = parsePixelSize(value);
  if (!parsed) return '请输入有效尺寸，例如 3840x2160。';
  const { width, height } = parsed;
  const pixels = width * height;
  if (width < GPT_IMAGE_2_MIN_SIDE || height < GPT_IMAGE_2_MIN_SIDE) {
    return '尺寸边长不能小于 16px。';
  }
  if (width > GPT_IMAGE_2_MAX_SIDE || height > GPT_IMAGE_2_MAX_SIDE) {
    return 'gpt-image-2 最大边不能超过 3840px。';
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    return 'gpt-image-2 的宽高都必须是 16px 的倍数。';
  }
  if (Math.max(width, height) / Math.min(width, height) > GPT_IMAGE_2_MAX_RATIO) {
    return 'gpt-image-2 的长短边比例不能超过 3:1。';
  }
  if (pixels < GPT_IMAGE_2_MIN_PIXELS || pixels > GPT_IMAGE_2_MAX_PIXELS) {
    return 'gpt-image-2 总像素必须在 655,360 到 8,294,400 之间。';
  }
  return '';
}

function gptImage2CustomSizeFor(value) {
  return gptImage2CustomSizeError(value) ? '' : normalizePixelSize(value);
}

function gptImage2SizeFor(aspectRatio, imageSize, customSize = '') {
  if (imageSize === 'custom') {
    return gptImage2CustomSizeFor(customSize);
  }
  if (imageSize === 'auto') {
    return 'auto';
  }
  const normalizedResolution = imageSize && imageSize !== 'auto' ? imageSize : '1K';
  return (
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.[aspectRatio] ||
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.['1:1'] ||
    '1024x1024'
  );
}

function geminiProImageSizeFor(aspectRatio, imageSize) {
  const normalizedResolution = imageSize && imageSize !== 'auto' ? imageSize : '1K';
  return GOOGLE_GEMINI_PRO_IMAGE_SIZE_BY_RESOLUTION[normalizedResolution]?.[aspectRatio] || '';
}

function imagePixelSizeForModel(modelValue, aspectRatio, imageSize, customSize = '') {
  if (isGptImage2Model(modelValue)) {
    const pixelSize = gptImage2SizeFor(aspectRatio, imageSize, customSize);
    if (pixelSize === 'auto') return '';
    return pixelSize || '自定义尺寸待输入';
  }
  if (modelValue === 'gemini-3-pro-image-preview') {
    return geminiProImageSizeFor(aspectRatio, imageSize);
  }
  return '';
}

function aspectOrientation(aspectRatio) {
  const [rawWidth, rawHeight] = String(aspectRatio || '').split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'square';
  }
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function googleImageEditSizeFor(aspectRatio, imageSize, modelValue) {
  if (modelValue === 'gemini-3-pro-image-preview') {
    const officialSize = geminiProImageSizeFor(aspectRatio, imageSize);
    if (officialSize) return officialSize;
  }
  const normalizedResolution =
    imageSize && imageSize !== 'auto' ? String(imageSize).toUpperCase() : '1K';
  const sizeMap =
    GOOGLE_IMAGE_EDIT_SIZE_BY_RESOLUTION[normalizedResolution] ||
    GOOGLE_IMAGE_EDIT_SIZE_BY_RESOLUTION['1K'];
  return sizeMap[aspectOrientation(aspectRatio)] || sizeMap.square || '1024x1024';
}

const VIDEO_MODELS = [
  {
    value: 'grok-video-super-720p',
    label: 'Grok Video',
    badge: '720P',
    sizes: ['1280x720', '720x1280'],
    durations: [5, 10, 15],
    defaultSize: '1280x720',
    defaultDuration: 15,
    defaultFps: 24,
    billingLabel: '按次计费',
    priceLabel: `¥${GROK_VIDEO_PRICE_PER_CALL.toFixed(2)}/次`,
    hint: '固定 ¥6.50/次；支持 5/10/15 秒，建议生成 15 秒。',
  },
  {
    value: 'seedance-sd2-fast-720p',
    label: 'Seedance SD Fast 720P',
    badge: 'Fast',
    sizes: ['1280x720', '720x1280'],
    durations: [5, 10, 15],
    defaultSize: '1280x720',
    defaultDuration: 10,
    defaultFps: 24,
    referenceLimits: { image: 10, video: 0, audio: 0 },
    billingLabel: '按秒计费',
    priceLabel: `¥${SEEDANCE_SD2_FAST_PRICE_PER_SECOND.toFixed(2)}/秒`,
    hint: '¥0.25/秒；固定 720P，支持 5/10/15 秒；可文生视频或上传图片，不支持视频/音频参考；人脸能力未承诺。',
  },
  {
    value: 'grok-video-1.5',
    label: 'Grok Video 1.5',
    badge: '1.5',
    sizes: ['1280x720', '720x1280'],
    durations: [6, 10],
    defaultSize: '1280x720',
    defaultDuration: 6,
    defaultFps: 24,
    referenceLimits: { image: 1, video: 0, audio: 0 },
    workflows: ['image'],
    requiresImage: true,
    billingLabel: '按次计费',
    priceLabel: `¥${GROK_VIDEO_15_PRICE_PER_CALL.toFixed(2)}/次`,
    hint: '固定 ¥0.20/次；固定 720P，仅支持 6/10 秒图生视频；必须上传 1 张图片，不支持视频/音频参考；人脸能力未承诺。',
  },
  {
    value: 'seedance-2.0-ld-17',
    label: 'Seedance 2.0 LD-17',
    badge: '全能',
    sizes: ['1280x720', '720x1280', '1024x1024'],
    durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultSize: '1280x720',
    defaultDuration: 8,
    defaultFps: 24,
    referenceLimits: { image: 9, video: 3, audio: 3 },
    supportsFace: true,
    billingLabel: '按次计费',
    priceLabel: `¥${SEEDANCE_LD17_PRICE_PER_CALL.toFixed(2)}/次`,
    hint: '固定 ¥6.48/次；支持 5-15 秒，可使用 9 图 / 3 视频 / 3 音频参考。',
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

const MEDIA_PROMPT_MAX_LENGTH = 10000;
const DEFAULT_PROMPT = '';
const DEFAULT_IMAGE_NEGATIVE_PROMPT = [
  'low quality',
  'worst quality',
  'low resolution',
  'blurry',
  'out of focus',
  'soft focus',
  'pixelated',
  'jpeg artifacts',
  'compression artifacts',
  'noise',
  'grainy',
  'overexposed',
  'underexposed',
  'washed out',
  'flat lighting',
  'harsh flash',
  'color banding',
  'posterization',
  'oversaturated',
  'undersaturated',
  'bad contrast',
  'muddy colors',
  'wrong white balance',
  'chromatic aberration',
  'lens dirt',
  'watermark',
  'logo',
  'signature',
  'caption',
  'subtitle',
  'text',
  'random letters',
  'misspelled text',
  'ui elements',
  'frame border',
  'duplicate subject',
  'extra person',
  'cropped head',
  'cropped face',
  'cut off limbs',
  'bad anatomy',
  'deformed anatomy',
  'disfigured face',
  'asymmetrical face',
  'cross eye',
  'bad eyes',
  'dead eyes',
  'bad teeth',
  'distorted mouth',
  'deformed hands',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'fused fingers',
  'long fingers',
  'broken fingers',
  'extra arms',
  'extra legs',
  'missing arms',
  'missing legs',
  'twisted limbs',
  'floating limbs',
  'unnatural pose',
  'stiff pose',
  'plastic skin',
  'waxy skin',
  'over-smoothed skin',
  'uncanny face',
  'doll-like face',
  'ai generated look',
  'over-sharpened',
  'heavy retouching',
  'bad hair',
  'melted hair',
  'broken jewelry',
  'floating object',
  'warped object',
  'melted object',
  'incorrect perspective',
  'distorted perspective',
  'tilted horizon',
  'bad composition',
  'messy background',
  'background smear',
  'background blobs',
  'depth error',
  'shadow error',
  'reflection error',
  'object intersection',
  'duplicated pattern',
  'texture stretching',
  'unnatural material',
  'cartoon',
  'anime',
  '3d render',
  'cgi',
  'illustration',
  'painting',
  'sketch',
].join(', ');
const DEFAULT_VIDEO_NEGATIVE_PROMPT = [
  DEFAULT_IMAGE_NEGATIVE_PROMPT,
  'flicker',
  'temporal flicker',
  'frame flicker',
  'brightness flicker',
  'color flicker',
  'exposure pumping',
  'strobing',
  'jitter',
  'camera jitter',
  'shaky frame',
  'warped motion',
  'morphing subject',
  'identity drift',
  'face drift',
  'body drift',
  'shape drift',
  'texture crawling',
  'boiling texture',
  'pulsing edges',
  'wobbling edges',
  'rubber limbs',
  'melting objects',
  'object popping',
  'object teleporting',
  'inconsistent lighting',
  'inconsistent shadows',
  'inconsistent reflections',
  'background swimming',
  'background sliding',
  'camera path jump',
  'bad motion blur',
  'excessive motion blur',
  'ghosting',
  'double exposure',
  'frame blending artifacts',
  'low frame rate',
  'choppy motion',
  'loop seam',
  'frozen subject',
  'unnatural physics',
  'floating feet',
  'foot sliding',
  'hand deformation over time',
  'mouth deformation over time',
  'rolling shutter artifacts',
  'video compression artifacts',
  'subtitle overlay',
  'timestamp',
].join(', ');
const BUILTIN_NEGATIVE_PROMPTS = [
  DEFAULT_IMAGE_NEGATIVE_PROMPT,
  DEFAULT_VIDEO_NEGATIVE_PROMPT,
];
const EMPTY_MODELS = [];

function defaultNegativePromptForMode(mode) {
  return mode === 'video' ? DEFAULT_VIDEO_NEGATIVE_PROMPT : DEFAULT_IMAGE_NEGATIVE_PROMPT;
}

function isBuiltinNegativePrompt(value) {
  const normalized = String(value || '').trim();
  return BUILTIN_NEGATIVE_PROMPTS.some((item) => item === normalized);
}

function toCountSelectOptions(maxCount = 1) {
  return Array.from({ length: Math.max(1, Number(maxCount) || 1) }, (_, index) => {
    const value = index + 1;
    return { value, label: `${value} 张` };
  });
}
const IMAGE_REQUEST_TIMEOUT_MS = 240000;
const IMAGE_POLL_REQUEST_TIMEOUT_MS = 30000;
const IMAGE_WAIT_MESSAGE =
  '图像任务已提交，后台会持久化结果，可用任务 ID 查询。';
const IMAGE_LONG_WAIT_MS = 70 * 1000;
const IMAGE_LONG_WAIT_MESSAGE =
  '图像任务仍在生成中，耗时接近 70 秒。请不要重复提交，可继续等待或稍后用任务 ID 查询结果。';
const IMAGE_VERY_LONG_WAIT_MS = 180 * 1000;
const IMAGE_VERY_LONG_WAIT_MESSAGE =
  '图像任务已进入长尾等待，系统仍会继续轮询并保留任务结果。请保持当前页面或稍后用任务 ID 查询。';
const REVERSE_PROMPT_MODEL = 'gpt-5.4-mini';
const REVERSE_PROMPT_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const REVERSE_PROMPT_REFERENCE_PREFIX = '我需要按参考图生成图片：';
const REVERSE_PROMPT_INSTRUCTION_BASE =
  '请根据上传图片反推出可用于图像生成的详细提示词，并按最终输出规则返回。请用中文写作，目标是让后续图像生成尽可能接近参考图，而不是生成同题材的新图。必须优先锁定以下可复现因素：1. 画幅比例、裁切边界、主体在画面中的大小、头顶/脚底/左右留白、相机高度、拍摄距离和镜头焦段感；2. 主体姿态、朝向、步态、手臂位置、腿部交叉关系、手持物位置、表情、视线、发型走向和头发遮挡；3. 服装版型、颜色、材质、纹理、褶皱、领口、腰线、裙摆形状、鞋包首饰等具体细节；4. 背景真实元素的位置关系，包括街道/斑马线/路沿/店招/广告牌/桌椅/遮阳伞/植物/墙柱/路人，说明哪些元素必须保留、在哪一侧、虚化程度如何；5. 光线方向、阴影强弱、肤色质感、清晰度、景深、色温、对比度、真实街拍感或商业精修感。请避免泛化成“美女街拍、咖啡店背景”这类宽泛描述，不要擅自替换背景、删除路人、改变裁切、改变衣服结构或把画面过度棚拍化。不要解释过程，不要输出 Markdown。';
const REVERSE_PROMPT_INSTRUCTION_EXTENSION =
  '在以上基础上继续整合以下反推规则：必须把“保持不变的视觉不变量”和“禁止漂移项”写进最终提示词，优先使用“严格保持参考图的同一构图、同一主体比例、同一相机距离、同一拍摄角度、同一透视关系、同一背景物体位置、同一光线方向和同一服装结构”这类硬约束。若参考图是近距离手机自拍、低机位、广角或手臂伸向镜头，必须明确写出前景手臂/袖口占画面比例、近大远小透视畸变、脸部在画面上半部的位置、头顶到画面边缘距离、胸肩腰在画面中的裁切边界，禁止把它改成端正半身写真、棚拍写真或更远的全身构图。若参考图是超长竖图或非标准 9:16 画幅，必须写出近似原图的纵横比或“保持原图超长竖向裁切”，并说明不允许为了适配常规尺寸而向下补全身体、扩大背景或改变主体占比。必须按相对位置描述关键物体：例如头发/发饰/耳饰/领口/腰带/袖口/刺绣/门框/天花板/灯源/高光/阴影分别位于画面哪一侧、上下百分比区间、是否被裁切、是否被前景遮挡。人物类图片必须锁定脸部朝向、下巴角度、眼睛视线、嘴唇开合、耳朵露出程度、碎发贴脸和遮挡位置、皮肤真实纹理与修图强度；服装类图片必须锁定交叠衣襟方向、透明薄纱层、刺绣图案的位置密度、腰带宽度和配饰数量，禁止凭空增加更华丽的流苏、耳坠、腰饰或改变衣服层级。光线类图片必须保留原图中的过曝点、背光轮廓光、发丝高光、镜头眩光、硬阴影或低对比灰墙质感，不要自动优化成均匀柔光、干净影棚或电影海报色调。最终提示词要同时包含正向复现描述和负向约束：不要改变裁切，不要改变视角，不要居中重构，不要拉远镜头，不要标准化五官姿态，不要增加不存在的配饰，不要把真实自拍感改成精修商业写真。';
const REVERSE_PROMPT_MATERIAL_CARD_EXTENSION =
  '同时把“JSON素材卡模板”的字段作为内部拆解框架使用，但最终只输出指定 JSON 对象，不输出字段外标题或分析过程。内部必须按以下维度检查后再写最终提示词：baseInfo 图像类型、竖横方向、近似比例、景别和真实感来源；mainSubject 主体类型、成年人物属性、脸部识别感、五官轮廓、脸型比例、神态气质、整体体态、发型状态、服装层次、妆容配饰、动作表情和画面位置；composition 构图方式、主体位置、前景/中景/背景、边缘残留和必须遵守的构图约束；cameraSetup 手机镜头类型、低/平/俯仰角度、拍摄距离、广角畸变、自拍或他拍逻辑、观者视角；lightShadow 光源位置、光线性质、高光、阴影、曝光和动态范围；colorTone 主色、辅色、饱和度、对比度和整体冷暖；textureMaterial 服装、皮肤、头发、环境、道具材质和细节真实感；sceneSpace 地点类型、可见物体、真实场景证据、纵深关系和生活现场感；spatialLogic 前中后景层级、遮挡顺序、人物与物体接触关系、肢体前后拓扑和容易生成错误的风险点；imageQuality 清晰度、噪点、手机压缩感、自动锐化、轻微低动态范围、后期程度和AI感风险；negativePrompt 避免的风格、构图漂移、身体错误、道具漂浮、塑料皮肤、背景糊成色块、人物贴图感和低俗凝视。只描述图片中真实可见的内容，不脑补不存在的物体、动作、关系和情绪，不写“高级、漂亮、氛围感强”这类没有生成指导价值的空话。人物图片必须自然加入参考图人物一致性要求：以上传图片中的成年人物为人物原型，保留脸部识别感、五官轮廓、脸型比例、神态气质和整体人物辨识度；但不要把胸部、臀部、腿部等身体局部作为提示词焦点。默认写成真实手机生活照、手机抓拍照或生活随拍照的可生成提示词，强调自然、不摆拍、不影棚、不广告、不精修，清晰但不过锐，皮肤保留真实纹理，边缘保留真实环境残留。';
const REVERSE_PROMPT_FINAL_OUTPUT_GUARD =
  '最终必须同时输出两套提示词，并且只输出一个 JSON 对象，不要 Markdown、不要解释、不要字段外文本。JSON 结构固定为 {"reference_prompt":"...","text_prompt":"..."}。reference_prompt 用于“带参考图生成”，必须以“我需要按参考图生成图片：”开头，允许使用“参考图”作为生成锚点，必须写清严格保持参考图的同一构图、同一主体比例、同一相机距离、同一拍摄角度、同一透视关系、同一背景物体位置、同一光线方向、同一服装结构和同一人物识别特征。text_prompt 用于“纯文生图”，不得出现“上传图片、上传图、输入图、源图、参考图、原图、这张图”等元描述，必须把源图关系改写成可独立生成的视觉属性描述，例如把“保留原图构图”改写为“保持同一超长竖向近距离自拍构图”，把“参考图人物”改写为“同一成年人物识别特征”，把“上传图片中的服装”改写为“深红交叠衣襟、透明薄纱袖、刺绣位置和腰带宽度”。';
const REVERSE_PROMPT_INSTRUCTION = `${REVERSE_PROMPT_INSTRUCTION_BASE}${REVERSE_PROMPT_INSTRUCTION_EXTENSION}${REVERSE_PROMPT_MATERIAL_CARD_EXTENSION}${REVERSE_PROMPT_FINAL_OUTPUT_GUARD}`;

const REVERSE_PROMPT_SOURCE_PHRASE_REPLACEMENTS = [
  [/以上传图片中的成年女性为人物原型[，,、\s]*/g, '以同一成年女性人物识别特征为基础，'],
  [/以上传图片中的成年男性为人物原型[，,、\s]*/g, '以同一成年男性人物识别特征为基础，'],
  [/以上传图片中的成年人物为人物原型[，,、\s]*/g, '以同一成年人物识别特征为基础，'],
  [/以上传图片中的人物为人物原型[，,、\s]*/g, '以同一人物识别特征为基础，'],
  [/以输入图中的成年女性为人物原型[，,、\s]*/g, '以同一成年女性人物识别特征为基础，'],
  [/以输入图中的成年男性为人物原型[，,、\s]*/g, '以同一成年男性人物识别特征为基础，'],
  [/以输入图中的成年人物为人物原型[，,、\s]*/g, '以同一成年人物识别特征为基础，'],
  [/以输入图中的人物为人物原型[，,、\s]*/g, '以同一人物识别特征为基础，'],
  [/以上传图中的成年女性为人物原型[，,、\s]*/g, '以同一成年女性人物识别特征为基础，'],
  [/以上传图中的成年男性为人物原型[，,、\s]*/g, '以同一成年男性人物识别特征为基础，'],
  [/以上传图中的成年人物为人物原型[，,、\s]*/g, '以同一成年人物识别特征为基础，'],
  [/以上传图中的人物为人物原型[，,、\s]*/g, '以同一人物识别特征为基础，'],
  [/以参考图中的成年女性为人物原型[，,、\s]*/g, '以同一成年女性人物识别特征为基础，'],
  [/以参考图中的成年男性为人物原型[，,、\s]*/g, '以同一成年男性人物识别特征为基础，'],
  [/以参考图中的成年人物为人物原型[，,、\s]*/g, '以同一成年人物识别特征为基础，'],
  [/以参考图中的人物为人物原型[，,、\s]*/g, '以同一人物识别特征为基础，'],
  [/保持原图超长竖向裁切/g, '保持同一超长竖向裁切'],
  [/保留原图超长竖向裁切/g, '保留同一超长竖向裁切'],
  [/严格保持参考图的/g, '严格保持同一'],
  [/严格保留参考图的/g, '严格保留同一'],
  [/保持参考图的/g, '保持同一'],
  [/保留参考图的/g, '保留同一'],
  [/保持原图的/g, '保持同一'],
  [/保留原图的/g, '保留同一'],
  [/保持这张图的/g, '保持同一'],
  [/保留这张图的/g, '保留同一'],
  [/保持上传图片的/g, '保持同一'],
  [/保留上传图片的/g, '保留同一'],
  [/保持上传图的/g, '保持同一'],
  [/保留上传图的/g, '保留同一'],
  [/保持输入图的/g, '保持同一'],
  [/保留输入图的/g, '保留同一'],
  [/保持源图的/g, '保持同一'],
  [/保留源图的/g, '保留同一'],
  [/与原图一致/g, '与上述视觉特征一致'],
  [/和原图一致/g, '与上述视觉特征一致'],
  [/与参考图一致/g, '与上述视觉特征一致'],
  [/和参考图一致/g, '与上述视觉特征一致'],
  [/与上传图片一致/g, '与上述视觉特征一致'],
  [/和上传图片一致/g, '与上述视觉特征一致'],
  [/与上传图一致/g, '与上述视觉特征一致'],
  [/和上传图一致/g, '与上述视觉特征一致'],
  [/与输入图一致/g, '与上述视觉特征一致'],
  [/和输入图一致/g, '与上述视觉特征一致'],
  [/与源图一致/g, '与上述视觉特征一致'],
  [/和源图一致/g, '与上述视觉特征一致'],
  [/接近原图/g, '接近上述视觉特征'],
  [/接近参考图/g, '接近上述视觉特征'],
  [/接近上传图片/g, '接近上述视觉特征'],
  [/接近上传图/g, '接近上述视觉特征'],
  [/接近输入图/g, '接近上述视觉特征'],
  [/接近源图/g, '接近上述视觉特征'],
  [/还原原图/g, '还原上述视觉特征'],
  [/复刻原图/g, '复刻上述视觉特征'],
  [/还原参考图/g, '还原上述视觉特征'],
  [/复刻参考图/g, '复刻上述视觉特征'],
  [/还原上传图片/g, '还原上述视觉特征'],
  [/复刻上传图片/g, '复刻上述视觉特征'],
  [/还原上传图/g, '还原上述视觉特征'],
  [/复刻上传图/g, '复刻上述视觉特征'],
  [/还原输入图/g, '还原上述视觉特征'],
  [/复刻输入图/g, '复刻上述视觉特征'],
  [/还原源图/g, '还原上述视觉特征'],
  [/复刻源图/g, '复刻上述视觉特征'],
  [/上传图片中的/g, '画面中的'],
  [/上传图中的/g, '画面中的'],
  [/输入图中的/g, '画面中的'],
  [/源图中的/g, '画面中的'],
  [/参考图中的/g, '画面中的'],
  [/原图中的/g, '画面中的'],
  [/这张图中的/g, '画面中的'],
  [/上传图片里/g, '画面里'],
  [/上传图里/g, '画面里'],
  [/输入图里/g, '画面里'],
  [/源图里/g, '画面里'],
  [/参考图里/g, '画面里'],
  [/原图里/g, '画面里'],
  [/这张图里/g, '画面里'],
  [/上传图片/g, '画面'],
  [/上传图/g, '画面'],
  [/输入图/g, '画面'],
  [/源图/g, '画面'],
  [/参考图/g, '画面'],
  [/原图/g, '画面'],
  [/这张图/g, '画面'],
];

const REVERSE_PROMPT_REFERENCE_PHRASE_REPLACEMENTS = [
  [/上传图片/g, '参考图'],
  [/上传图/g, '参考图'],
  [/输入图/g, '参考图'],
  [/源图/g, '参考图'],
  [/原图/g, '参考图'],
  [/这张图/g, '参考图'],
  [/参考图参考图/g, '参考图'],
];

function toSelectOptions(values) {
  return values.map((value) => ({ value, label: String(value) }));
}

function toResolutionSelectOptions(values) {
  return values.map((value) => ({
    value,
    label: value === 'auto' ? '默认' : value === 'custom' ? '自定义' : String(value),
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
  const message =
    typeof error === 'string' ? error || '生成失败' : error?.message || '生成失败';
  const lower = String(message).toLowerCase();
  const code =
    typeof error === 'string' ? '' : String(error?.code || '').toLowerCase();
  if (
    lower.includes('prompt_blocked') ||
    lower.includes('content_policy_violation') ||
    lower.includes('content moderation') ||
    lower.includes('output audio may contain sensitive information') ||
    lower.includes('rejected by the safety system') ||
    lower.includes('safety_violations=')
  ) {
    return '提示词或参考图被安全策略拒绝，请调整内容后重试。';
  }
  if (lower.includes('current status: failure')) {
    return '视频任务已失败，没有返回可下载视频；请调整提示词或参考图后重试。';
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
    String(message).includes('上游') ||
    String(message).includes('供应商') ||
    String(message).includes('渠道')
  ) {
    return '模型服务暂时不可用，请稍后重试。';
  }
  return message;
}

function userFacingReversePromptError(error) {
  const message = generationErrorMessage(error);
  const lower = String(message || '').toLowerCase();
  if (
    lower.includes('no access to model') ||
    lower.includes('has no access to model') ||
    lower.includes('token has no access') ||
    lower.includes('access denied') ||
    lower.includes('forbidden')
  ) {
    return '当前用户分组暂未开放图像反推模型。';
  }
  if (
    lower.includes('context length') ||
    lower.includes('too large') ||
    lower.includes('payload') ||
    lower.includes('413')
  ) {
    return '参考图过大，请压缩到 12MB 以内后重试。';
  }
  if (
    lower.includes('content policy') ||
    lower.includes('safety') ||
    lower.includes('blocked') ||
    lower.includes('moderation')
  ) {
    return '参考图可能触发安全审核，请更换图片后再试。';
  }
  if (lower.includes('timeout') || lower.includes('network')) {
    return '图像反推连接超时，请稍后重试。';
  }
  return message || '图像反推失败，请稍后重试。';
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

function validateReversePromptImage(file) {
  if (!file) return '请先上传一张参考图。';
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return '仅支持 PNG / JPG / WebP 图片。';
  }
  if (file.size > REVERSE_PROMPT_MAX_IMAGE_BYTES) {
    return '参考图不能超过 12MB，请压缩后再上传。';
  }
  return '';
}

function extractReversePromptText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] || {};
  const content = firstChoice?.message?.content ?? firstChoice?.delta?.content;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.text || item?.content || '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(text || '')
    .replace(/^```(?:text|markdown|json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function sanitizeReversePromptOutput(value) {
  let text = String(value || '').trim();
  for (const [pattern, replacement] of REVERSE_PROMPT_SOURCE_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/保持画面超长竖向裁切/g, '保持同一超长竖向裁切')
    .replace(/保留画面超长竖向裁切/g, '保留同一超长竖向裁切')
    .replace(/保持画面的/g, '保持同一')
    .replace(/保留画面的/g, '保留同一')
    .replace(/严格保持画面的/g, '严格保持同一')
    .replace(/严格保留画面的/g, '严格保留同一')
    .replace(/同一同一/g, '同一')
    .replace(/画面人物/g, '人物')
    .replace(/画面画面/g, '画面')
    .replace(/，{2,}/g, '，')
    .replace(/、{2,}/g, '、')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReferenceReversePrompt(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of REVERSE_PROMPT_REFERENCE_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  if (!text) return '';
  return text.startsWith(REVERSE_PROMPT_REFERENCE_PREFIX)
    ? text
    : `${REVERSE_PROMPT_REFERENCE_PREFIX}${text}`;
}

function parseReversePromptResult(payload) {
  const rawText = extractReversePromptText(payload);
  if (!rawText) return { referencePrompt: '', textPrompt: '' };

  const candidates = [rawText];
  const objectMatch = rawText.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== rawText) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const referencePrompt =
        parsed?.reference_prompt ||
        parsed?.referencePrompt ||
        parsed?.reference ||
        '';
      const textPrompt =
        parsed?.text_prompt ||
        parsed?.textPrompt ||
        parsed?.prompt ||
        parsed?.text ||
        '';
      if (referencePrompt || textPrompt) {
        return {
          referencePrompt: normalizeReferenceReversePrompt(referencePrompt || textPrompt),
          textPrompt: sanitizeReversePromptOutput(textPrompt || referencePrompt),
        };
      }
    } catch (error) {
      // Some providers wrap JSON in prose despite the instruction; fall back below.
    }
  }

  return {
    referencePrompt: normalizeReferenceReversePrompt(rawText),
    textPrompt: sanitizeReversePromptOutput(rawText),
  };
}

function askReversePromptReferenceMode() {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '是否把这张图作为生成参考图？',
      content:
        '选择“是”会把反推图自动加入下方参考图，并生成“按参考图生成图片”的提示词；选择“否”则只生成纯文生图提示词。',
      okText: '是，作为参考图',
      cancelText: '否，仅文生图',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function promptWithReferenceImages(value, count) {
  if (count <= 0) return clampPromptText(value);
  const markers = Array.from({ length: count }, (_, index) => `@image${index + 1}`);
  const missing = markers.filter((marker) => !String(value || '').includes(marker));
  if (missing.length === 0) return clampPromptText(value);
  return clampPromptText(`${missing.join(' ')} ${value || ''}`.trim());
}

function promptWithReferenceAliases(value, aliases) {
  const markers = aliases
    .map((alias) => String(alias || '').trim())
    .filter(Boolean)
    .map((alias) => `@${alias}`);
  const missing = markers.filter((marker) => !String(value || '').includes(marker));
  if (missing.length === 0) return clampPromptText(value);
  return clampPromptText(`${missing.join(' ')} ${value || ''}`.trim());
}

function clampPromptText(value) {
  const text = String(value || '');
  const chars = Array.from(text);
  if (chars.length <= MEDIA_PROMPT_MAX_LENGTH) return text;
  return chars.slice(0, MEDIA_PROMPT_MAX_LENGTH).join('');
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

function toDownloadMediaURL(url) {
  const absoluteUrl = toAbsoluteMediaURL(normalizeURL(url));
  if (!absoluteUrl || typeof window === 'undefined' || !window.location?.origin) {
    return absoluteUrl;
  }
  try {
    const parsed = new URL(absoluteUrl, window.location.origin);
    if (parsed.origin === window.location.origin && /^\/pg\/media\/files\//i.test(parsed.pathname)) {
      parsed.searchParams.set('download', '1');
      return parsed.href;
    }
    return parsed.href;
  } catch {
    return absoluteUrl;
  }
}

function fileMediaType(file) {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (VIDEO_IMAGE_TYPES.includes(mime) || /\.(png|jpe?g|webp)$/.test(name)) {
    return 'image';
  }
  if (VIDEO_VIDEO_TYPES.includes(mime) || /\.(mp4|webm|mov|m4v)$/.test(name)) {
    return 'video';
  }
  if (VIDEO_AUDIO_TYPES.includes(mime) || /\.(mp3|m4a|aac|wav)$/.test(name)) {
    return 'audio';
  }
  return 'unknown';
}

function referenceFileOf(item) {
  return item?.file || item;
}

function referenceMediaTypeOf(item) {
  return item?.mediaType || fileMediaType(referenceFileOf(item));
}

function referenceAliasPrefix(mediaType) {
  return {
    image: '图片',
    video: '视频',
    audio: '音频',
  }[mediaType] || '素材';
}

function createReferenceItem(file, counters = {}) {
  const mediaType = fileMediaType(file);
  const nextIndex = (counters[mediaType] || 0) + 1;
  counters[mediaType] = nextIndex;
  return {
    id: `${mediaType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    alias: `${referenceAliasPrefix(mediaType)}${nextIndex}`,
  };
}

function nextReferenceCounters(items) {
  return items.reduce(
    (counts, item) => {
      const mediaType = referenceMediaTypeOf(item);
      const alias = String(item?.alias || '');
      const match = alias.match(/(\d+)$/);
      const aliasIndex = match ? Number(match[1]) : 0;
      counts[mediaType] = Math.max(counts[mediaType] || 0, aliasIndex);
      return counts;
    },
    { image: 0, video: 0, audio: 0 },
  );
}

function referenceMentionMarker(alias) {
  return `@${String(alias || '').trim()}`;
}

function referenceMentionPattern(alias) {
  const marker = referenceMentionMarker(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${marker}(?=\\s|$)`, 'u');
}

function sortedReferenceMentions(promptValue, references) {
  const text = String(promptValue || '');
  return references
    .map((item, index) => ({
      item,
      index,
      marker: referenceMentionMarker(item.alias),
      position: text.search(referenceMentionPattern(item.alias)),
    }))
    .filter((entry) => entry.position >= 0)
    .sort((left, right) => left.position - right.position || left.index - right.index)
    .map((entry) => entry.item);
}

function orderedReferencesForPrompt(promptValue, references) {
  const mentioned = sortedReferenceMentions(promptValue, references);
  const mentionedIds = new Set(mentioned.map((item) => item.id));
  return [
    ...mentioned,
    ...references.filter((item) => !mentionedIds.has(item.id)),
  ];
}

function mentionQueryAtCursor(value, cursor) {
  const beforeCursor = String(value || '').slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/u);
  if (!match) return null;
  const token = match[0];
  return {
    query: match[2] || '',
    start: cursor - token.length + (match[1] ? match[1].length : 0),
    end: cursor,
  };
}

function isOfficialSeedanceReferenceModel(modelValue) {
  return Boolean(VIDEO_MODELS.find((item) => item.value === modelValue)?.officialSeedanceReferences) ||
    modelValue === 'seedance-2.0-ld-17';
}

function isExtendedSeedanceVideoModel(modelValue) {
  return Boolean(VIDEO_MODELS.find((item) => item.value === modelValue)?.extendedSeedance);
}

function reservedLastFrameImageSlots(modelValue, workflow) {
  return (isOfficialSeedanceReferenceModel(modelValue) || isExtendedSeedanceVideoModel(modelValue)) &&
    workflow === 'first-last'
    ? 1
    : 0;
}

function videoReferencePolicy(model, options = {}) {
  const baseLimits = model?.referenceLimits || { image: VIDEO_REFERENCE_LIMIT, video: 0, audio: 0 };
  const reservedImageSlots = Math.max(0, Number(options.reservedImageSlots) || 0);
  const limits = {
    ...baseLimits,
    image: Math.max(0, (Number(baseLimits.image) || 0) - reservedImageSlots),
  };
  const allowedTypes = Object.entries(limits)
    .filter(([, limit]) => Number(limit) > 0)
    .map(([type]) => type);
  const maxFiles = allowedTypes.reduce(
    (sum, type) => sum + Math.max(0, Number(limits[type]) || 0),
    0,
  );
  const typeLabel = {
    image: '图片',
    video: '视频',
    audio: '音频',
  };
  const limitLabel = allowedTypes
    .map((type) => `${limits[type]} ${typeLabel[type]}`)
    .join(' / ');
  const reservedHint = reservedImageSlots > 0 ? `；尾帧会占用 ${reservedImageSlots} 张图片额度` : '';
  const accept = [
    ...(limits.image ? VIDEO_IMAGE_TYPES : []),
    ...(limits.video ? VIDEO_VIDEO_TYPES : []),
    ...(limits.audio ? VIDEO_AUDIO_TYPES : []),
  ].join(',');
  return {
    limits,
    allowedTypes,
    maxFiles: maxFiles || VIDEO_REFERENCE_LIMIT,
    limitLabel: limitLabel || `${VIDEO_REFERENCE_LIMIT} 图片`,
    accept: accept || VIDEO_REFERENCE_ACCEPT,
    hint: allowedTypes.includes('audio')
      ? `已选素材，支持 ${limitLabel}${reservedHint}；音频必须搭配图片或视频。`
      : `已选素材，支持 ${limitLabel}${reservedHint}。`,
  };
}

function videoReferenceCounts(files) {
  return files.reduce(
    (counts, file) => {
      const type = referenceMediaTypeOf(file);
      if (counts[type] !== undefined) counts[type] += 1;
      return counts;
    },
    { image: 0, video: 0, audio: 0 },
  );
}

function filterReferenceItemsByPolicy(items, policy) {
  const counts = { image: 0, video: 0, audio: 0 };
  return items.filter((item) => {
    const type = referenceMediaTypeOf(item);
    if (!policy.allowedTypes.includes(type)) return false;
    if (counts[type] >= (policy.limits[type] || 0)) return false;
    counts[type] += 1;
    return true;
  });
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

async function resultMediaFile(result, purpose = 'reference') {
  const sourceUrl = getPreviewURLs(result)[0] || normalizeURL(result?.url || '');
  if (!sourceUrl) throw new Error('这个结果没有可复用的媒体链接。');
  const absoluteUrl = toAbsoluteMediaURL(sourceUrl);
  const response = await fetch(absoluteUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('结果文件暂时无法读取，请下载后手动上传。');
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('结果文件为空，请下载后手动上传。');
  const fallbackType = result?.kind === 'video' ? 'video/mp4' : 'image/png';
  const mime = blob.type || fallbackType;
  const ext =
    mime.includes('webp') ? 'webp' :
      mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' :
        mime.includes('mp4') ? 'mp4' :
          mime.includes('webm') ? 'webm' :
            result?.kind === 'video' ? 'mp4' : 'png';
  const prefix = result?.kind === 'video' ? 'video-result' : purpose;
  return new File([blob], `${prefix}-${Date.now()}.${ext}`, { type: mime });
}

function firstPromptText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function extractImageResults(
  response,
  fallbackPrompt = '',
  fallbackModel = '',
  fallbackModelLabel = '',
) {
  const data = response?.data || [];
  return data
    .map((item, index) => {
      const url =
        item.url ||
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      if (!url) return null;
      const originalPrompt = firstPromptText(item.prompt, fallbackPrompt);
      const revisedPrompt = firstPromptText(item.revised_prompt);
      const modelValue = String(item.model || fallbackModel || '').trim();
      return {
        id: `image-${Date.now()}-${index}`,
        kind: 'image',
        url,
        displayUrl: url.startsWith('data:') ? dataURLToBlobURL(url) : url,
        model: modelValue,
        modelLabel: firstPromptText(
          item.modelLabel,
          item.model_label,
          imageModelConfig(modelValue)?.label,
          fallbackModelLabel,
          modelValue,
        ),
        prompt: originalPrompt,
        revisedPrompt,
        displayPrompt: firstPromptText(revisedPrompt, originalPrompt),
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

function imageTaskToResult(
  task,
  fallbackPrompt = '',
  fallbackModel = '',
  fallbackModelLabel = '',
) {
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
  const originalPrompt = firstPromptText(
    item.prompt,
    task.prompt,
    task.data?.prompt,
    fallbackPrompt,
  );
  const revisedPrompt = firstPromptText(
    item.revisedPrompt,
    item.revised_prompt,
  );
  const modelValue = String(
    item.model ||
      task.model ||
      task.data?.model ||
      task.request?.model ||
      task.data?.request?.model ||
      fallbackModel ||
      '',
  ).trim();
  const metadata = item.metadata || item.Metadata || {};
  const actualSize = firstPromptText(metadata.actual_size);
  const requestedSize = firstPromptText(metadata.effective_size, metadata.requested_size);
  return {
    id: `image-${task.task_id}`,
    kind: 'image',
    url,
    displayUrl: item.displayUrl || item.cachedUrl || url,
    cachedUrl: item.cachedUrl || url,
    model: modelValue,
    modelLabel: firstPromptText(
      item.modelLabel,
      item.model_label,
      task.modelLabel,
      task.model_label,
      task.data?.modelLabel,
      task.data?.model_label,
      imageModelConfig(modelValue)?.label,
      fallbackModelLabel,
      modelValue,
    ),
    prompt: originalPrompt,
    revisedPrompt,
    displayPrompt: firstPromptText(revisedPrompt, originalPrompt),
    taskId: task.task_id,
    actualSize,
    requestedSize,
    sizeMismatch: Boolean(actualSize && requestedSize && actualSize !== requestedSize),
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

function videoErrorMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object') return '';
  return (
    String(value.message || '').trim() ||
    String(value.error || '').trim() ||
    String(value.fail_reason || '').trim() ||
    String(value.failReason || '').trim()
  );
}

function extractVideoFailureReason(response) {
  return (
    videoErrorMessage(response?.error) ||
    String(response?.fail_reason || '').trim() ||
    String(response?.failReason || '').trim() ||
    String(response?.message || '').trim() ||
    videoErrorMessage(response?.data?.error) ||
    String(response?.data?.fail_reason || '').trim() ||
    String(response?.data?.failReason || '').trim() ||
    String(response?.data?.message || '').trim() ||
    videoErrorMessage(response?.metadata?.error) ||
    String(response?.metadata?.fail_reason || '').trim() ||
    String(response?.metadata?.failReason || '').trim() ||
    String(response?.metadata?.message || '').trim()
  );
}

function videoPollErrorStatus(error) {
  const status = error?.response?.status || error?.status;
  const numericStatus = Number(status);
  return Number.isFinite(numericStatus) ? numericStatus : 0;
}

function isTransientVideoPollError(error) {
  const status = videoPollErrorStatus(error);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (status >= 500) return true;

  const code = String(error?.code || '').toLowerCase();
  if (
    ['econnaborted', 'err_network', 'err_connection_reset', 'etimedout', 'econnreset'].includes(code)
  ) {
    return true;
  }

  const message = generationErrorMessage(error).toLowerCase();
  if (
    message.includes('timeout') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('bad gateway') ||
    message.includes('gateway time') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('too many requests') ||
    message.includes('socket hang up') ||
    message.includes('connection reset') ||
    message.includes('查询超时')
  ) {
    return true;
  }

  return !error?.response && Boolean(error?.request);
}

function videoPollErrorMessage(error) {
  const status = videoPollErrorStatus(error);
  const message = generationErrorMessage(error);
  if (message) return message;
  return status ? `HTTP ${status}` : '查询请求暂时失败';
}

function isTransientImagePollError(error) {
  return isTransientVideoPollError(error);
}

function imagePollErrorMessage(error) {
  return videoPollErrorMessage(error);
}

function createTerminalImageTaskError(message) {
  const error = new Error(message || '图像任务失败。');
  error.imageTaskTerminal = true;
  return error;
}

function generationErrorMessage(error) {
  return (
    videoErrorMessage(error?.response?.data?.error) ||
    String(error?.response?.data?.message || '').trim() ||
    videoErrorMessage(error?.response?.data?.data?.error) ||
    String(error?.response?.data?.data?.message || '').trim() ||
    String(error?.message || '').trim() ||
    String(error || '').trim()
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

function createVideoResult(
  response,
  url,
  taskId = '',
  fallbackModel = '',
  fallbackModelLabel = '',
) {
  const id = taskId || getVideoTaskId(response) || `direct-${Date.now()}`;
  const modelValue = String(
    response?.model ||
      response?.data?.model ||
      response?.metadata?.model ||
      fallbackModel ||
      '',
  ).trim();
  return {
    id: `video-${id}`,
    kind: 'video',
    url,
    displayUrl: url,
    model: modelValue,
    modelLabel: firstPromptText(
      response?.modelLabel,
      response?.model_label,
      response?.data?.modelLabel,
      response?.data?.model_label,
      videoModelConfig(modelValue)?.label,
      fallbackModelLabel,
      modelValue,
    ),
    taskId,
    status: 'completed',
    createdAt: Date.now(),
  };
}

function downloadURL(url, filename) {
  const link = document.createElement('a');
  link.href = toDownloadMediaURL(url);
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatResultTime(createdAt) {
  if (!createdAt) return '刚刚';
  const elapsed = Math.max(0, Date.now() - Number(createdAt));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function parseProgressPercent(message) {
  const match = String(message || '').match(/进度\s*(\d{1,3})%/);
  if (!match) return undefined;
  return Math.min(100, Math.max(0, Number(match[1])));
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
  className = '',
}) {
  return (
    <label
      className={className ? `mp-field ${className}` : 'mp-field'}
      data-xr-agent={agentKey || undefined}
    >
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
  className = '',
}) {
  const classes = [
    'mp-chip-field',
    compact ? 'is-compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={classes}
      data-xr-agent={agentKey || undefined}
    >
      <span>{label}</span>
      <div className='mp-chip-row'>
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

function ReferenceThumbCard({ item, index, onInsertMention, onRemove }) {
  const file = referenceFileOf(item);
  const mediaType = referenceMediaTypeOf(item);
  const alias = item?.alias || `${index + 1}`;
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const renderMedia = () => {
    if (mediaType === 'image' && previewUrl) {
      return <img src={previewUrl} alt={file?.name || `${alias} 参考图`} />;
    }
    if (mediaType === 'video' && previewUrl) {
      return <video src={previewUrl} muted playsInline preload='metadata' />;
    }
    if (mediaType === 'audio') {
      return (
        <div className='mp-upload-audio-card'>
          <div className='mp-upload-audio-icon'>
            <IconPlay />
          </div>
          <div className='mp-upload-audio-bars' aria-hidden='true'>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>音频素材</strong>
        </div>
      );
    }
    return (
      <div className='mp-upload-generic-card'>
        <IconUpload />
        <strong>素材文件</strong>
      </div>
    );
  };

  return (
    <div className='mp-upload-thumb-card'>
      <div className={`mp-upload-thumb-media is-${mediaType}`}>{renderMedia()}</div>
      <div className='mp-upload-thumb-meta'>
        <div className='mp-upload-thumb-head'>
          <strong className={`mp-reference-alias is-${mediaType}`}>{alias}</strong>
          <span className='mp-upload-thumb-type'>{referenceAliasPrefix(mediaType)}</span>
        </div>
        <span className='mp-upload-thumb-name' title={file?.name || ''}>
          {file?.name || '未命名文件'}
        </span>
      </div>
      <div className='mp-upload-thumb-actions'>
        {onInsertMention ? (
          <Button size='small' theme='borderless' onClick={() => onInsertMention(item)}>
            @引用
          </Button>
        ) : null}
        <Button
          size='small'
          theme='borderless'
          onClick={() => onRemove(item?.id || index)}
        >
          移除
        </Button>
      </div>
    </div>
  );
}

function MultiFileDrop({
  label,
  files,
  maxFiles,
  onFiles,
  onRemove,
  onInsertMention,
  accept = 'image/png,image/jpeg,image/webp',
  hint,
}) {
  const [isDragging, setIsDragging] = useState(false);

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
        {files.length > 0 ? (
          <div className='mp-upload-selection-state'>
            <div className='mp-upload-placeholder'>
              <IconUpload size='extra-large' />
            </div>
            <strong>{`已选 ${files.length} 个素材`}</strong>
          </div>
        ) : (
          <div className='mp-upload-placeholder'>
            <IconUpload size='extra-large' />
          </div>
        )}
        <span className='mp-upload-title'>{label}</span>
        <span className='mp-upload-hint'>
          {hint || `已选 ${files.length} / ${maxFiles} 张，拖入或点击上传 PNG / JPG / WebP`}
        </span>
        <input
          type='file'
          multiple
          accept={accept}
          className='mp-upload-input'
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      {files.length > 0 ? (
        <div className='mp-upload-thumb-grid'>
          {files.map((item, index) => {
            const file = referenceFileOf(item);
            return (
              <ReferenceThumbCard
                key={item?.id || `${file.name}-${file.lastModified}-${index}`}
                item={item}
                index={index}
                onInsertMention={onInsertMention}
                onRemove={onRemove}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MentionMenu({
  visible,
  items,
  activeIndex,
  query,
  onPick,
  onClose,
}) {
  if (!visible) return null;
  return (
    <div className='mp-mention-menu' role='listbox' aria-label='可能@的内容'>
      <div className='mp-mention-title'>
        <span>可能@的内容</span>
        {query ? <em>{query}</em> : null}
      </div>
      {items.length > 0 ? (
        <div className='mp-mention-options'>
          {items.map((item, index) => (
            <button
              key={item.id}
              type='button'
              role='option'
              aria-selected={activeIndex === index}
              className={activeIndex === index ? 'mp-mention-option active' : 'mp-mention-option'}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
              }}
            >
              <span className={`mp-mention-icon is-${item.mediaType}`}>
                {item.mediaType === 'audio' ? '音' : item.mediaType === 'video' ? '视' : '图'}
              </span>
              <span>
                <strong>{item.alias}</strong>
                <em>{referenceFileOf(item).name}</em>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className='mp-mention-empty'>当前没有可引用素材</div>
      )}
      <button
        type='button'
        className='mp-mention-close'
        onMouseDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        关闭
      </button>
    </div>
  );
}

function ResultCard({
  result,
  onContinueEdit,
  onUseAsReference,
  onInspect,
  selected = false,
  onToggleSelect,
}) {
  const previewUrls = getPreviewURLs(result);
  const [activeUrlIndex, setActiveUrlIndex] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const displayUrl = previewUrls[activeUrlIndex] || '';
  const originalUrl = normalizeURL(result.url);
  const cacheFailed = result.cacheStatus === 'failed';
  const previewUnavailable = previewFailed || !displayUrl;
  const usedFallbackPreview = activeUrlIndex > 0;
  const openUrl = originalUrl || displayUrl;
  const displayPrompt = firstPromptText(
    result.displayPrompt,
    result.revisedPrompt,
    result.prompt,
  );
  const statusText = cacheFailed
    ? '临时缓存不可用，作品已生成，请用原始链接保存。'
    : '浏览器暂时无法直接预览，请打开原始链接保存。';
  const kindLabel = result.kind === 'image' ? '图片作品' : '视频作品';
  const fileLabel = result.kind === 'image' ? 'PNG / URL' : 'MP4 / URL';
  const createdLabel = formatResultTime(result.createdAt);
  const taskLabel = result.taskId ? `任务 ${result.taskId}` : '即时结果';
  const promptFoldable = displayPrompt.length > 86;

  useEffect(() => {
    setActiveUrlIndex(0);
    setPreviewFailed(false);
    setPromptExpanded(false);
  }, [result.id, result.cachedUrl, result.displayUrl, result.url]);

  const handlePreviewError = () => {
    if (activeUrlIndex + 1 < previewUrls.length) {
      setActiveUrlIndex(activeUrlIndex + 1);
      return;
    }
    setPreviewFailed(true);
  };

  return (
    <div className={selected ? 'mp-result-card is-selected' : 'mp-result-card'}>
      <div className='mp-result-card-head'>
        <label className='mp-result-select'>
          <input
            type='checkbox'
            checked={selected}
            onChange={() => onToggleSelect?.(result.id)}
            aria-label='选择作品'
          />
          <span />
        </label>
        <div>
          <strong>{kindLabel}</strong>
          <span>{taskLabel}</span>
        </div>
        <Tag color={cacheFailed ? 'orange' : 'green'}>
          {cacheFailed ? '原始链接' : '已完成'}
        </Tag>
      </div>
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
        <span>{fileLabel}</span>
        <span>{createdLabel}</span>
        <span>72 小时内有效</span>
      </div>
      {displayPrompt ? (
        <div className={promptExpanded ? 'mp-result-prompt is-expanded' : 'mp-result-prompt'}>
          <div className='mp-result-prompt-head'>
            <span>Prompt 摘要</span>
            {promptFoldable ? (
              <button
                type='button'
                onClick={() => setPromptExpanded((value) => !value)}
              >
                {promptExpanded ? '收起' : '展开'}
              </button>
            ) : null}
          </div>
          <p>{displayPrompt}</p>
        </div>
      ) : null}
      <div className='mp-result-action-stack'>
        <div className='mp-result-next-actions' aria-label='下一步创作'>
          {result.kind === 'image' ? (
            <>
              <Button
                size='small'
                className='mp-btn-secondary is-strong'
                onClick={() => onContinueEdit?.(result)}
              >
                继续编辑
              </Button>
              <Button
                size='small'
                className='mp-btn-secondary'
                onClick={() => onUseAsReference?.(result)}
              >
                作为参考图
              </Button>
            </>
          ) : (
            <Button
              size='small'
              className='mp-btn-secondary'
              onClick={() => onUseAsReference?.(result)}
            >
              作为视频参考
            </Button>
          )}
        </div>
        <div className='mp-result-tool-actions' aria-label='作品工具'>
          <Button
            size='small'
            theme='borderless'
            className='mp-btn-tool'
            icon={<IconDownload />}
            onClick={() =>
              downloadURL(
                displayUrl || originalUrl,
                result.kind === 'image'
                  ? 'xingren-image.png'
                  : 'xingren-video.mp4',
              )
            }
          >
            下载
          </Button>
          <Button
            size='small'
            theme='borderless'
            className='mp-btn-ghost'
            icon={<IconExternalOpen />}
            onClick={() => onInspect?.(result)}
          >
            更多
          </Button>
        </div>
      </div>
    </div>
  );
}

const MediaPlayground = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('image');
  const [creativeTask, setCreativeTask] = useState('image-generate');
  const [imageWorkflow, setImageWorkflow] = useState('generate');
  const [videoWorkflow, setVideoWorkflow] = useState('text');
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].value);
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value);
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [models, setModels] = useState(EMPTY_MODELS);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const promptTextareaRef = useRef(null);
  const pollingCancelledRef = useRef(false);
  const imageEditModelLockRef = useRef('');
  const [mentionState, setMentionState] = useState({
    visible: false,
    start: 0,
    end: 0,
    query: '',
    activeIndex: 0,
  });
  const [promptComposing, setPromptComposing] = useState(false);
  const [negativePromptEnabled, setNegativePromptEnabled] = useState(false);
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
  const [customImageSize, setCustomImageSize] = useState('3840x2160');
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
  const [reversePromptFile, setReversePromptFile] = useState(null);
  const [reversePromptText, setReversePromptText] = useState('');
  const [reversePromptRunning, setReversePromptRunning] = useState(false);
  const [reversePromptMessage, setReversePromptMessage] = useState('');
  const [lastFrameFile, setLastFrameFile] = useState(null);
  const [maskFile, setMaskFile] = useState(null);
  const [results, setResults] = useState([]);
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [selectedResultIds, setSelectedResultIds] = useState([]);
  const [resultViewMode, setResultViewMode] = useState('grid');
  const [resultSort, setResultSort] = useState('newest');
  const [submitting, setSubmitting] = useState(false);
  const [videoPolling, setVideoPolling] = useState(false);
  const [activeVideoTask, setActiveVideoTask] = useState(null);
  const [liveQueueTasks, setLiveQueueTasks] = useState([]);
  const [taskMessage, setTaskMessage] = useState('');
  const [imageTaskLookup, setImageTaskLookup] = useState('');
  const [submitStartedAt, setSubmitStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  function upsertLiveQueueTask(task) {
    if (!task?.id) return;
    setLiveQueueTasks((current) => {
      const existing = current.find((item) => item.id === task.id);
      const nextTask = {
        ...(existing || {}),
        ...task,
        createdAt: task.createdAt || existing?.createdAt || Date.now(),
      };
      return [nextTask, ...current.filter((item) => item.id !== task.id)].slice(0, 12);
    });
  }

  function removeLiveQueueTask(id) {
    if (!id) return;
    setLiveQueueTasks((current) => current.filter((item) => item.id !== id));
  }

  useEffect(() => {
    document.body.classList.add('mp-route-active');
    return () => document.body.classList.remove('mp-route-active');
  }, []);

  useEffect(() => {
    if (!negativePromptEnabled) return;
    setNegativePrompt((current) => {
      if (!current.trim() || isBuiltinNegativePrompt(current)) {
        return defaultNegativePromptForMode(mode);
      }
      return current;
    });
  }, [mode, negativePromptEnabled]);

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
  const isImageModelAllowed = (modelValue) =>
    models.length === 0 || models.some((item) => item === modelValue);
  const isVideoModelAllowed = (modelValue) =>
    models.length === 0 ||
    models.some((item) => item === modelValue);
  const activeModel = mode === 'image' ? activeImageModel : activeVideoModel;
  const currentModelId = mode === 'image' ? imageModel : videoModel;
  const modelAllowed =
    mode === 'image' ? isImageModelAllowed(imageModel) : isVideoModelAllowed(videoModel);
  const effectiveGroup =
    mode === 'image' ? IMAGE_GENERATION_GROUP.value : group;
  const reversePromptGroup = IMAGE_GENERATION_GROUP.value;
  const visibleGroupOptions = mode === 'image' ? [IMAGE_GENERATION_GROUP] : groups;
  const defaultNegativePrompt = defaultNegativePromptForMode(mode);
  const activeNegativePrompt = negativePromptEnabled ? negativePrompt.trim() : '';
  const visibleResults = useMemo(() => {
    const sorted = [...results].sort((left, right) => {
      const leftTime = Number(left.createdAt || 0);
      const rightTime = Number(right.createdAt || 0);
      return resultSort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
    return sorted;
  }, [results, resultSort]);
  const inspectorResult = useMemo(
    () =>
      visibleResults.find((item) => selectedResultIds.includes(item.id)) || null,
    [selectedResultIds, visibleResults],
  );

  useEffect(() => {
    if (mode !== 'video' || models.length === 0 || isVideoModelAllowed(videoModel)) return;
    const nextModel = VIDEO_MODELS.find(
      (item) =>
        (!item.private || models.some((model) => model === item.value)) &&
        isVideoModelAllowed(item.value),
    );
    if (!nextModel?.value || nextModel.value === videoModel) return;
    const previousLabel = videoModelConfig(videoModel)?.label || videoModel;
    setVideoModel(nextModel.value);
    Toast.info(`当前分组未开放 ${previousLabel}，已切换到 ${nextModel.label}。`);
  }, [mode, models, videoModel]);

  const reservedVideoImageSlots = reservedLastFrameImageSlots(videoModel, videoWorkflow);
  const videoRefPolicy = useMemo(
    () => videoReferencePolicy(activeVideoModel, { reservedImageSlots: reservedVideoImageSlots }),
    [activeVideoModel, reservedVideoImageSlots],
  );
  const mentionCandidates = useMemo(() => {
    if (mode !== 'video' || videoWorkflow === 'text') return [];
    return referenceFiles
      .filter((item) => videoRefPolicy.allowedTypes.includes(referenceMediaTypeOf(item)))
      .map((item) => ({
        ...item,
        mediaType: referenceMediaTypeOf(item),
      }));
  }, [mode, referenceFiles, videoRefPolicy, videoWorkflow]);
  const mentionMenuItems = useMemo(() => {
    const query = mentionState.query.trim().toLowerCase();
    if (!query) return mentionCandidates;
    return mentionCandidates.filter((item) => {
      const file = referenceFileOf(item);
      return (
        String(item.alias || '').toLowerCase().includes(query) ||
        String(file?.name || '').toLowerCase().includes(query)
      );
    });
  }, [mentionCandidates, mentionState.query]);
  const referenceFileLimit =
    mode === 'image' ? IMAGE_EDIT_REFERENCE_LIMIT : videoRefPolicy.maxFiles;
  const imageRatioOptions =
    activeImageModel.aspectRatios?.length
      ? activeImageModel.aspectRatios
      : activeImageModel.sizes || [];
  const imageRatioValue = activeImageModel.aspectRatios?.length
    ? aspectRatio
    : size;
  const imagePixelLabel =
    mode === 'image'
      ? imagePixelSizeForModel(imageModel, imageRatioValue, resolution, customImageSize)
      : '';
  const inspectorImagePixelLabel =
    inspectorResult?.actualSize ||
    inspectorResult?.requestedSize ||
    imagePixelLabel;
  const imageDisplayRatio =
    mode === 'image' &&
    isGptImage2Model(imageModel) &&
    resolution === 'custom' &&
    imagePixelLabel &&
    imagePixelLabel !== '自定义尺寸待输入'
      ? aspectRatioLabelForPixelSize(imagePixelLabel)
      : imageRatioValue;
  const showImageRatioOptions =
    mode === 'image' &&
    imageRatioOptions.length > 0 &&
    !(isGptImage2Model(imageModel) && resolution === 'custom');
  const showGptImage2CustomSize =
    mode === 'image' && isGptImage2Model(imageModel) && resolution === 'custom';

  function promptTextarea() {
    const current = promptTextareaRef.current;
    if (!current) return null;
    if (current.tagName === 'TEXTAREA') return current;
    if (current.textAreaRef?.current) return current.textAreaRef.current;
    if (current.textAreaRef) return current.textAreaRef;
    if (current.input) return current.input;
    if (typeof current.querySelector === 'function') return current.querySelector('textarea');
    return null;
  }

  function closeMentionMenu() {
    setMentionState((current) => ({ ...current, visible: false, activeIndex: 0 }));
  }

  function syncMentionAtCursor(nextPrompt = prompt) {
    if (promptComposing || mode !== 'video' || videoWorkflow === 'text') {
      closeMentionMenu();
      return;
    }
    const textarea = promptTextarea();
    const cursor = textarea?.selectionStart ?? String(nextPrompt || '').length;
    const mention = mentionQueryAtCursor(nextPrompt, cursor);
    if (!mention) {
      closeMentionMenu();
      return;
    }
    setMentionState({
      visible: true,
      start: mention.start,
      end: mention.end,
      query: mention.query,
      activeIndex: 0,
    });
  }

  function insertPromptText(text, range = null) {
    const textarea = promptTextarea();
    const start = range?.start ?? textarea?.selectionStart ?? prompt.length;
    const end = range?.end ?? textarea?.selectionEnd ?? start;
    const before = prompt.slice(0, start);
    const after = prompt.slice(end);
    const needsLeadingSpace = before && !/\s$/.test(before);
    const needsTrailingSpace = after && !/^\s/.test(after);
    const insertion = `${needsLeadingSpace ? ' ' : ''}${text}${needsTrailingSpace ? ' ' : ''}`;
    const nextPrompt = clampPromptText(`${before}${insertion}${after}`);
    const nextCursor = Math.min(before.length + insertion.length, nextPrompt.length);
    setPrompt(nextPrompt);
    closeMentionMenu();
    window.requestAnimationFrame(() => {
      const nextTextarea = promptTextarea();
      if (!nextTextarea) return;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function insertReferenceMention(item, range = null) {
    if (!item?.alias) return;
    insertPromptText(
      referenceMentionMarker(item.alias),
      range || (mentionState.visible ? mentionState : null),
    );
  }

  function handlePromptChange(value) {
    const nextPrompt = clampPromptText(value);
    setPrompt(nextPrompt);
    window.requestAnimationFrame(() => syncMentionAtCursor(nextPrompt));
  }

  function handleNegativePromptEnabledChange(checked) {
    setNegativePromptEnabled(checked);
    if (checked) {
      setNegativePrompt((current) => current.trim() || defaultNegativePromptForMode(mode));
    }
  }

  function handlePromptKeyDown(event) {
    if (!mentionState.visible) return;
    if (event.nativeEvent?.isComposing || promptComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionState((current) => ({
        ...current,
        activeIndex: mentionMenuItems.length
          ? (current.activeIndex + 1) % mentionMenuItems.length
          : 0,
      }));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionState((current) => ({
        ...current,
        activeIndex: mentionMenuItems.length
          ? (current.activeIndex - 1 + mentionMenuItems.length) % mentionMenuItems.length
          : 0,
      }));
      return;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && mentionMenuItems.length > 0) {
      event.preventDefault();
      insertReferenceMention(mentionMenuItems[mentionState.activeIndex] || mentionMenuItems[0], mentionState);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionMenu();
    }
  }

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
      if (isGptImage2Model(activeImageModel.value)) {
        setCustomImageSize('3840x2160');
      }
    } else {
      setDuration(
        activeVideoModel.defaultDuration ||
          activeVideoModel.durations?.[0] ||
          5,
      );
      setFps(activeVideoModel.defaultFps || 24);
      setResolution(
        activeVideoModel.defaultResolution ||
          activeVideoModel.resolutions?.[0] ||
          'auto',
      );
    }
  }, [activeModel, activeImageModel, activeVideoModel, mode]);

  useEffect(() => {
    setReferenceFiles((files) => {
      if (mode !== 'video') {
        return files.length > referenceFileLimit
          ? files.slice(0, referenceFileLimit)
          : files;
      }
      const allowed = filterReferenceItemsByPolicy(files, videoRefPolicy);
      return allowed.length > referenceFileLimit
        ? allowed.slice(0, referenceFileLimit)
        : allowed;
    });
  }, [mode, referenceFileLimit, videoRefPolicy]);

  useEffect(() => {
    if (!mentionState.visible) return;
    if (mentionMenuItems.length === 0) {
      setMentionState((current) => ({ ...current, activeIndex: 0 }));
      return;
    }
    if (mentionState.activeIndex >= mentionMenuItems.length) {
      setMentionState((current) => ({
        ...current,
        activeIndex: mentionMenuItems.length - 1,
      }));
    }
  }, [mentionMenuItems.length, mentionState.activeIndex, mentionState.visible]);

  useEffect(() => {
    closeMentionMenu();
  }, [mode, videoWorkflow, videoModel]);

  useEffect(() => {
    if (mode !== 'video' || !activeVideoModel.workflows?.length) return;
    if (!activeVideoModel.workflows.includes(videoWorkflow)) {
      setVideoWorkflow(activeVideoModel.workflows[0]);
    }
  }, [activeVideoModel, mode, videoWorkflow]);

  useEffect(() => {
    setResults(restoreStoredResults());
    setResultsLoaded(true);
  }, []);

  useEffect(() => {
    pollingCancelledRef.current = false;
    return () => { pollingCancelledRef.current = true; };
  }, []);

  useEffect(() => {
    if (!resultsLoaded) return;
    persistResults(results);
  }, [results, resultsLoaded]);

  useEffect(() => {
    if ((!submitting && !videoPolling) || !submitStartedAt) {
      setElapsedSeconds(0);
      return undefined;
    }
    const updateElapsed = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - submitStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [submitting, videoPolling, submitStartedAt]);

  function addReferenceFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    if (mode === 'video') {
      const counts = videoReferenceCounts(referenceFiles);
      const accepted = [];
      let rejected = 0;
      const counters = nextReferenceCounters(referenceFiles);
      incoming.forEach((file) => {
        const type = fileMediaType(file);
        if (!videoRefPolicy.allowedTypes.includes(type)) {
          rejected += 1;
          return;
        }
        if (counts[type] >= (videoRefPolicy.limits[type] || 0)) {
          rejected += 1;
          return;
        }
        counts[type] += 1;
        accepted.push(createReferenceItem(file, counters));
      });
      if (accepted.length === 0) {
        Toast.warning(`当前模型最多支持 ${videoRefPolicy.limitLabel}。`);
        return;
      }
      setReferenceFiles((current) =>
        [...current, ...accepted].slice(0, referenceFileLimit),
      );
      if (rejected > 0) {
        Toast.warning(`已按模型限制保留素材：${videoRefPolicy.limitLabel}。`);
      }
      return;
    }

    const available = referenceFileLimit - referenceFiles.length;
    if (available <= 0) {
      Toast.warning(`最多支持上传 ${referenceFileLimit} 张参考图。`);
      return;
    }
    const counters = nextReferenceCounters(referenceFiles);
    const accepted = incoming
      .slice(0, available)
      .map((file) => createReferenceItem(file, counters));
    setReferenceFiles((current) =>
      [...current, ...accepted].slice(0, referenceFileLimit),
    );
    if (incoming.length > accepted.length) {
      Toast.warning(
        `最多支持上传 ${referenceFileLimit} 张参考图，已保留前 ${referenceFileLimit} 张。`,
      );
    }
  }

  function removeReferenceFile(idOrIndex) {
    setReferenceFiles((files) =>
      files.filter((item, itemIndex) => item.id !== idOrIndex && itemIndex !== idOrIndex),
    );
  }

  function addReversePromptFileAsReference(file) {
    if (!file) return;
    if (referenceFiles.some((item) => referenceFileOf(item) === file)) return;
    if (referenceFiles.length >= IMAGE_EDIT_REFERENCE_LIMIT) {
      Toast.warning(`最多支持上传 ${IMAGE_EDIT_REFERENCE_LIMIT} 张参考图。`);
      return;
    }
    setReferenceFiles((current) => {
      if (current.some((item) => referenceFileOf(item) === file)) return current;
      if (current.length >= IMAGE_EDIT_REFERENCE_LIMIT) return current;
      const counters = nextReferenceCounters(current);
      return [...current, createReferenceItem(file, counters)];
    });
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
        if (imageWorkflow === 'edit' && isGoogleImageEditModel(imageModel)) {
          if (effectiveAspectRatio) payload.aspect_ratio = effectiveAspectRatio;
          if (resolution && resolution !== 'auto') {
            payload.resolution = String(resolution).toUpperCase();
            payload.image_size = String(resolution).toUpperCase();
          }
          payload.size = googleImageEditSizeFor(effectiveAspectRatio, resolution, imageModel);
          if (quality) payload.quality = quality;
          if (activeNegativePrompt)
            payload.extra_fields = { negative_prompt: activeNegativePrompt };
          return payload;
        }
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
        if (activeNegativePrompt)
          payload.extra_fields = { negative_prompt: activeNegativePrompt };
        return payload;
      }
      const isGptImage2 = isGptImage2Model(imageModel);
      payload.n = effectiveCount;
      payload.size = isGptImage2
        ? gptImage2SizeFor(effectiveAspectRatio, resolution, customImageSize)
        : size;
      if (isGptImage2 && resolution && resolution !== 'auto' && resolution !== 'custom')
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
      if (activeNegativePrompt)
        payload.extra_fields = { negative_prompt: activeNegativePrompt };
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
      ratio: SIZE_TO_ASPECT_RATIO[size] || undefined,
      resolution: activeVideoModel.value === 'seedance-sd2-fast-720p'
        ? '720P'
        : activeVideoModel.resolutions?.includes(resolution)
          ? resolution
          : undefined,
      metadata: {},
    };
    if (seed.trim()) payload.seed = Number(seed);
    if (activeNegativePrompt)
      payload.metadata.negative_prompt = activeNegativePrompt;
    if (
      activeVideoModel.value === 'seedance-2.0-ld-17' ||
      activeVideoModel.officialSeedanceReferences ||
      activeVideoModel.extendedSeedance
    ) {
      if (videoWorkflow !== 'text') {
        payload.references = ['上传的参考素材会在提交时自动填入'];
      }
    } else if (videoWorkflow === 'image') {
      payload.image = '上传的第一张参考图会在提交时自动填入';
      payload.images = ['最多 5 张参考图会在提交时自动填入'];
    } else if (videoWorkflow === 'first-last') {
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
    customImageSize,
    duration,
    effectiveGroup,
    enhancePrompt,
    format,
    fps,
    imageModel,
    imageWorkflow,
    inputFidelity,
    mode,
    activeNegativePrompt,
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
    activeVideoModel,
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

  async function cacheReferenceMedia(reference, mediaType, role, index) {
    const file = referenceFileOf(reference);
    const dataUrl = await fileToDataURL(file);
    const res = await API.post(
      '/pg/media/cache',
      {
        url: dataUrl,
        kind: mediaType,
        metadata: {
          role: 'reference',
          media_type: mediaType,
          reference_role: role,
          reference_index: index + 1,
          reference_alias: reference?.alias || '',
          hidden: true,
          public_reference: true,
          source: 'video_input',
          model: videoModel,
          workflow: videoWorkflow,
        },
      },
      { skipErrorHandler: true },
    );
    if (!res.data?.success || !res.data?.data?.url) {
      throw new Error(res.data?.message || '参考素材缓存失败。');
    }
    return toAbsoluteMediaURL(
      res.data.data.upstream_url || res.data.data.public_url || res.data.data.url,
    );
  }

  async function cacheReversePromptImage(file) {
    const dataUrl = await fileToDataURL(file);
    const res = await API.post(
      '/pg/media/cache',
      {
        url: dataUrl,
        kind: 'image',
        metadata: {
          role: 'reference',
          reference_role: 'reverse_prompt',
          hidden: true,
          public_reference: true,
          public_reference_reason: 'reverse_prompt_upstream_url',
          source: 'reverse_prompt',
          model: REVERSE_PROMPT_MODEL,
          target_model: imageModel,
        },
      },
      { skipErrorHandler: true },
    );
    if (!res.data?.success || !res.data?.data?.url) {
      throw new Error(res.data?.message || '参考图缓存失败。');
    }
    return toAbsoluteMediaURL(
      res.data.data.upstream_url || res.data.data.public_url || res.data.data.url,
    );
  }

  async function reverseImagePrompt() {
    const validationError = validateReversePromptImage(reversePromptFile);
    if (validationError) {
      Toast.error(validationError);
      return;
    }

    let useReferenceImage = await askReversePromptReferenceMode();
    if (useReferenceImage && !activeImageModel.edit) {
      Toast.warning('当前模型不支持参考图输入，已按文生图提示词处理。');
      useReferenceImage = false;
    }

    setMode('image');
    setImageWorkflow(useReferenceImage ? 'edit' : 'generate');
    if (useReferenceImage) addReversePromptFileAsReference(reversePromptFile);
    setReversePromptRunning(true);
    setReversePromptMessage('正在上传图片并调用图像识别模型...');
    try {
      const imageUrl = await cacheReversePromptImage(reversePromptFile);
      setReversePromptMessage('图片已上传，正在反推两套可生成提示词...');
      const res = await API.post(
        '/pg/chat/completions',
        {
          model: REVERSE_PROMPT_MODEL,
          group: reversePromptGroup,
          stream: false,
          temperature: 0.2,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${REVERSE_PROMPT_INSTRUCTION}\n\n目标生成模型：${activeImageModel.label || imageModel}。`,
                },
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
              ],
            },
          ],
        },
        { skipErrorHandler: true, timeout: 180000 },
      );
      if (res.data?.error?.message) throw new Error(res.data.error.message);
      const parsedPrompt = parseReversePromptResult(res.data);
      const nextPrompt = useReferenceImage
        ? parsedPrompt.referencePrompt
        : parsedPrompt.textPrompt;
      if (!nextPrompt) throw new Error('反推结果为空，请换一张图片重试。');
      setReversePromptText(nextPrompt);
      handlePromptChange(nextPrompt);
      setReversePromptMessage(
        useReferenceImage
          ? '已生成参考图模式提示词，并自动加入下方参考图。'
          : '已生成文生图模式提示词，并写入画面描述。',
      );
      Toast.success('图像提示词已反推');
    } catch (error) {
      const message = userFacingReversePromptError(error);
      setReversePromptMessage(message);
      Toast.error(message);
    } finally {
      setReversePromptRunning(false);
    }
  }

  function applyReversePrompt() {
    const nextPrompt = reversePromptText.trim();
    if (!nextPrompt) {
      Toast.warning('暂无可套用的反推提示词。');
      return;
    }
    setMode('image');
    handlePromptChange(nextPrompt);
    Toast.success('已套用反推提示词');
  }

  async function applyVideoReferences(payload) {
    if (videoWorkflow !== 'image' && videoWorkflow !== 'first-last') return payload;

    const isOfficialReferencesModel =
      isOfficialSeedanceReferenceModel(videoModel) || isExtendedSeedanceVideoModel(videoModel);
    const imageReferenceItems = referenceFiles.filter((item) => referenceMediaTypeOf(item) === 'image');
    const referenceItemsForModel =
      videoWorkflow === 'first-last'
        ? imageReferenceItems.slice(0, 1)
        : videoModel === 'seedance-sd2-fast-720p'
          ? imageReferenceItems
          : referenceFiles;
    const limitedReferenceItems = isOfficialReferencesModel
      ? filterReferenceItemsByPolicy(referenceItemsForModel, videoRefPolicy)
      : referenceItemsForModel;
    const orderedReferenceItems = isOfficialReferencesModel
      ? orderedReferencesForPrompt(payload.prompt || '', limitedReferenceItems)
      : limitedReferenceItems;

    const references = await Promise.all(
      orderedReferenceItems.map(async (item, index) => {
        const mediaType = isOfficialReferencesModel ? referenceMediaTypeOf(item) : 'image';
        const role =
          mediaType === 'video'
            ? 'reference_video'
            : mediaType === 'audio'
              ? 'reference_audio'
              : videoWorkflow === 'first-last' && index === 0
                ? 'first_frame'
                : 'reference_image';
        return {
          mediaType,
          role,
          alias: item.alias || `${referenceAliasPrefix(mediaType)}${index + 1}`,
          url: await cacheReferenceMedia(item, mediaType, role, index),
        };
      }),
    );
    if (videoWorkflow === 'first-last' && lastFrameFile) {
      references.push({
        mediaType: 'image',
        role: 'last_frame',
        alias: `尾帧${references.length + 1}`,
        url: await cacheReferenceMedia(lastFrameFile, 'image', 'last_frame', references.length),
      });
    }
    if (references.length === 0) return payload;

    if (isOfficialReferencesModel) {
      const shouldForwardReferenceAliases = !activeVideoModel.extendedSeedance;
      const officialReferences = references
        .filter((item) => ['image', 'video', 'audio'].includes(item.mediaType))
        .map((item) => ({
          media_type: item.mediaType,
          role: item.role,
          url: item.url,
          ...(shouldForwardReferenceAliases ? { alias: item.alias } : {}),
        }));
      const referenceAliases = shouldForwardReferenceAliases
        ? officialReferences.map((item) => item.alias).filter(Boolean)
        : [];
      return {
        ...payload,
        references: officialReferences,
        prompt: shouldForwardReferenceAliases
          ? promptWithReferenceAliases(payload.prompt || '', referenceAliases)
          : payload.prompt || '',
        metadata: {
          ...(payload.metadata || {}),
          ...(shouldForwardReferenceAliases
            ? {
              reference_aliases: referenceAliases,
              reference_mentions: sortedReferenceMentions(payload.prompt || '', orderedReferenceItems).map((item) => item.alias),
            }
            : {}),
        },
      };
    }

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
    const lockedEditModel =
      imageWorkflow === 'edit' ? imageEditModelLockRef.current : '';
    if (lockedEditModel && !isImageModelAllowed(lockedEditModel)) {
      imageEditModelLockRef.current = '';
      throw new Error('原结果模型当前不可用，请先手动选择可用模型。');
    }
    const effectiveRequestPayload =
      lockedEditModel && lockedEditModel !== requestPayload.model
        ? { ...requestPayload, model: lockedEditModel }
        : requestPayload;
    const submittedPrompt = firstPromptText(effectiveRequestPayload.prompt, prompt);
    const submittedModel = effectiveRequestPayload.model || imageModel;
    const submittedModelLabel =
      imageModelConfig(submittedModel)?.label ||
      activeImageModel.label ||
      submittedModel;
    if (imageWorkflow === 'edit') {
      const form = new FormData();
      Object.entries(effectiveRequestPayload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        form.set(
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        );
      });
      referenceFiles.forEach((item) => form.append('image', referenceFileOf(item)));
      if (maskFile) form.set('mask', maskFile);
      response = await API.post('/pg/images/tasks/edits', form, {
        skipErrorHandler: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: IMAGE_REQUEST_TIMEOUT_MS,
      });
    } else {
      response = await API.post('/pg/images/tasks/generations', effectiveRequestPayload, {
        skipErrorHandler: true,
        timeout: IMAGE_REQUEST_TIMEOUT_MS,
      });
    }
    const payload = response.data;
    if (payload?.error?.message) throw new Error(payload.error.message);
    if (!payload?.success) throw new Error(payload?.message || '图像任务提交失败。');
    const taskId = getImageTaskId(payload);
    if (!taskId) throw new Error('图像任务提交成功但没有返回任务 ID。');
    setImageTaskLookup(taskId);
    setTaskMessage(`图像任务已提交：${taskId}，正在等待持久化结果...`);
    upsertLiveQueueTask({
      id: taskId,
      title: '图片生成中',
      kind: 'image',
      model: submittedModelLabel,
      status: 'running',
      statusText: '生成中',
      progress: 3,
      createdAt: Date.now(),
      message: `图像任务已提交：${taskId}`,
    });
    let result;
    try {
      result = await pollImageTask(
        taskId,
        submittedPrompt,
        submittedModel,
        submittedModelLabel,
      );
    } catch (error) {
      upsertLiveQueueTask({
        id: taskId,
        title: '图片生成失败',
        kind: 'image',
        model: submittedModelLabel,
        status: 'failed',
        statusText: '失败',
        progress: 100,
        message: generationErrorMessage(error),
      });
      throw error;
    }
    if (!result) return;
    removeLiveQueueTask(taskId);
    setResults((prev) => [result, ...prev]);
    setSelectedResultIds((prev) =>
      prev.includes(result.id) ? prev : [result.id, ...prev],
    );
    Toast.success('图像已生成，请立即下载保存。');
  }

  async function pollImageTask(
    taskId,
    submittedPrompt = '',
    submittedModel = '',
    submittedModelLabel = '',
  ) {
    const startedAt = Date.now();
    const deadline = Date.now() + 30 * 60 * 1000;
    let longWaitNotified = false;
    let veryLongWaitNotified = false;
    while (Date.now() < deadline) {
      if (pollingCancelledRef.current) return null;
      const elapsedMs = Date.now() - startedAt;
      try {
        const res = await API.get(`/pg/images/tasks/${encodeURIComponent(taskId)}`, {
          skipErrorHandler: true,
          disableDuplicate: true,
          timeout: IMAGE_POLL_REQUEST_TIMEOUT_MS,
        });
        if (res.data?.error?.message) throw new Error(res.data.error.message);
        if (!res.data?.success || !res.data?.data) {
          throw new Error(res.data?.message || '图像任务查询失败。');
        }
        const status = getImageTaskStatus(res.data);
        const progress = getImageTaskProgress(res.data);
        if (!longWaitNotified && elapsedMs >= IMAGE_LONG_WAIT_MS) {
          longWaitNotified = true;
          Toast.info(IMAGE_LONG_WAIT_MESSAGE);
        }
        if (!veryLongWaitNotified && elapsedMs >= IMAGE_VERY_LONG_WAIT_MS) {
          veryLongWaitNotified = true;
          Toast.info(IMAGE_VERY_LONG_WAIT_MESSAGE);
        }
        let waitSuffix = '';
        if (elapsedMs >= IMAGE_VERY_LONG_WAIT_MS) {
          waitSuffix = '，已进入长尾等待，后台仍会继续保留结果';
        } else if (elapsedMs >= IMAGE_LONG_WAIT_MS) {
          waitSuffix = '，生成耗时较长，请继续等待或稍后用任务 ID 查询';
        }
        const nextMessage = `图像任务 ${res.data.data.task_id}：${status}，进度 ${progress}%${waitSuffix}`;
        setTaskMessage(nextMessage);
        upsertLiveQueueTask({
          id: taskId,
          title: '图片生成中',
          kind: 'image',
          status: status === 'completed' ? 'running' : status || 'running',
          statusText: status === 'completed' ? '回收结果' : status || '生成中',
          progress,
          message: nextMessage,
        });
        if (status === 'completed') {
          const result = imageTaskToResult(
            res.data.data,
            submittedPrompt,
            submittedModel,
            submittedModelLabel,
          );
          if (result) return result;
          throw new Error('图像任务完成但没有返回持久化图片。');
        }
        if (status === 'failed') {
          upsertLiveQueueTask({
            id: taskId,
            title: '图片生成失败',
            kind: 'image',
            status: 'failed',
            statusText: '失败',
            progress: 100,
            message:
              res.data.data.fail_reason ||
              res.data.data.data?.error ||
              '图像任务失败。',
          });
          throw createTerminalImageTaskError(
            res.data.data.fail_reason ||
              res.data.data.data?.error ||
              '图像任务失败。',
          );
        }
      } catch (error) {
        if (error?.imageTaskTerminal) throw error;
        if (!isTransientImagePollError(error)) throw error;
        let waitSuffix = '，页面会继续查询，不会中断后台生成任务';
        if (!longWaitNotified && elapsedMs >= IMAGE_LONG_WAIT_MS) {
          longWaitNotified = true;
          Toast.info(IMAGE_LONG_WAIT_MESSAGE);
        }
        if (elapsedMs >= IMAGE_VERY_LONG_WAIT_MS) {
          waitSuffix = '，后台仍会保留结果，可稍后用任务 ID 查询';
          if (!veryLongWaitNotified) {
            veryLongWaitNotified = true;
            Toast.info(IMAGE_VERY_LONG_WAIT_MESSAGE);
          }
        }
        const nextMessage = `图像任务 ${taskId} 查询暂时失败：${imagePollErrorMessage(error)}${waitSuffix}`;
        setTaskMessage(nextMessage);
        upsertLiveQueueTask({
          id: taskId,
          title: '图片生成中',
          kind: 'image',
          status: 'running',
          statusText: '轮询中',
          progress: parseProgressPercent(nextMessage),
          message: nextMessage,
        });
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
        setSelectedResultIds((prev) =>
          prev.includes(result.id) ? prev : [result.id, ...prev],
        );
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
      Toast.error(userFacingGenerationError(generationErrorMessage(error)));
    } finally {
      setSubmitting(false);
      setTaskMessage('');
    }
  }

  async function pollVideo(taskId) {
    const startedAt = Date.now();
    const deadline = startedAt + VIDEO_MAX_PAGE_POLL_MS;
    let longWaitNotified = false;
    let backgroundNotified = false;
    setVideoPolling(true);
    while (Date.now() < deadline) {
      if (pollingCancelledRef.current) return null;
      try {
        const res = await API.get(`/pg/videos/${encodeURIComponent(taskId)}`, {
          skipErrorHandler: true,
          disableDuplicate: true,
        });
        const status = getVideoStatus(res.data);
        const progress = getVideoProgress(res.data);
        const url = extractVideoURL(res.data);
        const elapsedMs = Date.now() - startedAt;
        let waitSuffix = '';
        if (!longWaitNotified && elapsedMs >= VIDEO_LONG_WAIT_MS) {
          Toast.info('视频任务仍在生成中，请不要重复提交，完成后会自动回写日志和媒体工坊。');
          longWaitNotified = true;
        }
        if (elapsedMs >= VIDEO_BACKGROUND_WAIT_MS) {
          waitSuffix = '，已转入长时间后台轮询，生成完成后会回写日志和媒体工坊';
          if (!backgroundNotified) {
            Toast.info('视频任务耗时较长，页面将低频轮询；请稍后在日志或媒体工坊查看结果。');
            backgroundNotified = true;
          }
        }
        const nextMessage = `视频任务 ${status}，进度 ${progress}%${waitSuffix}`;
        setTaskMessage(nextMessage);
        upsertLiveQueueTask({
          id: taskId,
          title: '视频生成中',
          kind: 'video',
          model: activeVideoModel.label,
          status: status === 'completed' ? 'polling' : status || 'polling',
          statusText: status === 'completed' ? '回收结果' : status || '轮询中',
          progress,
          message: nextMessage,
        });
        if (url) return createVideoResult(
          res.data,
          url,
          taskId,
          videoModel,
          activeVideoModel.label,
        );
        if (status === 'failed') {
          upsertLiveQueueTask({
            id: taskId,
            title: '视频生成失败',
            kind: 'video',
            model: activeVideoModel.label,
            status: 'failed',
            statusText: '失败',
            progress: 100,
            message: extractVideoFailureReason(res.data) || '视频任务失败。',
          });
          throw new Error(extractVideoFailureReason(res.data) || '视频任务失败。');
        }
        if (status === 'completed') {
          throw new Error('视频完成但没有返回视频地址。');
        }
      } catch (error) {
        if (!isTransientVideoPollError(error)) throw error;
        const elapsedMs = Date.now() - startedAt;
        let waitSuffix = '，页面会继续轮询，不会中断生成任务';
        if (!longWaitNotified && elapsedMs >= VIDEO_LONG_WAIT_MS) {
          Toast.info('视频任务仍在生成中，请不要重复提交，完成后会自动回写日志和媒体工坊。');
          longWaitNotified = true;
        }
        if (elapsedMs >= VIDEO_BACKGROUND_WAIT_MS) {
          waitSuffix = '，已转入长时间后台轮询，生成完成后会回写日志和媒体工坊';
          if (!backgroundNotified) {
            Toast.info('视频任务耗时较长，页面将低频轮询；请稍后在日志或媒体工坊查看结果。');
            backgroundNotified = true;
          }
        }
        const nextMessage = `视频任务查询暂时失败：${videoPollErrorMessage(error)}${waitSuffix}`;
        setTaskMessage(nextMessage);
        upsertLiveQueueTask({
          id: taskId,
          title: '视频生成中',
          kind: 'video',
          model: activeVideoModel.label,
          status: 'polling',
          statusText: '轮询中',
          progress: parseProgressPercent(nextMessage),
          message: nextMessage,
        });
      }
      const elapsedMs = Date.now() - startedAt;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          elapsedMs >= VIDEO_BACKGROUND_WAIT_MS
            ? VIDEO_BACKGROUND_POLL_INTERVAL_MS
            : VIDEO_POLL_INTERVAL_MS,
        ),
      );
    }
    return null;
  }

  async function submitVideo() {
    let payload;
    if (videoModel === 'grok-video-1.5') {
      const reference = referenceFiles.find((item) => referenceMediaTypeOf(item) === 'image');
      const file = referenceFileOf(reference);
      if (!file) throw new Error('Grok Video 1.5 必须上传一张参考图片。');
      payload = new FormData();
      payload.set('model', videoModel);
      payload.set('prompt', prompt.trim());
      payload.set('seconds', String(duration));
      payload.set('size', size);
      payload.set('input_reference', file);
    } else {
      payload = await applyVideoReferences({ ...requestPayload });
    }
    const res = await API.post('/pg/videos', payload, {
      skipErrorHandler: true,
    });
    if (res.data?.error?.message) throw new Error(res.data.error.message);
    const directUrl = extractVideoURL(res.data);
    if (directUrl) {
      const result = createVideoResult(
        res.data,
        directUrl,
        '',
        videoModel,
        activeVideoModel.label,
      );
      const cached = await cacheMedia(result);
      setResults((prev) => [cached, ...prev]);
      setSelectedResultIds((prev) =>
        prev.includes(cached.id) ? prev : [cached.id, ...prev],
      );
      Toast.success('视频已生成，请立即下载保存。');
      return;
    }
    const taskId = getVideoTaskId(res.data);
    if (!taskId) throw new Error('视频任务提交成功但没有返回任务 ID。');
    setActiveVideoTask({
      taskId,
      model: activeVideoModel.label,
      workflow: workflowLabel,
      spec: outputSpec,
    });
    setVideoPolling(true);
    setTaskMessage(`视频任务已提交：${taskId}，页面保持打开时会后台自动轮询结果。`);
    upsertLiveQueueTask({
      id: taskId,
      title: '视频生成中',
      kind: 'video',
      model: activeVideoModel.label,
      status: 'polling',
      statusText: '轮询中',
      progress: 3,
      createdAt: Date.now(),
      message: `视频任务已提交：${taskId}`,
    });
    Toast.info('视频任务已进入后台轮询，可以继续修改提示词或参数。');
    window.setTimeout(async () => {
      let keepTaskMessage = false;
      try {
        const result = await pollVideo(taskId);
        if (!result) {
          Toast.info('页面轮询已暂停，任务仍在后台继续生成，完成后会写入日志和媒体工坊。');
          setTaskMessage(`视频任务 ${taskId} 已转入后台生成，完成后可在任务日志和媒体工坊查看。`);
          keepTaskMessage = true;
          return;
        }
        const cached = await cacheMedia(result);
        removeLiveQueueTask(taskId);
        setResults((prev) => [cached, ...prev]);
        setSelectedResultIds((prev) =>
          prev.includes(cached.id) ? prev : [cached.id, ...prev],
        );
        Toast.success('视频已生成，请立即下载保存。');
      } catch (error) {
        upsertLiveQueueTask({
          id: taskId,
          title: '视频生成失败',
          kind: 'video',
          model: activeVideoModel.label,
          status: 'failed',
          statusText: '失败',
          progress: 100,
          message: generationErrorMessage(error),
        });
        Toast.error(userFacingGenerationError(generationErrorMessage(error)));
        setTaskMessage(`视频任务 ${taskId} 后台轮询结束：${generationErrorMessage(error)}`);
        keepTaskMessage = true;
      } finally {
        setVideoPolling(false);
        setActiveVideoTask(null);
        if (!keepTaskMessage) {
          setTaskMessage('');
        }
        setSubmitStartedAt(null);
      }
    }, 0);
  }

  async function handleSubmit() {
    if (!modelAllowed) return Toast.error('当前用户分组暂未开放这个模型。');
    if (!prompt.trim()) return Toast.error('请先写一句你想生成什么。');
    if (mode === 'image' && isGptImage2Model(imageModel) && resolution === 'custom') {
      const sizeError = gptImage2CustomSizeError(customImageSize);
      if (sizeError) return Toast.error(sizeError);
    }
    if (mode === 'image' && imageWorkflow === 'edit' && referenceFiles.length === 0)
      return Toast.error('图像修改需要先上传参考图。');
    if (mode === 'video' && videoWorkflow !== 'text' && referenceFiles.length === 0)
      return Toast.error('图生视频需要先上传首帧或参考素材。');
    if (mode === 'video' && activeVideoModel.requiresImage) {
      const counts = videoReferenceCounts(referenceFiles);
      if (videoWorkflow !== 'image' || counts.image !== 1) {
        return Toast.error('Grok Video 1.5 必须且只能上传一张参考图片。');
      }
    }
    if (mode === 'video' && videoWorkflow !== 'text') {
      const counts = videoReferenceCounts(referenceFiles);
      if (videoWorkflow === 'first-last' && counts.image === 0) {
        return Toast.error('首尾帧视频需要先上传首帧图片。');
      }
      if (videoModel === 'seedance-sd2-fast-720p' && counts.image === 0) {
        return Toast.error('Seedance SD Fast 只支持图片参考，请先上传图片素材。');
      }
    }
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
      Toast.error(userFacingGenerationError(generationErrorMessage(error)));
    } finally {
      setSubmitting(false);
      if (mode === 'image') {
        setTaskMessage('');
        setSubmitStartedAt(null);
      }
    }
  }

  const handleRemoveResult = (id) => {
    setResults((prev) => prev.filter((item) => item.id !== id));
    setSelectedResultIds((prev) => prev.filter((item) => item !== id));
  };
  const inspectorResultPreview = inspectorResult
    ? getPreviewURLs(inspectorResult)[0] || ''
    : '';
  const inspectorResultPrompt = inspectorResult
    ? firstPromptText(
      inspectorResult.displayPrompt,
      inspectorResult.revisedPrompt,
      inspectorResult.prompt,
    )
    : '';
  const allVisibleResultsSelected =
    visibleResults.length > 0 &&
    visibleResults.every((item) => selectedResultIds.includes(item.id));
  const toggleResultSelection = (id) => {
    setSelectedResultIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const toggleAllVisibleResults = () => {
    setSelectedResultIds((prev) => {
      const visibleIds = visibleResults.map((item) => item.id);
      if (visibleIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  function scrollWorkbenchTo(id) {
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function inspectResult(item) {
    setSelectedResultIds((prev) =>
      prev.includes(item.id) ? prev : [item.id, ...prev],
    );
    scrollWorkbenchTo('mp-context-panel');
  }

  function selectCreativeTask(task, nextWorkflow) {
    imageEditModelLockRef.current = '';
    if (task === 'image-edit' && !activeImageModel.edit) {
      Toast.warning('当前模型不支持图片编辑，请先更换模型。');
      return;
    }
    setCreativeTask(task);
    if (task === 'video') {
      setMode('video');
      if (nextWorkflow) setVideoWorkflow(nextWorkflow);
      return;
    }
    setMode('image');
    if (task === 'image-edit') {
      setImageWorkflow('edit');
      return;
    }
    if (task === 'reverse') {
      setImageWorkflow('generate');
      scrollWorkbenchTo('mp-reverse-workbench');
      return;
    }
    setImageWorkflow('generate');
  }

  function appendImageReferenceFile(file, successMessage) {
    if (!file) return false;
    if (fileMediaType(file) !== 'image') {
      Toast.warning('当前区域只支持图片素材。');
      return false;
    }
    if (referenceFiles.length >= IMAGE_EDIT_REFERENCE_LIMIT) {
      Toast.warning(`最多支持上传 ${IMAGE_EDIT_REFERENCE_LIMIT} 张参考图。`);
      return false;
    }
    setReferenceFiles((current) => {
      if (current.length >= IMAGE_EDIT_REFERENCE_LIMIT) return current;
      const counters = nextReferenceCounters(current);
      return [...current, createReferenceItem(file, counters)].slice(0, IMAGE_EDIT_REFERENCE_LIMIT);
    });
    if (successMessage) Toast.success(successMessage);
    return true;
  }

  function appendVideoReferenceFile(file, successMessage) {
    if (!file) return false;
    const targetPolicy = videoReferencePolicy(activeVideoModel, {
      reservedImageSlots: reservedLastFrameImageSlots(videoModel, 'image'),
    });
    const type = fileMediaType(file);
    if (!targetPolicy.allowedTypes.includes(type)) {
      Toast.warning(`当前视频模型支持 ${targetPolicy.limitLabel}。`);
      return false;
    }
    const counts = videoReferenceCounts(referenceFiles);
    if (counts[type] >= (targetPolicy.limits[type] || 0)) {
      Toast.warning(`当前视频模型最多支持 ${targetPolicy.limitLabel}。`);
      return false;
    }
    setReferenceFiles((current) => {
      const currentCounts = videoReferenceCounts(current);
      if (currentCounts[type] >= (targetPolicy.limits[type] || 0)) return current;
      const counters = nextReferenceCounters(current);
      return [...current, createReferenceItem(file, counters)].slice(0, targetPolicy.maxFiles);
    });
    if (successMessage) Toast.success(successMessage);
    return true;
  }

  async function loadResultImageModelValue(result) {
    const sourceModelValue = resultImageModelValue(result);
    if (sourceModelValue) return sourceModelValue;
    if (!result?.taskId) return '';
    try {
      const res = await API.get(`/pg/images/tasks/${encodeURIComponent(result.taskId)}`, {
        skipErrorHandler: true,
        disableDuplicate: true,
      });
      const task = res.data?.data || {};
      const item = task.item || task.data?.item || {};
      const modelValue = String(
        item.model ||
          task.model ||
          task.data?.model ||
          task.request?.model ||
          task.data?.request?.model ||
          '',
      ).trim();
      if (!modelValue) return '';
      const modelLabel = imageModelConfig(modelValue)?.label || modelValue;
      setResults((current) =>
        current.map((item) =>
          item.id === result.id
            ? { ...item, model: modelValue, modelLabel }
            : item,
        ),
      );
      return modelValue;
    } catch (error) {
      return '';
    }
  }

  function activateImageEditWorkflow() {
    setCreativeTask('image-edit');
    setMode('image');
    setImageWorkflow('edit');
  }

  async function reuseResultMedia(result, action) {
    try {
      const sourceModelValue = resultImageModelValue(result);
      const hydratedSourceModelValue =
        sourceModelValue || (action === 'edit' || action === 'reference'
          ? await loadResultImageModelValue(result)
          : '');
      const sourceModel = imageModelConfig(hydratedSourceModelValue);
      const targetImageModel = sourceModel || activeImageModel;
      if (action === 'edit' || action === 'reference') {
        if (!hydratedSourceModelValue) {
          Toast.warning('结果缺少原模型标记，请先用任务 ID 查询或重新选择原模型后再提交。');
          return;
        }
        if (!sourceModel || !isImageModelAllowed(hydratedSourceModelValue)) {
          Toast.warning('原结果模型当前不可用，请先手动选择可用模型。');
          return;
        }
        if (!targetImageModel.edit) {
          Toast.warning('当前模型不支持图片编辑，请先更换模型。');
          return;
        }
        imageEditModelLockRef.current = hydratedSourceModelValue;
        if (imageModel !== hydratedSourceModelValue) {
          setImageModel(hydratedSourceModelValue);
          Toast.info(`已切回原结果模型：${sourceModel.label}`);
        }
      }
      const file = await resultMediaFile(result, action);
      if (action === 'edit') {
        activateImageEditWorkflow();
        if (appendImageReferenceFile(file, '已放入编辑源图。')) {
          scrollWorkbenchTo('mp-assets-workbench');
        }
        return;
      }
      if (action === 'reference') {
        activateImageEditWorkflow();
        if (appendImageReferenceFile(file, '已作为图生图参考放入编辑源图。')) {
          scrollWorkbenchTo('mp-assets-workbench');
        }
        return;
      }
      if (action === 'video') {
        selectCreativeTask('video', 'image');
        if (appendVideoReferenceFile(file, '已加入视频参考素材。')) {
          scrollWorkbenchTo('mp-assets-workbench');
        }
        return;
      }
      if (action === 'reverse') {
        if (fileMediaType(file) !== 'image') {
          Toast.warning('图像反推只支持图片结果。');
          return;
        }
        selectCreativeTask('reverse');
        setReversePromptFile(file);
        scrollWorkbenchTo('mp-reverse-workbench');
        Toast.success('已放入反推图。');
      }
    } catch (error) {
      Toast.error(generationErrorMessage(error) || '结果复用失败，请下载后手动上传。');
    }
  }

  const modelOptions = (mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS).filter(
    (item) =>
      (!item.private || models.some((model) => model === item.value)) &&
      (mode === 'image' || isVideoModelAllowed(item.value)),
  );
  const workflowSelectValue = mode === 'video' ? videoWorkflow : imageWorkflow;
  const workflowSelectOptions =
    mode === 'video'
      ? [
        { value: 'text', label: '文生视频' },
        { value: 'image', label: '图生视频' },
        { value: 'first-last', label: '首尾帧' },
      ].filter((item) => !activeVideoModel.workflows || activeVideoModel.workflows.includes(item.value))
      : creativeTask === 'image-edit'
        ? [{ value: 'edit', label: '图像修改' }]
        : [
          { value: 'generate', label: '文生图' },
          {
            value: 'edit',
            label: activeImageModel.edit ? '图生图' : '图生图不可用',
            disabled: !activeImageModel.edit,
          },
        ];
  const handleWorkflowSelect = (value) => {
    if (mode === 'video') {
      setVideoWorkflow(value);
      return;
    }
    if (value === 'edit') {
      selectCreativeTask('image-edit');
      return;
    }
    imageEditModelLockRef.current = '';
    setImageWorkflow('generate');
    setCreativeTask('image-generate');
    setMode('image');
  };
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
        ? resolution === 'custom'
          ? '自定义'
          : resolution
        : size
      : size;
  const ratioLabel =
    mode === 'image'
      ? imageDisplayRatio || '默认'
      : String(size || '').replace('x', ' × ');
  const qualityLabel =
    mode === 'image' ? quality || '默认' : `${duration} 秒 · ${fps} fps`;
  const videoReferenceText = `${referenceFiles.length} / ${referenceFileLimit} 素材`;
  const formatLabel = mode === 'image' ? String(format || 'url').toUpperCase() : 'URL / MP4';
  const runningQueueItems = liveQueueTasks.filter((item) => item.status !== 'failed');
  const activeQueueItem =
    runningQueueItems[0] ||
    (submitting || videoPolling
      ? {
        id: activeVideoTask?.taskId || imageTaskLookup || 'current-generation',
        title: workflowLabel,
        kind: mode,
        model: activeModel.label,
        status: videoPolling ? 'polling' : 'running',
        statusText: videoPolling ? '轮询中' : '生成中',
        progress: parseProgressPercent(taskMessage),
        createdAt: submitStartedAt || Date.now(),
        message: taskMessage || '任务已提交，等待生成结果。',
      }
      : null);
  const queueItems = [
    ...liveQueueTasks,
    ...visibleResults.slice(0, 10).map((item) => ({
      id: item.id,
      title: item.kind === 'image' ? '图片生成完成' : '视频生成完成',
      kind: item.kind,
      model: resultModelLabel(item, activeImageModel, activeVideoModel),
      status: 'completed',
      statusText: '已完成',
      createdAt: item.createdAt,
      result: item,
      message: firstPromptText(item.displayPrompt, item.prompt, item.revisedPrompt) || '结果已进入作品区。',
    })),
  ];
  const queueCounts = {
    running: liveQueueTasks.filter((item) => item.status === 'running' || item.status === 'polling').length,
    pending: liveQueueTasks.filter((item) => item.status === 'queued').length,
    completed: visibleResults.length,
    failed: liveQueueTasks.filter((item) => item.status === 'failed').length,
  };
  const activeQueueElapsedSeconds = activeQueueItem?.createdAt
    ? Math.max(0, Math.floor((Date.now() - activeQueueItem.createdAt) / 1000))
    : elapsedSeconds;
  const referenceLabel =
    mode === 'image'
      ? imageWorkflow === 'edit'
        ? `${referenceFiles.length} / ${referenceFileLimit} 张`
        : '不需要'
      : videoWorkflow === 'text'
        ? '不需要'
        : videoReferenceText;
  const showMaterialUploads =
    creativeTask === 'image-edit' ||
    creativeTask === 'reverse' ||
    (creativeTask === 'video' && videoWorkflow !== 'text');
  const outputSpec =
    mode === 'image'
      ? [
        ratioLabel,
        sizeLabel,
        imagePixelLabel,
        qualityLabel,
      ].filter(Boolean).join(' · ')
      : `${ratioLabel} · ${qualityLabel}`;
  const creativeNavItems = [
    {
      key: 'video',
      label: '视频生成',
      active: creativeTask === 'video',
      onClick: () => selectCreativeTask('video'),
    },
    {
      key: 'image-generate',
      label: '图片生成',
      active: creativeTask === 'image-generate',
      onClick: () => selectCreativeTask('image-generate'),
    },
    {
      key: 'image-edit',
      label: '图片编辑',
      active: creativeTask === 'image-edit',
      disabled: !activeImageModel.edit,
      onClick: () => selectCreativeTask('image-edit'),
    },
    {
      key: 'reverse',
      label: '图像反推提示词',
      active: creativeTask === 'reverse',
      onClick: () => {
        selectCreativeTask('reverse');
      },
    },
    {
      key: 'history',
      label: '历史任务',
      active: false,
      onClick: () =>
        document.getElementById('mp-results-workbench')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
    },
    {
      key: 'library',
      label: '素材库',
      active: false,
      onClick: () =>
        document.getElementById('mp-assets-workbench')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
    },
  ];
  const quickEntryItems = [
    {
      key: 'text-image',
      label: '文生图',
      active: creativeTask === 'image-generate',
      onClick: () => selectCreativeTask('image-generate'),
    },
    {
      key: 'image-image',
      label: '图生图',
      active: creativeTask === 'image-edit',
      onClick: () => selectCreativeTask('image-edit'),
    },
    {
      key: 'inpaint',
      label: '局部重绘',
      active: creativeTask === 'image-edit',
      onClick: () => selectCreativeTask('image-edit'),
    },
    {
      key: 'style',
      label: '风格迁移',
      active: creativeTask === 'image-edit',
      onClick: () => selectCreativeTask('image-edit'),
    },
  ];
  const flowSteps = [
    {
      key: 'task',
      number: '01',
      title: '任务',
      caption: workflowLabel,
      active: false,
      onClick: () => scrollWorkbenchTo('mp-task-workbench'),
    },
    {
      key: 'prompt',
      number: '02',
      title: creativeTask === 'reverse' ? '反推' : '提示',
      caption: creativeTask === 'reverse' ? '上传反推图' : '输入创作描述',
      active: !submitting && !videoPolling && creativeTask !== 'reverse',
      onClick: () => promptTextareaRef.current?.focus?.(),
    },
    {
      key: 'params',
      number: '03',
      title: '参数',
      caption: '设置生成参数',
      active: false,
      onClick: () => scrollWorkbenchTo('mp-parameter-workbench'),
    },
    {
      key: 'generate',
      number: '04',
      title: '生成',
      caption: submitting || videoPolling ? '任务运行中' : 'AI 生成图片',
      active: submitting || videoPolling,
      onClick: () => scrollWorkbenchTo('mp-parameter-workbench'),
    },
    {
      key: 'result',
      number: '05',
      title: '结果',
      caption: results.length ? '查看与管理' : '等待作品',
      active: !submitting && !videoPolling && results.length > 0,
      onClick: () => scrollWorkbenchTo('mp-results-workbench'),
    },
  ];

  return (
    <div className='mp-page classic-page-fill'>
      <div className='mp-shell'>
        <header className='mp-workbench-topbar' aria-label='媒体创作工作台顶部栏'>
          <Button
            theme='borderless'
            type='tertiary'
            className='mp-home-back'
            onClick={() => navigate('/')}
          >
            <span className='mp-home-back-icon' aria-hidden='true'>‹</span>
            返回主页
          </Button>
          <div className='mp-topbar-title-block'>
            <img className='mp-site-logo' src='/logo.png' alt='星人' />
            <div>
              <strong>媒体创作工作台</strong>
              <span>{workflowLabel} · {activeModel.label}</span>
            </div>
          </div>
          <div className='mp-topbar-summary' aria-label='当前任务摘要'>
            <div className='mp-topbar-primary-spec'>
              <span>当前模型 / 输出规格</span>
              <strong>{activeModel.label} · {outputSpec}</strong>
            </div>
            <div className='mp-topbar-pills'>
              <span>作品 {results.length} 个</span>
              <span>素材 {referenceFiles.length} / {referenceFileLimit}</span>
              <span>保留 72 小时</span>
            </div>
          </div>
        </header>
        <section className='mp-workbench'>
          <aside className='mp-media-sidebar' aria-label='媒体工坊导航'>
            <div className='mp-media-brand'>
              <div className='mp-media-logo'>
                <IconImage />
              </div>
              <div>
                <strong>星人 Codex</strong>
                <span>媒体工坊</span>
              </div>
              <Tag color='green'>Pro</Tag>
            </div>

            <Button
              block
              type='primary'
              theme='solid'
              icon={<IconRefresh />}
              className='mp-new-creation-btn'
                onClick={() => {
                  handlePromptChange(DEFAULT_PROMPT);
                  setNegativePromptEnabled(false);
                  setNegativePrompt('');
                  setReferenceFiles([]);
                setReversePromptFile(null);
                setReversePromptText('');
                setReversePromptMessage('');
                setLastFrameFile(null);
                setMaskFile(null);
                setImageTaskLookup('');
                setTaskMessage('');
                setSubmitStartedAt(null);
                setElapsedSeconds(0);
                setSelectedResultIds([]);
              }}
            >
              新建创作
            </Button>

            <nav className='mp-creative-nav' aria-label='创作导航'>
              <span>创作</span>
              {creativeNavItems.map((item) => (
                <button
                  key={item.key}
                  type='button'
                  className={item.active ? 'active' : ''}
                  disabled={item.disabled}
                  onClick={item.onClick}
                >
                  <span className='mp-nav-dot' />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className='mp-sidebar-card mp-sidebar-model-card'>
              <SectionTitle meta={activeModel.badge}>当前模型</SectionTitle>
              <ModelSelector
                models={modelOptions}
                selectedModel={currentModelId}
                onSelectModel={(value) => {
                  imageEditModelLockRef.current = '';
                  mode === 'image' ? setImageModel(value) : setVideoModel(value);
                }}
                mode={mode}
              />
            </div>

            <div className='mp-sidebar-card'>
              <SectionTitle>快捷入口</SectionTitle>
              <div className='mp-quick-grid'>
                {quickEntryItems.map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    className={item.active ? 'active' : ''}
                    onClick={item.onClick}
                  >
                    <IconImage />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className='mp-sidebar-card mp-resource-card'>
              <SectionTitle>账户与资源</SectionTitle>
              <div className='mp-resource-row'>
                <span>本次方案</span>
                <strong>{formatLabel}</strong>
              </div>
              <div className='mp-resource-row'>
                <span>结果数量</span>
                <strong>{results.length} 个</strong>
              </div>
              <div className='mp-resource-meter'>
                <span style={{ width: `${Math.min(results.length * 12, 100)}%` }} />
              </div>
              <p>临时预览保留 72 小时，请及时下载保存。</p>
            </div>
          </aside>

          <main className='mp-canvas-panel'>
            <section className='mp-flow-steps' aria-label='媒体创作流程'>
              {flowSteps.map((step) => (
                <button
                  key={step.key}
                  type='button'
                  className={step.active ? 'mp-flow-step is-active' : 'mp-flow-step'}
                  onClick={step.onClick}
                >
                  <span>{step.number}</span>
                  <strong>{step.title}</strong>
                  <em>{step.caption}</em>
                </button>
              ))}
            </section>

            <section id='mp-task-workbench' className='mp-mode-panel'>
              <div className='mp-task-type-tabs' aria-label='创作类型'>
                {[
                  { key: 'image-generate', label: '图片生成' },
                  { key: 'image-edit', label: '图片编辑', disabled: !activeImageModel.edit },
                  { key: 'reverse', label: '图像反推提示词' },
                  { key: 'video', label: '视频生成' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    disabled={item.disabled}
                    className={creativeTask === item.key ? 'active' : ''}
                    onClick={() => selectCreativeTask(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <div className={creativeTask === 'reverse' ? 'mp-prompt-zone is-muted' : 'mp-prompt-zone'}>
              <PromptComposer
                prompt={prompt}
                onPromptChange={handlePromptChange}
                promptMaxLength={MEDIA_PROMPT_MAX_LENGTH}
                negativePrompt={negativePrompt}
                onNegativePromptChange={setNegativePrompt}
                negativePromptEnabled={negativePromptEnabled}
                onNegativePromptEnabledChange={handleNegativePromptEnabledChange}
                negativePromptPreset={defaultNegativePrompt}
                onCopy={async () => {
                  const ok = await copy(prompt);
                  if (ok) Toast.success('提示词已复制');
                }}
                onClear={() => handlePromptChange('')}
                promptTextareaRef={promptTextareaRef}
                onPromptClick={() => syncMentionAtCursor()}
                onPromptKeyUp={() => syncMentionAtCursor()}
                onPromptKeyDown={handlePromptKeyDown}
                onCompositionStart={() => setPromptComposing(true)}
                onCompositionEnd={() => {
                  setPromptComposing(false);
                  window.requestAnimationFrame(() => syncMentionAtCursor());
                }}
                mentionMenu={
                  <MentionMenu
                    visible={mentionState.visible}
                    items={mentionMenuItems}
                    activeIndex={mentionState.activeIndex}
                    query={mentionState.query}
                    onPick={(item) => insertReferenceMention(item, mentionState)}
                    onClose={closeMentionMenu}
                  />
                }
                onReverseClick={() => selectCreativeTask('reverse')}
              />
            </div>
            {showMaterialUploads ? (
              <section id='mp-assets-workbench' className='mp-assets-section'>
                <div className='mp-section-head'>
                  <SectionTitle meta='Source'>素材输入</SectionTitle>
                  <span>{workflowLabel} · {referenceLabel}</span>
                </div>
                <div className='mp-material-grid is-upload-only'>
                  {creativeTask === 'image-edit' ? (
                    <div className='mp-material-zone is-primary is-edit-source'>
                      <div className='mp-material-zone-head'>
                        <strong>编辑源图</strong>
                      </div>
                      <div className='mp-field-grid is-material'>
                        <MultiFileDrop
                          label='上传编辑源图'
                          files={referenceFiles}
                          maxFiles={referenceFileLimit}
                          accept='image/png,image/jpeg,image/webp'
                          onFiles={addReferenceFiles}
                          onRemove={removeReferenceFile}
                          hint={`支持 JPG / PNG / WebP，最多 ${referenceFileLimit} 张。`}
                        />
                        <FileDrop
                          label='遮罩图，可选'
                          file={maskFile}
                          onFile={setMaskFile}
                          compact
                        />
                      </div>
                    </div>
                  ) : null}

                  {creativeTask === 'reverse' ? (
                    <div className='mp-material-zone is-primary is-reverse-source'>
                      <div className='mp-material-zone-head'>
                        <strong>反推图片</strong>
                      </div>
                      <FileDrop
                        label='上传反推图片'
                        file={reversePromptFile}
                        onFile={setReversePromptFile}
                        compact
                      />
                    </div>
                  ) : null}

                  {creativeTask === 'video' && videoWorkflow !== 'text' ? (
                    <div className='mp-material-zone is-primary is-video-source'>
                      <div className='mp-material-zone-head'>
                        <strong>{videoWorkflow === 'first-last' ? '首尾帧素材' : '视频参考素材'}</strong>
                      </div>
                      <div className='mp-field-grid is-material'>
                        <MultiFileDrop
                          label={videoWorkflow === 'first-last' ? '首帧 / 参考素材' : '上传视频参考素材'}
                          files={referenceFiles}
                          maxFiles={referenceFileLimit}
                          accept={videoRefPolicy.accept}
                          onFiles={addReferenceFiles}
                          onRemove={removeReferenceFile}
                          onInsertMention={insertReferenceMention}
                          hint={videoRefPolicy.hint}
                        />
                        {videoWorkflow === 'first-last' ? (
                          <FileDrop
                            label='上传尾帧图片'
                            file={lastFrameFile}
                            onFile={setLastFrameFile}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {creativeTask === 'reverse' ? (
              <section id='mp-reverse-workbench' className='mp-reverse-workbench'>
                <ReversePromptPanel
                  file={reversePromptFile}
                  onFileChange={setReversePromptFile}
                  reversePromptText={reversePromptText}
                  onReversePromptTextChange={setReversePromptText}
                  isRunning={reversePromptRunning}
                  onStartReverse={reverseImagePrompt}
                  onCopyResult={async () => {
                    const ok = await copy(reversePromptText);
                    if (ok) Toast.success('反推提示词已复制');
                  }}
                  onApplyResult={applyReversePrompt}
                  message={reversePromptMessage}
                  modelName={REVERSE_PROMPT_MODEL}
                  imageWorkflow={imageWorkflow}
                  fileDrop={null}
                  modelSelector={
                    <NativeSelect
                      label='生成模型'
                      value={imageModel}
                      options={toModelSelectOptions(modelOptions)}
                      onChange={(value) => {
                        imageEditModelLockRef.current = '';
                        setImageModel(value);
                      }}
                      agentKey='media-reverse-target-model'
                    />
                  }
                />
              </section>
            ) : null}

              <div id='mp-parameter-workbench' className='mp-parameter-panel'>
                <div className='mp-control-bar' aria-label='创作控制条'>
                  <div className='mp-control-bar-title'>
                    <SectionTitle meta='Control'>创作控制条</SectionTitle>
                    <span>{workflowLabel} · {outputSpec}</span>
                  </div>
                  <div className='mp-control-grid'>
                  {creativeTask !== 'reverse' ? (
                    <NativeSelect
                      label='生成方式'
                      value={workflowSelectValue}
                      options={workflowSelectOptions}
                      onChange={handleWorkflowSelect}
                      agentKey='media-workflow-select'
                      className='mp-param-control is-workflow'
                    />
                  ) : null}
                  <NativeSelect
                    label='模型'
                    value={currentModelId}
                    options={toModelSelectOptions(modelOptions)}
                    onChange={(value) => {
                      imageEditModelLockRef.current = '';
                      mode === 'image' ? setImageModel(value) : setVideoModel(value);
                    }}
                    agentKey='media-inline-model'
                    className='mp-param-control is-model'
                  />
                  {mode === 'image' && activeImageModel.resolutions?.length ? (
                    <NativeSelect
                      label='尺寸'
                      value={resolution}
                      options={toResolutionSelectOptions(activeImageModel.resolutions)}
                      onChange={setResolution}
                      agentKey='media-resolution'
                      className='mp-param-control'
                    />
                  ) : (
                    <NativeSelect
                      label={mode === 'image' ? '尺寸' : '视频尺寸'}
                      value={size}
                      options={toSizeSelectOptions(activeModel.sizes, activeModel)}
                      onChange={setSize}
                      agentKey='media-size'
                      className='mp-param-control'
                    />
                  )}
                  {mode === 'image' && showImageRatioOptions ? (
                    <NativeSelect
                      label='比例'
                      value={imageRatioValue}
                      options={toSelectOptions(imageRatioOptions)}
                      onChange={handleImageRatioChange}
                      agentKey='media-aspect-ratio'
                      className='mp-param-control is-ratio'
                    />
                  ) : null}
                  {mode === 'image' ? (
                    <NativeSelect
                      label='数量'
                      value={clampCount(count, activeImageModel)}
                      options={toCountSelectOptions(activeImageModel.maxCount || 1)}
                      onChange={(value) => setCount(clampCount(Number(value), activeImageModel))}
                      className='mp-param-control'
                      agentKey='media-count'
                    />
                  ) : (
                    <NativeSelect
                      label='时长'
                      value={duration}
                      options={activeVideoModel.durations.map((value) => ({
                        value,
                        label: `${value} 秒`,
                      }))}
                      onChange={(value) => setDuration(Number(value))}
                      className='mp-param-control'
                      agentKey='media-duration'
                    />
                  )}
                  {mode === 'image' ? (
                    <NativeSelect
                      label='清晰度'
                      value={quality}
                      options={toSelectOptions(activeImageModel.qualities)}
                      onChange={setQuality}
                      agentKey='media-quality'
                      className='mp-param-control'
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
                      agentKey='media-fps'
                      className='mp-param-control'
                    />
                  )}
                  {mode === 'image' ? (
                    <NativeSelect
                      label='格式'
                      value={format}
                      options={toSelectOptions(activeImageModel.formats)}
                      onChange={setFormat}
                      agentKey='media-format'
                      className='mp-param-control'
                    />
                  ) : activeVideoModel.resolutions?.length ? (
                    <NativeSelect
                      label='清晰度'
                      value={resolution}
                      options={toSelectOptions(activeVideoModel.resolutions)}
                      onChange={setResolution}
                      agentKey='media-video-resolution'
                      className='mp-param-control'
                    />
                  ) : (
                    <div className='mp-static-param'>
                      <span>格式</span>
                      <strong>{formatLabel}</strong>
                    </div>
                  )}
                  <Button
                    theme='borderless'
                    type='tertiary'
                    className='mp-advanced-toggle mp-btn-ghost'
                    onClick={() => setShowAdvancedParams((value) => !value)}
                    >
                      {showAdvancedParams ? '收起高级' : '高级设置'}
                    </Button>
                  </div>
                  <div className='mp-control-submit'>
                  <Button
                    type='primary'
                    loading={creativeTask === 'reverse' ? reversePromptRunning : false}
                    disabled={
                      creativeTask === 'reverse'
                        ? reversePromptRunning || !reversePromptFile
                        : !modelAllowed
                    }
                    className='mp-generate-main-button mp-btn-primary'
                    onClick={creativeTask === 'reverse' ? reverseImagePrompt : handleSubmit}
                  >
                    {creativeTask === 'reverse'
                      ? '开始反推'
                      : mode === 'video'
                        ? '立即生成视频'
                        : '立即生成图片'}
                  </Button>
                  </div>
                </div>
                {showAdvancedParams ? (
                  <div className='mp-advanced-params mp-advanced-params-drawer'>
                    {mode === 'video' ? (
                      <NativeSelect
                        label='分组'
                        value={effectiveGroup}
                        options={visibleGroupOptions}
                        onChange={setGroup}
                        agentKey='media-group'
                      />
                    ) : null}
                    {showGptImage2CustomSize ? (
                      <label className='mp-field' data-xr-agent='media-custom-size'>
                        <span>自定义尺寸</span>
                        <Input
                          value={customImageSize}
                          onChange={setCustomImageSize}
                          placeholder='3840x2160'
                        />
                      </label>
                    ) : null}
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
                    {mode === 'image' && format !== 'png' && format !== 'url' ? (
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
                    {mode === 'video' ? (
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
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
            <section id='mp-results-workbench' className='mp-results-section'>
              {results.length === 0 ? (
                <div className='mp-empty-canvas'>
                  <div className='mp-empty-mark'>
                    <IconUpload />
                  </div>
                  <Title heading={4}>等待第一个作品</Title>
                  <Paragraph>
                    选择模型后点击生成。任务进度会进入右侧队列，完成后作品会自动落到这里。
                  </Paragraph>
                  <div className='mp-empty-spec'>
                    <span>{activeModel.label}</span>
                    <span>{workflowLabel}</span>
                    <span>{outputSpec}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className='mp-gallery-head'>
                    <div>
                      <Title heading={4}>生成结果</Title>
                      <Paragraph>
                        共 {results.length} 个作品 · 已选 {selectedResultIds.length} 个 ·
                        {resultSort === 'newest' ? '按最新生成排序' : '按最早生成排序'}
                      </Paragraph>
                    </div>
                    <Space spacing={8}>
                      <Button
                        theme={allVisibleResultsSelected ? 'solid' : 'borderless'}
                        type={allVisibleResultsSelected ? 'primary' : 'tertiary'}
                        className={allVisibleResultsSelected ? 'mp-btn-secondary is-strong' : 'mp-btn-tool'}
                        onClick={toggleAllVisibleResults}
                      >
                        {allVisibleResultsSelected ? '取消全选' : '全选'}
                      </Button>
                      <Button
                        theme={resultViewMode === 'grid' ? 'solid' : 'borderless'}
                        type='tertiary'
                        icon={<IconImage />}
                        className='mp-btn-tool'
                        onClick={() => setResultViewMode('grid')}
                      >
                        网格
                      </Button>
                      <Button
                        theme={resultViewMode === 'list' ? 'solid' : 'borderless'}
                        type='tertiary'
                        className='mp-btn-tool'
                        onClick={() => setResultViewMode('list')}
                      >
                        列表
                      </Button>
                      <Button
                        theme='borderless'
                        type='tertiary'
                        className='mp-btn-tool'
                        onClick={() =>
                          setResultSort((value) =>
                            value === 'newest' ? 'oldest' : 'newest',
                          )
                        }
                      >
                        {resultSort === 'newest' ? '最新' : '最早'}
                      </Button>
                      <Button
                        icon={<IconRefresh />}
                        theme='borderless'
                        type='danger'
                        className='mp-btn-danger'
                        onClick={() => {
                          setResults([]);
                          setSelectedResultIds([]);
                        }}
                        disabled={results.length === 0}
                      >
                        清空
                      </Button>
                    </Space>
                  </div>
                  <div
                    className={
                      resultViewMode === 'list'
                        ? 'mp-result-grid is-list-view'
                        : 'mp-result-grid'
                    }
                  >
                    {visibleResults.map((result) => (
                      <ResultCard
                        key={result.id}
                        result={result}
                        onContinueEdit={(item) => reuseResultMedia(item, 'edit')}
                        onUseAsReference={(item) => reuseResultMedia(item, item.kind === 'video' ? 'video' : 'reference')}
                        onInspect={inspectResult}
                        selected={selectedResultIds.includes(result.id)}
                        onToggleSelect={toggleResultSelection}
                      />
                    ))}
                  </div>
                </>
              )}
              <div className='mp-retention-note'>
                生成后的临时预览文件保留 72 小时，到期自动清理；请在有效期内下载保存。
              </div>
            </section>
          </main>

          <aside
            id='mp-context-panel'
            className={
              inspectorResult
                ? 'mp-inspector mp-queue-panel is-result-context'
                : 'mp-inspector mp-queue-panel is-queue-context'
            }
            aria-label={inspectorResult ? '结果上下文面板' : '任务队列中心'}
          >
            {!inspectorResult ? (
              <>
                <div className='mp-queue-card is-overview'>
                  <div className='mp-queue-card-head'>
                    <SectionTitle meta='Queue'>任务队列中心</SectionTitle>
                    <Tag color={queueCounts.running ? 'blue' : 'grey'}>
                      {queueCounts.running ? '运行中' : '空闲'}
                    </Tag>
                  </div>
                  <div className='mp-queue-stats'>
                    {[
                      { label: '运行中', value: queueCounts.running, key: 'running' },
                      { label: '等待中', value: queueCounts.pending, key: 'pending' },
                      { label: '已完成', value: queueCounts.completed, key: 'completed' },
                      { label: '失败', value: queueCounts.failed, key: 'failed' },
                    ].map((item) => (
                      <div key={item.key} className={`mp-queue-stat-item is-${item.key}`}>
                        <span className='mp-queue-count'>{item.value}</span>
                        <Text type='tertiary' size='small'>{item.label}</Text>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='mp-queue-card is-current'>
                  <div className='mp-queue-card-head'>
                    <SectionTitle meta='Current'>当前生成任务</SectionTitle>
                  </div>
                  {activeQueueItem ? (
                    <div className='mp-current-queue-task'>
                      <div className='mp-queue-task-icon'>
                        {activeQueueItem.kind === 'video' ? <IconPlay /> : <IconImage />}
                      </div>
                      <div className='mp-queue-task-main'>
                        <strong>{activeQueueItem.title}</strong>
                        <span>{activeQueueItem.model}</span>
                        <p>{activeQueueItem.message}</p>
                        <div className='mp-queue-progress'>
                          <span style={{ width: `${activeQueueItem.progress || 18}%` }} />
                        </div>
                        <em>{activeQueueElapsedSeconds} 秒 · {activeQueueItem.id}</em>
                      </div>
                    </div>
                  ) : (
                    <div className='mp-queue-empty'>
                      <IconRefresh />
                      <span>提交生成后，当前任务会在这里显示进度。</span>
                    </div>
                  )}
                </div>

                <div className='mp-queue-card is-list'>
                  <div className='mp-queue-card-head'>
                    <SectionTitle meta={`${queueItems.length}`}>队列列表</SectionTitle>
                  </div>
                  {queueItems.length ? (
                    <div className='mp-queue-list'>
                      {queueItems.map((item) => (
                        <div key={item.id} className={`mp-queue-item is-${item.status}`}>
                          <div className='mp-queue-kind'>
                            {item.kind === 'video' ? <IconPlay /> : <IconImage />}
                          </div>
                          <div className='mp-queue-item-body'>
                            <div className='mp-queue-item-title'>
                              <strong>{item.title}</strong>
                              <span>{item.statusText}</span>
                            </div>
                            <p>{item.model}</p>
                            <em>{formatResultTime(item.createdAt)}</em>
                            {item.message ? <small>{item.message}</small> : null}
                          </div>
                          <div className='mp-queue-item-actions'>
                            {item.result ? (
                              <Button
                                size='small'
                                theme='borderless'
                                className='mp-btn-ghost'
                                onClick={() => {
                                  inspectResult(item.result);
                                }}
                              >
                                查看
                              </Button>
                            ) : (
                              <span>等待完成</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='mp-queue-empty'>
                      <IconUpload />
                      <span>还没有队列任务。</span>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            <div className='mp-queue-card mp-result-inspector-card'>
              <div className='mp-queue-card-head'>
                <SectionTitle meta='Detail'>结果详情</SectionTitle>
                {inspectorResult ? (
                  <div className='mp-result-inspector-head-actions'>
                    <Tag color={inspectorResult.cacheStatus === 'failed' ? 'orange' : 'green'}>
                      {inspectorResult.cacheStatus === 'failed' ? '原始链接' : '已完成'}
                    </Tag>
                    <Button
                      size='small'
                      theme='borderless'
                      className='mp-btn-ghost'
                      onClick={() => setSelectedResultIds([])}
                    >
                      返回队列
                    </Button>
                  </div>
                ) : null}
              </div>
              {inspectorResult ? (
                <div className='mp-result-inspector'>
                  <strong>{inspectorResult.kind === 'image' ? '图片作品' : '视频作品'}</strong>
                  <div className='mp-result-inspector-preview'>
                    {inspectorResultPreview && inspectorResult.kind === 'image' ? (
                      <img src={inspectorResultPreview} alt='结果详情预览' />
                    ) : inspectorResultPreview ? (
                      <video src={inspectorResultPreview} muted playsInline preload='metadata' />
                    ) : (
                      <div className='mp-result-inspector-empty'>
                        <IconEyeOpened />
                        <span>预览暂不可用</span>
                      </div>
                    )}
                  </div>
                  <div className='mp-result-inspector-meta'>
                    <div>
                      <span>完成时间</span>
                      <strong>{formatResultTime(inspectorResult.createdAt)}</strong>
                    </div>
                    <div>
                      <span>模型</span>
                      <strong>{resultModelLabel(inspectorResult, activeImageModel, activeVideoModel)}</strong>
                    </div>
                    <div>
                      <span>规格</span>
                      <strong>{inspectorResult.kind === 'image' ? inspectorImagePixelLabel : outputSpec}</strong>
                    </div>
                    <div>
                      <span>格式</span>
                      <strong>{inspectorResult.kind === 'image' ? formatLabel : 'MP4 / URL'}</strong>
                    </div>
                  </div>
                  {inspectorResult.kind === 'image' && inspectorResult.sizeMismatch ? (
                    <div className='mp-result-inspector-size-notice'>
                      <strong>尺寸说明</strong>
                      <span>
                        本次请求 {inspectorResult.requestedSize}，实际生成 {inspectorResult.actualSize}。已保留该结果，可直接下载。
                      </span>
                    </div>
                  ) : null}
                  {inspectorResultPrompt ? (
                    <div className='mp-result-inspector-prompt'>
                      <span>Prompt 摘要</span>
                      <p>{inspectorResultPrompt}</p>
                    </div>
                  ) : null}
                  <div className='mp-result-inspector-next'>
                    <strong>下一步操作</strong>
                    {inspectorResult.kind === 'image' ? (
                      <>
                        <Button
                          size='small'
                          className='mp-btn-secondary'
                          onClick={() => reuseResultMedia(inspectorResult, 'reference')}
                        >
                          作为参考图
                        </Button>
                        <Button
                          size='small'
                          className='mp-btn-secondary'
                          onClick={() => reuseResultMedia(inspectorResult, 'video')}
                        >
                          生成视频
                        </Button>
                        <Button
                          size='small'
                          className='mp-btn-secondary'
                          onClick={() => reuseResultMedia(inspectorResult, 'reverse')}
                        >
                          图像反推
                        </Button>
                        <Button
                          size='small'
                          className='mp-btn-secondary'
                          onClick={() => reuseResultMedia(inspectorResult, 'edit')}
                        >
                          再次编辑
                        </Button>
                      </>
                    ) : (
                      <Button
                        size='small'
                        className='mp-btn-secondary'
                        onClick={() => reuseResultMedia(inspectorResult, 'video')}
                      >
                        作为视频参考
                      </Button>
                    )}
                  </div>
                  <div className='mp-result-inspector-tools'>
                    {inspectorResultPrompt ? (
                      <Button
                        size='small'
                        theme='borderless'
                        className='mp-btn-tool'
                        icon={<IconRefresh />}
                        onClick={() => {
                          handlePromptChange(inspectorResultPrompt);
                          Toast.success('已套用到提示词。');
                        }}
                      >
                        套用提示词
                      </Button>
                    ) : null}
                    <Button
                      size='small'
                      theme='borderless'
                      className='mp-btn-tool'
                      icon={<IconDownload />}
                      onClick={() =>
                        downloadURL(
                          inspectorResultPreview || normalizeURL(inspectorResult.url),
                          inspectorResult.kind === 'image'
                            ? 'xingren-image.png'
                            : 'xingren-video.mp4',
                        )
                      }
                    >
                      下载
                    </Button>
                    <Button
                      size='small'
                      theme='borderless'
                      className='mp-btn-tool'
                      icon={<IconCopy />}
                      onClick={async () => {
                        const ok = await copy(inspectorResultPreview || normalizeURL(inspectorResult.url));
                        if (ok) Toast.success('链接已复制');
                      }}
                    >
                      复制
                    </Button>
                  </div>
                  <div className='mp-result-danger-zone'>
                    <Button
                      size='small'
                      theme='borderless'
                      type='danger'
                      className='mp-btn-danger'
                      icon={<IconDelete />}
                      onClick={() => handleRemoveResult(inspectorResult.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='mp-queue-empty'>
                  <IconImage />
                  <span>生成或选择一个作品后，这里会显示详情与下一步操作。</span>
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

export default MediaPlayground;
