import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source=await readFile(new URL('../assets/pwa/beauty-mahjong-source.png',import.meta.url));
const src='data:image/png;base64,'+source.toString('base64');
const out=new URL('../public/icons/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512],['apple-touch-icon.png',180]]){
  const png=await page.evaluate(async({src,size,maskable})=>{
   const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=c.height=size;
   const ctx=c.getContext('2d');ctx.fillStyle='#153b29';ctx.fillRect(0,0,size,size);
   const scale=maskable ? .75 : 1,offset=size*(1-scale)/2;ctx.drawImage(img,offset,offset,size*scale,size*scale);
   return c.toDataURL('image/png').split(',')[1];
  },{src,size,maskable:name.startsWith('maskable')});
  await writeFile(new URL(name,out),Buffer.from(png,'base64'));
 }
}finally{await browser.close();}
