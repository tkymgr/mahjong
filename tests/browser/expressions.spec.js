import { test, expect } from '@playwright/test';
import { ready, start } from './helpers.js';
import { CHARACTERS } from '../../src/game/characters.js';

async function setPortraits(page,characters,points){
  await page.evaluate(({characters,points})=>{
    const g=window.mahjongGame,s=g.session;s.engine.dispose();s.pending=null;s.phase='playing';s.result=null;s.opponents=characters;
    s.model.defen=[25000,...points];g.table.draw();s.publish();
  },{characters,points});
}

test('all nine square portraits load every expression and two costume stages',async({page})=>{
  await ready(page);await start(page);
  for(let i=0;i<9;i+=3){
    const characters=CHARACTERS.slice(i,i+3);
    for(const [mood,points] of [['normal',25000],['happy',32000],['upset',20000],['flustered',14000],['crisis',5000]]){
      await setPortraits(page,characters,[points,points,points]);
      await expect(page.locator(`.seat-profile[data-mood="${mood}"]`)).toHaveCount(3);
      await page.waitForFunction(()=>[...document.querySelectorAll('.seat-profile img')].every(i=>i.complete&&i.naturalWidth===256));
      for(const c of characters){
        const img=page.locator(`.seat-profile[data-character="${c.id}"] img`);
        await expect(img).toHaveAttribute('src',new RegExp(mood==='normal'?`characters/${c.id}.png$`:`expressions/${c.id}-${mood}.webp$`));
        expect(await img.evaluate(el=>getComputedStyle(el).clipPath)).toBe('none');
        const box=await img.boundingBox();expect(box.width).toBeCloseTo(box.height,1);
      }
    }
  }
  // Show the two clothing stages and a normal portrait together, with stable names.
  await setPortraits(page,CHARACTERS.slice(0,3),[14000,5000,25000]);
  await expect(page.locator('.seat-1')).toHaveAttribute('data-mood','flustered');
  await expect(page.locator('.seat-2')).toHaveAttribute('data-mood','crisis');
  await page.waitForFunction(()=>[...document.querySelectorAll('.seat-profile img')].every(i=>i.complete&&i.naturalWidth===256));
  const name=await page.locator('.seat-2 strong').boundingBox(),right=await page.locator('.seat-1 img').boundingBox();
  expect(name.y+name.height).toBeLessThanOrEqual(right.y);
  await page.screenshot({path:`test-results/${test.info().project.name}-square-expressions.png`});
});

test('result faces reflect settlement before confirmation even after seat rotation',async({page})=>{
  await ready(page);await start(page);
  await page.evaluate(characters=>{
    const g=window.mahjongGame,s=g.session;s.engine.dispose();s.opponents=characters;s.model.player_id=[2,3,0,1];s.model.defen=[25000,25000,25000,25000];
    s.handleEvent('hule',{l:0,baojia:3,shoupai:'m123456p123s789z11',fu:30,fanshu:6,defen:18000,hupai:[],fenpei:[18000,0,0,-18000]});g.table.draw();
  },CHARACTERS.slice(0,3));
  await expect(page.locator('.seat-1')).toHaveAttribute('data-mood','crisis');
  await expect(page.locator('.seat-2')).toHaveAttribute('data-mood','happy');
  await expect(page.locator('.seat-3')).toHaveAttribute('data-mood','normal');
  expect(await page.evaluate(()=>window.mahjongGame.session.model.defen)).toEqual([25000,25000,25000,25000]);
  await page.evaluate(()=>{const g=window.mahjongGame;g.session.model.defen=[25000,7000,43000,25000];g.table.draw();});
  await expect(page.locator('.seat-1')).toHaveAttribute('data-mood','crisis');
  await page.evaluate(()=>{const g=window.mahjongGame;g.session.model.defen=[25000,25000,25000,25000];g.session.handleEvent('qipai');g.table.draw();});
  await expect(page.locator('.seat-profile[data-mood="normal"]')).toHaveCount(3);
});

test('a missing expression falls back to the original portrait',async({page})=>{
  await page.route('**/expressions/hinata-crisis.webp',route=>route.abort());
  await ready(page);await start(page);
  await setPortraits(page,CHARACTERS.slice(0,3),[5000,25000,25000]);
  const card=page.locator('.seat-profile[data-character="hinata"]');
  await expect(card).toHaveAttribute('data-mood','crisis');
  await expect(card.locator('img')).toHaveAttribute('src',/characters\/hinata\.png$/);
  expect(await card.locator('img').evaluate(el=>el.complete&&el.naturalWidth===256)).toBe(true);
});
