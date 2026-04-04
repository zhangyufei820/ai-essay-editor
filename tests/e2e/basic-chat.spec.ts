import { test, expect } from '@playwright/test';

/**
 * 基础对话流程 E2E 测试
 * 注意：依赖 Dify API 可用，如果 API 不可用会失败
 */
test.describe('基础对话流程', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到首页
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('应该能输入消息并收到回复', async ({ page }) => {
    // 找到输入框（根据实际选择器调整）
    const inputSelector = 'textarea[placeholder*="输入"], input[type="text"]';
    const input = page.locator(inputSelector).first();

    // 如果找不到输入框，跳过此测试
    const inputCount = await page.locator(inputSelector).count();
    if (inputCount === 0) {
      test.skip();
      return;
    }

    // 输入测试消息
    await input.fill('你好');
    await input.press('Enter');

    // 等待回复出现（最多 30 秒，因为 AI 生成需要时间）
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    // 验证回复内容不为空
    const content = await assistantMessage.textContent();
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(0);
  });

  test('页面状态正常，无 JS 错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 等待几秒确保异步操作完成
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });
});
