import {test,expect} from '@playwright/test';
import {CHARACTERS} from '../../src/game/characters.js';
import {ready,start} from './helpers.js';

const normal=['m123456p123z1,s9999','p12345678s123z24','s12345678m123z33','m147p258s26z13,z7777'];
const nine=['m119p19s19z123456m2','p23456789s234z22','s23456789m234z33','m345678p345678z4'];
function sampleDeck(hands,dora){
 const pool=Object.fromEntries(['m','p','s','z'].flatMap(s=>Array.from({length:s==='z'?7:9},(_,i)=>[s+(i+1),4])));
 for(const hand of hands)for(const suit of hand.match(/[mpsz]\d+/g))for(const n of suit.slice(1))pool[suit[0]+n]--;
 for(const tile of dora)pool[tile]--;
 if(Object.values(pool).some(n=>n<0))throw Error('Invalid draw sample: more than four copies');
 const tiles=Object.entries(pool).flatMap(([p,n])=>Array(n).fill(p));let seed=93217;
 for(let i=tiles.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]];}
 return tiles;
}
async function drawScene(page,abort){
 await ready(page);await start(page);
 const hands=abort?nine:normal,dora=abort?['p9']:['p9','m9','z5'];
 const pool=sampleDeck(hands,dora),rivers=abort?[[],[],[],[]]:[0,1,2,3].map(i=>pool.slice(i*17,(i+1)*17));
 const wall=abort?[...pool,...dora]:[...pool.slice(68),...dora];
 await page.evaluate(({hands,dora,rivers,wall,abort,opponents})=>{
  const g=window.mahjongGame,s=g.session,m=s.model;s.engine.dispose();s.pending=null;s.autoPlay=false;s.speech=null;m.player_id=[0,1,2,3];m.qijia=0;s.opponents=opponents;
  const Hand=m.shoupai[0].constructor,River=m.he[0].constructor;
  for(let seat=0;seat<4;seat++){m.shoupai[seat]=Hand.fromString(hands[seat]);m.he[seat]=new River();rivers[seat].forEach(p=>m.he[seat].dapai(p));}
  m.shan._pai=wall;m.shan._baopai=dora;
  s.handleEvent('pingju',{name:abort?'九種九牌':'荒牌平局',shoupai:abort?[hands[0],'','','']:[hands[0],'',hands[2],''],fenpei:abort?[0,0,0,0]:[1500,-1500,1500,-1500]});
  s.request({kind:'result',choices:[{label:'次へ',reply:{}}],auto:()=>({})},()=>{window.drawContinued=true;s.handleEvent('qipai');});
  g.table.draw();
 },{hands,dora,rivers,wall,abort,opponents:['hinata','saki','rei'].map(id=>CHARACTERS.find(c=>c.id===id))});
}

for(const abort of [false,true])test(`${abort?'nine terminals':'exhaustive draw'} opens all hands behind a compact unobstructing result bar`,async({page})=>{
 await drawScene(page,abort);
 await expect(page.locator('#hand-result-title')).toHaveText(abort?'九種九牌':'流局');
 await expect(page.locator('.draw-point-changes li')).toHaveCount(4);
 await expect(page.locator('.hand-result-backdrop')).toHaveCount(0);
 const data=await page.evaluate(()=>{
  const g=window.mahjongGame,r=g.canvas.getBoundingClientRect(),panel=document.querySelector('.draw-summary').getBoundingClientRect();
  return {revealed:[...g.session.revealed],snapshots:g.session.revealedHands.size,panel:{x:panel.x,y:panel.y,w:panel.width,h:panel.height},board:{x:r.x,y:r.y,w:r.width,h:r.height},hands:g.table.tiles.filter(t=>t.kind==='hand'||t.kind==='meld').map(t=>({player:t.player,hidden:t.hidden,flat:t.flat,screenSpace:t.screenSpace,x:r.x+t.x*r.width/1536,y:r.y+t.y*r.height/720,w:t.w*r.width/1536,h:t.h*r.height/720}))};
 });
 expect(data.revealed).toEqual([0,1,2,3]);expect(data.snapshots).toBe(4);
 expect(data.panel.x).toBeGreaterThanOrEqual(data.board.x);expect(data.panel.y).toBeGreaterThanOrEqual(data.board.y);
 expect(data.panel.x+data.panel.w).toBeLessThanOrEqual(data.board.x+data.board.w+1);
 expect(data.panel.y+data.panel.h).toBeLessThanOrEqual(data.board.y+data.board.h+1);
 expect(data.panel.h).toBeLessThan(data.board.h*.4);
 for(const hand of data.hands){
  expect(hand.hidden).toBe(false);if(hand.player!==0)expect(hand.flat).toBe(true);else expect(hand.screenSpace).toBe(true);
  const p=data.panel;expect(p.x+p.w<=hand.x+1||hand.x+hand.w<=p.x+1||p.y+p.h<=hand.y+1||hand.y+hand.h<=p.y+1,JSON.stringify({panel:p,hand})).toBe(true);
 }
 const board=await page.locator('#canvas').boundingBox();await page.locator('#canvas').click({position:{x:board.width*.5,y:board.height*.13}});
 await expect(page.locator('.draw-summary')).toBeVisible();
 await page.screenshot({path:`test-results/${test.info().project.name}-${abort?'nine-terminals':'draw'}-all-hands.png`});
 await page.locator('#continue-result').click();expect(await page.evaluate(()=>window.drawContinued)).toBe(true);
 await expect(page.locator('.draw-summary')).toHaveCount(0);
 expect(await page.evaluate(()=>window.mahjongGame.session.revealed.size)).toBe(0);
});
