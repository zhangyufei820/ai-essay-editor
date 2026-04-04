import { test, expect } from '@playwright/test';

test.describe('首页加载测试', () => {
  test('首页应该能正常加载', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // 过滤掉无关紧要的错误（如第三方字体/CDN 加载失败）
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('favicon') &&
        !e.includes('fonts.googleapis') &&
        !e.includes('cdn.jsdelivr') &&
        !e.includes('fonts.gstatic')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
