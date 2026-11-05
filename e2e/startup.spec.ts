import { expect, test } from '@playwright/test';

test('loads the stage-one story and opens the reader controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: '不定积分解题法' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '章节选择' }).click();
  await expect(page.getByRole('heading', { name: '章节选择' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /基本积分方法/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('button', { name: /开始游戏/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/title-screen.png' });
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await expect(page.getByText('严佩', { exact: true })).toBeVisible();
  await expect(page.getByText('咳咳，', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/reader-wide.png' });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停一下' })).toBeVisible();
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '游戏设置' })).toBeVisible();
  const textSpeed = page.locator('input[type="range"]').first();
  await textSpeed.focus();
  await textSpeed.press('Home');
  await expect(textSpeed).toHaveValue('0');
  await page.getByRole('button', { name: '关闭' }).click();
  for (let index = 0; index < 80; index += 1) {
    if (await page.locator('.math-inline svg').count()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(20);
  }
  await expect(page.locator('.math-inline svg').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/reader-formula.png' });

  await page.locator('[title="菜单 (Esc)"]').click();
  await page.getByRole('button', { name: '存档 / 读档' }).click();
  await page
    .locator('.save-slot')
    .first()
    .getByRole('button', { name: '保存' })
    .click();
  await expect(page.locator('.save-slot').first()).not.toContainText('空存档');
  await page.reload();
  await expect(page.getByRole('button', { name: /继续游戏/ })).toBeVisible();
  await page.getByRole('button', { name: /继续游戏/ }).click();
  await expect(page.locator('.math-inline svg').first()).toBeVisible();
  expect(errors).toEqual([]);
});
