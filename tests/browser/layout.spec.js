import {test,expect} from '@playwright/test';
import {ready,start,openMenu,closeMenu,clickGame} from './helpers.js';
import {TILE,PLAYER_HAND,WORLD_TILE_SCALE} from '../../src/game/model-layout.js';

test('PLAYER tiles use the selected slight tilt, equal sizes and a fixed lower edge',async({page,isMobile})=>{
 await ready(page);await start(page);
 const data=await page.evaluate(()=>{
  const t=window.mahjongGame.table;
  return {worldProjection:t.camera.camera.projection,handProjection:t.handCamera.camera.projection,
   railNames:t.app.root.children.map(e=>e.name).filter(n=>/rail/i.test(n)),
   tiles:t.tiles.filter(p=>p.kind==='hand'&&p.player===0).map(p=>({code:p.code,drawn:p.drawn,x:p.x,y:p.y,w:p.w,h:p.h,screenSpace:p.screenSpace,euler:p.entity.getEulerAngles().toArray()}))};
 });
 expect(data.worldProjection).toBe(0);expect(data.handProjection).toBe(1);
 expect(data.railNames).not.toContain('End rail');expect(data.railNames).not.toContain('Front rail');
 expect(data.tiles).toHaveLength(14);
 const first=data.tiles[0],board=await page.locator('#canvas').boundingBox();
 for(const tile of data.tiles){
  expect(tile.screenSpace).toBe(true);expect(tile.euler[0]).toBeCloseTo(PLAYER_HAND.pitch,3);expect(Math.abs(tile.euler[1])+Math.abs(tile.euler[2])).toBeLessThan(.001);
  expect(tile.w).toBeCloseTo(first.w,3);expect(tile.h).toBeCloseTo(first.h,3);expect(tile.y).toBeCloseTo(first.y,3);
  const angle=PLAYER_HAND.pitch*Math.PI/180;
  expect((tile.w*board.width/1536)/(tile.h*board.height/720)).toBeCloseTo(TILE.width/(TILE.height*Math.cos(angle)+TILE.depth*Math.sin(angle)),2);
  expect(tile.x).toBeGreaterThanOrEqual(0);expect(tile.x+tile.w).toBeLessThanOrEqual(1536);
  expect(tile.y+tile.h).toBeLessThanOrEqual(720);
 }
 await page.screenshot({path:`test-results/${test.info().project.name}-frontal-hand.png`});
 await page.evaluate(()=>{window.playerHandClicks=[];window.mahjongGame.session.discard=(...args)=>window.playerHandClicks.push(args);});
 const targets=[first,data.tiles.at(-1)];
 for(const tile of targets)await clickGame(page,tile.x+tile.w/2,tile.y+tile.h*.75,isMobile);
 expect(await page.evaluate(()=>window.playerHandClicks)).toEqual(targets.map(tile=>[tile.code,tile.drawn]));
});

test('PLAYER open melds and concealed kan backs fit the frontal rack without overlapping',async({page})=>{
 await ready(page);await start(page);
 for(const hand of ['m123z11,m111-,p555=,s789-','z11,m1111,p2222,s3333,z4444']){
  const data=await page.evaluate(hand=>{
   const g=window.mahjongGame,s=g.session;s.engine.dispose();s.pending=null;s.phase='playing';
   const Hand=s.humanHand.constructor;s.model.shoupai[s.humanSeat]=Hand.fromString(hand);g.table.draw();s.publish();
   return g.table.tiles.filter(t=>t.player===0&&t.screenSpace).map(t=>({kind:t.kind,hidden:t.hidden,roll:t.roll,x:t.x,y:t.y,w:t.w,h:t.h}));
  },hand);
  const cards=[...data].sort((a,b)=>a.x-b.x);
  for(let i=0;i<cards.length;i++){
   expect(cards[i].x).toBeGreaterThanOrEqual(0);expect(cards[i].x+cards[i].w).toBeLessThanOrEqual(1536);
   expect(cards[i].y+cards[i].h).toBeLessThanOrEqual(720);
   if(i)expect(cards[i-1].x+cards[i-1].w).toBeLessThan(cards[i].x);
  }
  if(hand.includes('-'))expect(data.filter(t=>t.kind==='meld'&&t.roll===90)).toHaveLength(3);
  else expect(data.filter(t=>t.kind==='meld'&&t.hidden)).toHaveLength(8);
 }
});

test('the world camera keeps aligned side rows, perspective depth and ground contact',async({page})=>{
 await ready(page);await page.locator('#start-game').click();await page.waitForFunction(()=>window.mahjongGame.session.pending?.kind==='round');
 const info=await page.evaluate(()=>{const t=window.mahjongGame.table;t.draw();return {camera:t.camera.camera.projection,shadows:t.light.light.castShadows,players:[1,2,3].map(id=>t.tiles.filter(p=>p.kind==='hand'&&p.player===id).map(p=>({x:p.position.x,y:p.position.y,z:p.position.z,w:p.w,h:p.h,height:p.height,scale:p.scale,yaw:p.yaw,back:p.entity.forward.toArray(),contact:p.position.y-p.height/2}))),meshes:t.model.meshes};});
 expect(info.camera).toBe(0);expect(info.shadows).toBe(true);
 for(let i=0;i<3;i++){const hand=info.players[i];expect(hand).toHaveLength(13);for(const p of hand){expect(Math.abs(p.contact)).toBeLessThan(.001);expect(p.scale).toBe(WORLD_TILE_SCALE);}if(i!==1){const rows=[...hand].sort((a,b)=>a.z-b.z);for(const p of rows)expect(p.x).toBe(rows[0].x);expect(rows.at(-1).h).toBeGreaterThan(rows[0].h);expect(rows.at(-1).w).toBeGreaterThan(rows[0].w);expect(rows[0].back[0]*-rows[0].x).toBeGreaterThan(0);}}
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
