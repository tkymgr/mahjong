import { test, expect } from '@playwright/test';
import { ready, openMenu, closeMenu } from './helpers.js';
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


test('original BGM loops independently, saves volume and pauses on hidden/title/disposal',async({page})=>{
  await ready(page);
  expect(await page.evaluate(()=>window.mahjongGame.audio.musicSource)).toBeNull();
  await openMenu(page);
  await expect(page.locator('#music-toggle')).toHaveAttribute('aria-pressed','true');
  await page.locator('#music-volume').evaluate(el=>{el.value='37';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await closeMenu(page);await page.locator('#start-game').click();
  await page.waitForFunction(()=>window.mahjongGame.audio.musicSource&&window.mahjongGame.audio.context.state==='running');
  const result=await page.evaluate(async()=>{
    const a=window.mahjongGame.audio,c=a.context,delay=ms=>new Promise(r=>setTimeout(r,ms));
    const analyser=c.createAnalyser();analyser.fftSize=2048;a.musicGain.connect(analyser);
    await delay(180);let peak=0;
    for(let i=0;i<12;i++){const samples=new Float32Array(2048);analyser.getFloatTimeDomainData(samples);for(const v of samples)peak=Math.max(peak,Math.abs(v));await delay(15);}
    const original=a.musicSource,loop=original.loop,duration=a.musicBuffer.duration;
    a.setEnabled(false);const independent=a.musicSource===original;
    const variants=['tumo','sute','naki','ribo'].map(id=>a.sounds.get(id).buffers.length);
    a.setHidden(true);const paused=a.musicSource===null,offset=a.musicOffset;
    a.setHidden(false);const resumed=!!a.musicSource&&a.musicOffset===offset;
    a.setMusicEnabled(false);const stopped=a.musicSource===null;
    a.setMusicEnabled(true);const enabled=!!a.musicSource;
    analyser.disconnect();return {peak,loop,duration,independent,variants,paused,offset,resumed,stopped,enabled};
  });
  expect(result.peak).toBeGreaterThan(.002);expect(result.peak).toBeLessThan(.5);
  expect(result.duration).toBeCloseTo(16*4*60/84,1);expect(result.loop).toBe(true);
  expect(result.independent).toBe(true);expect(result.variants).toEqual([3,3,3,3]);
  expect(result.paused&&result.resumed&&result.stopped&&result.enabled).toBe(true);expect(result.offset).toBeGreaterThan(.1);
  await openMenu(page);await page.locator('#music-toggle').click();
  await expect(page.locator('#music-toggle')).toHaveAttribute('aria-pressed','false');
  await page.reload();await page.waitForSelector('#start-game');await openMenu(page);
  await expect(page.locator('#music-toggle')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#music-volume')).toHaveValue('37');
  await page.locator('#music-toggle').click();await closeMenu(page);await page.locator('#start-game').click();
  await page.waitForFunction(()=>!!window.mahjongGame.audio.musicSource);
  await page.evaluate(()=>window.mahjongGame.session.home());
  expect(await page.evaluate(()=>window.mahjongGame.audio.musicSource)).toBeNull();
  await page.evaluate(async()=>{const g=window.mahjongGame;g.session.start();await g.audio.unlock();});
  await page.waitForFunction(()=>!!window.mahjongGame.audio.musicSource);
  await page.evaluate(()=>window.mahjongGame.destroy());
  await page.waitForFunction(()=>window.mahjongGame.audio.context.state==='closed');
  expect(await page.evaluate(()=>window.mahjongGame.audio.musicBuffer)).toBeNull();
});

test('missing BGM remains optional and does not block play or effects',async({page})=>{
  await page.route('**/js/bgm-salon.mp3',route=>route.abort());
  await ready(page);await openMenu(page);
  await expect(page.locator('#music-toggle')).toBeDisabled();
  await expect(page.locator('#sound-toggle')).toBeEnabled();
  await closeMenu(page);await page.locator('#start-game').click();
  await expect(page.locator('#round-prompt')).toBeVisible();
});
