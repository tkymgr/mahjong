import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchResult, aggregateResults } from '../../src/game/results.js';
import { MahjongSession } from '../../src/game/session.js';

const paipu = () => ({
  qijia: 1, player: ['あなた','レイ','レン','サキ'], defen: [24000,33000,18000,25000], rank: [3,1,4,2], point: ['-16.0','43.0','-32.0','5.0'],
  log: [
    [{ qipai: { zhuangfeng: 0, jushu: 0, changbang: 0, defen: [25000,25000,25000,25000] } }, { hule: { l: 0, baojia: 1 } }],
    [{ qipai: { zhuangfeng: 0, jushu: 1, changbang: 1, defen: [17000,25000,25000,33000] } }, { pingju: { name: '荒牌平局' } }],
  ],
});
const opponents = [{ id: 'rei', avatar: 'characters/rei.png' },{ id: 'ren', avatar: 'characters/ren.png' },{ id: 'saki', avatar: 'characters/saki.png' }];

test('results retain fixed player identities across dealer rotation and include deposits', () => {
  const data = paipu();
  const result = createMatchResult(data, { opponents });
  assert.equal(result.title, '半荘終了');
  assert.deepEqual(result.history.map(hand => hand.changes), [[0,8000,-8000,0],[-1000,0,1000,0]]);
  assert.deepEqual(result.history[0].winners, ['レイ']);
  assert.equal(result.history[1].round, '東二局'); assert.equal(result.history[1].honba, 1);
  assert.equal(result.history[1].result, '流局');
  assert.deepEqual(result.players.map(p => p.identity), ['you','rei','ren','saki']);
  assert.deepEqual(result.players.map(p => p.score), [-16,43,-32,5]);
  for (let id = 0; id < 4; id++) assert.equal(result.history.reduce((sum, hand) => sum + hand.changes[id], 0), data.defen[id] - 25000);
  data.defen[0] = 999999; data.player[0] = 'changed';
  assert.equal(result.players[0].points, 24000); assert.equal(result.players[0].name, 'あなた');
});

test('multiple ron winners and final leftover-deposit payment are reflected', () => {
  const data = paipu(); data.log = [[{qipai: { zhuangfeng: 1, jushu: 3, changbang: 2, defen: [24000,25000,25000,25000] }}, {hule:{l:1,baojia:2}}, {hule:{l:3,baojia:2}}]];
  const result = createMatchResult(data, { opponents });
  assert.deepEqual(result.history[0].winners, ['レイ','サキ']);
  assert.equal(result.history[0].round, '南四局');
  assert.equal(result.history[0].changes.reduce((a,b) => a+b), 1000);
});

test('cumulative scores group characters by identity instead of changing seats', () => {
  const first = createMatchResult(paipu(), { opponents });
  const data = paipu(); data.player = ['あなた','レン','サキ','レイ'];
  const second = createMatchResult(data, { opponents: [opponents[1],opponents[2],opponents[0]], number: 2 });
  const totals = aggregateResults([first,second]);
  assert.equal(totals[0].identity, 'you'); assert.equal(totals[0].games, 2); assert.equal(totals[0].score, -32);
  assert.equal(totals.find(p => p.identity === 'rei').score, 48);
  assert.equal(totals.find(p => p.identity === 'ren').score, 11);
  assert.equal(totals.reduce((sum,p) => sum+p.score,0), 0);
});

test('completion is recorded once, survives returning home and excludes abandoned games', () => {
  const session = new MahjongSession(); session.opponents = opponents;
  const data = paipu(); session.completeMatch(data); session.completeMatch(data);
  assert.equal(session.scoreHistory.length, 1); assert.equal(session.phase, 'finished');
  assert.equal(session.autoPlay, false);
  session.home(); assert.equal(session.scoreHistory.length, 1); assert.equal(session.matchResult, null);
  session.start(); assert.equal(session.matchResult, null); assert.equal(session.scoreHistory.length, 1);
  session.home(); assert.equal(session.scoreHistory.length, 1);
  session.opponents = opponents; session.completeMatch(paipu());
  assert.equal(session.scoreHistory.length, 2); assert.equal(session.matchResult.number, 2);
  session.dispose();
});
