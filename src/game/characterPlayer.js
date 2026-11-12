import Majiang from '@kobalab/majiang-core';
import ComputerPlayer from '@kobalab/majiang-ai';

const normal = p => p.slice(0, 2).replace('0', '5');
const STYLES = Object.freeze({
  straight:  { calls: 'closed',   foldAt: Infinity, outs: 0, value: 0 },
  cheerful:  { calls: 'quick',    foldAt: Infinity, outs: 0, value: .5 },
  careful:   { calls: 'closed',   foldAt: 3,        outs: 0, value: 0 },
  quick:     { calls: 'quick',    foldAt: 3,        outs: 1, value: 0 },
  closed:    { calls: 'closed',   foldAt: 2,        outs: 1, value: 3 },
  defensive: { calls: 'careful',  foldAt: 1,        outs: 1, value: .5 },
  balanced:  { calls: 'balanced', foldAt: 2,        outs: 1, value: 0 },
  attacking: { calls: 'quick',    foldAt: 3,        outs: 1, value: 0 },
  value:     { calls: 'value',    foldAt: 2,        outs: 1, value: 3 },
});

// Only this player's hand and publicly revealed tiles feed these policies.
// Strength and personality are separate; neither reads concealed information.
export class CharacterPlayer extends ComputerPlayer {
  constructor(character) { super(); this.character = character; }
  get style() {
    return STYLES[this.character.style] || STYLES[{beginner:'straight', intermediate:'closed', advanced:'balanced'}[this.character.level]];
  }
  threats() {
    return this._model.shoupai.map((hand, seat) => hand.lizhi && seat !== this._menfeng ? seat : -1).filter(seat => seat >= 0);
  }
  isSafe(p, threats) {
    return threats.length > 0 && threats.every(seat => this._model.he[seat]._pai.some(tile => normal(tile) === normal(p)));
  }
  doraCount(p) {
    return +(p[1] === '0') + this.shan.baopai.filter(indicator => normal(Majiang.Shan.zhenbaopai(indicator)) === normal(p)).length;
  }
  select_dapai(info) {
    if (this.character.level === 'advanced') return this.advancedDiscard(info);
    const legal = this.get_dapai(this.shoupai);
    const threats = this.threats();
    const candidates = legal.map(p => {
      const hand = this.shoupai.clone().dapai(p);
      const distance = Majiang.Util.xiangting(hand);
      const outs = Majiang.Util.tingpai(hand).reduce((sum, tile) => sum + Math.max(0, this._suanpai._paishu[tile[0]][+tile[1] || 5]), 0);
      const safe = this.isSafe(p, threats);
      const n = +p[1] || 5;
      const edge = p[0] === 'z' ? 4 : Math.abs(n - 5);
      return { p, distance, safe, edge, score: outs * this.style.outs - this.doraCount(p) * this.style.value };
    });
    const bestDistance = Math.min(...candidates.map(c => c.distance));
    const fold = threats.length > 0 && bestDistance >= this.style.foldAt && candidates.some(c => c.safe);
    candidates.sort((a, b) => (fold ? +b.safe - +a.safe : 0) || a.distance - b.distance || b.score - a.score || b.edge - a.edge || a.p.localeCompare(b.p));
    let choice = candidates[0].p;
    if (!fold && this.allow_lizhi(this.shoupai, choice)) choice += '*';
    return choice;
  }
  advancedDiscard(info) {
    const evaluated = info || [], baseline = super.select_dapai(evaluated);
    const legal = this.get_dapai(this.shoupai), threats = this.threats();
    const distance = p => Majiang.Util.xiangting(this.shoupai.clone().dapai(p));
    if (threats.length) {
      // More patient characters fold earlier, but an attacking character still
      // retains the library's danger checks rather than blindly pushing.
      if (distance(baseline) >= this.style.foldAt) {
        const safe = legal.filter(p => this.isSafe(p, threats));
        if (safe.length) return safe.sort((a,b) => distance(a)-distance(b) || this.doraCount(a)-this.doraCount(b) || a.localeCompare(b))[0];
      }
      return baseline;
    }
    if (!['attacking','value'].includes(this.character.style)) return baseline;
    const base = evaluated.find(c => !c.m && c.p === baseline.slice(0,2));
    if (!(base?.ev > 0)) return baseline;
    const choices = legal.map(p => ({p, record:evaluated.find(c => !c.m && c.p === p.slice(0,2))}))
      .filter(c => c.record?.ev >= base.ev*.9 && distance(c.p) <= distance(baseline));
    const score = c => this.character.style === 'attacking'
      ? c.record.ev * (1 + .035 * (c.record.n_tingpai || 0))
      : c.record.ev * (1 - .1 * Math.min(3,this.doraCount(c.p)));
    choices.sort((a,b) => score(b)-score(a) || a.p.localeCompare(b.p));
    const choice = choices[0]?.p;
    if (!choice || choice.slice(0,2) === baseline.slice(0,2)) return baseline;
    return choice + (this.select_lizhi(choice) && choices[0].record.ev >= 350 ? '*' : '');
  }
  select_fulou(data, info) {
    if (this.style.calls === 'closed') return;
    const evaluated = info || [], baseline = super.select_fulou(data, evaluated);
    const threats = this.threats();
    if (this.style.calls === 'careful') {
      if (threats.length || !baseline) return;
      return !this.shoupai.menqian || Majiang.Util.xiangting(this.shoupai.clone().fulou(baseline)) === 0 ? baseline : undefined;
    }
    const stay = evaluated.find(c => c.m === '')?.ev || 0;
    if (this.style.calls === 'value' && this.shoupai.menqian) {
      const option = evaluated.find(c => c.m === baseline);
      return option?.ev >= Math.max(1500, stay*1.1) ? baseline : undefined;
    }
    if (this.style.calls === 'quick' && !threats.length) {
      // Positive yaku-aware EV prevents speed preferences from opening a
      // no-yaku hand. Calls still come from the core's legal meld candidates.
      const current = Majiang.Util.xiangting(this.shoupai);
      const options = evaluated.filter(c => c.m && c.ev > 0 && c.ev >= stay*.8)
        .map(c => ({...c, distance:Majiang.Util.xiangting(this.shoupai.clone().fulou(c.m))}))
        .filter(c => c.distance < current);
      options.sort((a,b) => a.distance-b.distance || b.ev-a.ev || a.m.localeCompare(b.m));
      if (options.length) return options[0].m;
    }
    return baseline;
  }
  select_gang(info) {
    if (this.character.level !== 'advanced') return;
    return super.select_gang(info);
  }
}
