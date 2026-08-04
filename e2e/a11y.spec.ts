import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';

/**
 * WCAG regression gate.
 *
 * What this gate used to do, and why each part of it was not enough:
 *
 *  1. It injected `animation: none; transition: none; opacity: 1 !important`
 *     before scanning. That makes the suite structurally unable to see a
 *     transition or theme-swap defect, and the `opacity: 1` half actively
 *     falsified the measurement: `.cl-hero-sub` renders at 0.85, disabled play
 *     buttons at 0.55, zero-value contrast bars at 0.4, and forcing all of them
 *     opaque hands axe a foreground colour that is never painted. The
 *     replacement is `emulateMedia({ reducedMotion: 'reduce' })` — this lab's
 *     stylesheet honours that query and even has a rule that holds the
 *     "key recovered" toast statically visible under it — followed by a wait
 *     for `document.getAnimations()` to go quiet. `test.use({ reducedMotion })`
 *     is a silent no-op on Playwright 1.61.1, so the emulation is asserted from
 *     inside the page rather than assumed.
 *
 *  2. It scanned only the untouched page at the default 1280px viewport. Both
 *     halves of that mattered. The page does paint its whole readout, candidate
 *     grid, microscope, landscape and replay tables synchronously at load — so
 *     there is no first-paint race here — but the trials panel, the guided-tour
 *     dialog, the descent playback, the landscape tooltip and the two failure
 *     verdicts (stalled, past the noise ceiling) are all states the scan never
 *     reached. And the width mattered on its own: three containers here are
 *     `overflow-x: auto` and only overflow on a narrow screen, which is where
 *     the two paper tables and the verify snippet were failing
 *     `scrollable-region-focusable` as keyboard traps. A 1280px scan cannot
 *     fail that rule no matter how broken the page is.
 *
 *  3. It asserted only on `results.violations`. axe files contrast over a
 *     gradient, and a name on a role-less element, under `incomplete`, where
 *     that assertion never sees them. The gate now also refuses any non-contrast
 *     `incomplete` rule, and measures contrast arithmetically — compositing
 *     translucent layers and gradient stops — so the nodes axe declines to
 *     judge are still judged.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The only rule permitted to sit in axe's `incomplete` bucket, because this
 * page's selects and stepper arrows sit on backdrops axe will not resolve.
 * Those nodes are not waved through — `auditContrast` measures every one of
 * them. Any other rule landing here (`aria-prohibited-attr` above all) is a
 * finding the gate must fail on.
 */
const INCOMPLETE_ALLOWED = new Set(['color-contrast']);

async function useReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

/**
 * Wait for motion to stop and stay stopped. A theme flip does not drain in one
 * batch — a settling transition can start the next — so require several
 * consecutive quiet frames rather than exiting through a gap between waves.
 * The 15s ceiling is headroom for a loaded machine; idle, this returns in well
 * under 100ms.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running').length;
      w.__quietFrames = running === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return (w.__quietFrames ?? 0) >= 5;
    },
    undefined,
    { timeout: 15_000, polling: 'raf' }
  );
}

/** Expand the native disclosures so their content is in the scan. */
async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
  });
}

