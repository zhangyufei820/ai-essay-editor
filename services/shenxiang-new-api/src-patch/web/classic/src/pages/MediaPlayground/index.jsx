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
  Upload,
} from '@douyinfe/semi-ui';
import {
  IconChevronDown,
  IconCopy,
  IconDelete,
  IconDownload,
  IconExternalOpen,
  IconEyeOpened,
  IconImage,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconUpload,
} from '@douyinfe/semi-icons';
import { API, copy } from '../../helpers';

const { Text, Title, Paragraph } = Typography;

const IMAGE_MODELS = [
  {
    value: 'gpt-image-2-4K',
    label: 'GPT Image 2',
    badge: '4K',
    vendor: '星人图像',
    sizes: [
      'auto',
      '1024x1024',
      '1024x1536',
      '1536x1024',
      '2048x2048',
      '2048x4096',
      '4096x2048',
    ],
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    defaultSize: '1024x1024',
    defaultQuality: 'high',
    edit: true,
    hint: '适合高质量海报、产品图和需要透明背景的素材。',
  },
  {
    value: 'banana-2',
    label: 'Banana 2',
    badge: '4K',
    vendor: 'Moonapix',
    sizes: ['1024x1024', '2048x2048', '2048x4096', '4096x2048'],
    qualities: ['auto'],
    formats: ['url'],
    defaultSize: '4096x2048',
    defaultQuality: 'auto',
    edit: false,
    hint: '适合快速高分辨率创意图、场景草图和视觉方案探索。',
  },
  {
    value: 'grok-image-pro',
    label: 'Grok Image Pro',
    badge: 'Pro',
    vendor: '星人图像',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    qualities: ['standard', 'hd'],
    formats: ['url'],
    defaultSize: '1024x1024',
    defaultQuality: 'standard',
    edit: false,
    hint: '适合真实感、社媒封面和快速创意探索。',
  },
];

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

function toSelectOptions(values) {
  return values.map((value) => ({ value, label: String(value) }));
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
      };
    })
    .filter(Boolean);
}

function getVideoTaskId(response) {
  return response?.id || response?.task_id || '';
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'succeeded', 'success'].includes(value)) return 'completed';
  if (['failed', 'failure', 'error'].includes(value)) return 'failed';
  if (['in_progress', 'processing', 'running'].includes(value))
    return 'processing';
  return value || 'queued';
}

