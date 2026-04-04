import { test, expect } from '@playwright/test';

test.describe('首页加载', () => {
  test('应该能打开首页且无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // 等待页面基本加载
    await page.waitForLoadState('networkidle');

    // 检查页面标题或主要元素存在（根据实际调整）
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 过滤掉无关紧要的错误（如第三方字体加载失败）
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('favicon') &&
        !e.includes('fonts.googleapis')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
