const WINDS = ['東', '南', '西', '北'];

// qipai scores and settlement seats rotate; final scores use fixed player IDs.
// Compare successive fixed-ID balances so riichi deposits, multiple wins, and
// the final allocation of leftover deposits are included exactly once.
export function createMatchResult(paipu, { rounds = 2, startPoints = 25000, opponents = [], number = 1 } = {}) {
  const players = paipu.player.map((name, id) => ({
    id, identity: id === 0 ? 'you' : opponents[id - 1]?.id || `seat-${id}`,
    name, avatar: id === 0 ? null : opponents[id - 1]?.avatar || null,
    rank: paipu.rank[id], points: paipu.defen[id], score: Number(paipu.point[id]),
  }));
  const hands = paipu.log.map(events => ({ events, deal: events.find(event => event.qipai)?.qipai })).filter(hand => hand.deal);
  const balances = deal => {
    const fixed = [0, 0, 0, 0];
    deal.defen.forEach((points, seat) => { fixed[(paipu.qijia + deal.jushu + seat) % 4] = points; });
    return fixed;
  };
  const history = hands.map(({ events, deal }, index) => {
    const before = balances(deal), after = index + 1 < hands.length ? balances(hands[index + 1].deal) : [...paipu.defen];
    const wins = events.filter(event => event.hule).map(event => event.hule);
    const draw = events.find(event => event.pingju)?.pingju;
    return {
      number: index + 1, round: `${WINDS[deal.zhuangfeng] || '東'}${'一二三四'[deal.jushu]}局`, honba: deal.changbang,
      result: wins.length ? wins[0].baojia == null ? 'ツモ' : 'ロン' : draw?.name === '荒牌平局' ? '流局' : draw?.name || '終了',
      winners: wins.map(win => players[(paipu.qijia + deal.jushu + win.l) % 4].name),
      changes: after.map((points, id) => points - before[id]), balances: after,
    };
  });
  return { number, title: rounds === 1 ? '東風戦終了' : '半荘終了', format: rounds === 1 ? '東風戦' : '半荘', startPoints, players, history };
}

export function aggregateResults(records) {
  const totals = new Map();
  for (const record of records) for (const player of record.players) {
    const total = totals.get(player.identity) || { identity: player.identity, name: player.name, avatar: player.avatar, games: 0, score: 0, rankSum: 0 };
    total.games++; total.score = Math.round((total.score + player.score) * 10) / 10; total.rankSum += player.rank;
    totals.set(player.identity, total);
  }
  return [...totals.values()].map(total => ({ ...total, averageRank: total.rankSum / total.games })).sort((a, b) => a.identity === 'you' ? -1 : b.identity === 'you' ? 1 : b.score - a.score || a.name.localeCompare(b.name));
}
export function signedScore(value) { return `${value > 0 ? '+' : ''}${value.toFixed(1)}`; }
export function signedPoints(value) { return `${value > 0 ? '+' : ''}${value.toLocaleString()}`; }
