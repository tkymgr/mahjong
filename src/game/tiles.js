// Tile codes are majiang-core's m/p/s/z notation. Atlas indices are our art API.
export function tileIndex(tile) {
  const suit = tile?.[0], n = +tile?.[1] || 5;
  return suit === 'z' ? 26 + n : ['m', 'p', 's'].indexOf(suit) * 9 + n - 1;
}
export function tileName(tile) {
  const n = +tile[1] || 5;
  return tile[0] === 'z' ? ['東', '南', '西', '北', '白', '發', '中'][n - 1] : `${tile[1] === '0' ? '赤' : ''}${'一二三四五六七八九'[n - 1]}${{ m: '萬', p: '筒', s: '索' }[tile[0]]}`;
}
export function meldTiles(meld) {
  const suit = meld[0], result = [];
  for (let i = 1; i < meld.length; i++) if (/\d/.test(meld[i])) result.push({ tile: suit + meld[i], called: /[+=-]/.test(meld[i + 1] || '') });
  const source = meld.match(/[+=-]/)?.[0];
  if (source) {
    // Core notation attaches the source to the called tile in numeric order.
    // Display it at the caller's left / middle / right to identify the discarder.
    const called = result.splice(result.findIndex(entry => entry.called), 1)[0];
    const position = source === '-' ? 0 : source === '=' ? 1 : result.length;
    result.splice(position, 0, called);
  }
  const concealed = !source;
  return result.map((entry, i) => ({ ...entry, back: concealed && (i === 0 || i === result.length - 1) }));
}
export function handTiles(hand) {
  if (!hand) return [];
  const result = [];
  for (const suit of ['m', 'p', 's', 'z']) {
    const counts = hand._bingpai[suit];
    for (let n = 1; n < counts.length; n++) {
      const reds = n === 5 && suit !== 'z' ? counts[0] : 0;
      for (let i = 0; i < counts[n]; i++) result.push({ tile: suit + (i < reds ? 0 : n), drawn: false });
    }
  }
  // Private representation is isolated here and covered by tests against pinned 1.4.1.
  if (hand._zimo?.length === 2) {
    const i = result.findIndex(p => p.tile === hand._zimo);
    if (i >= 0) result.push({ ...result.splice(i, 1)[0], drawn: true });
  }
  return result;
}
