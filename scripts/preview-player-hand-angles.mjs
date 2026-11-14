// Capture real 3D variants in an isolated browser without changing game defaults.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {start} from '../tests/browser/helpers.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.MAHJONG_PREVIEW_URL||'http://127.0.0.1:4173';
const output=path.join(root,'docs/hand-angle-patterns');await fs.mkdir(output,{recursive:true});
const patterns=[
 {id:'current',degrees:0,label:'0° 正面比較用',note:'文字の読みやすさ優先'},
 {id:'a',degrees:5,label:'A｜5° 控えめ',note:'上面を少しだけ見せる'},
 {id:'b',degrees:10,label:'B｜10° 採用パターン',note:'読みやすさと立体感を両立'},
 {id:'c',degrees:15,label:'C｜15° 立体感重視',note:'上面と厚みをはっきり見せる'},
];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1280,height:760},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.waitForFunction(()=>window.mahjongGame?.initialized);await start(page);
 await page.evaluate(async()=>{
  const g=window.mahjongGame,s=g.session,m=s.model;s.engine.dispose();s.pending=null;s.phase='playing';s.speech=null;
  m.player_id=[0,1,2,3];m.qijia=0;
  const Hand=m.shoupai[0].constructor,River=m.he[0].constructor;
  m.shoupai[0]=Hand.fromString('m147p258s369z12567');
  for(let id=0;id<4;id++)m.he[id]=new River();
  const {CHARACTERS}=await import('/src/game/characters.js');
  s.opponents=['hinata','saki','rei'].map(id=>CHARACTERS.find(p=>p.id===id));
  s.publish();g.table.draw();g.table.dirty=false;
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const board=await page.locator('#canvas').boundingBox();
 const clip={x:Math.floor(board.x+board.width*.08),y:Math.floor(board.y+board.height-140),width:Math.ceil(board.width*.84),height:140};
 const rows=[];
 for(const pattern of patterns){
  const metrics=await page.evaluate(degrees=>{
   const g=window.mahjongGame,t=g.table,radians=degrees*Math.PI/180;
   const baseline=-t.handCamera.camera.orthoHeight+2*t.handCamera.camera.orthoHeight*12/720;
   const {width,height,depth}=t.model.dimensions;
   for(const tile of t.tiles.filter(p=>p.screenSpace&&p.kind==='hand')){
    const bodyHeight=(height*Math.cos(radians)+depth*Math.sin(radians))*tile.scale;
    tile.entity.setEulerAngles(degrees,0,0);tile.entity.setPosition(tile.position.x,baseline+bodyHeight/2,0);
   }
   t.updateBounds();g.app.renderNextFrame=true;
   const hand=t.tiles.filter(p=>p.screenSpace&&p.kind==='hand');
   return {degrees,tileCount:hand.length,visibleWidth:hand[0].w,visibleHeight:hand[0].h,lowestPoint:Math.max(...hand.map(p=>p.y+p.h))};
  },pattern.degrees);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(output,`${pattern.id}-full.png`)});
  const crop=await page.screenshot({clip,path:path.join(output,`${pattern.id}-hand.png`)});
  rows.push({...pattern,metrics,image:'data:image/png;base64,'+crop.toString('base64')});
 }
 if(errors.length)throw Error(errors.join('\n'));
 const sheet=await page.evaluate(async rows=>{
  const canvas=document.createElement('canvas');canvas.width=1180;canvas.height=890;
  const c=canvas.getContext('2d');c.fillStyle='#102b22';c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#f5dfab';c.font='bold 32px "Hiragino Kaku Gothic ProN",sans-serif';c.fillText('PLAYER手牌の角度比較',35,47);
  c.fillStyle='#b9c9bb';c.font='17px sans-serif';c.fillText('同じ牌・同じ幅・同じ下端位置で、実際の3Dモデルを比較',35,76);
  for(let i=0;i<rows.length;i++){
   const row=rows[i],y=104+i*186;
   c.fillStyle=i===2?'#f5d786':'#e8e7da';c.font='bold 24px "Hiragino Kaku Gothic ProN",sans-serif';c.fillText(row.label,35,y+24);
   c.fillStyle='#bccdbe';c.font='17px sans-serif';c.fillText(row.note,430,y+23);
   const image=new Image();image.src=row.image;await image.decode();c.drawImage(image,(1180-image.width)/2,y+32);
   c.strokeStyle='#44624f';c.beginPath();c.moveTo(35,y+180);c.lineTo(1145,y+180);c.stroke();
  }
  c.fillStyle='#bccdbe';c.font='17px sans-serif';c.fillText('角度を付けても、牌面の幅と文字の色は揃えています。',35,875);
  return canvas.toDataURL('image/png');
 },rows);
 await fs.writeFile(path.join(output,'comparison.png'),Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile(path.join(output,'patterns.json'),JSON.stringify({createdOn:'2026-11-14',renderer:'Actual PlayCanvas 3D tile models; preview only',referenceHand:'m147p258s369z12567',patterns:rows.map(({image,...row})=>row)},null,2)+'\n');
 console.log('Saved 0 / 5 / 10 / 15 degree previews and comparison sheet in docs/hand-angle-patterns');
}finally{await browser.close();}
