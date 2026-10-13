export function planImageUploadTargets(sizes, policy, maskIndex = -1) {
  const originalSizes = Array.from(sizes || [], (size) => Number(size || 0));
  if (originalSizes.length === 0) return [];

  const totalLimit = Math.min(
    Number(policy.max_total_bytes),
    Number(policy.global_total_bytes),
  );
  const imageLimit = Math.min(Number(policy.max_image_bytes), totalLimit);
  if (!Number.isFinite(totalLimit) || !Number.isFinite(imageLimit) || imageLimit <= 0) {
    throw new Error('当前模型上传限制无效，请刷新页面后重试。');
  }

  // Keep every original file when both the per-image and combined limits allow it.
  const targets = originalSizes.map((size) =>
    size > imageLimit ? Math.floor(imageLimit * 0.96) : size,
  );
  const plannedTotal = targets.reduce((sum, size) => sum + size, 0);
  if (plannedTotal <= totalLimit) return targets;

  // Only the actual overflow needs reducing. Prefer reference images over a
  // mask, whose exact pixels and geometry can affect image-edit semantics.
  let remaining = plannedTotal - Math.floor(totalLimit * 0.99);
  const indices = targets.map((_, index) => index).sort((left, right) => {
    if (left === maskIndex) return 1;
    if (right === maskIndex) return -1;
    return targets[right] - targets[left];
  });
  for (const index of indices) {
    if (remaining <= 0) break;
    const minimum = Math.min(targets[index], 256 * 1024);
    const reduction = Math.min(remaining, targets[index] - minimum);
    targets[index] -= reduction;
    remaining -= reduction;
  }
  if (remaining > 0) {
    throw new Error('图片总量超出当前模型限制，请减少参考图后重试。');
  }
  return targets;
}
