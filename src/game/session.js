import Majiang from '@kobalab/majiang-core';
import ComputerPlayer from '@kobalab/majiang-ai';
import { selectOpponents } from './characters.js';
import { CharacterPlayer } from './characterPlayer.js';
import { createMatchResult } from './results.js';
import { libraryRules, normalizeRules } from './rules.js';
import { handTiles, meldTiles, tileName } from './tiles.js';

const DELAYS = [1000, 750, 500, 300, 100];
const DEFAULT_NAMES = ['あなた', '対戦相手', '対戦相手', '対戦相手'];

// Lifecycle guards around MIT majiang-core. Pending library callbacks cannot
// advance an abandoned match, including during Vue unmount or restart.
export class ManagedGame extends Majiang.Game {
  constructor(players, callback, rule, active = () => true, names = DEFAULT_NAMES) {
    super(players.map(player => ({ action: (message, reply) => {
      if (active()) player.action(message, reply && (result => { if (active()) reply(result); }));
    } })), callback, rule, '四人麻雀');
    this.active = active;
    this.closed = false;
    this.delays = new Set();
    this.model.player = [...names];
  }
  delay(callback, timeout) {
    if (this.closed) return;
    if (this._sync) return callback();
    const ms = this._dwell === 0 ? 0 : timeout ?? Math.max(500, this._dwell);
    const id = setTimeout(() => { this.delays.delete(id); if (!this.closed && this.active()) callback(); }, ms);
    this.delays.add(id);
  }
  next() { if (!this.closed && this.active()) super.next(); }
  start() {
    if (this.closed || !this.active()) return;
    // Clear pause even if the current dwell timer has not fired yet.
    this._stop = null;
    super.start();
  }
  reply(id, result) { if (!this.closed && this.active()) super.reply(id, result); }
  call_players(...args) { if (!this.closed) super.call_players(...args); }
  notify_players(...args) { if (!this.closed) super.notify_players(...args); }
  dispose() {
    this.closed = true;
    clearTimeout(this._timeout_id);
    this._timeout_id = null;
    for (const id of this.delays) clearTimeout(id);
    this.delays.clear();
    this._stop = () => {};
  }
}

