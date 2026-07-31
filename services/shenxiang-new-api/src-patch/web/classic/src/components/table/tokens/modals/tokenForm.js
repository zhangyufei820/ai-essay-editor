export const normalizeTokenExpiryForForm = (expiredTime, formatTimestamp) => {
  const unixSeconds = Number(expiredTime);
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }
  return formatTimestamp(unixSeconds);
};

export const expiryFormValueToUnixSeconds = (value) => {
  if (value === null || value === undefined || value === '' || value === -1) {
    return -1;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }
  return Math.ceil(time / 1000);
};
