import test from 'node:test';
import assert from 'node:assert/strict';
import Majiang from '@kobalab/majiang-core';
import ComputerPlayer from '@kobalab/majiang-ai';
import { HumanPlayer, MahjongSession, ManagedGame } from '../../src/game/session.js';
import { libraryRules, normalizeRules } from '../../src/game/rules.js';
import { handTiles, tileIndex, meldTiles } from '../../src/game/tiles.js';
import { loadPreferences, savePreferences } from '../../src/game/preferences.js';

test('rules validate inputs and map to the MIT core', () => {
  const rule = libraryRules({ rounds: 1, startPoints: 30000, redDora: true, ron: 2, openTanyao: false });
  assert.equal(rule['場数'], 1); assert.equal(rule['配給原点'], 30000);
  assert.deepEqual(rule['赤牌'], { m: 1, p: 1, s: 1 }); assert.equal(rule['最大同時和了数'], 2);
  assert.equal(rule['クイタンあり'], false);
  assert.equal(normalizeRules({ rounds: 99 }).rounds, 2);
});

test('tile adapter preserves drawn duplicates, red fives, white and green', () => {
  const hand = Majiang.Shoupai.fromString('m055p123s123z11223');
  const tiles = handTiles(hand);
  assert.equal(tiles.length, 14); assert.equal(tiles.filter(p => p.tile === 'm0').length, 1);
  assert.equal(tiles.filter(p => p.drawn).length, 1);
  assert.equal(tileIndex('z5'), 31); assert.equal(tileIndex('z6'), 32);
  assert.equal(tileIndex('m0'), 4);
  assert.equal(meldTiles('p555+5').length, 4);
  assert.deepEqual(meldTiles('m1111').map(p => p.back), [true, false, false, true]);
});

test('settings round trip, migrate old preferences and tolerate blocked storage', () => {
  const data = new Map([['mahjong', 'speed=2&sound=0&']]);
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(loadPreferences(storage).sound, false); assert.equal(loadPreferences(storage).speed, 2);
  const prefs = { speed: 4, sound: true, music: false, musicVolume: .37, rules: normalizeRules({ rounds: 1 }) };
  savePreferences(prefs, storage); assert.deepEqual(loadPreferences(storage), prefs);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(loadPreferences(blocked).speed, 3); assert.doesNotThrow(() => savePreferences(prefs, blocked));
});

function humanFixture(hand, options) {
  const session = new MahjongSession();
  const human = new HumanPlayer(session);
  human.action({ kaiju: { id: 0, rule: libraryRules(options), title: 'Test', player: ['A', 'B', 'C', 'D'], qijia: 0 } }, () => {});
  human.action({ qipai: { zhuangfeng: 0, jushu: 0, changbang: 0, lizhibang: 0, defen: [25000, 25000, 25000, 25000], baopai: 'm9', shoupai: [hand, '', '', ''] } }, () => {});
  session.respond();
  return { human, session };
}

test('human adapter offers valid tsumo, chi, pon and concealed kan replies', () => {
  let f = humanFixture('m123456p123s789z1');
  let reply;
  f.human.action({ zimo: { l: 0, p: 'z1' } }, value => { reply = value; });
  assert.ok(f.session.pending.choices.some(c => c.label === 'ツモ'));
  f.session.choose(f.session.pending.choices.findIndex(c => c.label === 'ツモ'));
  assert.deepEqual(reply, { hule: '-' });
  f = humanFixture('m12p123456s789z11');
  f.human.action({ dapai: { l: 3, p: 'm3' } }, () => {});
  assert.ok(f.session.pending.choices.some(c => c.reply.fulou === 'm123-'));
  f = humanFixture('m11p123456s789z11');
  f.human.action({ dapai: { l: 1, p: 'm1' } }, () => {});
  assert.ok(f.session.pending.choices.some(c => c.label.startsWith('ポン')));
  f = humanFixture('m111p234567s789z1');
  f.human.action({ zimo: { l: 0, p: 'm1' } }, () => {});
  assert.ok(f.session.pending.choices.some(c => c.reply.gang === 'm1111'));
});