export class HumanPlayer extends ComputerPlayer {
  constructor(session) { super(); this.session = session; }
  ask(kind, data, auto) {
    const callback = this._callback;
    this.session.request({ kind, ...data, auto }, callback);
  }
  automatic(invoke) {
    const callback = this._callback;
    let answer = {};
    this._callback = result => { answer = result || {}; };
    try { invoke(); } finally { this._callback = callback; }
    return answer;
  }
  action_kaiju() { this._callback(); }
  action_qipai() {
    if (this.session.autoPlay) this._callback();
    else this.ask('round', { choices: [{ label: '対局を続ける', reply: {} }] }, () => ({}));
  }
  action_zimo(data, gangzimo) {
    if (this.session.disposed) return;
    if (data.l !== this._menfeng) return this._callback();
    if (this.session.autoPlay) return super.action_zimo(data, gangzimo);
    const canTsumo = this.select_hule(null, gangzimo);
    const discards = this.get_dapai(this.shoupai);
    const gangs = this.get_gang_mianzi(this.shoupai);
    if (this.shoupai.lizhi) {
      const drawn = discards.find(p => p.endsWith('_'));
      if (drawn && !canTsumo && !gangs.length) return this._callback({ dapai: drawn });
      if (drawn && (canTsumo || gangs.length)) {
        const choices = [];
        if (canTsumo) choices.push({ label: 'ツモ', reply: { hule: '-' } });
        for (const m of gangs) choices.push({ label: `カン ${meldTiles(m).map(p => tileName(p.tile)).join(' ')}`, reply: { gang: m } });
        choices.push({ label: canTsumo ? '和了せずツモ切り' : '見送り（ツモ切り）', reply: { dapai: drawn } });
        return this.ask('discard', { choices, discards, riichi: [] }, () => this.automatic(() => super.action_zimo(data, gangzimo)));
      }
    }
    const choices = [];
    if (canTsumo) choices.push({ label: 'ツモ', reply: { hule: '-' } });
    for (const m of gangs) choices.push({ label: `カン ${meldTiles(m).map(p => tileName(p.tile)).join(' ')}`, reply: { gang: m } });
    if (this.allow_pingju(this.shoupai)) choices.push({ label: '九種九牌', reply: { daopai: '-' } });
    const riichi = discards.filter(p => this.allow_lizhi(this.shoupai, p));
    this.ask('discard', { choices, discards, riichi }, () => this.automatic(() => super.action_zimo(data, gangzimo)));
  }
  action_fulou(data) {
    if (data.l !== this._menfeng || /^\w\d{4}/.test(data.m)) return this._callback();
    if (this.session.autoPlay) return super.action_fulou(data);
    this.ask('discard', { choices: [], discards: this.get_dapai(this.shoupai), riichi: [] }, () => this.automatic(() => super.action_fulou(data)));
  }
  action_dapai(data) {
    if (data.l === this._menfeng) return super.action_dapai(data);
    if (this.session.autoPlay) return super.action_dapai(data);
    const choices = [];
    if (this.select_hule(data)) choices.push({ label: 'ロン', reply: { hule: '-' } });
    const direction = ['', '+', '=', '-'][(4 + data.l - this._menfeng) % 4];
    const tile = data.p.slice(0, 2) + direction;
    for (const [label, melds] of [['ポン', this.get_peng_mianzi(this.shoupai, tile)], ['チー', this.get_chi_mianzi(this.shoupai, tile)], ['カン', this.get_gang_mianzi(this.shoupai, tile)]]) {
      for (const m of melds) choices.push({ label: `${label} ${meldTiles(m).map(p => tileName(p.tile)).join(' ')}`, reply: { fulou: m } });
    }
    if (!choices.length) return this._callback();
    choices.push({ label: '見送り', reply: {} });
    this.ask('reaction', { choices }, () => this.automatic(() => super.action_dapai(data)));
  }
  action_gang(data) {
    if (this.session.autoPlay) return super.action_gang(data);
    if (data.l !== this._menfeng && this.select_hule(data, true)) {
      this.ask('reaction', { choices: [{ label: 'ロン', reply: { hule: '-' } }, { label: '見送り', reply: {} }] }, () => this.automatic(() => super.action_gang(data)));
    } else this._callback();
  }
  action_hule() { if (this.session.autoPlay) this._callback(); else this.ask('result', { choices: [{ label: '次へ', reply: {} }] }, () => ({})); }
  action_pingju() { this.action_hule(); }
  action_jieju() { this._callback(); }
}

