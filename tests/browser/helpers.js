export async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.mahjongGame?.initialized && window.mahjongGame.session.phase === 'title');
}
export async function clickGame(page, x, y, touch = false) {
  const canvas = page.locator('#canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  const px = rect.x + x * rect.width / 1536, py = rect.y + y * rect.height / 720;
  if (touch) await page.touchscreen.tap(px, py); else await page.mouse.click(px, py);
}
export async function toHumanTurn(page) {
  for (let i = 0; i < 200; i++) {
    const state = await page.evaluate(() => window.mahjongGame.session.publicState());
    if (state.pendingKind === 'discard') {
      await page.waitForFunction(()=>{
        const g=window.mahjongGame;
        return g.session.pending?.kind==='discard'&&!g.table.dirty&&g.table.hits.length>0;
      });
      return state;
    }
    if (state.pendingKind === 'reaction') await page.getByRole('button', { name: '見送り', exact: true }).click();
    else if (['round', 'result'].includes(state.pendingKind)) await page.locator('[data-choice="0"]').click();
    await page.waitForTimeout(100);
  }
  throw Error('Player turn was not reached');
}
export async function openMenu(page, tab = 'general') {
  if (!await page.getByRole('dialog').isVisible()) await page.locator('#menu-toggle').click();
  await page.locator(`[data-menu-tab="${tab}"]`).click();
}
export async function closeMenu(page) {
  if (await page.getByRole('dialog').isVisible()) await page.locator('#menu-close').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
export async function start(page) {
  await openMenu(page);
  await page.locator('#speed').selectOption('4');
  await closeMenu(page);
  await page.locator('#start-game').click();
  return toHumanTurn(page);
}