test('riichi restricts discards and emits the library marker', () => {
  const { human, session } = humanFixture('m123456p123s78z11');
  let reply;
  human.action({ zimo: { l: 0, p: 's1' } }, value => { reply = value; });
  assert.ok(session.pending.riichi.includes('s1_'));
  session.toggleRiichi();
  assert.equal(session.discard('z1'), false);
  assert.equal(session.discard('s1', true), true);
  assert.deepEqual(reply, { dapai: 's1_*' });
});

function riichiFixture(hand='m123456p123s78z11', draw='s1', options) {
  const f=humanFixture(hand,options);let reply;
  f.human.action({zimo:{l:0,p:draw}},value=>{reply=value;});
  f.session.toggleRiichi();
  assert.equal(f.session.discard(draw,true),true);
  assert.equal(reply.dapai,draw+'_*');
  f.human.action({dapai:{l:0,p:reply.dapai}},()=>{});
  assert.equal(f.human.shoupai.lizhi,true);
  return f;
}

test('riichi automatically discards only the drawn tile without requesting input',()=>{
  const {human,session}=riichiFixture();let reply;
  human.action({zimo:{l:0,p:'m9'}},value=>{reply=value;});
  assert.deepEqual(reply,{dapai:'m9_'});assert.equal(session.pending,null);
  assert.ok(human.get_dapai(human.shoupai).includes(reply.dapai));
});

test('riichi auto discard retains the exact red-five tile',()=>{
  const {human,session}=riichiFixture(undefined,undefined,{redDora:true});let reply;
  human.action({zimo:{l:0,p:'p0'}},value=>{reply=value;});
  assert.deepEqual(reply,{dapai:'p0_'});assert.equal(session.pending,null);
});

test('an opponent riichi does not enable automatic discards for the human',()=>{
  const {human,session}=humanFixture('m123456p123s78z11');let reply;
  human._model.shoupai[1]._lizhi=true;
  human.action({zimo:{l:0,p:'m9'}},value=>{reply=value;});
  assert.equal(reply,undefined);assert.equal(session.pending.kind,'discard');
});

test('a riichi tsumo win waits for confirmation and can be explicitly discarded',()=>{
  for(const win of [true,false]){
    const {human,session}=riichiFixture();let reply;
    human.action({zimo:{l:0,p:'s9'}},value=>{reply=value;});
    assert.equal(reply,undefined);assert.equal(session.pending.kind,'discard');
    const index=session.pending.choices.findIndex(c=>win?c.reply.hule:c.reply.dapai==='s9_');
    assert.ok(index>=0);session.choose(index);
    assert.deepEqual(reply,win?{hule:'-'}:{dapai:'s9_'});
  }
});

test('riichi keeps ron confirmation on an opponent discard',()=>{
  const {human,session}=riichiFixture();let reply;
  human.action({dapai:{l:1,p:'s9'}},value=>{reply=value;});
  assert.equal(reply,undefined);assert.equal(session.pending.kind,'reaction');
  const index=session.pending.choices.findIndex(c=>c.reply.hule);
  assert.ok(index>=0);session.choose(index);assert.deepEqual(reply,{hule:'-'});
});

test('riichi asks before a legal concealed kan and can discard the drawn tile instead',()=>{
  for(const kan of [true,false]){
    const {human,session}=riichiFixture('m111p234s34578z11','p9');let reply;
    human.action({zimo:{l:0,p:'m1'}},value=>{reply=value;});
    assert.ok(human.get_gang_mianzi(human.shoupai).includes('m1111'));
    assert.equal(reply,undefined);assert.equal(session.pending.kind,'discard');
    const index=session.pending.choices.findIndex(c=>kan?c.reply.gang==='m1111':c.reply.dapai==='m1_');
    assert.ok(index>=0);session.choose(index);
    assert.deepEqual(reply,kan?{gang:'m1111'}:{dapai:'m1_'});assert.equal(session.pending,null);
  }
});

test('a kan forbidden by the core rules does not interrupt automatic riichi discards',()=>{
  const {human,session}=riichiFixture('m111p234s34578z11','p9');let reply;
  human._rule['リーチ後暗槓許可レベル']=0;
  human.action({zimo:{l:0,p:'m1'}},value=>{reply=value;});
  assert.ok(human.shoupai.get_gang_mianzi().includes('m1111'));
  assert.deepEqual(human.get_gang_mianzi(human.shoupai),[]);
  assert.deepEqual(reply,{dapai:'m1_'});assert.equal(session.pending,null);
});

