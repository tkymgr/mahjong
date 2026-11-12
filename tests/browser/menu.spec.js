import { test, expect } from '@playwright/test';
import { ready, start, openMenu, closeMenu, toHumanTurn } from './helpers.js';

async function inside(page, selector) {
  const board = await page.locator('#canvas').boundingBox(), element = await page.locator(selector).boundingBox();
  expect(element.x).toBeGreaterThanOrEqual(board.x - 1);
  expect(element.y).toBeGreaterThanOrEqual(board.y - 1);
  expect(element.x + element.width).toBeLessThanOrEqual(board.x + board.width + 1);
  expect(element.y + element.height).toBeLessThanOrEqual(board.y + board.height + 1);
}

test('all controls and scrollable settings fit inside the green table', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.masthead, .header-actions, .game-controls, footer')).toHaveCount(0);
  await inside(page, '#menu-toggle'); await inside(page, '#start-game');
  await openMenu(page);
  await inside(page, '.table-menu');
  await expect(page.locator('#sound-toggle')).toBeVisible();
  await page.locator('#speed').selectOption('2');
  await openMenu(page, 'rules');
  await page.locator('#rule-extension').scrollIntoViewIfNeeded();
  await inside(page, '#rule-extension');
  await page.screenshot({ path: `test-results/${test.info().project.name}-table-menu.png` });
  await closeMenu(page);
  await page.locator('#menu-toggle').focus(); await page.locator('#menu-toggle').press('Enter');
  await page.locator('#menu-close').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#menu-toggle')).toBeFocused();
});

test('opening the menu blocks discards and closing it restores play', async ({ page }) => {
  await ready(page); await start(page);
  const before = await page.evaluate(() => {
    const s = window.mahjongGame.session;
    return s.model.he[s.humanSeat]._pai.length;
  });
  await openMenu(page);
  expect(await page.evaluate(() => !window.mahjongGame.input.enabled)).toBe(true);
  await page.locator('#menu-close').press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
  expect(await page.evaluate(() => {
    const s = window.mahjongGame.session;
    return s.model.he[s.humanSeat]._pai.length;
  })).toBe(before);
  await closeMenu(page);
  expect(await page.evaluate(() => window.mahjongGame.input.enabled)).toBe(true);
  await page.locator('#canvas').focus(); await page.locator('#canvas').press('ArrowRight'); await page.locator('#canvas').press('Enter');
  await page.waitForFunction(n => {
    const s = window.mahjongGame.session;
    return s.model.he[s.humanSeat]._pai.length > n;
  }, before);
});

test('pon, chi combinations and pass are selectable in a tray inside the table', async ({ page }) => {
  await ready(page); await start(page);
  await page.evaluate(() => window.mahjongGame.session.engine.dispose());
  const choices = [
    { label: 'ポン 三萬 三萬 三萬', reply: { fulou: 'm333-' } },
    { label: 'チー 一萬 二萬 三萬', reply: { fulou: 'm123-' } },
    { label: 'チー 二萬 三萬 四萬', reply: { fulou: 'm23-4' } },
    { label: 'チー 三萬 四萬 五萬', reply: { fulou: 'm3-45' } },
    { label: 'カン 三萬 三萬 三萬 三萬', reply: { fulou: 'm3333-' } },
    { label: 'ロン', reply: { hule: '-' } },
    { label: '見送り', reply: {} },
  ];
  for (const index of [1, 0, 6]) {
    await page.evaluate(choices => {
      window.tableReply = null;
      window.mahjongGame.session.request({ kind: 'reaction', choices, auto: () => ({}) }, reply => { window.tableReply = reply; });
    }, choices);
    await expect(page.locator('.table-actions [data-choice]')).toHaveCount(7);
    await expect(page.locator('.table-actions .mini-tile')).toHaveCount(16);
    await inside(page, '.table-actions');
    const board = await page.locator('#canvas').boundingBox(), tray = await page.locator('.table-actions').boundingBox();
    const handTop=await page.evaluate(()=>Math.min(...window.mahjongGame.table.tiles.filter(t=>t.kind==='hand'&&t.player===0).map(t=>t.y)));
    expect(tray.y + tray.height).toBeLessThanOrEqual(board.y + board.height * (handTop / 720) + 1);
    if (board.width / board.height > 1.8) expect(tray.x).toBeGreaterThan(board.x + board.width * (208 / 1536));
    await page.locator(`[data-choice="${index}"]`).scrollIntoViewIfNeeded();
    await inside(page, `[data-choice="${index}"]`);
    if (index === 1) await page.screenshot({ path: `test-results/${test.info().project.name}-reaction-tray.png` });
    await page.locator(`[data-choice="${index}"]`).click();
    expect(await page.evaluate(() => window.tableReply)).toEqual(choices[index].reply);
  }
});

test('fullscreen keeps the menu and action layer aligned with the canvas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop fullscreen API check');
  await ready(page); await openMenu(page);
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await expect.poll(async () => {
    const a = await page.locator('#canvas').boundingBox(), b = await page.locator('.table-ui').boundingBox();
    return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y), Math.abs(a.width-b.width), Math.abs(a.height-b.height));
  }).toBeLessThan(2);
  await inside(page, '.table-menu');
  await openMenu(page, 'help'); await page.locator('#license-notices').click();
  await expect(page.getByRole('dialog', { name: '素材・ライセンス', exact: true })).toBeVisible();
  await inside(page, '.table-menu');
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('#license-back').click();
  await closeMenu(page); await inside(page, '#menu-toggle');
  await page.evaluate(() => document.exitFullscreen());
});

test('round prompts and individual winning scores remain readable inside the 3D table',async({page})=>{
  await ready(page);await page.locator('#start-game').click();
  await expect(page.locator('#round-prompt')).toContainText('配牌を確認');
  await page.locator('[data-choice="0"]').click();
  await toHumanTurn(page);
  await page.evaluate(()=>{
    const s=window.mahjongGame.session;s.engine.dispose();const seat=s.humanSeat;
    s.handleEvent('hule',{l:seat,baojia:(seat+1)%4,shoupai:'m123456p123s789z11',fu:30,fanshu:1,defen:1000,hupai:[{name:'立直'}],fenpei:[1000,-1000,0,0]});
    s.request({kind:'result',choices:[{label:'次へ',reply:{}}],auto:()=>({})},()=>{window.resultContinued=true;});
  });
  await expect(page.locator('#hand-result-title')).toHaveText('あなたのロン和了');
  await expect(page.locator('.hand-result')).toContainText('30符 1翻');
  await expect(page.locator('.hand-result')).toContainText('1,000点');
  await inside(page,'.hand-result');
  await page.locator('#continue-result').click();expect(await page.evaluate(()=>window.resultContinued)).toBe(true);
});
