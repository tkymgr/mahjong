import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../../src/game/characters.js';
import { characterAppearance } from '../../src/game/characterAppearance.js';
import { MahjongSession } from '../../src/game/session.js';
import Majiang from '@kobalab/majiang-core';

test('all nine adult character identities have four distinct expression assets',()=>{
  const paths=[];
  for(const character of CHARACTERS){
    assert.equal(Object.keys(character.expressions).length,4);
    for(const path of Object.values(character.expressions)){assert.ok(path.includes(character.id+'-'));paths.push(path);}
    assert.equal(characterAppearance(character,1,null).avatar,character.avatar);
  }
  assert.equal(new Set(paths).size,36);
});

test('appearance responds to relative points and remains tied to player ID after seat rotation',()=>{
  const c=CHARACTERS[0],model={player_id:[2,3,0,1],defen:[25000,25000,25000,25000]};
  for(const [points,mood] of [[25000,'normal'],[30000,'happy'],[22500,'upset'],[15000,'flustered'],[7500,'crisis'],[-1000,'crisis']]){
    model.defen[1]=points;assert.equal(characterAppearance(c,1,model,{startPoints:25000}).mood,mood);
  }
  model.defen[1]=30000;assert.equal(characterAppearance(c,1,model,{startPoints:50000}).mood,'flustered');
  model.defen[1]=50000;assert.equal(characterAppearance(c,1,model,{startPoints:50000}).mood,'normal');
  assert.equal(characterAppearance(c,2,model,{startPoints:25000}).mood,'normal');
});

for(const type of ['hule','pingju'])test(`${type} uses a settlement snapshot without changing scores or applying it twice`,()=>{
  const s=new MahjongSession();s.engine={model:{player_id:[2,3,0,1],defen:[25000,25000,25000,25000],shoupai:Array.from({length:4},()=>Majiang.Shoupai.fromString('m123456p123s789z11'))}};
  const data={l:0,baojia:3,shoupai:'m123456p123s789z11',fu:30,fanshu:6,defen:18000,hupai:[],fenpei:[18000,0,0,-18000]};
  s.handleEvent(type,type==='hule'?data:{...data,name:'荒牌平局'});
  assert.deepEqual(s.result.standings,[25000,7000,43000,25000]);
  assert.deepEqual(s.model.defen,[25000,25000,25000,25000]);
  const losing=characterAppearance(CHARACTERS[0],1,s.model,s.rules,s.result);
  assert.equal(losing.mood,'crisis');
  if(type==='hule')assert.equal(characterAppearance(CHARACTERS[1],2,s.model,s.rules,s.result).mood,'happy');
  s.model.defen=[...s.result.standings];
  assert.deepEqual(characterAppearance(CHARACTERS[0],1,s.model,s.rules,s.result),losing);
  s.handleEvent('qipai');assert.equal(s.result,null);
});

test('a winning expression takes precedence, and a small loss shows disappointment',()=>{
  const c=CHARACTERS[0],model={defen:[25000,1000,25000,25000]};
  assert.equal(characterAppearance(c,1,model,null,{type:'hule',winnerId:1}).mood,'happy');
  assert.equal(characterAppearance(c,2,model,null,{type:'hule',winnerId:1,players:[{id:2,delta:-1000}]}).mood,'upset');
});
