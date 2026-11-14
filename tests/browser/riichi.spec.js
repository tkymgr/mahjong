import {test,expect} from '@playwright/test';
import {ready,start} from './helpers.js';

async function prepareRiichi(page,hand='m123456p123s78z11'){
 await ready(page);await start(page);
 await page.evaluate(hand=>{
  const g=window.mahjongGame,s=g.session,m=s.model;s.engine.dispose();s.pending=null;s.autoPlay=false;s.speech=null;s.phase='playing';m.player_id=[0,1,2,3];
  const Human=s.human.constructor,h=new Human(s);s.human=h;
  h.action({kaiju:{id:0,rule:s.engine._rule,title:'Test',player:s.names,qijia:0}},()=>{});
  h.action({qipai:{zhuangfeng:0,jushu:0,changbang:0,lizhibang:1,defen:[24000,25000,25000,25000],baopai:'m9',shoupai:[hand+'*','','','']}},()=>{});
  s.respond();m.shoupai[0]=h.shoupai.clone();m.he[0]=h.he;s.publish();g.table.draw();
  window.riichiReply=null;
  window.riichiDraw=tile=>{
   h.action({zimo:{l:0,p:tile}},reply=>{window.riichiReply=reply;});
   if(window.riichiReply?.dapai)h.action({dapai:{l:0,p:window.riichiReply.dapai}},()=>{});
   m.shoupai[0]=h.shoupai.clone();m.he[0]=h.he;s.publish();g.table.draw();
  };
 },hand);
}

test('riichi normally discards the drawn tile without a click or pending choice',async({page})=>{
 await prepareRiichi(page);await page.evaluate(()=>window.riichiDraw('m9'));
 expect(await page.evaluate(()=>window.riichiReply)).toEqual({dapai:'m9_'});
 expect(await page.evaluate(()=>window.mahjongGame.session.pending)).toBeNull();
 await expect(page.locator('.table-actions')).toHaveCount(0);
 expect(await page.evaluate(()=>window.mahjongGame.session.humanHand.toString())).toBe('m123456p123s78z11*');
 expect(await page.evaluate(()=>window.mahjongGame.session.model.he[0]._pai.at(-1))).toBe('m9_');
});

test('riichi tsumo waits for the win button',async({page})=>{
 await prepareRiichi(page);await page.evaluate(()=>window.riichiDraw('s9'));
 expect(await page.evaluate(()=>window.riichiReply)).toBeNull();
 await expect(page.getByRole('button',{name:'ツモ',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'和了せずツモ切り',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ツモ',exact:true}).click();
 expect(await page.evaluate(()=>window.riichiReply)).toEqual({hule:'-'});
});

for(const kan of [true,false])test(`riichi concealed kan asks first: ${kan?'declare':'pass and discard'}`,async({page})=>{
 await prepareRiichi(page,'m111p234s34578z11');await page.evaluate(()=>window.riichiDraw('m1'));
 expect(await page.evaluate(()=>window.riichiReply)).toBeNull();
 await expect(page.getByRole('button',{name:/^カン /})).toBeVisible();
 await expect(page.getByRole('button',{name:'見送り（ツモ切り）',exact:true})).toBeVisible();
 await (kan?page.getByRole('button',{name:/^カン /}):page.getByRole('button',{name:'見送り（ツモ切り）',exact:true})).click();
 expect(await page.evaluate(()=>window.riichiReply)).toEqual(kan?{gang:'m1111'}:{dapai:'m1_'});
});
