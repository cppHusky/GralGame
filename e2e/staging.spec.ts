import { expect, test } from '@playwright/test';

test('board close-up keeps formulas clear of the speaker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?unit=stage1/l1/s01');
  await expect(page.getByRole('main')).toHaveAttribute(
    'data-bg',
    'classroom_wide',
  );
  for (let index = 0; index < 40; index += 1) {
    if (await page.locator('.board-equations .blackboard-item').count()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(30);
  }
  await expect(page.getByRole('main')).toHaveAttribute(
    'data-bg',
    'classroom_blackboard',
  );
  const board = page.locator('.blackboard').first();
  await expect(board).toBeVisible();
  const width = await board.evaluate(
    (element) => element.getBoundingClientRect().width / window.innerWidth,
  );
  expect(width).toBeLessThan(0.7);
  await page.screenshot({ path: 'test-results/staging-board.png' });
  expect(errors).toEqual([]);
});

test('figures get their own slot and stay inside the board', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?unit=stage1/l1/s03');
  for (let index = 0; index < 200; index += 1) {
    if (await page.locator('.board-figures svg').count()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(25);
  }
  const figure = page.locator('.board-figures svg').first();
  await expect(figure).toBeVisible();
  const box = await figure.boundingBox();
  const board = await page.locator('.blackboard').boundingBox();
  expect(box && board).toBeTruthy();
  if (box && board) {
    expect(box.width).toBeLessThanOrEqual(board.width + 1);
    expect(box.height).toBeLessThanOrEqual(board.height + 1);
  }
  await page.screenshot({ path: 'test-results/staging-figure.png' });
  expect(errors).toEqual([]);
});

test('after-lesson starts in the classroom and moves to the lake', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?unit=stage1/l3/after');
  await expect(page.getByRole('main')).toHaveAttribute(
    'data-bg',
    'classroom_wide',
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/staging-after-lesson.png' });

  for (let index = 0; index < 120; index += 1) {
    if (await page.locator('.location-card').count()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(30);
  }
  await expect(page.locator('.location-card')).toContainText('湖边长廊');
  await expect(page.getByRole('main')).toHaveAttribute(
    'data-bg',
    'lakeside_corridor',
  );
  await page.waitForTimeout(900);
  await expect(page.locator('.dialogue')).toContainText('所谓湖泊仅有三亩方塘');
  await page.screenshot({ path: 'test-results/staging-location-card.png' });
  expect(errors).toEqual([]);
});

test('lesson changes show an intermission card', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?unit=stage1/l1/s06&beat=32');
  for (let index = 0; index < 40; index += 1) {
    if (await page.locator('.intermission').count()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(20);
  }
  const intermission = page.locator('.intermission');
  await expect(intermission).toBeVisible();
  await expect(intermission).toContainText('幕间');
  await expect(intermission).toContainText('基本积分方法');
  await page.screenshot({ path: 'test-results/staging-intermission.png' });
  await intermission.click();
  await expect(intermission).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a character leaves the stage after running out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?unit=stage1/l1/s00&beat=3');
  await expect(page.getByRole('main')).toHaveAttribute(
    'data-cast',
    'yang-bing',
  );
  await page.screenshot({ path: 'test-results/staging-exit.png' });
  expect(errors).toEqual([]);
});
