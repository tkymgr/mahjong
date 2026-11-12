// Application options mapped to majiang-core's documented rule keys.
import Majiang from '@kobalab/majiang-core';

export const DEFAULT_RULES = Object.freeze({ rounds: 2, startPoints: 25000, redDora: false, openTanyao: true, ron: 1, renchan: 2, nagashi: false, kiriage: true, extension: false });
export function normalizeRules(value = {}) {
  const r = { ...DEFAULT_RULES };
  for (const [key, allowed] of Object.entries({ rounds: [1, 2], startPoints: [25000, 30000], ron: [1, 2, 3], renchan: [0, 1, 2, 3] })) {
    if (allowed.includes(value[key])) r[key] = value[key];
  }
  for (const key of ['redDora', 'openTanyao', 'nagashi', 'kiriage', 'extension']) if (typeof value[key] === 'boolean') r[key] = value[key];
  return r;
}
export function libraryRules(value) {
  const r = normalizeRules(value);
  return Majiang.rule({
    '配給原点': r.startPoints, '場数': r.rounds, '赤牌': { m: +r.redDora, p: +r.redDora, s: +r.redDora },
    'クイタンあり': r.openTanyao, '最大同時和了数': r.ron, '連荘方式': r.renchan,
    '流し満貫あり': r.nagashi, '切り上げ満貫あり': r.kiriage, '延長戦方式': r.extension ? 1 : 0,
    '喰い替え許可レベル': 2, '役満パオあり': false,
  });
}
export function ruleSummary(value) {
  const r = normalizeRules(value);
  return [r.rounds === 1 ? '東風戦' : '東南戦', `${r.startPoints.toLocaleString()}点開始`, `喰いタン ${r.openTanyao ? 'あり' : 'なし'}`, `赤牌 ${r.redDora ? '各1枚' : 'なし'}`, ['頭ハネ', 'ダブロン', 'トリロン'][r.ron - 1], ['連荘なし', '和了連荘', 'テンパイ連荘', 'ノーテン連荘'][r.renchan], `切り上げ満貫 ${r.kiriage ? 'あり' : 'なし'}`, `流し満貫 ${r.nagashi ? 'あり' : 'なし'}`, '途中流局あり・オーラス止めあり'];
}
