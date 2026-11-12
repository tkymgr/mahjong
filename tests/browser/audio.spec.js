import { test, expect } from '@playwright/test';
import { ready, openMenu } from './helpers.js';
import fs from 'node:fs';
const catalogue = JSON.parse(fs.readFileSync('assets/audio/effects.json', 'utf8'));

test('sound switch persists and all nine sounds produce audio, loop and stop', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('mahjong.preferences.v2')) localStorage.setItem('mahjong', 'speed=3&sound=0&'); });
  await ready(page); await openMenu(page);
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound-toggle').click();
  await page.waitForFunction(() => window.mahjongGame.audio.context.state === 'running');
  const result = await page.evaluate(async clips => {
    const scene = window.mahjongGame;
    await scene.audio.unlock();
    const context = scene.audio.context;
    await context.suspend(); await scene.audio.unlock();
    const resumed = context.state;
    const analyser = context.createAnalyser(); analyser.fftSize = 2048; scene.audio.masterGain.connect(analyser);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const peaks = [];
    for (const clip of clips) {
      scene.audio.stopAll(); await sleep(70); scene.audio.play(clip.id);
      let peak = 0;
      for (let i = 0; i < 20; i++) {
        await sleep(5); const samples = new Float32Array(2048); analyser.getFloatTimeDomainData(samples);
        for (const v of samples) peak = Math.max(peak, Math.abs(v));
      }
      peaks.push({ id: clip.id, peak, duration: scene.audio.sounds.get(clip.id).buffer.duration });
    }
    scene.audio.stopAll(); scene.audio.play('tenbo', true); await sleep(460);
    const sound = scene.audio.sounds.get('tenbo'), looping = sound.isPlaying && sound.loop;
    scene.audio.stop('tenbo'); analyser.disconnect();
    return { peaks, looping, stopped: !sound.isPlaying, resumed };
  }, [...catalogue.clips, { id: 'clear', duration: 1.4 }]);
  for (const clip of result.peaks) { expect(clip.peak, clip.id).toBeGreaterThan(.002); expect(clip.peak).toBeLessThan(.7); }
  expect(result.resumed).toBe('running'); expect(result.looping).toBe(true); expect(result.stopped).toBe(true);
  await page.reload(); await page.waitForSelector('#start-game'); await openMenu(page);
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
});
