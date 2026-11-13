import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const layout=JSON.parse(await fs.readFile(path.join(root,'assets/title/title-tiles-layout.json'),'utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try{
  await server.listen();const port=server.httpServer.address().port;
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:layout.referenceSize[0],height:layout.referenceSize[1]},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/scripts/title-tiles-render.html`);
  await page.waitForFunction(()=>!!window.titleAuthoring,null,{timeout:60000});
  for(const [pass,name]of [['beauty','title-tiles-on-plane.png'],['plane','title-tiles-plane.png'],['tiles','title-tiles-3d.png']]){
    const data=await page.evaluate(pass=>window.titleAuthoring.capture(pass),pass);
    await fs.writeFile(path.join(root,'assets/title',name),Buffer.from(data.split(',')[1],'base64'));
  }
  if(errors.length)throw Error(errors.join('\n'));
  const metrics=await page.evaluate(()=>window.titleAuthoring.metrics());
  for(const tile of metrics.tiles)if(tile.dimensionsMm.some((value,index)=>Math.abs(value-layout.tileDimensionsMm[index])>0.0001))throw Error('Inconsistent physical tile dimensions');
  const heldWidth=metrics.tiles.at(-1).bounds.width;
  if(heldWidth/layout.heldTile.fingerWidthPixels>1.5)throw Error('Held tile exceeds the fingertip scale reference');
  if(metrics.tiles.filter(t=>t.flat&&!t.hidden).some(t=>t.bounds.width/heldWidth>1.65))throw Error('Foreground tiles are oversized relative to the held tile');
  await fs.writeFile(path.join(root,'assets/title/title-tiles-render.json'),JSON.stringify(metrics,null,2)+'\n');
  console.log(`Rendered ${metrics.tileCount} actual 3D tiles at ${metrics.renderSize.join(' x ')}, dimensions ${metrics.tileDimensionsMm.join(' x ')} mm`);
}finally{await browser?.close();await server.close();}
