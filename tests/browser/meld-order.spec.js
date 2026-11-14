import { test, expect } from '@playwright/test';
import { ready, start } from './helpers.js';

test('each seat adds newer melds to the left and keeps the first call on the right after an added kan',async({page})=>{
  await ready(page);await start(page);
  const stages=[
    'm234p456s789z11,m111-',
    'm234s789z11,m111-,p555=',
    'm234z11,m111-,p555=,s789-',
    'm234z11,m111-1,p555=,s789-',
    'z11,m111-1,p555=,s789-,z222+',
    'z11,m1111,p555=,s789-,z222+'
  ];
  for(const hand of stages){
    const players=await page.evaluate(hand=>{
      const g=window.mahjongGame,s=g.session;s.engine.dispose();s.pending=null;s.phase='playing';
      const Hand=s.humanHand.constructor;
      s.model.shoupai=s.model.shoupai.map(()=>Hand.fromString(hand));
      const before=s.model.shoupai.map(h=>[...h._fulou]);g.table.draw();s.publish();
      return [0,1,2,3].map(id=>{
        const seat=s.model.player_id.indexOf(id);
        return {id,before:before[seat],after:[...s.model.shoupai[seat]._fulou],tiles:g.table.tiles.filter(t=>t.player===id&&t.kind==='meld').map(t=>({code:t.code,hidden:t.hidden,along:[t.position.x,-t.position.z,-t.position.x,t.position.z][id]}))};
      });
    },hand);
    for(const p of players){
      expect(p.after).toEqual(p.before);
      const groups=p.before.map(meld=>p.tiles.filter(t=>t.code?.[0]===meld[0]));
      // Concealed kan's hidden outside tiles lack codes; its visible pair still identifies its slot.
      expect(p.tiles).toHaveLength(p.before.reduce((n,m)=>n+(m.match(/\d/g)||[]).length,0));
      for(let i=0;i<groups.length;i++){
        expect(groups[i].length).toBeGreaterThan(0);
        if(i)expect(Math.max(...groups[i].map(t=>t.along))).toBeLessThan(Math.min(...groups[i-1].map(t=>t.along)));
      }
      expect(p.tiles.filter(t=>t.hidden)).toHaveLength(hand.includes('m1111')?2:0);
    }
  }
  await page.screenshot({path:`test-results/${test.info().project.name}-meld-order.png`});
});
