import { test, expect } from '@playwright/test';
import { ready, start } from './helpers.js';
import { CHARACTERS } from '../../src/game/characters.js';

for(const winner of [1,2,3])test(`player ${winner} winning hand stays outside the result panel and its exact winning tile is marked`,async({page})=>{
 await ready(page);await start(page);
 for(const shoupai of ['m123456p123s789z11','m234p789z11,s111-,z555=']){
  await page.evaluate(({winner,shoupai,characters})=>{
   const g=window.mahjongGame,s=g.session;s.engine.dispose();s.pending=null;s.opponents=characters;
   const seat=s.model.player_id.indexOf(winner),delta=[0,0,0,0];delta[seat]=8000;delta[(seat+1)%4]=-8000;
   s.handleEvent('hule',{l:seat,baojia:(seat+1)%4,shoupai,fu:40,fanshu:4,defen:8000,hupai:[{name:shoupai.includes(',')?'白':'立直',fanshu:1},{name:'ドラ',fanshu:3}],fenpei:delta});
   s.request({kind:'result',choices:[{label:'次へ',reply:{}}],auto:()=>({})},()=>{});g.table.draw();
  },{winner,shoupai,characters:CHARACTERS.slice(0,3)});
  const panel=page.locator('.hand-result'),box=await panel.boundingBox(),board=await page.locator('#canvas').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(board.x);expect(box.x+box.width).toBeLessThanOrEqual(board.x+board.width+1);
  expect(box.y).toBeGreaterThanOrEqual(board.y);expect(box.y+box.height).toBeLessThanOrEqual(board.y+board.height+1);
  const tiles=await page.evaluate(winner=>window.mahjongGame.table.tiles.filter(t=>t.player===winner&&['hand','meld'].includes(t.kind)).map(t=>({x:t.x,y:t.y,w:t.w,h:t.h,winning:t.winning,drawn:t.drawn,code:t.code})),winner);
  expect(tiles).toHaveLength(14);
  for(const t of tiles){
   const b={x:board.x+t.x*board.width/1536,y:board.y+t.y*board.height/720,w:t.w*board.width/1536,h:t.h*board.height/720};
   expect(b.x+b.w<=box.x||box.x+box.width<=b.x||b.y+b.h<=box.y||box.y+box.height<=b.y,JSON.stringify({winner,tile:b,panel:box})).toBe(true);
  }
  expect(tiles.filter(t=>t.winning)).toHaveLength(1);expect(tiles.find(t=>t.winning).code).toBe('z1');
  await expect(page.locator('.win-tile-detail img')).toHaveAttribute('alt','和了牌：東');
  await expect(page.locator('.winning-tile-marker')).toBeVisible();
  if(!shoupai.includes(','))await page.screenshot({path:`test-results/${test.info().project.name}-winner-${winner}-visible.png`});
 }
});
