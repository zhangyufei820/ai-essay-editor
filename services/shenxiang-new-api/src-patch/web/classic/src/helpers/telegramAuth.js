export const TELEGRAM_AUTH_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'username',
  'photo_url',
  'auth_date',
  'hash',
  'lang',
];

export function buildTelegramAuthPayload(response, state) {
  if (!state) {
    throw new Error('Missing OAuth state');
  }
  const payload = { state: String(state) };
  TELEGRAM_AUTH_FIELDS.forEach((field) => {
    if (response?.[field] !== undefined && response[field] !== null && response[field] !== '') {
      payload[field] = String(response[field]);
    }
  });
  return payload;
}
