import { test, expect } from '@playwright/test';
import { ready, start } from './helpers.js';

test('called tile position identifies the discarder from every player seat',async({page})=>{
  await ready(page);await start(page);
  const cases=[['m123-',0,'m3'],['m12-3',0,'m2'],['m1-23',0,'m1'],['p340-',0,'p0'],['p550-',0,'p0'],['p550=',1,'p0'],['p550+',2,'p0'],['s1111-',0,'s1'],['s1111=',1,'s1'],['s1111+',3,'s1']];
  for(const [meld,index,code] of cases){
    const players=await page.evaluate(meld=>{
      const g=window.mahjongGame,s=g.session;s.engine.dispose();s.pending=null;s.phase='playing';
      const Hand=s.humanHand.constructor;
      s.model.shoupai=s.model.shoupai.map(()=>Hand.fromString(`m456789z11234,${meld}`));
      const before=s.model.shoupai.map(h=>h.toString());g.table.draw();s.publish();
      return [0,1,2,3].map(id=>({id,unchanged:s.model.shoupai.every((h,i)=>h.toString()===before[i]),tiles:g.table.tiles.filter(t=>t.kind==='meld'&&t.player===id).map(t=>({code:t.code,flat:t.flat,halfWidth:Math.max(...t.meshInstances.map(mi=>id%2?mi.aabb.halfExtents.z:mi.aabb.halfExtents.x)),called:t.screenSpace?t.roll===90:(t.yaw-id*90+360)%360===90,along:[t.position.x,-t.position.z,-t.position.x,t.position.z][id]})).sort((a,b)=>a.along-b.along)}));
    },meld);
    for(const player of players){
      expect(player.unchanged).toBe(true);
      expect(player.tiles.map((t,i)=>t.called?i:null).filter(i=>i!==null),`${meld} player ${player.id}`).toEqual([index]);
      expect(player.tiles[index].code).toBe(code);
      for(let i=1;i<player.tiles.length;i++){const a=player.tiles[i-1],b=player.tiles[i];expect(a.along+a.halfWidth).toBeLessThanOrEqual(b.along-b.halfWidth+.01);}
      if(player.id!==0)expect(player.tiles.every(t=>t.flat)).toBe(true);
    }
  }
  await page.screenshot({path:`test-results/${test.info().project.name}-meld-direction.png`});
});
