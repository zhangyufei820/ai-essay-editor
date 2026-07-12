import { describe, expect, it } from 'vitest';
import { buildTelegramAuthPayload } from './telegramAuth';

describe('buildTelegramAuthPayload', () => {
  it('binds signed Telegram fields to a one-time browser state', () => {
    expect(
      buildTelegramAuthPayload(
        {
          id: 123,
          auth_date: 1_800_000_000,
          hash: 'signed-hash',
          ignored: 'not-forwarded',
        },
        'oauth-state',
      ),
    ).toEqual({
      id: '123',
      auth_date: '1800000000',
      hash: 'signed-hash',
      state: 'oauth-state',
    });
  });

  it('rejects a payload without browser state', () => {
    expect(() => buildTelegramAuthPayload({ id: '123' }, '')).toThrow(
      'Missing OAuth state',
    );
  });
});
