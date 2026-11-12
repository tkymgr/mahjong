import test from 'node:test';
import assert from 'node:assert/strict';
import Majiang from '@kobalab/majiang-core';
import { CHARACTERS, selectOpponents } from '../../src/game/characters.js';
import { CharacterPlayer } from '../../src/game/characterPlayer.js';
import { libraryRules } from '../../src/game/rules.js';
import { ManagedGame, MahjongSession } from '../../src/game/session.js';

function fixture(level, hand = 'm123456p123s78z11', draw = 's1') {
  const player = new CharacterPlayer(CHARACTERS.find(c => c.level === level || c.id === level));
  player.action({ kaiju: { id: 0, rule: libraryRules(), title: 'Test', player: ['A','B','C','D'], qijia: 0 } }, () => {});
  player.action({ qipai: { zhuangfeng: 0, jushu: 0, changbang: 0, lizhibang: 0, defen: [25000,25000,25000,25000], baopai: 'm9', shoupai: [hand,'','',''] } }, () => {});
  if(draw)player.zimo({ l: 0, p: draw });
  return player;
}

test('nine unique characters have three profiles per difficulty and distinct avatar paths', () => {
  assert.equal(CHARACTERS.length, 9);
  for (const level of ['beginner','intermediate','advanced']) assert.equal(CHARACTERS.filter(c => c.level === level).length, 3);
  for (const field of ['id','name','avatar']) assert.equal(new Set(CHARACTERS.map(c => c[field])).size, 9);
});

test('selection samples three without replacement and can reach all nine', () => {
  const seen = new Set();
  for (let i = 0; i < 90; i++) {
    const chosen = selectOpponents(() => i / 90);
    assert.equal(new Set(chosen.map(c => c.id)).size, 3);
    chosen.forEach(c => seen.add(c.id));
  }
  assert.equal(seen.size, 9);
});

test('all policies discard legally and only mark legal riichi', () => {
  for (const {id:level} of CHARACTERS) {
    for (const [hand, draw] of [['m123456p123s78z11','s1'], ['m055p123s123z1122','z3']]) {
      const player = fixture(level, hand, draw), choice = player.select_dapai();
      assert.ok(player.get_dapai(player.shoupai).includes(choice.replace(/\*$/, '')), `${level}: ${choice}`);
      if (choice.endsWith('*')) assert.ok(player.allow_lizhi(player.shoupai, choice.slice(0, -1)));
    }
  }
});

function callFixture(id,hand) {
  const player=fixture(id,hand,null);
  const event={l:3,p:'z5'};
  player.dapai(event);
  assert.equal(player.select_hule(event),false);
  return {player,event};
}

test('closed and calling personalities of the same strength choose different legal actions',()=>{
  for(const [caller,closed] of [['ponta','hinata'],['ren','saki']]){
    const a=callFixture(caller,'m123p456s677z5511'),b=callFixture(closed,'m123p456s677z5511');
    const meld=a.player.select_fulou(a.event);
    assert.equal(meld,'z555-');
    assert.ok(a.player.get_peng_mianzi(a.player.shoupai,'z5-').includes(meld));
    assert.equal(b.player.select_fulou(b.event),undefined);
  }
});

test('value personality passes a cheap open hand that the balanced player accepts',()=>{
  const a=callFixture('rei','m234p456s677z5511'),b=callFixture('gen','m234p456s677z5511');
  assert.equal(a.player.select_fulou(a.event),'z555-');
  assert.equal(b.player.select_fulou(b.event),undefined);
});

test('careful learner folds to a publicly safe tile while the straightforward learner continues',()=>{
  const choices={};
  for(const id of ['hinata','suzume']){
    const player=fixture(id,'m13579p13579s135','z1');
    player._model.shoupai[1]._lizhi=true;player._model.he[1].dapai('m5');
    choices[id]=player.select_dapai();
  }
  assert.equal(choices.suzume,'m5');assert.notEqual(choices.hinata.slice(0,2),'m5');
});

test('defensive player folds a one-away hand while a quick player continues',()=>{
  const choices={};
  for(const id of ['ren','teppei']){
    const player=fixture(id,'m123p456s2378z112','z3');
    player._model.shoupai[1]._lizhi=true;player._model.he[1].dapai('m1');
    choices[id]=player.select_dapai();
  }
  assert.equal(choices.teppei,'m1');assert.notEqual(choices.ren.slice(0,2),'m1');
});

test('intermediate uses a shared genbutsu against riichi while beginner keeps shape', () => {
  for (const level of ['beginner','intermediate']) {
    const player = fixture(level, 'm13579p13579s135', 'z1');
    // Visible opponent riichi and a single known safe tile, deliberately
    // less efficient than the isolated honor: policies must differ.
    player._model.shoupai[1]._lizhi = true;
    player._model.he[1].dapai('m5');
    const choice = player.select_dapai();
    if (level === 'intermediate') assert.equal(choice.slice(0, 2), 'm5');
    else assert.notEqual(choice.slice(0, 2), 'm5');
  }
});

test('mixed-difficulty matches finish with legal settlement', { timeout: 180000 }, () => {
  const selected = ['beginner', 'intermediate', 'advanced', 'beginner'].map(level => CHARACTERS.find(c => c.level === level));
  let state = 81023, result;
  const original = Math.random;
  Math.random = () => { state = (Math.imul(state,1664525) + 1013904223) >>> 0; return state / 4294967296; };
  try {
    const game = new ManagedGame(selected.map(c => new CharacterPlayer(c)), paipu => { result = paipu; }, Majiang.rule({ ...libraryRules({rounds: 1, renchan: 0}), '途中流局あり': false }), () => true, selected.map(c => c.name));
    game.do_sync(); game.dispose();
    assert.deepEqual(result.player, selected.map(c => c.name));
    assert.deepEqual([...result.rank].sort(), [1,2,3,4]);
    assert.equal(result.defen.reduce((a,b) => a+b), 100000);
  } finally { Math.random = original; }
});

test('all nine personalities complete deterministic mixed matches including calls and settlement', {timeout:180000},()=>{
  const original=Math.random;
  try {
    for(const group of [[0,3,6,1],[1,4,7,2],[2,5,8,0]]){
      const selected=group.map(index=>CHARACTERS[index]);
      let seed=81023+group[0],result;
      Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const game=new ManagedGame(selected.map(c=>new CharacterPlayer(c)),paipu=>{result=paipu;},Majiang.rule({...libraryRules({rounds:1,renchan:0}),'途中流局あり':false}),()=>true,selected.map(c=>c.name));
      try{game.do_sync();}finally{game.dispose();}
      assert.deepEqual(result.player,selected.map(c=>c.name));
      assert.deepEqual([...result.rank].sort(),[1,2,3,4]);
      assert.equal(result.defen.reduce((a,b)=>a+b),100000);
    }
  }finally{Math.random=original;}
});

test('a session keeps its identities across hands and clears them at home', () => {
  const session = new MahjongSession(); session.start();
  const selected = session.publicState().opponents;
  assert.equal(selected.length, 3); assert.equal(new Set(selected.map(c => c.id)).size, 3);
  assert.deepEqual(session.model.player, ['あなた', ...selected.map(c => c.name)]);
  session.handleEvent('qipai'); assert.deepEqual(session.publicState().opponents, selected);
  session.home(); assert.deepEqual(session.publicState().opponents, []);
  session.dispose();
});
