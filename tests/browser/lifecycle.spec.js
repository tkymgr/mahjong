import { test, expect } from '@playwright/test';
import { ready } from './helpers.js';

test('image failure can be retried and an optional missing sound is tolerated', async ({ page }) => {
  await page.route('**/models/mahjong-tile.json', route => route.abort());
  await page.goto('/'); await expect(page.locator('#load-error')).toBeVisible();
  await page.unroute('**/models/mahjong-tile.json');
  await page.route('**/js/w_tumo.wav', route => route.abort());
  await page.locator('#retry').click();
  await expect(page.locator('#start-game')).toBeVisible();
  expect(await page.evaluate(() => window.mahjongGame.audio.sounds.size)).toBe(8);
});

test('Vue unmount disposes engine callbacks, textures and sound; remount works', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_PREVIEW), 'Development fixture excluded from dist');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/browser/fixtures/lifecycle.html');
  await page.waitForFunction(() => window.games?.[0]?.session);
  await page.evaluate(() => {
    const scene = window.games[0];
    scene.session.start(); window.oldSession = scene.session;
    window.oldAudio = scene.audio; window.oldGame = window.games[0];
  });
  await page.locator('#toggle').click();
  await page.waitForFunction(() => window.oldGame.disposed);
  expect(await page.evaluate(() => ({ disposed: window.oldSession.disposed, closed: window.oldSession.engine.closed, sound: window.oldAudio.sounds.size, delays: window.oldSession.engine.delays.size }))).toEqual({ disposed: true, closed: true, sound: 0, delays: 0 });
  await page.locator('#toggle').click();
  await page.waitForFunction(() => window.games?.[1]?.session?.phase === 'title');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