test('disposed riichi sessions do not issue automatic replies',()=>{
  const {human,session}=riichiFixture();let reply;session.dispose();
  human.action({zimo:{l:0,p:'m9'}},value=>{reply=value;});
  assert.equal(reply,undefined);assert.equal(session.pending,null);
});

test('quick pause and resume retains a pending engine timer without stalling',async()=>{
  const players=Array.from({length:4},()=>({action:(_message,reply)=>reply?.({})}));
  const game=new ManagedGame(players,()=>{},libraryRules());let advances=0;
  game.dwell=30;game.reply_kaiju=()=>{advances++;};
  try{
    game.call_players('kaiju',players.map(()=>({kaiju:{}})),30);
    game.stop();game.start();
    await new Promise(resolve=>setTimeout(resolve,60));assert.equal(advances,1);
    game.call_players('kaiju',players.map(()=>({kaiju:{}})),20);game.stop();
    await new Promise(resolve=>setTimeout(resolve,40));assert.equal(advances,1);
    game.start();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(advances,2);
  }finally{game.dispose();}
});

test('a discarded winning tile causes permanent furiten on ron', () => {
  const { human, session } = humanFixture('m123456789p12z11');
  human.action({ zimo: { l: 0, p: 'p3' } }, () => {});
  session.discard('p3', true);
  human.action({ dapai: { l: 0, p: 'p3_' } }, () => {});
  human.action({ zimo: { l: 1, p: '' } }, () => {});
  human.action({ dapai: { l: 1, p: 'p3' } }, () => {});
  assert.ok(!session.pending?.choices.some(c => c.reply.hule));
});

test('representative scoring is delegated to the MIT engine', () => {
  const param = { rule: libraryRules(), zhuangfeng: 0, menfeng: 1, hupai: { lizhi: 1 }, baopai: [], fubaopai: null, jicun: { changbang: 0, lizhibang: 0 } };
  // Use a complete 14-tile seven-pairs hand, with no extra winning tile.
  const tsumo = Majiang.Util.hule(Majiang.Shoupai.fromString('m1144p2288s3399z55'), null, { ...param, hupai: {} });
  assert.ok(tsumo.hupai.some(yaku => yaku.name === '七対子'));
  assert.equal(tsumo.fu, 25);
  assert.equal(tsumo.fanshu, 3);
  assert.equal(tsumo.defen, 3200);
  const kokushi = Majiang.Util.hule(Majiang.Shoupai.fromString('m119p19s19z1234567'), null, { ...param, hupai: {} });
  assert.equal(kokushi.damanguan, 1);
  assert.equal(kokushi.defen, 32000);
});

test('a complete synchronous MIT-AI east round settles and ranks four players', { timeout: 180000 }, () => {
  let state = 73117;
  const originalRandom = Math.random;
  Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  try {
    let result;
    const rule = Majiang.rule({ ...libraryRules({ rounds: 1, renchan: 0 }), '途中流局あり': false });
    const game = new ManagedGame(Array.from({ length: 4 }, () => new ComputerPlayer()), paipu => { result = paipu; }, rule);
    game.do_sync();
    assert.ok(result.log.length >= 4);
    assert.deepEqual([...result.rank].sort(), [1, 2, 3, 4]);
    assert.equal(result.defen.reduce((a, b) => a + b), 100000);
    assert.ok(Math.abs(result.point.reduce((a, b) => a + +b, 0)) < .001);
    assert.ok(result.log.some(hand => hand.some(event => event.hule || event.pingju)));
    game.dispose();
  } finally { Math.random = originalRandom; }
});

