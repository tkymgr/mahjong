import {test,expect} from '@playwright/test';
import {ready,closeMenu,toHumanTurn} from './helpers.js';

test('salon title artwork and touch controls fit the table and open SPA dialogs',async({page})=>{
  await ready(page);
  await page.waitForFunction(()=>{const image=document.querySelector('.title-art');return image?.complete&&image.naturalWidth>0;});
  await expect(page.locator('.title-screen h1')).toHaveText('四人麻雀');
  await expect(page.locator('#game-frame')).not.toContainText(/初級|中級|上級/);
  const board=await page.locator('#canvas').boundingBox();
  for(const selector of ['#start-game','#title-characters','#menu-toggle','#title-license']){
    const b=await page.locator(selector).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(board.x);expect(b.y).toBeGreaterThanOrEqual(board.y);
    expect(b.x+b.width).toBeLessThanOrEqual(board.x+board.width+1);
    expect(b.y+b.height).toBeLessThanOrEqual(board.y+board.height+1);
  }
  await page.screenshot({path:`test-results/${test.info().project.name}-salon-title.png`});
  const url=page.url();
  await page.locator('#title-characters').click();
  await expect(page.locator('[data-menu-tab="characters"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.character-roster .opponent-card')).toHaveCount(9);
  await closeMenu(page);await expect(page.locator('#title-characters')).toBeFocused();
  await page.locator('#menu-toggle').click();
  await expect(page.locator('#sound-toggle')).toBeVisible();
  await page.locator('[data-menu-tab="rules"]').click();await page.locator('#rule-rounds').selectOption('1');
  await closeMenu(page);await expect(page.locator('.title-match-info')).toContainText('東風戦');
  await page.locator('#title-license').click();
  await expect(page.getByRole('dialog',{name:'素材・ライセンス',exact:true})).toBeVisible();
  await expect(page.locator('.license-text')).toContainText('Third-Party Notices');
  await page.locator('#menu-close').click();await page.locator('#menu-close').click();
  await expect(page.locator('#title-license')).toBeFocused();expect(page.url()).toBe(url);
});

test('start enters the 3D match and returning home restores the salon title',async({page})=>{
  await ready(page);await page.evaluate(()=>window.titleGame=window.mahjongGame);
  await page.locator('#start-game').click();await toHumanTurn(page);
  await expect(page.locator('.title-screen')).toHaveCount(0);
  await page.locator('#menu-toggle').click();await page.locator('[data-menu-tab="general"]').click();
  await page.locator('#return-title').click();
  await expect(page.locator('.title-screen')).toBeVisible();
  await expect(page.locator('#start-game')).toHaveText('対局開始');
  expect(await page.evaluate(()=>window.titleGame===window.mahjongGame)).toBe(true);
});