function extractVideoURL(response) {
  const metadata = response?.metadata || {};
  if (typeof metadata.url === 'string') return metadata.url;
  if (metadata.video && typeof metadata.video.url === 'string')
    return metadata.video.url;
  if (metadata.data && typeof metadata.data.url === 'string')
    return metadata.data.url;
  if (Array.isArray(metadata.videos) && metadata.videos[0]?.url)
    return metadata.videos[0].url;
  return '';
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

function NativeSelect({ label, value, options, onChange }) {
  return (
    <label className='mp-field'>
      <span>{label}</span>
      <Select
        value={value}
        optionList={options}
        onChange={onChange}
        suffix={<IconChevronDown />}
        style={{ width: '100%' }}
      />
    </label>
  );
}

function FileDrop({ label, file, onFile, compact = false }) {
  return (
    <div className={compact ? 'mp-upload mp-upload-compact' : 'mp-upload'}>
      <Upload
        limit={1}
        accept='image/png,image/jpeg,image/webp'
        beforeUpload={({ file: uploadFile }) => {
          onFile(uploadFile.fileInstance);
          return false;
        }}
        onRemove={() => onFile(null)}
        dragMainText={label}
        dragSubText='支持 PNG / JPG / WebP'
      />
      {file ? <Tag color='green'>{file.name}</Tag> : null}
    </div>
  );
}

function ResultCard({ result, onRemove }) {
  const [mediaError, setMediaError] = useState(false);
  const displayUrl = normalizeURL(
    result.cachedUrl || result.displayUrl || result.url,
  );
  const originalUrl = normalizeURL(result.url);
  const cacheFailed = result.cacheStatus === 'failed';

  return (
    <div className='mp-result-card'>
      <div className='mp-result-frame'>
        {result.kind === 'image' ? (
          <img
            src={displayUrl}
            alt='生成结果'
            onLoad={() => setMediaError(false)}
            onError={() => setMediaError(true)}
          />
        ) : (
          <video
            src={displayUrl}
            controls
            playsInline
            onLoadedData={() => setMediaError(false)}
            onError={() => setMediaError(true)}
          />
        )}
        {(mediaError || cacheFailed) && (
          <div className='mp-media-error'>
            <IconEyeOpened />
            <strong>预览加载失败</strong>
            <span>
              {cacheFailed
                ? result.cacheMessage
                : '临时链接可能限制浏览器直连。'}
            </span>
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
        )}
      </div>
      <div className='mp-result-meta'>
        <div>
          <Tag color={result.kind === 'image' ? 'blue' : 'purple'}>
            {result.kind === 'image' ? '图像' : '视频'}
          </Tag>
          <Tag color='orange'>1 小时内有效</Tag>
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
  const [background, setBackground] = useState('auto');
  const [inputFidelity, setInputFidelity] = useState('auto');
  const [compression, setCompression] = useState(100);
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(VIDEO_MODELS[0].defaultDuration);
  const [fps, setFps] = useState(VIDEO_MODELS[0].defaultFps);
  const [seed, setSeed] = useState('');
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [referenceFile, setReferenceFile] = useState(null);
  const [lastFrameFile, setLastFrameFile] = useState(null);
  const [maskFile, setMaskFile] = useState(null);
  const [results, setResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');
  const [showPayload, setShowPayload] = useState(true);

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
    } else {
      setDuration(
        activeVideoModel.defaultDuration ||
          activeVideoModel.durations?.[0] ||
          5,
      );
      setFps(activeVideoModel.defaultFps || 24);
    }
  }, [activeModel, activeImageModel, activeVideoModel, mode]);

  const requestPayload = useMemo(() => {
    if (mode === 'image') {
      const payload = {
        model: imageModel,
        group,
        prompt,
        n: count,
        size,
      };
      if (quality) payload.quality = quality;
      if (format && format !== 'url') payload.output_format = format;
      if (format !== 'png' && format !== 'url')
        payload.output_compression = compression;
      if (background !== 'auto') payload.background = background;
      if (imageWorkflow === 'edit') payload.input_fidelity = inputFidelity;
      if (negativePrompt.trim())
        payload.extra_fields = { negative_prompt: negativePrompt.trim() };
      return payload;
    }

    const [width, height] = size.split('x').map((value) => Number(value));
    const payload = {
      model: videoModel,
      group,
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
      payload.image = '上传的首帧图片会在提交时自动填入';
      payload.images = ['上传的首帧图片会在提交时自动填入'];
    }
    if (videoWorkflow === 'first-last') {
      payload.image = '上传的首帧图片会在提交时自动填入';
      payload.images = [
        '上传的首帧图片会在提交时自动填入',
        '上传的尾帧图片会在提交时自动填入',
      ];
      payload.metadata = {
        ...(payload.metadata || {}),
        last_frame_image: '上传的尾帧图片会在提交时自动填入',
        frames: [
          { role: 'first_frame', image: '上传的首帧图片会在提交时自动填入' },
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
    enhancePrompt,
    format,
    fps,
    group,
    imageModel,
    imageWorkflow,
    inputFidelity,
    mode,
    negativePrompt,
    prompt,
    quality,
    seed,
    size,
    videoModel,
    videoWorkflow,
    watermark,
  ]);

  async function cacheMedia(result) {
    if (!result.url || result.url.startsWith('data:')) return result;
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
        if (value !== undefined && typeof value !== 'object')
          form.set(key, String(value));
      });
      if (referenceFile) form.set('image', referenceFile);
      if (maskFile) form.set('mask', maskFile);
      response = await API.post('/pg/images/edits', form, {
        skipErrorHandler: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } else {
      response = await API.post('/pg/images/generations', requestPayload, {
        skipErrorHandler: true,
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
      const status = normalizeStatus(res.data?.status);
      setTaskMessage(`视频任务 ${status}，进度 ${res.data?.progress || 0}%`);
      if (status === 'completed') {
        const url = extractVideoURL(res.data);
        if (!url) throw new Error('视频完成但没有返回视频地址。');
        return {
          id: `video-${taskId}`,
          kind: 'video',
          url,
          displayUrl: url,
          taskId,
          status,
        };
      }
      if (status === 'failed')
        throw new Error(res.data?.error?.message || '视频任务失败。');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('视频生成等待超时，请稍后到任务日志查看结果。');
  }

  async function submitVideo() {
    const payload = { ...requestPayload };
    if (videoWorkflow === 'image' || videoWorkflow === 'first-last') {
      const firstFrame = await fileToDataURL(referenceFile);
      payload.image = firstFrame;
      payload.images = [firstFrame];
    }
    if (videoWorkflow === 'first-last') {
      const lastFrame = await fileToDataURL(lastFrameFile);
      payload.images = [payload.image, lastFrame];
      payload.metadata = {
        ...(payload.metadata || {}),
        last_frame_image: lastFrame,
        frames: [
          { role: 'first_frame', image: payload.image },
          { role: 'last_frame', image: lastFrame },
        ],
      };
    }
    const res = await API.post('/pg/videos', payload, {
      skipErrorHandler: true,
    });
    if (res.data?.error?.message) throw new Error(res.data.error.message);
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
    if (mode === 'image' && imageWorkflow === 'edit' && !referenceFile)
      return Toast.error('图像修改需要先上传参考图。');
    if (mode === 'video' && videoWorkflow !== 'text' && !referenceFile)
      return Toast.error('图生视频需要先上传首帧图片。');
    if (mode === 'video' && videoWorkflow === 'first-last' && !lastFrameFile)
      return Toast.error('首尾帧视频需要同时上传首帧和尾帧。');

    setSubmitting(true);
    setTaskMessage(
      mode === 'video' ? '正在提交视频任务...' : '正在生成图像...',
    );
    try {
      if (mode === 'image') await submitImage();
      else await submitVideo();
    } catch (error) {
      Toast.error(error.message || '生成失败');
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
            <StatPill label='保留' value='1 小时' />
            <StatPill label='图像' value='3 模型' />
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

            <div className='mp-field-grid'>
              <NativeSelect
                label='分组'
                value={group}
                options={groups}
                onChange={setGroup}
              />
              <NativeSelect
                label={mode === 'image' ? '画面尺寸' : '视频尺寸'}
                value={size}
                options={toSelectOptions(activeModel.sizes)}
                onChange={setSize}
              />
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
                <NativeSelect
                  label='背景'
                  value={background}
                  options={toSelectOptions(['auto', 'transparent', 'opaque'])}
                  onChange={setBackground}
                />
                <div className='mp-slider-field'>
                  <div>
                    <span>生成数量</span>
                    <b>{count} 张</b>
                  </div>
                  <Slider
                    min={1}
                    max={4}
                    step={1}
                    value={count}
                    onChange={setCount}
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
                {imageWorkflow === 'edit' ? (
                  <>
                    <NativeSelect
                      label='参考图保真度'
                      value={inputFidelity}
                      options={toSelectOptions(['auto', 'low', 'high'])}
                      onChange={setInputFidelity}
                    />
                    <FileDrop
                      label='上传参考图'
                      file={referenceFile}
                      onFile={setReferenceFile}
                    />
                    <FileDrop
                      label='上传遮罩图，可选'
                      file={maskFile}
                      onFile={setMaskFile}
                      compact
                    />
                  </>
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
                  <FileDrop
                    label='上传首帧图片'
                    file={referenceFile}
                    onFile={setReferenceFile}
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
              <div className='mp-action-row'>
                <Banner
                  type='warning'
                  closeIcon={null}
                  description='生成后请立即下载。临时预览文件只保留 1 小时，到期会自动清理。'
                />
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
                <Button
                  icon={<IconPlus />}
                  onClick={() => setShowPayload((value) => !value)}
                >
                  {showPayload ? '隐藏请求' : '查看请求'}
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
          </main>

          <aside className='mp-panel mp-inspector'>
            <SectionTitle meta='Auto'>请求格式</SectionTitle>
            <Text type='tertiary'>当前提交字段。</Text>
            {showPayload ? (
              <pre className='mp-payload'>
                {JSON.stringify(requestPayload, null, 2)}
              </pre>
            ) : null}
            <SectionTitle>当前配置</SectionTitle>
            <div className='mp-inspector-list'>
              <div>
                <span>模型</span>
                <strong>{activeModel.label}</strong>
              </div>
              <div>
                <span>模式</span>
                <strong>{mode === 'image' ? '图像' : '视频'}</strong>
              </div>
              <div>
                <span>尺寸</span>
                <strong>{size}</strong>
              </div>
              <div>
                <span>分组</span>
                <strong>{group || '默认'}</strong>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

export default MediaPlayground;
