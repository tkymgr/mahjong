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
  const prefs = { speed: 4, sound: true, rules: normalizeRules({ rounds: 1 }) };
  savePreferences(prefs, storage); assert.deepEqual(loadPreferences(storage), prefs);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(loadPreferences(blocked).speed, 3); assert.doesNotThrow(() => savePreferences(prefs, blocked));
});

function humanFixture(hand) {
  const session = new MahjongSession();
  const human = new HumanPlayer(session);
  human.action({ kaiju: { id: 0, rule: libraryRules(), title: 'Test', player: ['A', 'B', 'C', 'D'], qijia: 0 } }, () => {});
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
