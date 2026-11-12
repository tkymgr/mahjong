import {test,expect} from '@playwright/test';
import {ready,start,openMenu,closeMenu,clickGame} from './helpers.js';

test('one perspective camera controls size, aligned side rows, backs and ground contact',async({page})=>{
 await ready(page);await page.locator('#start-game').click();await page.waitForFunction(()=>window.mahjongGame.session.pending?.kind==='round');
 const info=await page.evaluate(()=>{const t=window.mahjongGame.table;t.draw();return {camera:t.camera.camera.projection,shadows:t.light.light.castShadows,players:[1,2,3].map(id=>t.tiles.filter(p=>p.kind==='hand'&&p.player===id).map(p=>({x:p.position.x,y:p.position.y,z:p.position.z,w:p.w,h:p.h,height:p.height,scale:p.scale,yaw:p.yaw,back:p.entity.forward.toArray(),contact:p.position.y-p.height/2}))),meshes:t.model.meshes};});
 expect(info.camera).toBe(0);expect(info.shadows).toBe(true);
 for(let i=0;i<3;i++){const hand=info.players[i];expect(hand).toHaveLength(13);for(const p of hand){expect(Math.abs(p.contact)).toBeLessThan(.001);expect(p.scale).toBe(1);}if(i!==1){const rows=[...hand].sort((a,b)=>a.z-b.z);for(const p of rows)expect(p.x).toBe(rows[0].x);expect(rows.at(-1).h).toBeGreaterThan(rows[0].h*1.3);expect(rows.at(-1).w).toBeGreaterThan(rows[0].w*1.3);expect(rows[0].back[0]*-rows[0].x).toBeGreaterThan(0);}}
 expect(info.meshes.ivory.positions.length).toBeGreaterThan(0);expect(info.meshes.back.positions.length).toBeGreaterThan(0);
});

test('rotating the display preserves the 3D match and ray picking',async({page,isMobile})=>{
 await ready(page);await start(page);await page.evaluate(()=>window.beforeRotation=window.mahjongGame);
 const before=await page.evaluate(()=>{const s=window.mahjongGame.session;return {hand:s.humanHand.toString(),points:[...s.model.defen],count:s.model.he[s.humanSeat]._pai.length};});
 await openMenu(page);for(const [width,height]of [[390,844],[844,390]]){await page.setViewportSize({width,height});await expect.poll(async()=>{const a=await page.locator('#canvas').boundingBox(),b=await page.locator('.table-ui').boundingBox();return Math.max(Math.abs(a.width-b.width),Math.abs(a.height-b.height),Math.abs(a.x-b.x),Math.abs(a.y-b.y));}).toBeLessThan(2);}
 expect(await page.evaluate(()=>window.beforeRotation===window.mahjongGame)).toBe(true);expect(await page.evaluate(()=>window.mahjongGame.session.humanHand.toString())).toBe(before.hand);expect(await page.evaluate(()=>window.mahjongGame.session.model.defen)).toEqual(before.points);
 await closeMenu(page);const h=await page.evaluate(()=>{const h=window.mahjongGame.table.hits[4];return {x:h.x,y:h.y,w:h.w,h:h.h};});await clickGame(page,h.x+h.w/2,h.y+h.h-8,isMobile);
 await page.waitForFunction(n=>{const s=window.mahjongGame.session;return s.model.he[s.humanSeat]._pai.length>n;},before.count);
});
