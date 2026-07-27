function numericAspectRatio(value) {
  const [rawWidth, rawHeight] = String(value || '').split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 0;
  }
  return width / height;
}

export function closestSupportedImageAspectRatio(
  referenceRatio,
  supportedRatios = [],
) {
  const target = numericAspectRatio(referenceRatio);
  if (!target) return '';

  return supportedRatios.reduce((closest, candidate) => {
    const candidateRatio = numericAspectRatio(candidate);
    if (!candidateRatio) return closest;
    if (!closest) return candidate;

    const closestDistance = Math.abs(
      Math.log(numericAspectRatio(closest) / target),
    );
    const candidateDistance = Math.abs(Math.log(candidateRatio / target));
    return candidateDistance < closestDistance ? candidate : closest;
  }, '');
}
