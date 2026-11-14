import { test, expect } from '@playwright/test';
import { ready, start, toHumanTurn, clickGame, openMenu, closeMenu } from './helpers.js';

test('PlayCanvas deals, picks a 3D tile and runs the CPUs', async ({ page, isMobile }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await ready(page);expect(await page.evaluate(()=>window.mahjongGame.engineName)).toBe('PlayCanvas');
  await page.screenshot({path:`test-results/${test.info().project.name}-title.png`});
  const state=await start(page);expect(state.hand.length).toBe(14);
  await page.screenshot({path:`test-results/${test.info().project.name}-board.png`});
  const before=await page.evaluate(()=>{const g=window.mahjongGame;return {count:g.session.model.he[g.session.humanSeat]._pai.length,hit:{x:g.table.hits[4].x,y:g.table.hits[4].y,w:g.table.hits[4].w,h:g.table.hits[4].h}};});
  await clickGame(page,before.hit.x+before.hit.w/2,before.hit.y+before.hit.h-8,isMobile);
  await page.waitForFunction(n=>{const s=window.mahjongGame.session;return s.model.he[s.humanSeat]._pai.length>n;},before.count);
  await toHumanTurn(page);expect(errors).toEqual([]);
});

test('a missing 3D graphics context shows a recoverable error', async ({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
  const size=page.viewportSize();if(size.width<size.height)await page.setViewportSize({width:size.height,height:size.width});
  await page.goto('/');await expect(page.locator('#load-error')).toBeVisible();await expect(page.locator('#retry')).toBeVisible();
});

test('rules persist, configure the MIT engine and cannot change mid-match', async ({ page }) => {
  await ready(page);
  await openMenu(page, 'rules');
  await page.locator('#rule-rounds').selectOption('1');
  await page.locator('#rule-points').selectOption('30000');
  await page.locator('#rule-red').check();
  await page.locator('#rule-tanyao').uncheck();
  await page.locator('#rule-ron').selectOption('2');
  await page.reload();
  await page.waitForSelector('#start-game');
  await openMenu(page, 'rules');
  await expect(page.locator('#rule-red')).toBeChecked();
  await expect(page.locator('#rule-points')).toHaveValue('30000');
  await start(page);
  const rule = await page.evaluate(() => window.mahjongGame.session.engine._rule);
  expect(rule['配給原点']).toBe(30000); expect(rule['場数']).toBe(1);
  expect(rule['赤牌']).toEqual({ m: 1, p: 1, s: 1 }); expect(rule['クイタンあり']).toBe(false);
  await openMenu(page, 'rules');
  await expect(page.locator('#rule-rounds')).toBeDisabled();
});

test('a cancelled pointer gesture preserves the hand and keyboard can discard',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop keyboard and mouse gesture');
  await ready(page);await start(page);
  const before=await page.evaluate(()=>{const g=window.mahjongGame;const h=g.table.hits[3];return {count:g.session.model.he[g.session.humanSeat]._pai.length,x:h.x+h.w/2,y:h.y+h.h-8};});
  const b=await page.locator('#canvas').boundingBox();await page.mouse.move(b.x+before.x*b.width/1536,b.y+before.y*b.height/720);await page.mouse.down();await page.mouse.move(b.x+1,b.y+1);await page.mouse.up();
  expect(await page.evaluate(()=>{const s=window.mahjongGame.session;return s.model.he[s.humanSeat]._pai.length;})).toBe(before.count);
  await page.locator('#canvas').focus();await page.locator('#canvas').press('ArrowRight');await page.locator('#canvas').press('Enter');
  await page.waitForFunction(n=>{const s=window.mahjongGame.session;return s.model.he[s.humanSeat]._pai.length>n;},before.count);
});

test('a complete hanchan shows scores, hand history and totals', async ({ page }) => {
  test.setTimeout(180000);
  await ready(page);
  await openMenu(page, 'rules');
  await page.locator('#rule-rounds').selectOption('2');
  await page.locator('#rule-renchan').selectOption('0');
  await closeMenu(page);
  await page.locator('#start-game').click();
  await page.evaluate(() => {
    const s = window.mahjongGame.session;
    s.engine.dwell = 0;
    s.setAutoPlay(true);
  });
  await page.waitForFunction(() => window.mahjongGame.session.phase === 'finished', null, { timeout: 165000 });
  const final = await page.evaluate(() => window.mahjongGame.session.paipu);
  expect(final.defen.reduce((a, b) => a + b)).toBe(100000);
  expect([...final.rank].sort()).toEqual([1, 2, 3, 4]);
  await expect(page.locator('#final-score-title')).toHaveText('半荘終了');
  await expect(page.locator('.score-ranking tbody tr')).toHaveCount(4);
  await expect(page.locator('.score-ranking tbody tr').first().locator('td').first()).toHaveText('1位');
  const lastRow = await page.locator('.score-ranking tbody tr').last().boundingBox(), footer = await page.locator('.score-footer').boundingBox();
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(footer.y + 1);
  await page.locator('#canvas').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#final-score-title')).toHaveText('半荘終了');
  await page.screenshot({ path: `test-results/${test.info().project.name}-final.png` });
  await page.locator('.match-scoreboard [data-score-tab="hands"]').click();
  await expect(page.locator('.score-history')).toHaveAttribute('data-history-count', String(final.log.length));
  await expect(page.locator('.score-hands tbody tr')).toHaveCount(final.log.length);
  const shown = await page.locator('.score-hands tbody tr').evaluateAll(rows => rows.map(row => +row.dataset.handNumber));
  expect(shown).toEqual(Array.from({ length: final.log.length }, (_, i) => i + 1));
  if (await page.getByRole('button', { name: '最後の局の履歴へ', exact: true }).isEnabled()) await page.getByRole('button', { name: '最後の局の履歴へ', exact: true }).click();
  await page.screenshot({ path: `test-results/${test.info().project.name}-hand-history.png` });
  await page.locator('.match-scoreboard [data-score-tab="totals"]').click();
  await expect(page.locator('.score-matches tbody tr')).toHaveCount(1);
  await expect(page.locator('.score-totals tbody tr')).toHaveCount(4);
  await page.screenshot({ path: `test-results/${test.info().project.name}-score-totals.png` });
  await openMenu(page);
  await page.locator('#return-title').click();
  await expect(page.locator('#start-game')).toBeVisible();
  await openMenu(page); await page.locator('#score-history').click();
  await expect(page.locator('.table-menu .score-ranking tbody tr')).toHaveCount(4);
});
