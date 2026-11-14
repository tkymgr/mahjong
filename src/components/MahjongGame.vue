<script setup>
import { onMounted, onBeforeUnmount, ref, computed, nextTick } from 'vue';
import { createMahjongGame } from '../game/createMahjongGame.js';
import { DEFAULT_RULES } from '../game/rules.js';
import { loadPreferences } from '../game/preferences.js';
import { CHARACTERS } from '../game/characters.js';
import { tileName } from '../game/tiles.js';
import { faceFile, BOARD_WIDTH, BOARD_HEIGHT } from '../game/model-layout.js';
import thirdPartyNotices from '../../THIRD_PARTY_NOTICES.md?raw';
import ScoreResults from './ScoreResults.vue';
import PwaControls from './PwaControls.vue';
import { version as appVersion } from '../../package.json';

const emit = defineEmits(['created', 'disposed', 'fullscreen-available', 'retry', 'sound-change', 'state-change']);
const frame = ref(null), canvas = ref(null), dialog = ref(null), menuButton = ref(null), loadError = ref(false);
const menuOpen = ref(false), menuTab = ref('general'), fullscreenAvailable = ref(false);
const licenseOpen = ref(false), menuContent = ref(null), licenseButton = ref(null);
let helpScroll = 0;
const sound = ref({ enabled: false, available: false });
const view = ref(null);
const overlayBounds = ref({ left: '0px', top: '0px', width: '100%', height: '100%' });
const initial = loadPreferences(), form = ref({ ...initial.rules });
const state = ref({ phase: 'loading', choices: [], speed: initial.speed, autoPlay: false });
const assetBase = import.meta.env.BASE_URL;
const avatarPreloads = new Map();
function preloadExpressions(opponents) {
  for(const character of opponents || [])for(const path of Object.values(character.expressions || {})){
    if(avatarPreloads.has(path))continue;
    const image=new Image();image.decoding='async';image.src=`${assetBase}${path}`;avatarPreloads.set(path,image);
  }
}
function avatarFallback(event,profile) {
  const image=event.target,fallback=new URL(`${assetBase}${profile.baseAvatar}`,document.baseURI).href;
  if(image.src!==fallback)image.src=fallback;
}
const editable = computed(() => ['title', 'finished'].includes(state.value.phase));
const hasActions = computed(() => ['discard', 'reaction'].includes(state.value.pendingKind) && (state.value.choices.length || state.value.riichiAvailable));
const gate = computed(() => state.value.pendingKind === 'round');
const speechLabels = {zimo:'ツモ',rong:'ロン',lizhi:'立直',chi:'チー',peng:'ポン',gang:'カン'};
const hint = computed(() => state.value.riichiSelecting ? '立直する牌を選んでください。' : state.value.pendingKind === 'discard' ? '手牌を選んで打牌してください。' : state.value.pendingKind === 'reaction' ? '鳴き・ロンを選ぶか、見送ってください。' : '');
let game = null, disposed = false, observer = null, resizeFrame = 0, pausedEngine = null, menuTrigger = null;
const scene = () => game?.session ? game : null;
function fitOverlay() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!frame.value || !canvas.value) return;
    const a = canvas.value.getBoundingClientRect(), b = frame.value.getBoundingClientRect();
    if (a.width && a.height) overlayBounds.value = { left: `${a.left - b.left}px`, top: `${a.top - b.top}px`, width: `${a.width}px`, height: `${a.height}px` };
  });
}
onMounted(() => {
  fullscreenAvailable.value = Boolean(document.fullscreenEnabled && frame.value.requestFullscreen);
  emit('fullscreen-available', fullscreenAvailable.value);
  try {
    game = createMahjongGame({ canvas: canvas.value, parent: frame.value,
      onError: () => { if (!disposed) loadError.value = true; },
      onView: value => { if(!disposed) view.value = value; },
      onSoundChange: value => { if (!disposed) { sound.value = value; emit('sound-change', value); } },
      onState: value => { if (!disposed) { state.value = value; preloadExpressions(value.opponents); emit('state-change', value); } }
    });
    observer = new ResizeObserver(fitOverlay); observer.observe(frame.value); observer.observe(canvas.value);
    fitOverlay(); emit('created', game);
  } catch (error) { loadError.value = true; console.error(error); }
});
onBeforeUnmount(() => {
  disposed = true; avatarPreloads.clear(); observer?.disconnect(); cancelAnimationFrame(resizeFrame);
  emit('sound-change', { enabled: false, available: false });
  if (game) { game.audio?.stopAll(); game.destroy(); emit('disposed', game); game = null; }
});
async function openMenu(event) {
  const current = scene(); if (!current?.session) return;
  menuTrigger = event?.currentTarget || menuButton.value;
  menuOpen.value = true; current.input.enabled = false;
  pausedEngine = current.session.engine;
  if (pausedEngine && !pausedEngine.closed) pausedEngine.stop();
  await nextTick(); dialog.value?.querySelector('button')?.focus();
}
function closeMenu() {
  licenseOpen.value = false; menuOpen.value = false;
  const current = scene();
  if (current) {
    current.input.enabled = true;
    if (pausedEngine && pausedEngine === current.session.engine && !pausedEngine.closed) pausedEngine.start();
  }
  pausedEngine = null; nextTick(() => (menuTrigger?.isConnected ? menuTrigger : menuButton.value)?.focus());
}
async function openTitleMenu(tab,event) { menuTab.value=tab; await openMenu(event); }
async function openTitleLicense(event) { await openTitleMenu('help',event); await openLicense(); }
async function openLicense() {
  helpScroll = menuContent.value?.scrollTop || 0;
  licenseOpen.value = true;
  await nextTick();
  if (menuContent.value) menuContent.value.scrollTop = 0;
  dialog.value?.querySelector('button')?.focus();
}
async function closeLicense() {
  licenseOpen.value = false;
  await nextTick();
  if (menuContent.value) menuContent.value.scrollTop = helpScroll;
  licenseButton.value?.focus({ preventScroll: true });
}
function dismissDialog() { licenseOpen.value ? closeLicense() : closeMenu(); }
function dialogKeys(event) {
  if (event.key === 'Escape') { event.preventDefault(); dismissDialog(); }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.value.querySelectorAll('button,select,input,a[href],summary,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
async function requestFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.value?.requestFullscreen?.(); fitOverlay(); }
  catch { /* Normal view remains usable. */ }
}
async function toggleSound() {
  const current = scene(); if (!current?.audio?.sounds.size) return;
  current.audio.setEnabled(!current.preferences.sound); current.saveSettings();
  if (current.preferences.sound) { await current.audio.unlock(); if (!disposed && current.preferences.sound) current.audio.play('puyo'); }
}
async function toggleMusic() {
  const current=scene();if(!current?.audio)return;
  current.audio.setMusicEnabled(!current.preferences.music);current.saveSettings();await current.audio.unlock();
}
function musicVolume(event) { scene()?.audio.setMusicVolume(+event.target.value/100);scene()?.saveSettings(); }
function applyRules() { scene()?.session.configure(form.value); scene()?.saveSettings(); }
function resetRules() { form.value = { ...DEFAULT_RULES }; applyRules(); }
function speed(event) { scene()?.session.setSpeed(+event.target.value); scene()?.saveSettings(); }
function start() { if (menuOpen.value) closeMenu(); scene()?.audio.unlock(); scene()?.session.start(); }
function home() { scene()?.session.home(); closeMenu(); }
function continueGame() { scene()?.session.choose(0); }
function winningMarker(tile) { return {left:`${tile.x/BOARD_WIDTH*100}%`,top:`${tile.y/BOARD_HEIGHT*100}%`,width:`${tile.w/BOARD_WIDTH*100}%`,height:`${tile.h/BOARD_HEIGHT*100}%`}; }
function miniature(tile) { return { backgroundImage: `url(${assetBase}js/faces/${faceFile(tile)})` }; }
defineExpose({ requestFullscreen, toggleSound });
</script>

