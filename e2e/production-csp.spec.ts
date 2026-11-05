import { expect, test } from '@playwright/test';

/**
 * Runs against the built `dist/` served with the real `_headers` CSP. PixiJS
 * must not need `eval`, otherwise the canvas silently fails only in production.
 */
test('production build renders sprites under the deployed CSP', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  const spriteResponses: number[] = [];
  page.on('response', (response) => {
    if (
      response.url().includes('/assets/ch/') ||
      response.url().includes('/assets/bg/')
    )
      spriteResponses.push(response.status());
  });

  await page.goto('/');
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await expect(page.getByText('严佩', { exact: true })).toBeVisible();
  await expect(page.locator('.stage')).not.toHaveClass(/stage-fallback/);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect
    .poll(() => spriteResponses.length, { timeout: 8000 })
    .toBeGreaterThan(0);
  expect(spriteResponses.every((status) => status === 200)).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __cspViolations: string[] }).__cspViolations,
    ),
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/production-csp.png' });
  expect(errors).toEqual([]);
});
