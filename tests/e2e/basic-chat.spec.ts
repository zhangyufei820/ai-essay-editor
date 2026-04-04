import { test, expect } from '@playwright/test';

/**
 * 页面元素存在性测试
 * 注意：完整对话流程需要后端服务和认证，跳过
 */
test.describe('页面元素测试', () => {
  test('页面基本结构应该正常加载', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // 验证 body 存在
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 验证没有 JS 错误
    expect(errors).toHaveLength(0);
  });
});