<template>
  <section id="game-frame" ref="frame" class="game-frame" aria-label="麻雀の対局画面">
    <div class="table-room" aria-hidden="true"><img :src="`${assetBase}js/salon-room.webp`" alt="" decoding="async" fetchpriority="low"></div>
    <canvas id="canvas" ref="canvas" width="1536" height="720" tabindex="0" :inert="menuOpen"
      aria-label="四人麻雀。手牌をクリックまたはタップして打牌。左右キーで牌を選び、Enterで打牌します。"
    >このゲームを遊ぶにはCanvas対応ブラウザーをご利用ください。</canvas>
    <div v-if="state.phase === 'loading' && !loadError" class="stage-loading" role="status">読み込み中…</div>
    <div class="table-ui" :style="overlayBounds">
      <div class="table-play-controls" :inert="menuOpen">
        <section v-if="state.phase === 'title'" class="title-screen" aria-label="四人麻雀 タイトル画面">
          <img :src="`${assetBase}js/title-salon.webp?v=3d-20261113`" alt="" class="title-art" fetchpriority="high" draggable="false">
          <div class="title-shade" aria-hidden="true"></div>
          <div class="title-content">
            <div class="title-wordmark"><h1>四人麻雀</h1><p lang="en">MAHJONG</p></div>
            <div class="title-actions">
              <button id="start-game" type="button" class="title-start" @click="start">対局開始</button>
              <div class="title-secondary">
                <button id="title-characters" type="button" aria-haspopup="dialog" @click="openTitleMenu('characters',$event)">雀士紹介</button>
                <button id="menu-toggle" ref="menuButton" type="button" aria-label="メニューを開く" aria-haspopup="dialog" :aria-expanded="menuOpen" @click="openTitleMenu('general',$event)">設定</button>
              </div>
              <p class="title-match-info">{{ state.rules?.rounds === 1 ? '東風戦' : '東南戦' }} · {{ state.rules?.startPoints?.toLocaleString() }}点開始</p>
            </div>
          </div>
          <button id="title-license" type="button" class="title-license" aria-haspopup="dialog" @click="openTitleLicense">素材・ライセンス</button>
          <p class="title-version">バージョン {{ appVersion }}</p>
        </section>
        <template v-if="state.phase !== 'title' && state.phase !== 'loading' && view">
          <section v-for="profile in view.profiles" :key="profile.id" class="seat-profile" :class="`seat-${profile.player}`" :data-character="profile.id" :data-mood="profile.mood" :aria-label="profile.name">
            <img :src="`${assetBase}${profile.avatar}`" :alt="`${profile.name}のアバター：${profile.moodLabel}`" @error="avatarFallback($event,profile)"><strong>{{ profile.name }}</strong><em v-if="profile.riichi">立直</em>
          </section>
          <div v-if="view.winningTile && state.phase === 'result'" class="winning-tile-marker" :class="{'label-below':view.winningTile.player === 2}" :style="winningMarker(view.winningTile)" aria-hidden="true"><span>和了牌</span></div>
          <section v-if="view.station" class="sr-only" aria-label="全自動卓の点数表示"><p>{{ view.station.round }} {{ view.station.honba }}本場 供託{{ view.station.deposits }}本 残り{{ view.station.remaining }}枚</p><p v-for="player in view.station.players" :key="player.id">{{ player.name }} {{ player.wind }} {{ player.points.toLocaleString() }}点</p></section>
        </template>
        <section v-if="state.phase === 'round' && view" id="round-prompt" class="round-prompt" role="status"><h2>{{ view.round }} {{ view.honba }}本場</h2><p>画面を押して配牌を確認</p></section>
        <button v-if="gate" class="continue-overlay" type="button" :data-choice="0" aria-label="対局を続ける" @click="continueGame"><span class="sr-only">対局を続ける</span></button>
        <section v-if="state.phase === 'result' && state.result?.type === 'pingju'" class="draw-summary" role="region" aria-labelledby="hand-result-title">
          <h2 id="hand-result-title">{{ state.result.title }}</h2>
          <ul class="draw-point-changes"><li v-for="player in state.result.players" :key="player.id" :data-player="player.id"><span>{{ player.name }}</span><strong :class="{ positive: player.delta > 0, negative: player.delta < 0 }">{{ player.delta >= 0 ? '+' : '' }}{{ player.delta.toLocaleString() }}点</strong></li></ul>
          <button id="continue-result" type="button" :data-choice="0" :disabled="state.pendingKind !== 'result'" @click="continueGame">次へ</button>
        </section>
        <div v-else-if="state.phase === 'result' && state.result" class="hand-result-backdrop" :class="`winner-${state.result.winnerId ?? 0}`" @click.self="continueGame">
          <section class="hand-result" role="region" aria-labelledby="hand-result-title">
            <header class="win-heading"><div><h2 id="hand-result-title">{{ state.result.title }}</h2><p class="win-points">{{ state.result.points }}</p></div><div v-if="state.result.winningTile" class="win-tile-detail"><span>和了牌（{{ state.result.winMethod }}）</span><img :src="`${assetBase}js/faces/${faceFile(state.result.winningTile)}`" :alt="`和了牌：${tileName(state.result.winningTile)}`"></div></header>
            <div class="win-details">
              <ul class="win-yaku" aria-label="役一覧"><li v-for="(yaku, index) in state.result.yaku" :key="index"><span>{{ yaku.name }}</span><strong>{{ yaku.value }}</strong></li></ul>
              <div class="win-dora">
                <section v-for="group in [{label:'ドラ', pairs:state.result.dora}, {label:'裏ドラ', pairs:state.result.uraDora}]" :key="group.label" :aria-label="group.label" class="dora-group">
                  <h3>{{ group.label }} <small v-if="group.pairs.length">表示牌 → ドラ</small></h3>
                  <div v-if="group.pairs.length" class="dora-pairs"><span v-for="(pair,index) in group.pairs" :key="index" class="dora-pair"><img :src="`${assetBase}js/faces/${faceFile(pair.indicator)}`" :alt="`${group.label}表示牌：${tileName(pair.indicator)}`"><span aria-hidden="true">→</span><img :src="`${assetBase}js/faces/${faceFile(pair.tile)}`" :alt="`${group.label}：${tileName(pair.tile)}`"></span></div>
                  <p v-else class="no-dora">{{ group.label === '裏ドラ' ? '公開なし' : 'なし' }}</p>
                </section>
              </div>
            </div>
            <footer><ul class="win-changes"><li v-for="player in state.result.players" :key="player.id"><span>{{ player.name }}</span><strong :class="{positive:player.delta>0,negative:player.delta<0}">{{ player.delta >= 0 ? '+' : '' }}{{ player.delta.toLocaleString() }}点</strong></li></ul><button id="continue-result" type="button" :data-choice="0" :disabled="state.pendingKind !== 'result'" @click="continueGame">次へ</button></footer>
          </section>
        </div>
        <div v-if="view?.speech && !['round','result','finished'].includes(state.phase)" class="seat-speech" :class="`speech-${view.speech.id}`" role="status">{{ speechLabels[view.speech.name] || view.speech.name }}</div>
        <section v-if="hasActions" class="table-actions" :class="{ 'reaction-actions': state.pendingKind === 'reaction' }" aria-label="鳴き・和了・立直の操作">
          <button v-for="choice in state.choices" :key="choice.index" type="button" :data-choice="choice.index" :aria-label="choice.label" :title="choice.label" @click="scene()?.session.choose(choice.index)">
            <span>{{ choice.action }}</span><span v-if="choice.tiles?.length" class="meld-preview" aria-hidden="true"><i v-for="(tile, i) in choice.tiles" :key="i" class="mini-tile" :style="miniature(tile)"></i></span>
          </button>
          <button v-if="state.riichiAvailable" id="riichi" type="button" :aria-pressed="state.riichiSelecting" @click="scene()?.session.toggleRiichi()">{{ state.riichiSelecting ? '立直を取り消す' : '立直' }}</button>
        </section>
        <section v-if="state.phase === 'finished' && state.matchResult" class="match-scoreboard" role="region" aria-labelledby="final-score-title">
          <header class="score-heading"><h2 id="final-score-title">{{ state.matchResult.title }}</h2></header>
          <div class="score-content"><ScoreResults :records="state.scoreHistory" /></div>
          <footer class="score-footer"><button id="score-home" type="button" @click="scene()?.session.home()">タイトルへ</button><button id="score-restart" type="button" @click="start">もう一度対局</button></footer>
        </section>
        <p class="sr-only" aria-live="polite">{{ hint }}</p>
      </div>
      <button v-if="!['loading','title'].includes(state.phase) && !menuOpen" id="menu-toggle" ref="menuButton" class="menu-toggle" type="button" aria-label="メニューを開く" aria-haspopup="dialog" :aria-expanded="menuOpen" @click="openMenu"><img :src="`${assetBase}icons/settings-gear.svg`" alt="" aria-hidden="true" draggable="false"></button>
      <div v-if="menuOpen" class="menu-backdrop" @click.self="dismissDialog">
        <section ref="dialog" class="table-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" @keydown="dialogKeys">
          <header class="menu-heading"><h2 id="menu-title">{{ licenseOpen ? '素材・ライセンス' : 'メニュー' }}</h2><button id="menu-close" class="dialog-close" type="button" :aria-label="licenseOpen ? 'ライセンスを閉じる' : 'メニューを閉じる'" @click="dismissDialog"><img :src="`${assetBase}icons/close.svg`" alt="" aria-hidden="true" draggable="false"></button></header>
          <nav v-if="!licenseOpen" class="menu-tabs" aria-label="メニューの項目"><button v-for="tab in [['general','設定'], ['rules','対局ルール'], ['help','遊び方'], ['characters','雀士']]" :key="tab[0]" type="button" :data-menu-tab="tab[0]" :aria-pressed="menuTab === tab[0]" @click="menuTab = tab[0]">{{ tab[1] }}</button></nav>
          <div ref="menuContent" class="menu-content">
            <section v-if="licenseOpen" class="license-view">
              <button id="license-back" type="button" @click="closeLicense">メニューへ戻る</button>
              <pre class="license-text" lang="en" tabindex="0" aria-label="Third-party notices and asset credits">{{ thirdPartyNotices }}</pre>
            </section>
            <template v-else>
            <section v-show="menuTab === 'general'" class="general-settings">
              <button id="sound-toggle" type="button" :disabled="!sound.available" :aria-pressed="sound.enabled" @click="toggleSound">効果音 {{ sound.enabled ? 'ON' : 'OFF' }}</button>
              <button id="music-toggle" type="button" :disabled="!sound.musicAvailable" :aria-pressed="sound.musicEnabled" @click="toggleMusic">BGM {{ sound.musicEnabled ? 'ON' : 'OFF' }}</button>
              <label class="music-volume">BGM音量 <input id="music-volume" type="range" min="0" max="100" step="1" :value="Math.round((sound.musicVolume ?? .25)*100)" @input="musicVolume"><output>{{ Math.round((sound.musicVolume ?? .25)*100) }}%</output></label>
              <label>打牌速度 <select id="speed" :value="state.speed" @change="speed"><option v-for="(label, i) in ['ゆっくり', '遅め', '標準', '速め', '最速']" :key="i" :value="i">{{ label }}</option></select></label>
              <button v-if="!['title', 'finished'].includes(state.phase)" id="auto-play" type="button" :aria-pressed="state.autoPlay" @click="scene()?.session.setAutoPlay(!state.autoPlay)">おまかせ {{ state.autoPlay ? 'ON' : 'OFF' }}</button>
              <button v-if="fullscreenAvailable" id="fullscreen" type="button" @click="requestFullscreen">全画面表示を切り替える</button>
              <button v-if="state.phase !== 'title'" id="return-title" type="button" @click="home">タイトルへ（対局終了）</button>
              <button id="score-history" type="button" :disabled="!state.scoreHistory?.length" @click="menuTab = 'scores'">スコア・履歴</button>
              <PwaControls :phase="state.phase" />
              <p>設定は自動で保存されます。メニューを閉じると対局を再開します。</p>
            </section>
            <section v-if="menuTab === 'scores'" class="score-menu-view"><ScoreResults :records="state.scoreHistory" /></section>
            <section v-show="menuTab === 'rules'"><details class="rules-panel" open>
    <summary>対局設定（次の対局から適用）</summary>
    <fieldset :disabled="!editable">
      <div class="rule-grid">
        <label>対局形式 <select id="rule-rounds" v-model.number="form.rounds" @change="applyRules"><option :value="1">東風戦</option><option :value="2">東南戦</option></select></label>
        <label>開始点 <select id="rule-points" v-model.number="form.startPoints" @change="applyRules"><option :value="25000">25,000点</option><option :value="30000">30,000点</option></select></label>
        <label>同時和了 <select id="rule-ron" v-model.number="form.ron" @change="applyRules"><option :value="1">頭ハネ</option><option :value="2">ダブロン</option><option :value="3">トリロン</option></select></label>
        <label>連荘 <select id="rule-renchan" v-model.number="form.renchan" @change="applyRules"><option :value="0">連荘なし</option><option :value="1">和了連荘</option><option :value="2">テンパイ連荘</option><option :value="3">ノーテン連荘</option></select></label>
        <label><input id="rule-red" v-model="form.redDora" type="checkbox" @change="applyRules">赤牌各1枚</label>
        <label><input id="rule-tanyao" v-model="form.openTanyao" type="checkbox" @change="applyRules">喰いタン</label>
        <label><input id="rule-kiriage" v-model="form.kiriage" type="checkbox" @change="applyRules">切り上げ満貫</label>
        <label><input id="rule-nagashi" v-model="form.nagashi" type="checkbox" @change="applyRules">流し満貫</label>
        <label><input id="rule-extension" v-model="form.extension" type="checkbox" @change="applyRules">30,000点未満なら延長戦</label>
      </div>
      <button type="button" @click="resetRules">初期設定に戻す</button>
    </fieldset>
    <p>対局中は変更できません。途中流局・一発・裏ドラ・カンドラ・オーラス止めあり、喰い替えあり、パオなし。返し点30,000点、ウマ20–10です。</p>
  </details></section>
            <section v-show="menuTab === 'help'" class="menu-help">
              <h3>遊び方</h3>
              <ol><li>「対局開始」で対局。東風戦・東南戦は対局ルールで選べます。</li><li>手牌をクリック／タップして打牌。左右キーとEnterでも選べます。</li><li>ポン・チー・ロンなどは、手牌の上に表示されるボタンで選びます。チーなどの牌の組み合わせは小さな牌画像で確認できます。</li><li>立直を押したら、立直可能な手牌を選んでください。鳴かないときは「見送り」を押します。</li><li>立直後は通常のツモを自動で切ります。ツモ和了・ロン・暗槓はボタンで確認し、暗槓しないときは「見送り（ツモ切り）」を選びます。おまかせONでは和了やカンもCPUに任せます。</li><li>局名・和了の表示は画面を押して続行します。流局・九種九牌などは全員の手牌を公開し、結果帯の「次へ」で進みます。</li></ol>
              <p>スマートフォンでは横向きにすると牌が見やすくなります。対局途中の状態は保存されません。</p>
              <button id="license-notices" ref="licenseButton" type="button" aria-haspopup="dialog" @click="openLicense">素材・ライセンス</button>
            </section>
            <section v-show="menuTab === 'characters'"><details class="character-guide" open>
    <summary>登場する雀士（9名）</summary>
    <p>対局ごとに9名から3名が重複なしで選ばれます。対局中は同じメンバーです。</p>
    <div class="character-roster">
      <article v-for="character in CHARACTERS" :key="character.id" class="opponent-card" :style="{ '--character-color': character.color }">
        <img :src="`${assetBase}${character.avatar}`" :alt="`${character.name}のアバター`" width="64" height="64" loading="lazy">
        <div><strong>{{ character.name }}</strong><small>{{ character.tagline }}</small></div>
      </article>
    </div>
    <p>対戦相手の顔とニックネームは卓上に表示されます。雀士ごとの打ち筋も楽しみながら対局してください。</p>
  </details></section>
            </template>
          </div>
        </section>
      </div>
    </div>
    <div id="load-error" class="load-error" role="alert" :hidden="!loadError"><strong>ゲームを読み込めませんでした。</strong><p>ファイルや通信環境を確認して、もう一度お試しください。</p><button id="retry" type="button" @click="emit('retry')">再読み込み</button></div>
  </section>
</template>