async function scan(page: Page, label: string): Promise<void> {
  await settle(page);

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations at: ${label}`).toEqual([]);

  const unexpectedIncomplete = results.incomplete
    .filter((v) => !INCOMPLETE_ALLOWED.has(v.id))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexpectedIncomplete, `axe incomplete (non-contrast) at: ${label}`).toEqual([]);

  const contrast = formatContrastFailures(await auditContrast(page));
  expect(contrast, `measured contrast failures at: ${label}`).toEqual([]);
}

async function toLight(page: Page): Promise<void> {
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

/**
 * Drive the interactive surfaces the untouched page never shows: the prediction
 * feedback, the descent playback and its "key recovered" toast, another
 * relation in the microscope, a fresh random start, an open help popover, the
 * trials panel with a real success rate in it, and the landscape tooltip.
 */
async function driveInteractiveStates(page: Page): Promise<void> {
  await page.locator('.predict-btn[data-guess="yes"]').click();
  await expect(page.locator('#predict-fb')).not.toBeEmpty();

  await page.locator('#play-btn').click();
  await expect(page.locator('#play-status')).not.toBeEmpty();
  await page.locator('#step-btn').click();

  await page.locator('#micro-next').click();
  await page.locator('#rand-start').click();

  await page.locator('.help-dot').first().click();
  await expect(page.locator('.help-dot').first()).toHaveAttribute('aria-expanded', 'true');

  await page.locator('#trials-n').selectOption('10');
  await page.locator('#trials-run').click();
  await expect(page.locator('#trials-out')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#trials-rate-num')).not.toHaveText('—', { timeout: 30_000 });

  // The landscape tooltip is a [hidden] panel driven by pointer position on the
  // canvas; dispatch the move directly so it works at any viewport width.
  await page.evaluate(() => {
    const c = document.getElementById('landscape-chart') as HTMLCanvasElement;
    const rect = c.getBoundingClientRect();
    c.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: rect.left + rect.width * 0.4,
        clientY: rect.top + rect.height * 0.4,
        bubbles: true,
      })
    );
  });
  await expect(page.locator('#landscape-tip')).toBeVisible();
}

test('the reduced-motion emulation this gate depends on actually reaches the page', async ({
  page,
}) => {
  // `test.use({ reducedMotion })` is a no-op on Playwright 1.61.1. If the
  // emulation ever stops arriving, every scan below silently goes back to
  // racing the theme transition, so assert the query from inside the page.
  await useReducedMotion(page);
  await page.goto('.');
  const reduced = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  expect(reduced).toBe(true);
});

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    await useReducedMotion(page);
    await page.goto('.');
    if (theme === 'light') await toLight(page);
    await revealAll(page);
    await scan(page, `${theme} / first paint / 1280`);
  });

  test(`no WCAG A/AA violations with every interactive surface driven, ${theme} theme`, async ({
    page,
  }) => {
    await useReducedMotion(page);
    await page.goto('.');
    await driveInteractiveStates(page);
    if (theme === 'light') await toLight(page);
    await revealAll(page);
    await scan(page, `${theme} / driven / 1280`);
  });

  // 380px is where the `overflow-x: auto` containers actually overflow. Both
  // paper tables and the verify snippet were 2.1.1 keyboard traps here while
  // the 1280px gate stayed green.
  test(`no WCAG A/AA violations at 380px with every interactive surface driven, ${theme} theme`, async ({
    page,
  }) => {
    await useReducedMotion(page);
    await page.setViewportSize({ width: 380, height: 720 });
    await page.goto('.');
    await driveInteractiveStates(page);
    if (theme === 'light') await toLight(page);
    await revealAll(page);
    await scan(page, `${theme} / driven / 380`);
  });
}

test('no WCAG A/AA violations with the guided tour open', async ({ page }) => {
  await useReducedMotion(page);
  await page.goto('.');
  await page.locator('#tour-start').click();
  await expect(page.locator('#tour')).toBeVisible();
  await scan(page, 'dark / guided tour, first step');
  await page.locator('#tour-next').click();
  await scan(page, 'dark / guided tour, second step');
});

// The two ways the demo can fail — too few leaks to finish the descent, and
// noise past the toy's ceiling so the minimum stops marking the key — repaint
// the verdict, the candidate cells and the contrast note in their alarm styling.
// None of that had ever been scanned.
for (const [name, query] of [
  ['the descent stalls on too few leaks', './?seed=1&rels=600&noise=0'],
  ['noise runs past the toy ceiling', './?seed=1&rels=4000&noise=45'],
] as const) {
  for (const width of [1280, 380] as const) {
    test(`no WCAG A/AA violations when ${name}, at ${width}px`, async ({ page }) => {
      await useReducedMotion(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(query);
      await revealAll(page);
      await scan(page, `${name} / ${width}px`);
    });
  }
}
