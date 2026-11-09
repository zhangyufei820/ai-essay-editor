import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconImage, IconRefresh, IconUpload } from '@douyinfe/semi-icons';
import { API } from '../../helpers';
import {
  allowedUpscaleFactors,
  formatUpscalePrice,
  UPSCALE_MAX_FILE_BYTES,
  UPSCALE_SCALES,
  upscaleStatusLabel,
  upscaleTaskStatus,
  upscaleTaskToResult,
} from './upscale-utils';
import './UpscalePanel.css';
import { startUpscaleEstimate } from './upscale-estimate';

const CREATIVE_CONTENT = [
  ['standard', '标准'],
  ['soft_portraits', '柔和肖像'],
  ['hard_portraits', '精细肖像'],
  ['art_n_illustration', '艺术与插画'],
  ['videogame_assets', '游戏素材'],
  ['nature_n_landscapes', '自然风景'],
  ['films_n_photography', '电影与摄影'],
  ['3d_renders', '三维渲染'],
  ['science_fiction_n_horror', '科幻与奇幻'],
];
const ENGINES = [
  ['automatic', '自动选择'],
  ['magnific_illusio', '插画引擎'],
  ['magnific_sharpy', '锐利写实'],
  ['magnific_sparkle', '均衡细节'],
];
const FLAVORS = [
  ['sublime', '插画与艺术图'],
  ['photo', '真实照片（仅 2 倍）'],
  ['photo_denoiser', '照片降噪（仅 2 倍）'],
];
const DEFAULT_PARAMS = {
  optimized_for: 'standard',
  prompt: '',
  creativity: 0,
  hdr: 0,
  resemblance: 0,
  fractality: 0,
  engine: 'automatic',
  flavor: 'sublime',
  sharpen: 7,
  smart_grain: 7,
  ultra_detail: 30,
  filter_nsfw: false,
};
const ACTIVE_STATUSES = ['SUBMITTED', 'IN_PROGRESS', 'UNKNOWN'];
const apiOptions = (signal) => ({
  signal,
  skipErrorHandler: true,
  disableDuplicate: true,
});
const isCancelled = (error) =>
  error?.code === 'ERR_CANCELED' ||
  error?.name === 'AbortError' ||
  error?.name === 'CanceledError';
const taskList = (data) =>
  Array.isArray(data) ? data : data?.tasks || data?.data || [];

