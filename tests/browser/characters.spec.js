import {test,expect} from '@playwright/test';
import {ready,start,openMenu,closeMenu} from './helpers.js';
test('three equally sized avatar profiles match the random 3D opponents',async({page})=>{
 await ready(page);await openMenu(page,'characters');await expect(page.locator('.character-roster .opponent-card')).toHaveCount(9);
 await page.locator('.character-roster img').evaluateAll(images=>images.forEach(i=>i.loading='eager'));
 await page.waitForFunction(()=>[...document.querySelectorAll('.character-roster img')].every(i=>i.complete&&i.naturalWidth));
 await expect(page.locator('#game-frame')).not.toContainText(/初級|中級|上級/);
 await expect(page.locator('.character-roster')).toContainText('ひなた');
 await expect(page.locator('.character-roster')).toContainText('安く鳴かず、打点を育てる');
 await page.screenshot({path:`test-results/${test.info().project.name}-character-roster.png`});
 await closeMenu(page);await start(page);
 await expect(page.locator('.seat-profile')).toHaveCount(3);
 await expect(page.locator('.seat-profile small,.profile-points,.own-status,.round-station')).toHaveCount(0);
 const players=await page.evaluate(()=>window.mahjongGame.session.opponents);expect(new Set(players.map(p=>p.id)).size).toBe(3);
 const sizes=[];for(const p of players){const card=page.locator(`.seat-profile[data-character="${p.id}"]`);await expect(card).toContainText(p.name);await expect(card).not.toContainText(/初級|中級|上級/);const b=await card.locator('img').boundingBox();sizes.push(b.width);}
 expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThan(1);await page.screenshot({path:`test-results/${test.info().project.name}-characters.png`});
 const board=await page.locator('#canvas').boundingBox();
 expect(Math.min(...sizes)).toBeGreaterThanOrEqual(board.width/board.height>1.8?90:56);
 const opposite=await page.locator('.seat-2 img').boundingBox();
 expect(Math.abs(opposite.x+opposite.width/2-board.x-board.width/2)).toBeLessThan(1);
 const left=await page.locator('.seat-3 img').boundingBox(),right=await page.locator('.seat-1 img').boundingBox();
 expect(left.x+left.width/2).toBeLessThan(board.x+board.width*.15);
 expect(right.x+right.width/2).toBeGreaterThan(board.x+board.width*.85);
 expect(players.map(p=>p.name).every(name=>['ひなた','こはる','すずめ','れん','さき','しずく','レイ','りん','あやめ'].includes(name))).toBe(true);
 await openMenu(page);await page.locator('#return-title').click();await expect(page.locator('.seat-profile')).toHaveCount(0);
});
