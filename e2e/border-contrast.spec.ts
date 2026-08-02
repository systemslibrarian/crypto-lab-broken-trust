import { expect, test } from '@playwright/test';

type Rgb = [number, number, number];

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [channels[0], channels[1], channels[2]];
}

function luminance(rgb: Rgb) {
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: Rgb, second: Rgb) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} trial selector boundary retains 3:1 contrast`, async ({ page }) => {
    await page.goto('.');
    if (theme === 'light') await page.locator('#cl-theme-toggle').click();

    const colors = await page.locator('.trials-controls select').evaluate((select) => {
      const style = getComputedStyle(select);
      return { border: style.borderTopColor, background: style.backgroundColor };
    });

    expect(contrast(parseRgb(colors.border), parseRgb(colors.background))).toBeGreaterThanOrEqual(3);
  });
}
