import { test, expect } from '@playwright/test';
import { ready, start } from './helpers.js';

test('winning summary identifies ura indicators and actual dora in a compact panel',async({page})=>{
  await ready(page);await start(page);
  await page.evaluate(()=>{
    const s=window.mahjongGame.session;s.engine.dispose();const seat=s.humanSeat;
    s.model.shan._baopai=['m9'];
    const fenpei=[0,0,0,0];fenpei[seat]=7700;fenpei[(seat+1)%4]=-7700;
    s.handleEvent('hule',{l:seat,baojia:(seat+1)%4,shoupai:'m123456p123s789z11',fu:30,fanshu:4,defen:7700,hupai:[{name:'立直',fanshu:1},{name:'ドラ',fanshu:1},{name:'裏ドラ',fanshu:2}],fubaopai:['z4'],fenpei});
    s.request({kind:'result',choices:[{label:'次へ',reply:{}}],auto:()=>({})},()=>{window.winContinued=true;});
  });
  const panel=page.locator('.hand-result');
  await expect(panel).toContainText('30符 4翻');
  const ura=panel.locator('.dora-group[aria-label="裏ドラ"]');
  await expect(ura.getByRole('img',{name:'裏ドラ表示牌：北',exact:true})).toBeVisible();
  await expect(ura.getByRole('img',{name:'裏ドラ：東',exact:true})).toBeVisible();
  await expect(panel.locator('.win-yaku')).toContainText('裏ドラ2翻');
  await page.waitForFunction(()=>[...document.querySelectorAll('.dora-pair img')].every(img=>img.complete&&img.naturalWidth>0));
  const board=await page.locator('#canvas').boundingBox(),box=await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(board.x);expect(box.y).toBeGreaterThanOrEqual(board.y);
  expect(box.x+box.width).toBeLessThanOrEqual(board.x+board.width+1);expect(box.y+box.height).toBeLessThanOrEqual(board.y+board.height+1);
  expect(box.height).toBeLessThanOrEqual(board.height*.79);
  await page.waitForFunction(()=>!window.mahjongGame.table.dirty);
  const detailBox=await panel.locator('.win-details').boundingBox();
  for(const img of await panel.locator('.dora-pair img').all()){const b=await img.boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(detailBox.y+detailBox.height+1);}
  await page.screenshot({path:`test-results/${test.info().project.name}-win-ura-dora.png`});
  await page.locator('#continue-result').click();expect(await page.evaluate(()=>window.winContinued)).toBe(true);
  await page.evaluate(()=>{
    const s=window.mahjongGame.session;
    s.handleEvent('hule',{l:s.humanSeat,baojia:null,shoupai:'m123456p123s789z11',fu:30,fanshu:1,defen:1000,hupai:[{name:'門前清自摸和',fanshu:1}],fubaopai:null,fenpei:[1000,-500,-300,-200]});
  });
  await expect(ura).toContainText('公開なし');await expect(ura.locator('img')).toHaveCount(0);
  await page.evaluate(()=>{
    const s=window.mahjongGame.session;
    s.model.shan._baopai=['m9','p9','s9','z4','z7'];
    s.handleEvent('hule',{l:s.humanSeat,baojia:null,shoupai:'m123456p123s789z11',fu:30,fanshu:13,defen:32000,hupai:Array.from({length:12},(_,i)=>({name:`役${i+1}`,fanshu:1})),fubaopai:['m1','p1','s1','z1','z5'],fenpei:[32000,-16000,-8000,-8000]});
    s.request({kind:'result',choices:[{label:'次へ',reply:{}}],auto:()=>({})},()=>{});
  });
  await expect(ura.locator('img')).toHaveCount(10);
  await expect(page.locator('#continue-result')).toBeInViewport();
  const stressBox=await panel.boundingBox();
  expect(stressBox.y+stressBox.height).toBeLessThanOrEqual(board.y+board.height+1);
  expect(await page.locator('.win-details').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
});
