export const UPSCALE_SCALES = [2, 4, 8, 16];
export const UPSCALE_MAX_OUTPUT_PIXELS = 101200000;
export const UPSCALE_MAX_FILE_BYTES = 10 * 1024 * 1024;

export function allowedUpscaleFactors(width, height, flavor = 'sublime') {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 10000 ||
    height > 10000
  )
    return [];
  return UPSCALE_SCALES.filter(
    (scale) =>
      width * height * scale * scale <= UPSCALE_MAX_OUTPUT_PIXELS &&
      (!['photo', 'photo_denoiser'].includes(flavor) || scale === 2),
  );
}

export function upscaleTaskStatus(task) {
  const value = String(task?.status || '').toUpperCase();
  if (task?.cache_status === 'expired') return 'FAILURE';
  if (task?.cache_status === 'pending' && value === 'SUCCESS') return 'IN_PROGRESS';
  if (['SUCCESS', 'COMPLETED', 'SUCCEEDED'].includes(value)) return 'SUCCESS';
  if (['FAILURE', 'FAILED', 'ERROR'].includes(value)) return 'FAILURE';
  if (['UNKNOWN', 'UNCERTAIN'].includes(value)) return 'UNKNOWN';
  if (['IN_PROGRESS', 'PROCESSING', 'RUNNING'].includes(value))
    return 'IN_PROGRESS';
  return 'SUBMITTED';
}

export function upscaleStatusLabel(task) {
  if (task?.cache_status === 'expired') return '结果已过期';
  if (task?.cache_status === 'pending' && task?.status === 'SUCCESS') return '正在保存图片';
  return {
    SUCCESS: '放大完成',
    FAILURE: '处理失败',
    UNKNOWN: '结果待核对',
    IN_PROGRESS: '正在放大',
    SUBMITTED: '等待处理',
  }[upscaleTaskStatus(task)];
}

export function upscaleTaskToResult(task) {
  if (!task || upscaleTaskStatus(task) !== 'SUCCESS') return null;
  const item = task.item || {};
  const url =
    item.cachedUrl ||
    item.cached_url ||
    item.url ||
    task.url ||
    task.result_url;
  if (!url || !task.task_id) return null;
  const model = task.model || item.model || '精准放大';
  const scale = Number(task.scale_factor || 2);
  const output = task.output || {};
  const createdAt = Number(task.created_at || task.finish_time || 0);
  return {
    id: `upscale-${task.task_id}`,
    kind: 'image',
    workflow: 'upscale',
    url,
    cachedUrl: item.cachedUrl || item.cached_url || url,
    displayUrl: item.displayUrl || item.cachedUrl || item.cached_url || url,
    downloadUrl:
      task.download_url ||
      `/pg/upscale/tasks/${encodeURIComponent(task.task_id)}/download`,
    taskId: task.task_id,
    model,
    modelLabel: model,
    prompt: `${model} · ${scale} 倍`,
    displayPrompt: `${model} · ${scale} 倍`,
    actualSize:
      output.width && output.height ? `${output.width}×${output.height}` : '',
    scaleFactor: scale,
    amountCny: Number(task.amount_cny || 0),
    status: 'ready',
    cacheStatus: 'ready',
    createdAt: createdAt
      ? createdAt < 100000000000
        ? createdAt * 1000
        : createdAt
      : Date.now(),
  };
}

export function formatUpscalePrice(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0 ? `¥${n.toFixed(3)}` : '待计算';
}