test('a real mixed match progresses through human riichi and automatic drawn-tile replies', {timeout:180000},()=>{
  const session=new MahjongSession();let requests=0,declared=0,autoCuts=0,result;
  session.request=(data,callback)=>{
    requests++;const win=data.choices?.find(c=>c.reply.hule);
    if(win)return callback(win.reply);
    if(data.kind==='reaction')return callback({});
    if(data.riichi?.length){declared++;return callback({dapai:data.riichi.at(-1)+'*'});}
    callback(data.auto());
  };
  class ObservedHuman extends HumanPlayer {
    action_zimo(data,gangzimo){
      const before=requests,riichi=this.shoupai.lizhi,callback=this._callback;let reply;
      this._callback=value=>{reply=value;callback(value);};
      try{super.action_zimo(data,gangzimo);if(riichi&&requests===before&&reply?.dapai?.endsWith('_'))autoCuts++;}
      finally{this._callback=callback;}
    }
  }
  let seed=81023;const original=Math.random;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let game;
  try{
    game=new ManagedGame([new ObservedHuman(session),...Array.from({length:3},()=>new ComputerPlayer())],p=>{result=p;},Majiang.rule({...libraryRules({rounds:1,renchan:0}),'途中流局あり':false}));
    session.engine=game;game.do_sync();
    assert.ok(declared>0);assert.ok(autoCuts>0);assert.equal(result.log.length,4);
    assert.equal(result.defen.reduce((a,b)=>a+b),100000);
    assert.deepEqual([...result.rank].sort(),[1,2,3,4]);
  }finally{game?.dispose();Math.random=original;}
});

test('disposed sessions cannot reply or advance', async () => {
  const session = new MahjongSession({ preferences: { speed: 4, sound: false } });
  session.start(); const engine = session.engine; session.dispose();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(engine.closed, true); assert.equal(engine.delays.size, 0);
  assert.equal(session.respond({ dapai: 'm1' }), false);
});

test('ron result retains the winning tile for the revealed hand and clears it next round', () => {
  const session = new MahjongSession();
  session.engine = { model: { player_id: [0, 1, 2, 3], shoupai: [Majiang.Shoupai.fromString('m123456p123s789z1')] } };
  session.handleEvent('hule', { l: 0, baojia: 1, shoupai: 'm123456p123s789z11', fu: 30, fanshu: 1, defen: 1000, hupai: [{ name: '立直' }], fenpei: [1000, -1000, 0, 0] });
  assert.equal(handTiles(session.revealedHands.get(0)).length, 14);
  assert.equal(session.result.title, 'あなたのロン和了');
  session.handleEvent('qipai');
  assert.equal(session.revealedHands.size, 0);
});

for(const name of ['荒牌平局','九種九牌'])test(`${name} reveals snapshots of every hand without changing declarations or payments`,()=>{
  const s=new MahjongSession();s.opponents=[{name:'ひなた'},{name:'さき'},{name:'レイ'}];
  const hands=['m123456p123z1,s9999','p12345678s123z24','s12345678m123z33','m147p258s26z13,z7777'].map(p=>Majiang.Shoupai.fromString(p));
  const strings=hands.map(h=>h.toString()),points=[25000,25000,25000,25000];
  s.engine={model:{player_id:[2,3,0,1],shoupai:hands,defen:points}};
  const data={name,shoupai:[strings[0],'',strings[2],''],fenpei:[1500,-1500,1500,-1500]};
  const original=JSON.stringify(data);s.handleEvent('pingju',data);
  assert.deepEqual([...s.revealed],[0,1,2,3]);assert.equal(s.revealedHands.size,4);
  for(let seat=0;seat<4;seat++){assert.notEqual(s.revealedHands.get(seat),hands[seat]);assert.equal(s.revealedHands.get(seat).toString(),strings[seat]);}
  assert.deepEqual(hands.map(h=>h.toString()),strings);assert.deepEqual(s.model.defen,points);assert.equal(JSON.stringify(data),original);
  assert.deepEqual(s.result.players.map(p=>p.id),[2,3,0,1]);assert.deepEqual(s.result.players.map(p=>p.delta),data.fenpei);
  assert.equal(s.result.title,name==='荒牌平局'?'流局':'九種九牌');
  s.handleEvent('qipai');assert.equal(s.revealed.size,0);assert.equal(s.revealedHands.size,0);assert.equal(s.result,null);
});

