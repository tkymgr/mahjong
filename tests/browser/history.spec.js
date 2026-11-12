import { test, expect } from '@playwright/test';
import { ready, start, openMenu } from './helpers.js';

async function completeFixture(page, count = 8, bust = false) {
  await ready(page); await start(page);
  await page.evaluate(({ count, bust }) => {
    const session = window.mahjongGame.session;
    session.engine.dispose();
    const log = Array.from({ length: count }, (_, i) => [
      { qipai: { zhuangfeng: Math.floor(i / 4), jushu: i % 4, changbang: 0, defen: [25000,25000,25000,25000] } },
      { pingju: { name: '荒牌平局', fenpei: [0,0,0,0] } },
    ]);
    if (bust) log[count - 1][1] = { hule: { l: 0, baojia: 3, fenpei: [32000,0,0,-32000] } };
    session.completeMatch({ qijia: 0, player: session.names, log,
      defen: bust ? [-7000,57000,25000,25000] : [25000,25000,25000,25000],
      rank: bust ? [4,1,2,3] : [1,2,3,4], point: bust ? ['-57.0','67.0','5.0','-15.0'] : ['35.0','5.0','-15.0','-25.0'],
    });
  }, { count, bust });
  await expect(page.locator('.score-ranking tbody tr')).toHaveCount(4);
  const row = await page.locator('.score-ranking tbody tr').last().boundingBox(), footer = await page.locator('.score-footer').boundingBox();
  expect(row.y + row.height).toBeLessThanOrEqual(footer.y + 1);
  await page.locator('.match-scoreboard [data-score-tab="hands"]').click();
}

test('every round through South 4 remains in a scrollable list on a small table', async ({ page }) => {
  await completeFixture(page);
  await expect(page.locator('.score-history')).toHaveAttribute('data-history-count', '8');
  await expect(page.locator('.history-summary')).toHaveText('全8局（東一局〜南四局）');
  await expect(page.locator('.score-hands tbody tr')).toHaveCount(8);
  const seen = await page.locator('.score-hands tbody tr').evaluateAll(rows => rows.map(row => +row.dataset.handNumber));
  expect(seen).toEqual([1,2,3,4,5,6,7,8]);
  const scrollable = await page.locator('.history-scroll').evaluate(el => el.scrollHeight > el.clientHeight + 2);
  if (scrollable) {
    await expect(page.locator('.history-scroll-hint')).toContainText('続きがあります');
    await expect(page.getByRole('button', { name: '最後の局の履歴へ', exact: true })).toBeEnabled();
    // Touch/trackpad scrolling within the list reaches South 4.
    await page.locator('.history-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    await expect(page.locator('.score-hands tbody tr').last()).toBeInViewport();
    await expect(page.locator('.history-scroll-hint')).toContainText('最後の局');
    await page.getByRole('button', { name: '履歴の先頭へ', exact: true }).click();
    await expect(page.locator('.history-scroll-hint')).toContainText('続きがあります');
    await page.getByRole('button', { name: '最後の局の履歴へ', exact: true }).click();
  }
  await expect(page.locator('.score-hands tbody tr').last()).toContainText('南四局');
  await expect(page.locator('.score-hands tbody tr').last()).toBeInViewport();
  const board = await page.locator('#canvas').boundingBox(), list = await page.locator('.history-scroll').boundingBox();
  expect(list.y).toBeGreaterThanOrEqual(board.y);
  expect(list.y + list.height).toBeLessThanOrEqual(board.y + board.height);
  const last = await page.locator('.score-hands tbody tr').last().boundingBox();
  expect(last.y + last.height).toBeLessThanOrEqual(list.y + list.height + 1);
  await page.screenshot({ path: `test-results/${test.info().project.name}-full-hand-history.png` });
  await openMenu(page); await page.locator('#return-title').click();
  await openMenu(page); await page.locator('#score-history').click();
  await page.locator('.table-menu [data-score-tab="hands"]').click();
  await expect(page.locator('.table-menu .history-summary')).toHaveText('全8局（東一局〜南四局）');
  await expect(page.locator('.table-menu .score-hands tbody tr')).toHaveCount(8);
  if (await page.locator('.table-menu .history-scroll').evaluate(el => el.scrollHeight > el.clientHeight + 2)) {
    await expect(page.getByRole('button', { name: '最後の局の履歴へ', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '最後の局の履歴へ', exact: true }).click();
  }
  await expect(page.locator('.table-menu .score-hands tbody tr').last()).toBeInViewport();
  await page.screenshot({ path: `test-results/${test.info().project.name}-menu-full-hand-history.png` });
});

test('a genuine early ending is distinguished from a clipped history list', async ({ page }) => {
  await completeFixture(page, 2, true);
  await expect(page.locator('.history-summary')).toHaveText('全2局 · 東二局でトビ終了');
  await expect(page.locator('.score-history')).toHaveAttribute('data-history-count', '2');
  await expect(page.locator('.history-summary')).toHaveAttribute('title', 'あなた -7,000点');
});