export class MahjongSession {
  constructor({ rules, preferences, audio, onChange = () => {}, onEvent = () => {} } = {}) {
    this.rules = normalizeRules(rules);
    this.preferences = preferences || { speed: 3, sound: true };
    this.audio = audio;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.scoreHistory = [];
    this.matchResult = null;
    this.completedPaipu = null;
    this.opponents = [];
    this.phase = 'title';
    this.pending = null;
    this.autoPlay = false;
    this.riichiSelecting = false;
    this.revealed = new Set();
    this.revealedHands = new Map();
    this.disposed = false;
    this.speech = null;
  }
  get names() { return ['あなた', ...this.opponents.map(character => character.name)]; }
  name(id) { return this.names[id] || '対戦相手'; }
  get model() { return this.engine?.model; }
  get humanSeat() { return this.model?.player_id.indexOf(0) ?? 0; }
  get humanHand() { return this.model?.shoupai[this.humanSeat]; }
  publish() { if (!this.disposed) this.onChange(this.publicState()); }
  publicState() {
    return { opponents: this.opponents, phase: this.phase, pendingKind: this.pending?.kind || null, choices: this.pending?.choices?.map((c, index) => ({ label: c.label, action: c.label.split(' ')[0], tiles: c.reply.fulou || c.reply.gang ? meldTiles(c.reply.fulou || c.reply.gang).map(p => p.tile) : [], index })) || [],
      riichiAvailable: !!this.pending?.riichi?.length, riichiSelecting: this.riichiSelecting,
      autoPlay: this.autoPlay, humanTurn: this.pending?.kind === 'discard', hand: handTiles(this.humanHand).map(p => p.tile),
      result: this.result || null, matchResult: this.matchResult, scoreHistory: this.scoreHistory, rules: this.rules, speed: this.preferences.speed };
  }
  configure(rules) { if (this.phase === 'title' || this.phase === 'finished') { this.rules = normalizeRules(rules); this.publish(); } }
  start() {
    this.engine?.dispose();
    this.phase = 'playing';
    this.matchResult = null; this.completedPaipu = null; this.paipu = null;
    this.pending = null;
    this.result = null;
    this.revealed.clear(); this.revealedHands.clear();
    this.human = new HumanPlayer(this);
    this.opponents = selectOpponents();
    this.players = [this.human, ...this.opponents.map(character => new CharacterPlayer(character))];
    let engine;
    const active = () => !this.disposed && this.engine === engine;
    engine = new ManagedGame(this.players, paipu => { if (active()) this.completeMatch(paipu) }, libraryRules(this.rules), active, this.names);
    this.engine = engine;
    engine.dwell = DELAYS[this.preferences.speed];
    engine.wait = 0;
    engine.view = {
      kaiju: () => this.publish(), redraw: () => this.handleEvent('qipai'),
      update: message => message ? this.handleEvent(Object.keys(message)[0], Object.values(message)[0]) : this.publish(),
      say: (name, seat) => { this.speech = { name, id: engine.model.player_id[seat], until: Date.now() + 1300 }; this.audio?.play('puyo'); this.publish(); },
      summary: paipu => { if (active()) this.completeMatch(paipu); },
    };
    engine.kaiju();
    this.publish();
  }
  completeMatch(paipu) {
    if (this.disposed || this.completedPaipu === paipu) return;
    this.completedPaipu = paipu; this.paipu = paipu;
    this.matchResult = createMatchResult(paipu, { ...this.rules, opponents: this.opponents, number: this.scoreHistory.length + 1 });
    this.scoreHistory = [...this.scoreHistory, this.matchResult];
    this.result = { type: 'final', title: this.matchResult.title, lines: [] };
    this.pending = null; this.autoPlay = false; this.riichiSelecting = false; this.speech = null;
    this.phase = 'finished'; this.publish();
  }
  handleEvent(type, data) {
    if (this.disposed) return;
    this.lastEvent = { type, data };
    if (type === 'qipai') { this.phase = 'playing'; this.result = null; this.revealed.clear(); this.revealedHands.clear(); this.audio?.play('tumo'); }
    if (['zimo', 'gangzimo'].includes(type)) this.audio?.play('tumo');
    if (type === 'dapai') { this.audio?.play('sute'); if (data.p.endsWith('*')) this.audio?.play('ribo'); }
    if (['fulou', 'gang'].includes(type)) this.audio?.play('naki');
    if (type === 'hule') {
      this.revealed.add(data.l);
      this.revealedHands.set(data.l, Majiang.Shoupai.fromString(data.shoupai));
      const own = this.model.player_id[data.l] === 0;
      this.audio?.play(own ? 'clear' : 'lose');
      const title = `${this.name(this.model.player_id[data.l])}の${data.baojia == null ? 'ツモ' : 'ロン'}和了`;
      const points = data.damanguan ? `${data.damanguan}倍役満` : `${data.fu}符 ${data.fanshu}翻`;
      const indicators = tiles => (tiles || []).map(indicator => ({ indicator, tile: Majiang.Shan.zhenbaopai(indicator) }));
      this.result = {
        type, title, winningTile: this.revealedHands.get(data.l)?._zimo?.slice(0,2), winMethod: data.baojia == null ? 'ツモ' : 'ロン', winnerId: this.model.player_id[data.l], standings: this.model.defen?.map((score,id)=>score+(data.fenpei[this.model.player_id.indexOf(id)] || 0)), points: `${points}  ${data.defen.toLocaleString()}点`,
        yaku: (data.hupai || []).map(yaku => ({ name: yaku.name, value: typeof yaku.fanshu === 'number' ? `${yaku.fanshu}翻` : yaku.fanshu || '' })),
        dora: indicators(this.model.shan?.baopai), uraDora: indicators(data.fubaopai),
        players: data.fenpei.map((delta, seat) => ({ id: this.model.player_id[seat], name: this.name(this.model.player_id[seat]), delta })),
        lines: [`${points}  ${data.defen.toLocaleString()}点`, ...(data.hupai || []).map(yaku => yaku.name), ...data.fenpei.map((delta, seat) => `${this.name(this.model.player_id[seat])} ${delta >= 0 ? '+' : ''}${delta.toLocaleString()}点`)]
      };
      this.phase = 'result';
    }
    if (type === 'pingju') {
      this.revealed.clear();this.revealedHands.clear();
      // End-of-hand disclosure is visual only. The core's declarations and
      // noten payments stay unchanged, including hands omitted from its event.
      this.model.shoupai.forEach((hand,seat)=>{this.revealed.add(seat);this.revealedHands.set(seat,hand.clone());});
      const players=data.fenpei.map((delta,seat)=>({id:this.model.player_id[seat],name:this.name(this.model.player_id[seat]),delta}));
      this.result = { type, standings: this.model.defen?.map((score,id)=>score+(data.fenpei[this.model.player_id.indexOf(id)] || 0)), title: data.name === '荒牌平局' ? '流局' : data.name, players, lines: players.map(player => `${player.name} ${player.delta >= 0 ? '+' : ''}${player.delta.toLocaleString()}点`) };
      this.phase = 'result';
    }
    this.onEvent(type, data);
    this.publish();
  }
  request(data, callback) {
    if (this.disposed) return;
    this.pending = { ...data, callback };
    this.riichiSelecting = false;
    if (data.kind === 'round') this.phase = 'round';
    if (data.choices?.some(c => c.reply.hule)) this.audio?.play('notice');
    this.publish();
  }
  respond(reply = {}) {
    if (!this.pending || this.disposed) return false;
    const callback = this.pending.callback;
    const wasGate = ['round', 'result'].includes(this.pending.kind);
    if (this.pending.kind === 'result') this.audio?.play('tenbo');
    this.pending = null;
    this.riichiSelecting = false;
    if (wasGate) this.phase = 'playing';
    callback(reply);
    this.publish();
    return true;
  }
  choose(index) { const choice = this.pending?.choices[index]; return choice ? this.respond(choice.reply) : false; }
  toggleRiichi() { if (this.pending?.riichi?.length) { this.riichiSelecting = !this.riichiSelecting; this.publish(); } }
  legalDiscards() { return this.pending?.kind === 'discard' ? this.riichiSelecting ? this.pending.riichi : this.pending.discards : []; }
  discard(tile, drawn = false) {
    const legal = this.legalDiscards();
    const choice = drawn && legal.includes(tile + '_') ? tile + '_' : legal.includes(tile) ? tile : legal.includes(tile + '_') ? tile + '_' : null;
    return choice ? this.respond({ dapai: choice + (this.riichiSelecting ? '*' : '') }) : false;
  }
  setAutoPlay(value) {
    this.autoPlay = value;
    if (value && this.pending) this.respond(this.pending.auto());
    this.publish();
  }
  setSpeed(value) { if (Number.isInteger(value) && value >= 0 && value <= 4) { this.preferences.speed = value; if (this.engine) this.engine.dwell = DELAYS[value]; this.publish(); } }
  home() { this.engine?.dispose(); this.engine = null; this.pending = null; this.result = null; this.matchResult = null; this.phase = 'title'; this.opponents = []; this.autoPlay = false; this.revealed.clear(); this.revealedHands.clear(); this.speech = null; this.publish(); }
  dispose() { this.disposed = true; this.engine?.dispose(); this.pending = null; this.onChange = () => {}; this.onEvent = () => {}; }
}
