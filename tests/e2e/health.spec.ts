import { test, expect } from '@playwright/test';

test.describe('健康检查', () => {
  test('API health endpoint 应该返回 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
  });
});