test('winning results distinguish indicator tiles from actual dora and never infer hidden ura',()=>{
  const s=new MahjongSession();
  s.engine={model:{player_id:[0,1,2,3],shoupai:[Majiang.Shoupai.fromString('m123456p123s789z11')],shan:{baopai:['m9','z4','z7'],fubaopai:['s8']}}};
  const data={l:0,baojia:1,shoupai:'m123456p123s789z11',fu:30,fanshu:4,defen:7700,hupai:[{name:'立直',fanshu:1},{name:'裏ドラ',fanshu:2}],fenpei:[7700,-7700,0,0],fubaopai:['p9','z4','z7']};
  s.handleEvent('hule',data);
  assert.deepEqual(s.result.dora,[{indicator:'m9',tile:'m1'},{indicator:'z4',tile:'z1'},{indicator:'z7',tile:'z5'}]);
  assert.deepEqual(s.result.uraDora,[{indicator:'p9',tile:'p1'},{indicator:'z4',tile:'z1'},{indicator:'z7',tile:'z5'}]);
  assert.deepEqual(s.result.yaku[1],{name:'裏ドラ',value:'2翻'});
  s.handleEvent('hule',{...data,fubaopai:null,hupai:[{name:'大三元',fanshu:'*'}],damanguan:1});
  assert.deepEqual(s.result.uraDora,[]);assert.equal(s.result.yaku[0].value,'*');
});

test('meld display identifies the discarder and preserves the called tile, red fives and remaining order',()=>{
  const cases=[
    ['m123-', ['m3','m1','m2'],0],
    ['m12-3', ['m2','m1','m3'],0],
    ['m1-23', ['m1','m2','m3'],0],
    ['p340-', ['p0','p3','p4'],0],
    ['p555-', ['p5','p5','p5'],0],
    ['p555=', ['p5','p5','p5'],1],
    ['p555+', ['p5','p5','p5'],2],
    ['p550-', ['p0','p5','p5'],0],
    ['p550=', ['p5','p0','p5'],1],
    ['p550+', ['p5','p5','p0'],2],
    ['s1111-', ['s1','s1','s1','s1'],0],
    ['s1111=', ['s1','s1','s1','s1'],1],
    ['s1111+', ['s1','s1','s1','s1'],3],
    ['s111-1', ['s1','s1','s1','s1'],0],
    ['s111=1', ['s1','s1','s1','s1'],1],
    ['s111+1', ['s1','s1','s1','s1'],3]
  ];
  for(const [meld,codes,called] of cases){
    const tiles=meldTiles(meld);
    assert.deepEqual(tiles.map(t=>t.tile),codes,meld);
    assert.deepEqual(tiles.map((t,i)=>t.called?i:null).filter(i=>i!==null),[called],meld);
    assert.ok(tiles.every(t=>!t.back),meld);
  }
  assert.deepEqual(meldTiles('z5555').map(t=>t.back),[true,false,false,true]);
});

test('music settings migrate independently and clamp invalid volume',()=>{
  const storage=value=>({getItem:key=>key==='mahjong.preferences.v2'?JSON.stringify(value):null});
  const old=loadPreferences(storage({sound:false}));
  assert.equal(old.sound,false);assert.equal(old.music,false);assert.equal(old.musicVolume,.25);
  assert.equal(loadPreferences(storage({music:false,musicVolume:2})).musicVolume,1);
  assert.equal(loadPreferences(storage({musicVolume:-1})).musicVolume,0);
  assert.equal(loadPreferences(storage({musicVolume:'loud'})).musicVolume,.25);
});

test('winning tile keeps its exact red identity and is the single drawn card in the revealed snapshot',()=>{
  const s=new MahjongSession();s.engine={model:{player_id:[2,3,0,1],defen:[25000,25000,25000,25000],shoupai:Array.from({length:4},()=>Majiang.Shoupai.fromString('m123456p123s789z1'))}};
  s.handleEvent('hule',{l:0,baojia:1,shoupai:'m123456p55s123z11p0',fu:30,fanshu:3,defen:3900,hupai:[],fenpei:[3900,-3900,0,0]});
  assert.equal(s.result.winnerId,2);assert.equal(s.result.winningTile,'p0');assert.equal(s.result.winMethod,'ロン');
  const drawn=handTiles(s.revealedHands.get(0)).filter(t=>t.drawn);assert.deepEqual(drawn,[{tile:'p0',drawn:true}]);
});
