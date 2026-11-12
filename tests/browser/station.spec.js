import {test,expect} from '@playwright/test';
import {ready,start} from './helpers.js';

test('automatic table displays all four scores and rotates winds independently of avatars',async({page})=>{
 await ready(page);await start(page);
 const result=await page.evaluate(()=>{
  const g=window.mahjongGame,s=g.session,m=s.model;s.engine.dispose();
  const checksum=()=>{const pixels=g.table.stationCanvas.getContext('2d').getImageData(0,0,768,768).data;let h=0;for(let i=0;i<pixels.length;i+=4)h=(Math.imul(h,31)+pixels[i]+pixels[i+1]*3+pixels[i+2]*7)|0;return h;};
  const before=checksum();m.player_id=[2,3,0,1];m.defen=[32000,18000,27000,23000];m.zhuangfeng=1;m.jushu=1;m.changbang=2;m.lizhibang=1;
  g.table.draw();s.publish();
  return {before,after:checksum(),state:g.table.stationState,enabled:g.table.stationDisplay.enabled,size:g.table.stationBody.getLocalScale().toArray()};
 });
 expect(result.before).not.toBe(result.after);expect(result.enabled).toBe(true);
 expect(result.size).toEqual([204,7,204]);expect(result.state.round).toBe('南二局');
 expect(result.state.honba).toBe(2);expect(result.state.deposits).toBe(1);
 expect(result.state.players.map(p=>p.points)).toEqual([32000,18000,27000,23000]);
 expect(result.state.players.map(p=>p.wind)).toEqual(['西','北','東','南']);
 await expect(page.getByRole('region',{name:'全自動卓の点数表示'})).toContainText('32,000点');
 await expect(page.locator('.seat-profile small,.profile-points,.own-status,.round-station')).toHaveCount(0);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const clip=await page.evaluate(()=>{
  const g=window.mahjongGame,t=g.table,r=g.canvas.getBoundingClientRect(),corners=[];
  for(const x of [-90,90])for(const z of [-90,90])corners.push(t.project(t.camera.getPosition().clone().set(x,9,z)));
  const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y));
  return {x:r.x+x*r.width/1536,y:r.y+y*r.height/720,width:(Math.max(...corners.map(p=>p.x))-x)*r.width/1536,height:(Math.max(...corners.map(p=>p.y))-y)*r.height/720};
 });
 const screenshot=await page.screenshot({clip});
 const rendered=await page.evaluate(async source=>{
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const c=canvas.getContext('2d');c.drawImage(image,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
  let gold=0,cyan=0;for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r>120&&g>90&&b<r*.8)gold++;if(b>90&&g>r*1.1&&b>r*1.1)cyan++;}
  return {gold,cyan};
 },'data:image/png;base64,'+screenshot.toString('base64'));
 expect(rendered.gold).toBeGreaterThan(3);expect(rendered.cyan).toBeGreaterThan(3);
 await page.screenshot({path:`test-results/${test.info().project.name}-automatic-table.png`});
});
