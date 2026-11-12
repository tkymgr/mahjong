import {test,expect} from '@playwright/test';
import {ready,start} from './helpers.js';

async function prepare(page){
  await ready(page);await start(page);
  return page.evaluate(()=>{
    const g=window.mahjongGame,t=g.table,h=t.hits[3],r=g.canvas.getBoundingClientRect();
    window.touchDiscards=[];const discard=g.session.discard.bind(g.session);
    g.session.discard=(...args)=>{window.touchDiscards.push(args);return discard(...args);};
    const y=h.y+h.h-8;
    // Find a real boundary between two ray-picked tiles, not just their boxes.
    let boundary=null;
    for(let x=h.x;x<h.x+h.w+30;x+=.25){const a=t.hit(x,y),b=t.hit(x+5*1536/r.width,y);if(a?.id===h.id&&b?.id&&b.id!==a.id){boundary={x:r.x+x*r.width/1536,y:r.y+y*r.height/720};break;}}
    return {boundary,center:{x:r.x+(h.x+h.w/2)*r.width/1536,y:r.y+y*r.height/720},tile:h.tile,drawn:h.drawn,id:h.id};
  });
}
const touchSessions=new WeakMap();
async function pointer(page,type,p){
  let cdp=touchSessions.get(page);
  if(!cdp){cdp=await page.context().newCDPSession(page);touchSessions.set(page,cdp);}
  const types={pointerdown:'touchStart',pointermove:'touchMove',pointerup:'touchEnd',pointercancel:'touchCancel'};
  await cdp.send('Input.dispatchTouchEvent',{type:types[type],touchPoints:['pointerup','pointercancel'].includes(type)?[]:[{x:p.x,y:p.y,id:1,radiusX:4,radiusY:4,force:1}]});
}

test('a small finger drift across a tile boundary keeps the initially touched tile',async({page})=>{
  const p=await prepare(page);expect(p.boundary).not.toBeNull();
  await pointer(page,'pointerdown',p.boundary);
  await pointer(page,'pointermove',{x:p.boundary.x+5,y:p.boundary.y});
  expect(await page.evaluate(()=>window.mahjongGame.table.hover)).toBe(p.id);
  await pointer(page,'pointerup',{x:p.boundary.x+5,y:p.boundary.y});
  expect(await page.evaluate(()=>window.touchDiscards)).toEqual([[p.tile,p.drawn]]);
});

test('dragging away and returning, pointer cancellation and secondary touches do not discard',async({page})=>{
  const p=await prepare(page);
  await pointer(page,'pointerdown',p.center);
  await pointer(page,'pointermove',{x:p.center.x,y:p.center.y-30});
  await pointer(page,'pointermove',p.center);await pointer(page,'pointerup',p.center);
  await pointer(page,'pointerdown',p.center);await pointer(page,'pointercancel',p.center);
  await page.evaluate(p=>{const c=document.querySelector('#canvas');for(const type of ['pointerdown','pointerup'])c.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:42,pointerType:'touch',isPrimary:false,button:0,clientX:p.x,clientY:p.y}));},p.center);
  expect(await page.evaluate(()=>window.touchDiscards)).toEqual([]);
  await pointer(page,'pointerdown',p.center);await pointer(page,'pointerup',p.center);
  expect(await page.evaluate(()=>window.touchDiscards)).toEqual([[p.tile,p.drawn]]);
});

test('a touch just below the hand is accepted, while empty table space stays inactive',async({page,isMobile})=>{
  await prepare(page);
  const p=await page.evaluate(()=>{
    const g=window.mahjongGame,t=g.table,h=t.hits[3],r=g.canvas.getBoundingClientRect();
    const x=h.x+h.w/2,y=h.y+h.h+3*720/r.height;
    return {x:r.x+x*r.width/1536,y:r.y+y*r.height/720,strict:t.hit(x,y)?.id||null,touch:t.hit(x,y,{x:6*1536/r.width,y:6*720/r.height})?.id,id:h.id,tile:h.tile,drawn:h.drawn,empty:t.hit(768,260,{x:6*1536/r.width,y:6*720/r.height})?.id||null};
  });
  expect(p.strict).toBeNull();expect(p.touch).toBe(p.id);expect(p.empty).toBeNull();
  if(isMobile)await page.touchscreen.tap(p.x,p.y);
  else {await pointer(page,'pointerdown',p);await pointer(page,'pointerup',p);}
  expect(await page.evaluate(()=>window.touchDiscards)).toEqual([[p.tile,p.drawn]]);
});
