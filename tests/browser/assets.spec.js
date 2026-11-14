import {test,expect} from '@playwright/test';
import {ready,start} from './helpers.js';
import {TILE,WORLD_TILE_SCALE} from '../../src/game/model-layout.js';

test('real 3D tiles retain all face textures and conceal the opponents faces',async({page})=>{
 await ready(page);await page.locator('#start-game').click();await page.waitForFunction(()=>window.mahjongGame.session.pending?.kind==='round');
 const result=await page.evaluate(()=>{const t=window.mahjongGame.table;t.draw();return {textures:t.faceMaterials.size,model:t.model.source,wallContacts:t.tiles.filter(tile=>tile.kind==='wall').map(tile=>({bottom:tile.entity.getPosition().y-tile.height/2,top:tile.entity.getPosition().y+tile.height/2})),worldScales:t.tiles.filter(tile=>tile.kind==='wall'||(tile.kind==='hand'&&tile.player!==0)).map(tile=>tile.scale),players:[1,2,3].map(id=>t.tiles.filter(tile=>tile.kind==='hand'&&tile.player===id).map(tile=>({hidden:tile.hidden,code:tile.code,meshes:tile.meshInstances.length}))),contact:t.tiles.filter(tile=>tile.kind==='hand'&&!tile.screenSpace).map(tile=>tile.position.y-tile.height/2)};});
 expect(result.textures).toBe(37);expect(result.model.repository).toBe('https://github.com/hiinaspace/just-mahjong');
 for(const scale of result.worldScales)expect(scale).toBe(WORLD_TILE_SCALE);
 for(let i=0;i<result.wallContacts.length;i+=2){expect(result.wallContacts[i].bottom).toBeCloseTo(0,3);expect(result.wallContacts[i+1].bottom).toBeCloseTo(result.wallContacts[i].top,3);}
 for(const hand of result.players){expect(hand).toHaveLength(13);for(const p of hand)expect(p).toEqual({hidden:true,code:null,meshes:2});}
 for(const y of result.contact)expect(Math.abs(y)).toBeLessThan(.001);
});

for(const riichi of [false,true])test(`3D rivers have separate readable face areas${riichi?' including sideways riichi tiles':''}`,async({page})=>{
 await ready(page);await start(page);
 const data=await page.evaluate(riichi=>{
  const game=window.mahjongGame,s=game.session,m=s.model;s.engine.dispose();s.pending=null;s.phase='playing';s.result=null;s.speech=null;m.player_id=[0,1,2,3];m.qijia=0;
  const Hand=m.shoupai[0].constructor,River=m.he[0].constructor,codes=['m1','m5','m9','p1','p5','p9','s1','s5','s9','z1','z2','z3','z4','z6','z7','m2','p2','s2'];
  for(let id=0;id<4;id++){m.shoupai[id]=Hand.fromString('m123456789p123z1');m.he[id]=new River();if(riichi)m.shoupai[id]._lizhi=true;codes.forEach((code,i)=>m.he[id].dapai(code+(riichi&&i===3?'*':'')));}
  game.table.draw();s.publish();return game.table.tiles.filter(t=>t.kind==='river').map(t=>({player:t.player,x:t.position.x,z:t.position.z,y:t.position.y,flat:t.flat,yaw:t.yaw,scale:t.scale,code:t.code}));
 },riichi);
 expect(data).toHaveLength(72);
 for(let i=0;i<data.length;i++){const a=data[i];expect(a.flat).toBe(true);expect(a.y).toBeCloseTo(TILE.depth*a.scale/2,5);for(let j=i+1;j<data.length;j++){const b=data[j];const aX=(a.yaw%180?TILE.height:TILE.width)*a.scale/2,aZ=(a.yaw%180?TILE.width:TILE.height)*a.scale/2,bX=(b.yaw%180?TILE.height:TILE.width)*b.scale/2,bZ=(b.yaw%180?TILE.width:TILE.height)*b.scale/2;expect(Math.abs(a.x-b.x)>=aX+bX-.01||Math.abs(a.z-b.z)>=aZ+bZ-.01,JSON.stringify([a,b])).toBe(true);}}
 const layout=await page.evaluate(()=>{
  const g=window.mahjongGame,r=g.canvas.getBoundingClientRect();
  return {faces:[...document.querySelectorAll('.seat-profile img')].map(i=>{const b=i.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}),tiles:g.table.tiles.filter(t=>t.kind==='river'||(t.kind==='hand'&&t.player===0)).map(t=>({x:r.x+t.x*r.width/1536,y:r.y+t.y*r.height/720,w:t.w*r.width/1536,h:t.h*r.height/720}))};
 });
 for(const face of layout.faces)for(const tile of layout.tiles)expect(face.x+face.w<=tile.x+1||tile.x+tile.w<=face.x+1||face.y+face.h<=tile.y+1||tile.y+tile.h<=face.y+1,JSON.stringify({face,tile})).toBe(true);
 await page.screenshot({path:`test-results/${test.info().project.name}-rivers${riichi?'-riichi':''}.png`});
});

test('a flat tile face keeps its printed contrast when the light becomes brighter',async({page})=>{
 await ready(page);await start(page);
 const clip=await page.evaluate(dimensions=>{
  const g=window.mahjongGame,s=g.session,m=s.model;s.engine.dispose();s.pending=null;s.phase='playing';s.speech=null;
  const seat=m.player_id.indexOf(2),River=m.he[seat].constructor;m.he[seat]=new River();m.he[seat].dapai('m1');g.table.draw();s.publish();
  const tile=g.table.tiles.find(t=>t.kind==='river'&&t.player===2),local=g.table.camera.getPosition().clone().set(0,0,dimensions.depth/2+.09),point=g.table.project(tile.entity.getWorldTransform().transformPoint(local)),r=g.canvas.getBoundingClientRect();
  return {x:Math.floor(r.x+point.x*r.width/1536),y:Math.floor(r.y+point.y*r.height/720),width:1,height:1};
 },TILE);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const before=await page.screenshot({clip});
 await page.evaluate(()=>{const g=window.mahjongGame;g.table.light.light.intensity=4;g.app.renderNextFrame=true;});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const after=await page.screenshot({clip});
 const colors=await page.evaluate(async sources=>Promise.all(sources.map(async source=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.drawImage(image,0,0);return [...c.getImageData(0,0,1,1).data].slice(0,3);})),[before,after].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
 expect(Math.max(...colors[0].map((value,i)=>Math.abs(value-colors[1][i])))).toBeLessThanOrEqual(3);
});