function taskError(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function SelectField({ label, value, options, onChange, hint }) {
  return (
    <label className='mp-upscale-field'>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function RangeField({ label, value, onChange, max = 10, min = -10, hint }) {
  return (
    <label className='mp-upscale-field mp-upscale-range'>
      <span>
        {label}
        <b>{value}</b>
      </span>
      <input
        aria-label={label}
        type='range'
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

async function readOriginalFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('仅支持静态的 JPG、PNG、WebP 图片。');
  if (file.size > UPSCALE_MAX_FILE_BYTES)
    throw new Error('本地原图不能超过 10MB，请改用公开的 HTTPS 图片链接。');
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
  const dimensions = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('无法读取图片，请确认文件完整。'));
    img.src = image;
  });
  if (!allowedUpscaleFactors(dimensions.width, dimensions.height).length)
    throw new Error(
      '图片尺寸不符合要求：单边须为 16～10000 像素，且至少可以放大 2 倍。',
    );
  return { image, ...dimensions, name: file.name };
}

export default function UpscalePanel({
  active,
  source,
  resetKey,
  onResult,
  onQueueTask,
}) {
  const [model, setModel] = useState('精准放大');
  const [scale, setScale] = useState(2);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [input, setInput] = useState(null);
  const [imageLink, setImageLink] = useState('');
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [estimateVersion, setEstimateVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [tasks, setTasks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const mounted = useRef(false);
  const callbacks = useRef({ onResult, onQueueTask });
  const controllers = useRef(new Set());
  const submittingRef = useRef(false);
  const submissionKey = useRef('');
  const fileVersion = useRef(0);
  const lastResetKey = useRef(resetKey);
  const creative = model === '创意放大';
  const flavor = creative ? 'sublime' : params.flavor;
  const locallyAllowed = input?.width
    ? allowedUpscaleFactors(input.width, input.height, flavor)
    : UPSCALE_SCALES.filter((x) => flavor === 'sublime' || x === 2);
  const allowed = estimate?.allowed_scale_factors || locallyAllowed;
  const activeIds = tasks
    .filter((t) => ACTIVE_STATUSES.includes(upscaleTaskStatus(t)))
    .map((t) => t.task_id)
    .filter(Boolean)
    .join('|');
  const latestResult = tasks.find((t) => upscaleTaskToResult(t));
  const result = upscaleTaskToResult(latestResult);
  const output =
    estimate?.output ||
    (input?.width
      ? { width: input.width * scale, height: input.height * scale }
      : null);
  const payload = useMemo(
    () => ({
      model,
      image: input?.image || '',
      scale_factor: scale,
      filter_nsfw: params.filter_nsfw,
      ...(creative
        ? {
            optimized_for: params.optimized_for,
            prompt: params.prompt,
            creativity: params.creativity,
            hdr: params.hdr,
            resemblance: params.resemblance,
            fractality: params.fractality,
            engine: params.engine,
          }
        : {
            flavor: params.flavor,
            sharpen: params.sharpen,
            smart_grain: params.smart_grain,
            ultra_detail: params.ultra_detail,
          }),
    }),
    [model, input?.image, scale, creative, params],
  );
  const uncertain = tasks.some((t) => upscaleTaskStatus(t) === 'UNKNOWN');

  useEffect(() => {
    callbacks.current = { onResult, onQueueTask };
  }, [onResult, onQueueTask]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fileVersion.current += 1;
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
    };
  }, []);
  useEffect(() => {
    if (resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    fileVersion.current += 1;
    setInput(null);
    setImageLink('');
    setEstimate(null);
    setMessage('');
    setParams(DEFAULT_PARAMS);
    setScale(2);
    submissionKey.current = '';
  }, [resetKey]);
  useEffect(() => {
    if (!source?.image) return;
    fileVersion.current += 1;
    setInput({ image: source.image, name: source.name || '已选作品' });
    setImageLink('');
    setMessage('');
    setEstimate(null);
    submissionKey.current = '';
  }, [source]);
  useEffect(() => {
    if (!locallyAllowed.includes(scale) && locallyAllowed.length)
      setScale(locallyAllowed[0]);
  }, [flavor, input?.width, input?.height, scale]);
  useEffect(() => {
    submissionKey.current = '';
  }, [payload]);

  function trackedController() {
    const c = new AbortController();
    controllers.current.add(c);
    return c;
  }

  function publishTask(task) {
    if (!task?.task_id) return;
    const state = upscaleTaskStatus(task);
    callbacks.current.onQueueTask?.({
      id: `upscale-${task.task_id}`,
      title: task.model || '高清放大',
      model: task.model || '高清放大',
      kind: 'image',
      status:
        state === 'SUCCESS'
          ? 'completed'
          : state === 'FAILURE'
            ? 'failed'
            : state === 'SUBMITTED'
              ? 'queued'
              : 'polling',
      statusText: upscaleStatusLabel(task),
      message:
        task.error ||
        (state === 'UNKNOWN'
          ? '提交结果待核对，请勿重复提交；任务会继续查询。'
          : `${Number(task.scale_factor || 2)} 倍高清放大`),
      createdAt: task.created_at
        ? Number(task.created_at) *
          (Number(task.created_at) < 100000000000 ? 1000 : 1)
        : undefined,
    });
    const completed = upscaleTaskToResult(task);
    if (completed) callbacks.current.onResult?.(completed);
  }

  function mergeTasks(incoming) {
    if (!mounted.current) return;
    incoming.forEach(publishTask);
    setTasks((current) => {
      const map = new Map(current.map((t) => [t.task_id, t]));
      incoming.forEach((t) => {
        if (t?.task_id) map.set(t.task_id, { ...map.get(t.task_id), ...t });
      });
      return [...map.values()]
        .sort(
          (a, b) =>
            Number(b.created_at || b.submit_time || 0) -
            Number(a.created_at || a.submit_time || 0),
        )
        .slice(0, 30);
    });
  }

  async function refreshTasks() {
    const c = trackedController();
    try {
      const r = await API.get('/pg/upscale/tasks', apiOptions(c.signal));
      if (r.data?.success && mounted.current) mergeTasks(taskList(r.data.data));
    } catch (error) {
      if (!isCancelled(error) && mounted.current)
        setMessage(taskError(error, '任务列表暂时无法读取，请稍后刷新。'));
    } finally {
      controllers.current.delete(c);
    }
  }

  useEffect(() => {
    if (!active) return undefined;
    const c = trackedController();
    API.get('/pg/upscale/config', apiOptions(c.signal))
      .then((r) => {
        if (!mounted.current) return;
        if (!r.data?.success) throw new Error('服务暂未开放');
        setConfig(r.data.data);
        setConfigError('');
      })
      .catch((error) => {
        if (!isCancelled(error) && mounted.current)
          setConfigError('高清放大服务暂时不可用，请稍后重试。');
      })
      .finally(() => controllers.current.delete(c));
    refreshTasks();
    return () => c.abort();
  }, [active]);

  useEffect(() => {
    if (!activeIds) return undefined;
    let cancelled = false;
    let timer;
    const ownControllers = new Set();
    async function poll() {
      const ids = activeIds.split('|');
      const updates = await Promise.allSettled(
        ids.map(async (id) => {
          const c = trackedController();
          ownControllers.add(c);
          try {
            const r = await API.get(
              `/pg/upscale/tasks/${encodeURIComponent(id)}`,
              apiOptions(c.signal),
            );
            return r.data?.success ? r.data.data : null;
          } finally {
            controllers.current.delete(c);
            ownControllers.delete(c);
          }
        }),
      );
      if (cancelled || !mounted.current) return;
      mergeTasks(
        updates
          .filter((x) => x.status === 'fulfilled' && x.value)
          .map((x) => x.value),
      );
      timer = window.setTimeout(poll, 4000);
    }
    timer = window.setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ownControllers.forEach((c) => c.abort());
    };
  }, [activeIds]);

  useEffect(() => {
    setEstimate(null);
    setEstimating(false);
    setEstimateError('');
    if (!active || !input?.image || !config) return undefined;
    setEstimating(true);
    return startUpscaleEstimate({
      request: (signal) =>
        API.post('/pg/upscale/estimate', payload, {
          ...apiOptions(signal),
          timeout: 75000,
        }),
      onResult: (r) => {
        if (!mounted.current) return;
        if (!r.data?.success) {
          setEstimateError(r.data?.message || '暂时无法计算费用。');
          return;
        }
        setEstimate(r.data.data);
        setMessage('');
      },
      onError: (error) => {
        if (mounted.current)
          setEstimateError(
            error?.code === 'UPSCALE_ESTIMATE_TIMEOUT' ||
              error?.code === 'ECONNABORTED'
              ? '费用计算超时，请重新计算；本次未提交放大任务，也未扣费。'
              : taskError(error, '暂时无法校验图片或计算费用，请重新计算。'),
          );
      },
      onSettled: () => {
        if (mounted.current) setEstimating(false);
      },
    });
  }, [active, input?.image, model, scale, flavor, config, estimateVersion]);

  async function chooseFile(file) {
    if (!file || submittingRef.current) return;
    const version = ++fileVersion.current;
    setReadingFile(true);
    try {
      const next = await readOriginalFile(file);
      if (mounted.current && version === fileVersion.current) {
        setInput(next);
        setImageLink('');
        setMessage('');
      }
    } catch (error) {
      if (mounted.current && version === fileVersion.current)
        setMessage(error.message);
    } finally {
      if (mounted.current && version === fileVersion.current)
        setReadingFile(false);
    }
  }

  function useLink() {
    try {
      const url = new URL(imageLink.trim());
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        imageLink.trim().length > 4096
      )
        throw new Error();
      fileVersion.current += 1;
      setInput({ image: url.href, name: '链接图片' });
      setMessage('');
    } catch {
      setMessage('请填写无需登录即可访问的 HTTPS 图片链接。');
    }
  }

  async function submit() {
    if (
      submittingRef.current ||
      !estimate ||
      estimating ||
      uncertain ||
      !input?.image
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage('正在提交，请勿重复点击。');
    submissionKey.current ||=
      window.crypto?.randomUUID?.() ||
      `upscale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const c = trackedController();
    try {
      const r = await API.post('/pg/upscale/tasks', payload, {
        ...apiOptions(c.signal),
        headers: {
          'Idempotency-Key': submissionKey.current,
          'X-Upscale-Expected-Amount': String(estimate.amount_cny),
        },
      });
      if (!mounted.current) return;
      if (!r.data?.success) {
        setMessage(r.data?.message || '提交失败，请检查图片和参数。');
        return;
      }
      const task = {
        ...r.data.data,
        model,
        scale_factor: scale,
        created_at: r.data.data?.created_at || Math.floor(Date.now() / 1000),
      };
      mergeTasks([task]);
      setMessage(
        upscaleTaskStatus(task) === 'UNKNOWN'
          ? '提交结果待核对，请勿重复提交。我们会继续查询处理结果。'
          : '任务已提交，页面切换后仍可在放大任务中查看进度。',
      );
      if (upscaleTaskStatus(task) !== 'UNKNOWN') submissionKey.current = '';
      if (upscaleTaskStatus(task) !== 'FAILURE')
        Toast.success('放大任务已提交');
    } catch (error) {
      if (!isCancelled(error) && mounted.current) {
        setMessage(
          error?.response
            ? taskError(error, '提交失败，请检查图片和参数。')
            : '提交结果尚未确认，请先刷新任务列表，勿重复提交。',
        );
        if (
          error?.response?.status === 409 &&
          String(error.response?.data?.message || '').includes('费用')
        ) {
          setEstimate(null);
          setConfig((value) => ({ ...value }));
        }
        refreshTasks();
      }
    } finally {
      controllers.current.delete(c);
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <section
      className='mp-upscale-workbench'
      hidden={!active}
      aria-label='高清放大工作台'
    >
      <div className='mp-upscale-heading'>
        <div>
          <span>保留原作，呈现更多细节</span>
          <h2>高清放大</h2>
          <p>选择精准还原或创意增强，最高支持 16 倍放大。</p>
        </div>
        <a href='/pg/upscale/help' target='_blank' rel='noopener noreferrer'>
          使用说明 ↗
        </a>
      </div>
      <div className='mp-upscale-layout'>
        <div className='mp-upscale-controls'>
          <div className='mp-upscale-modes' aria-label='放大模式'>
            {[
              ['精准放大', '忠实原图，适合照片和商品图'],
              ['创意放大', '补充纹理，适合插画和创意图'],
            ].map(([id, text]) => (
              <button
                type='button'
                className={model === id ? 'is-selected' : ''}
                aria-pressed={model === id}
                key={id}
                disabled={submitting}
                onClick={() => setModel(id)}
              >
                <strong>{id}</strong>
                <span>{text}</span>
              </button>
            ))}
          </div>
          <div
            className='mp-upscale-source'
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              chooseFile(e.dataTransfer.files?.[0]);
            }}
            onPaste={(e) => {
              const item = [...(e.clipboardData?.items || [])].find(
                (x) => x.kind === 'file',
              );
              if (item) {
                e.preventDefault();
                chooseFile(item.getAsFile());
              }
            }}
          >
            <input
              ref={fileRef}
              type='file'
              accept='image/png,image/jpeg,image/webp'
              hidden
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type='button'
              className={`mp-upscale-upload${dragging ? ' is-dragging' : ''}`}
              onClick={() => fileRef.current?.click()}
              disabled={submitting || readingFile}
            >
              <IconUpload />
              <strong>
                {readingFile
                  ? '正在读取原图…'
                  : input
                    ? '更换原图'
                    : '上传需要放大的图片'}
              </strong>
              <span>拖入、粘贴或选择图片 · 原图直传，不自动压缩</span>
              <small>静态 JPG、PNG、WebP，文件不超过 10MB</small>
            </button>
            <div className='mp-upscale-link'>
              <label>
                <span className='mp-upscale-sr-only'>公开图片链接</span>
                <input
                  type='url'
                  value={imageLink}
                  placeholder='或粘贴公开的 HTTPS 图片链接'
                  disabled={submitting}
                  onChange={(e) => setImageLink(e.target.value)}
                />
              </label>
              <Button
                size='small'
                disabled={!imageLink.trim() || submitting}
                onClick={useLink}
              >
                使用链接
              </Button>
            </div>
            <small>链接图片支持最大 75MB，地址中的图片请保持不变。</small>
          </div>
          <div className='mp-upscale-field'>
            <span>放大倍数</span>
            <div className='mp-upscale-scales'>
              {UPSCALE_SCALES.map((value) => (
                <button
                  key={value}
                  type='button'
                  aria-pressed={scale === value}
                  disabled={!allowed.includes(value) || submitting}
                  className={scale === value ? 'is-selected' : ''}
                  onClick={() => setScale(value)}
                >
                  {value} 倍
                </button>
              ))}
            </div>
            <small>
              根据原图尺寸自动限制倍数；最终输出不超过 1.012 亿像素。
            </small>
          </div>
          {creative ? (
            <>
              <div className='mp-upscale-field-grid'>
                <SelectField
                  label='优化方向'
                  value={params.optimized_for}
                  options={CREATIVE_CONTENT}
                  onChange={(v) =>
                    setParams((x) => ({ ...x, optimized_for: v }))
                  }
                />
                <SelectField
                  label='放大引擎'
                  value={params.engine}
                  options={ENGINES}
                  onChange={(v) => setParams((x) => ({ ...x, engine: v }))}
                />
              </div>
              <RangeField
                label='创意程度'
                value={params.creativity}
                onChange={(v) => setParams((x) => ({ ...x, creativity: v }))}
                hint='越高，补充的新细节越多。'
              />
              <RangeField
                label='明暗与层次'
                value={params.hdr}
                onChange={(v) => setParams((x) => ({ ...x, hdr: v }))}
              />
              <RangeField
                label='原图相似度'
                value={params.resemblance}
                onChange={(v) => setParams((x) => ({ ...x, resemblance: v }))}
              />
              <RangeField
                label='细节繁复度'
                value={params.fractality}
                onChange={(v) => setParams((x) => ({ ...x, fractality: v }))}
              />
              <label className='mp-upscale-field'>
                <span>引导提示词（可选）</span>
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={params.prompt}
                  placeholder='描述希望强化的纹理、材质或细节；也可复用原图的生成提示词。'
                  onChange={(e) =>
                    setParams((x) => ({ ...x, prompt: e.target.value }))
                  }
                />
                <small>{params.prompt.length} / 2000 字</small>
              </label>
            </>
          ) : (
            <>
              <SelectField
                label='处理风格'
                value={params.flavor}
                options={FLAVORS}
                onChange={(v) => setParams((x) => ({ ...x, flavor: v }))}
                hint='真实照片与照片降噪仅支持 2 倍；更高倍数请选择插画与艺术图。'
              />
              <RangeField
                label='锐化强度'
                min={0}
                max={100}
                value={params.sharpen}
                onChange={(v) => setParams((x) => ({ ...x, sharpen: v }))}
              />
              <RangeField
                label='自然颗粒'
                min={0}
                max={100}
                value={params.smart_grain}
                onChange={(v) => setParams((x) => ({ ...x, smart_grain: v }))}
                hint='适量颗粒可减少过度平滑感。'
              />
              <RangeField
                label='超精细细节'
                min={0}
                max={100}
                value={params.ultra_detail}
                onChange={(v) => setParams((x) => ({ ...x, ultra_detail: v }))}
              />
            </>
          )}
          <label className='mp-upscale-checkbox'>
            <input
              type='checkbox'
              checked={params.filter_nsfw}
              onChange={(e) =>
                setParams((x) => ({ ...x, filter_nsfw: e.target.checked }))
              }
            />
            <span>开启内容安全过滤</span>
          </label>
          <div className='mp-upscale-billing' aria-live='polite'>
            <div>
              <span>本次费用</span>
              <strong>
                {estimating
                  ? '计算中…'
                  : estimate
                    ? formatUpscalePrice(estimate.amount_cny)
                    : input?.image
                      ? '暂未算出'
                      : '上传后计算'}
              </strong>
            </div>
            <p>
              {estimate
                ? `${estimate.input?.width || input?.width} × ${estimate.input?.height || input?.height} → ${output?.width} × ${output?.height} 像素`
                : '上传图片后显示可选倍数、输出尺寸和人民币费用。'}
            </p>
            {estimate?.credits ? (
              <small>
                本次处理需要 {estimate.credits}{' '}
                积分，费用按原图像素和放大倍数计算。
              </small>
            ) : null}
            {estimateError ? <p role='status'>{estimateError}</p> : null}
            {input?.image && !estimate && !estimating ? (
              <Button
                icon={<IconRefresh />}
                disabled={!config || Boolean(configError)}
                onClick={() => setEstimateVersion((value) => value + 1)}
              >
                重新计算费用
              </Button>
            ) : null}
          </div>
          <p className='mp-upscale-charge-note'>
            任务受理后即开始计费，处理失败、超时或没有返回图片也可能不退款。请确认原图、参数和费用后再提交；完成后请及时下载保存。
          </p>
          {configError || message ? (
            <div className='mp-upscale-message' role='status'>
              {configError || message}
            </div>
          ) : null}
          {uncertain ? (
            <p className='mp-upscale-charge-note'>
              有任务的提交结果待核对，请先查询原任务，暂不重复提交。
            </p>
          ) : null}
          <Button
            block
            type='primary'
            theme='solid'
            icon={<IconImage />}
            loading={submitting}
            disabled={
              !estimate ||
              estimating ||
              submitting ||
              readingFile ||
              !config ||
              Boolean(configError) ||
              uncertain
            }
            onClick={submit}
          >
            {submitting
              ? '正在提交'
              : `开始${model}${estimate ? ` · ${formatUpscalePrice(estimate.amount_cny)}` : ''}`}
          </Button>
        </div>
        <div className='mp-upscale-preview-area'>
          <div className='mp-upscale-compare'>
            <figure>
              <figcaption>
                原图<span>{input?.name || '等待上传'}</span>
              </figcaption>
              {input?.image ? (
                <img src={input.image} alt='待放大的原图' />
              ) : (
                <div className='mp-upscale-empty'>
                  <IconUpload />
                  <strong>从一张原图开始</strong>
                  <p>上传、粘贴图片，或从下方作品选择“高清放大”。</p>
                </div>
              )}
            </figure>
            <figure>
              <figcaption>
                放大结果
                <span>
                  {result
                    ? `${result.scaleFactor} 倍 · ${result.actualSize || '已完成'}`
                    : '完成后在这里预览'}
                </span>
              </figcaption>
              {result ? (
                <img src={result.displayUrl} alt='高清放大结果' />
              ) : (
                <div className='mp-upscale-empty'>
                  <IconImage />
                  <strong>让细节更清楚</strong>
                  <p>精准模式尽量保留原貌；创意模式会推断并补充细节。</p>
                </div>
              )}
            </figure>
          </div>
          <div className='mp-upscale-task-list'>
            <div className='mp-upscale-task-heading'>
              <h3>放大任务</h3>
              <Button
                size='small'
                theme='borderless'
                icon={<IconRefresh />}
                onClick={refreshTasks}
              >
                刷新任务
              </Button>
            </div>
            {tasks.length ? (
              tasks.slice(0, 8).map((task) => (
                <div
                  className={`mp-upscale-task is-${upscaleTaskStatus(task).toLowerCase()}`}
                  key={task.task_id}
                >
                  <div>
                    <strong>
                      {task.model || '高清放大'} · {task.scale_factor || 2} 倍
                    </strong>
                    <span>
                      {upscaleStatusLabel(task)}
                      {task.amount_cny !== undefined
                        ? ` · ${formatUpscalePrice(task.amount_cny)}`
                        : ''}
                    </span>
                    {task.error ? <small>{task.error}</small> : null}
                    {upscaleTaskStatus(task) === 'UNKNOWN' ? (
                      <small>提交结果待核对，请勿重复提交。</small>
                    ) : null}
                  </div>
                  {upscaleTaskStatus(task) === 'SUCCESS' ? (
                    <a
                      href={
                        task.download_url ||
                        `/pg/upscale/tasks/${encodeURIComponent(task.task_id)}/download`
                      }
                      download
                    >
                      下载原图
                    </a>
                  ) : (
                    <span className='mp-upscale-task-dot' aria-hidden='true' />
                  )}
                </div>
              ))
            ) : (
              <p className='mp-upscale-task-empty'>
                这里会保留放大任务进度，刷新或重新打开页面后仍可继续查看。
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
