import { test, expect } from '@playwright/test';
import { ready, start, openMenu, closeMenu, landscape } from './helpers.js';

test('portrait blocks the board, pauses an ongoing match and resumes it in landscape',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('#portrait-gate')).toBeVisible();await expect(page.locator('#start-game')).not.toBeVisible();
 await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>window.mahjongGame?.initialized);await expect(page.locator('#portrait-gate')).toHaveCount(0);
 await start(page);
 await page.evaluate(()=>{const g=window.mahjongGame;window.orientationGame=g;g.session.setAutoPlay(true);});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#portrait-gate')).toBeVisible();
 await expect(page.locator('.landscape-game')).toHaveAttribute('inert','');
 await page.waitForTimeout(300);
 const before=await page.evaluate(()=>{const g=window.mahjongGame;return {hand:g.session.humanHand.toString(),points:[...g.session.model.defen],river:g.session.model.he.map(h=>h._pai.length)};});
 await page.waitForTimeout(1200);
 const paused=await page.evaluate(()=>{const g=window.mahjongGame;return {same:g===window.orientationGame,blocked:g.orientationBlocked,hand:g.session.humanHand.toString(),points:[...g.session.model.defen],river:g.session.model.he.map(h=>h._pai.length),music:g.audio.musicSource};});
 expect(paused.same&&paused.blocked).toBe(true);expect(paused.hand).toBe(before.hand);expect(paused.points).toEqual(before.points);expect(paused.river).toEqual(before.river);expect(paused.music).toBeNull();
 await page.screenshot({path:`test-results/${test.info().project.name}-portrait-gate.png`});
 await page.setViewportSize({width:844,height:390});await expect(page.locator('#portrait-gate')).toHaveCount(0);
 expect(await page.evaluate(()=>window.mahjongGame.orientationBlocked)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>JSON.stringify(window.mahjongGame.session.model.he.map(h=>h._pai.length)))).not.toBe(JSON.stringify(paused.river));
 await page.evaluate(()=>window.mahjongGame.session.setAutoPlay(false));
 await page.locator('#canvas').click({position:{x:2,y:2}});
 await openMenu(page);await closeMenu(page);
 expect(await page.evaluate(()=>window.mahjongGame===window.orientationGame)).toBe(true);
});

for(const path of ['/','/mahjong/'])test(`PWA manifest, complete offline assets and offline play at ${path}`,async({page,context})=>{
 test.skip(!process.env.PLAYWRIGHT_PWA,'Requires scoped production test server');
 await landscape(page);await page.goto(path);await page.waitForFunction(()=>window.mahjongGame?.initialized);
 await openMenu(page);await expect(page.locator('#offline-status')).toContainText('オフラインで利用できます');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const devtools=await context.newCDPSession(page),appManifest=await devtools.send('Page.getAppManifest');
 expect(appManifest.errors).toEqual([]);await devtools.detach();
 const info=await page.evaluate(async()=>{
  const href=document.querySelector('link[rel="manifest"]').href,manifest=await(await fetch(href)).json();
  const assets=await(await fetch(new URL('pwa-assets.json',href))).json();const scope=new URL('./',href).href;
  const cache=await caches.open('mahjong-pwa:'+new URL(scope).pathname+':'+assets.buildId);
  const all=await Promise.all(assets.files.map(file=>cache.match(new URL(file,scope).href)));
  return {manifest,scope,complete:all.every(Boolean),count:all.length,bytes:assets.bytes};
 });
 expect(new URL(info.scope).pathname).toBe(path);expect(info.manifest.orientation).toBe('landscape');expect(info.manifest.display).toBe('standalone');expect(info.manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable')).toBe(true);expect(info.complete).toBe(true);expect(info.count).toBeGreaterThan(100);expect(info.bytes).toBeLessThan(15*1024*1024);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.mahjongGame?.initialized&&window.mahjongGame.session.phase==='title');
 await start(page);
 expect(await page.evaluate(()=>({faces:window.mahjongGame.table.faceMaterials.size,effects:window.mahjongGame.audio.sounds.size,bgm:!!window.mahjongGame.audio.musicBuffer}))).toEqual({faces:37,effects:9,bgm:true});
 await expect(page.locator('.seat-profile')).toHaveCount(3);
 await context.setOffline(false);
});

test('a waiting PWA update cannot reload a match and can be applied from the title',async({page})=>{
 test.skip(!process.env.PLAYWRIGHT_PWA,'Production only');await ready(page);
 await openMenu(page);await expect(page.locator('#offline-status')).toContainText('オフラインで利用できます');await closeMenu(page);
 await start(page);
 await page.evaluate(async()=>{window.preUpdateGame=window.mahjongGame;await navigator.serviceWorker.register('./sw.js?test-revision=2',{scope:'./',updateViaCache:'none'});});
 await openMenu(page);await expect(page.locator('#update-app')).toBeVisible();await expect(page.locator('#update-app')).toBeDisabled();
 expect(await page.evaluate(()=>window.mahjongGame===window.preUpdateGame)).toBe(true);
 await page.locator('#return-title').click();await openMenu(page);
 await expect(page.locator('#update-app')).toBeEnabled();await page.locator('#update-app').click();
 await page.waitForFunction(()=>window.mahjongGame?.initialized&&window.mahjongGame.session.phase==='title'&&!window.preUpdateGame);
});
