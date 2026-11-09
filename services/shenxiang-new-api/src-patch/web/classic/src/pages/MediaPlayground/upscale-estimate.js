// One estimate owns its debounce, deadline and cancellation. A cancelled or
// timed-out request cannot overwrite a later estimate, even if abort is ignored.
export function startUpscaleEstimate({
  request,
  onResult,
  onError,
  onSettled,
  debounceMs = 350,
  timeoutMs = 75000,
}) {
  const controller = new AbortController();
  let closed = false;
  let deadline;
  const settle = (callback) => {
    if (closed) return;
    closed = true;
    clearTimeout(deadline);
    try {
      callback?.();
    } finally {
      onSettled();
    }
  };
  const timer = setTimeout(async () => {
    try {
      const result = await request(controller.signal);
      settle(() => onResult(result));
    } catch (error) {
      settle(() => onError(error));
    }
  }, debounceMs);
  deadline = setTimeout(() => {
    const error = new Error(
      '费用计算超时，请重新计算；本次未提交放大任务，也未扣费。',
    );
    error.code = 'UPSCALE_ESTIMATE_TIMEOUT';
    settle(() => onError(error));
    clearTimeout(timer);
    controller.abort();
  }, timeoutMs);
  return () => {
    clearTimeout(timer);
    settle();
    controller.abort();
  };
}
