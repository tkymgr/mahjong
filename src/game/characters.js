const roster = [
  ['hinata', 'ひなた', 'beginner', '門前で素直に、まっすぐ立直', '#d69a6a', 'straight'],
  ['ponta', 'こはる', 'beginner', '鳴いてつなぐ、軽やかな一局', '#d9b17a', 'cheerful'],
  ['suzume', 'すずめ', 'beginner', '遠い手は無理せず、安全第一', '#98b68a', 'careful'],
  ['ren', 'れん', 'intermediate', '受け入れ重視、鳴いて先手', '#ca895b', 'quick'],
  ['saki', 'さき', 'intermediate', '門前を育て、ドラを大切に', '#a59ac6', 'closed'],
  ['teppei', 'しずく', 'intermediate', '危険を感じたら早めに守る', '#87b6bb', 'defensive'],
  ['rei', 'レイ', 'advanced', '攻守の切り替えで流れを読む', '#9dbfae', 'balanced'],
  ['jin', 'りん', 'advanced', '広い待ちを選び、攻め切る', '#b18d9d', 'attacking'],
  ['gen', 'あやめ', 'advanced', '安く鳴かず、打点を育てる', '#b59dc9', 'value'],
];
// IDs stay stable for match history. Policy levels are internal, never UI labels.
export const CHARACTERS = Object.freeze(roster.map(([id, name, level, tagline, color, style]) => Object.freeze({ id, name, level, tagline, color, style, avatar: `characters/${id}.png`, expressions: Object.freeze(Object.fromEntries(['happy','upset','flustered','crisis'].map(mood => [mood, `characters/expressions/${id}-${mood}.webp`]))) })));

// Partial Fisher-Yates: each character is equally eligible, without replacement.
export function selectOpponents(random = Math.random) {
  const pool = [...CHARACTERS];
  for (let i = 0; i < 3; i++) {
    const j = i + Math.min(pool.length - i - 1, Math.max(0, Math.floor(random() * (pool.length - i))));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
