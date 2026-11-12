<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { aggregateResults, signedScore, signedPoints } from '../game/results.js';
const props = defineProps({ records: { type: Array, default: () => [] } });
const selected = ref(Math.max(0, props.records.length - 1)), tab = ref('final');
const record = computed(() => props.records[selected.value] || props.records.at(-1));
const ranking = computed(() => [...(record.value?.players || [])].sort((a, b) => a.rank - b.rank));
const totals = computed(() => aggregateResults(props.records));
const assetBase = import.meta.env.BASE_URL;
const view = ref(null), historyScroll = ref(null), denseHistory = ref(false);
const canScrollUp = ref(false), canScrollDown = ref(false), horizontalScroll = ref(false);
const bustPlayers = computed(() => record.value?.players.filter(player => player.points < 0) || []);
const historySummary = computed(() => {
  const hands = record.value?.history || [], first = hands[0], last = hands.at(-1);
  if (!first) return '記録された局はありません';
  return bustPlayers.value.length ? `全${hands.length}局 · ${last.round}でトビ終了` : `全${hands.length}局（${first.round}〜${last.round}）`;
});
const scrollHint = computed(() => canScrollDown.value ? '↓ 下に続きがあります。' : canScrollUp.value ? '最後の局まで表示しています。' : '全局分を表示しています。');
function updateHistoryScroll() {
  const element = historyScroll.value;
  if (!element) return;
  canScrollUp.value = element.scrollTop > 1;
  canScrollDown.value = element.scrollHeight - element.clientHeight - element.scrollTop > 2;
  horizontalScroll.value = element.scrollWidth - element.clientWidth > 2;
}
function scrollHistory(end) {
  const element = historyScroll.value;
  if (!element) return;
  element.scrollTop = end ? element.scrollHeight : 0;
  updateHistoryScroll();
}
let observer;
onMounted(() => {
  const board = view.value.closest('.table-ui');
  if (!board) return;
  const resize = () => { denseHistory.value = board.clientHeight <= 450; nextTick(updateHistoryScroll); };
  resize(); observer = new ResizeObserver(resize); observer.observe(board);
  if (historyScroll.value) observer.observe(historyScroll.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(historyScroll, (element, previous) => {
  if (previous) observer?.unobserve(previous);
  if (element) observer?.observe(element);
  nextTick(updateHistoryScroll);
});
watch([tab, selected], () => nextTick(() => { scrollHistory(false); updateHistoryScroll(); }));
watch(() => props.records.length, () => { selected.value = Math.max(0, props.records.length - 1); tab.value = 'final'; });
</script>

<template>
  <section ref="view" class="score-view" :class="{ 'hands-view': tab === 'hands', 'dense-history': denseHistory }" aria-label="スコアと対局履歴">
    <nav class="score-tabs" aria-label="スコアの表示切り替え">
      <button v-for="item in [['final','最終結果'],['hands','一局の履歴'],['totals','集計表']]" :key="item[0]" type="button" :data-score-tab="item[0]" :aria-pressed="tab === item[0]" @click="tab = item[0]">{{ item[1] }}</button>
    </nav>
    <p v-if="!record">終了した対局はまだありません。</p>
    <template v-else>
      <label v-if="records.length > 1 && tab !== 'totals'" class="score-select">対局 <select v-model.number="selected" aria-label="表示する対局"><option v-for="(item, index) in records" :key="item.number" :value="index">第{{ item.number }}対局（{{ item.format }}）</option></select></label>
      <section v-if="tab === 'final'" class="score-final">
        <p class="score-description">第{{ record.number }}対局 · {{ record.format }} · 最終スコア</p>
        <div class="score-table-wrap">
          <table class="score-ranking">
            <thead><tr><th scope="col">順位</th><th scope="col">雀士</th><th scope="col">持ち点</th><th scope="col">スコア</th></tr></thead>
            <tbody><tr v-for="player in ranking" :key="player.id" :data-player="player.id" :class="{ 'your-score': player.id === 0 }">
              <td>{{ player.rank }}位</td><th scope="row"><span class="score-player"><img v-if="player.avatar" :src="`${assetBase}${player.avatar}`" alt="" width="28" height="28">{{ player.name }}</span></th>
              <td>{{ player.points.toLocaleString() }}点</td><td :class="{ positive: player.score > 0, negative: player.score < 0 }">{{ signedScore(player.score) }} pt</td>
            </tr></tbody>
          </table>
        </div>
        <p class="score-note">スコアには返し点・順位点を反映しています。</p>
      </section>
      <section v-else-if="tab === 'hands'" class="score-history" :data-history-count="record.history.length">
        <header class="history-toolbar">
          <p class="history-summary" :title="bustPlayers.map(player => `${player.name} ${player.points.toLocaleString()}点`).join('・')">{{ historySummary }}</p>
          <div class="history-jump-buttons">
            <button type="button" :disabled="!canScrollUp" aria-label="履歴の先頭へ" @click="scrollHistory(false)">先頭へ</button>
            <button type="button" :disabled="!canScrollDown" aria-label="最後の局の履歴へ" @click="scrollHistory(true)">最後へ</button>
          </div>
        </header>
        <div ref="historyScroll" class="score-table-wrap history-scroll" role="region" aria-label="全局の点数履歴。上下にスクロールできます" tabindex="0" @scroll="updateHistoryScroll">
          <table class="score-hands">
            <thead><tr><th scope="col">局・本場</th><th scope="col">結果</th><th v-for="player in record.players" :key="player.id" scope="col">{{ player.name }}</th></tr></thead>
            <tbody><tr v-for="hand in record.history" :key="hand.number" :data-hand-number="hand.number"><th scope="row">{{ hand.round }}<small>{{ hand.honba }}本場</small></th><td>{{ hand.result }}<small>{{ hand.winners.join('・') }}</small></td><td v-for="(delta, id) in hand.changes" :key="id" :class="{ positive: delta > 0, negative: delta < 0 }">{{ signedPoints(delta) }}</td></tr></tbody>
          </table>
        </div>
        <p class="history-scroll-hint" aria-live="polite">{{ scrollHint }}<span v-if="horizontalScroll"> 横にもスクロールできます。</span></p>
        <p class="history-footnote">増減には立直・残った供託の精算を含みます。</p>
      </section>
      <section v-else>
        <h3 class="score-subheading">対局別スコア</h3>
        <div class="score-table-wrap">
          <table class="score-matches"><thead><tr><th scope="col">対局</th><th scope="col">あなた</th><th scope="col">右家</th><th scope="col">対面</th><th scope="col">左家</th></tr></thead><tbody><tr v-for="match in records" :key="match.number"><th scope="row">第{{ match.number }}対局<small>{{ match.format }}</small></th><td v-for="player in match.players" :key="player.id" :class="{ positive: player.score > 0, negative: player.score < 0 }"><small v-if="player.id !== 0">{{ player.name }}</small>{{ signedScore(player.score) }} pt</td></tr></tbody></table>
        </div>
        <h3 class="score-subheading">雀士別の合計</h3>
        <div class="score-table-wrap">
          <table class="score-totals"><thead><tr><th scope="col">雀士</th><th scope="col">対局数</th><th scope="col">合計スコア</th><th scope="col">平均順位</th></tr></thead><tbody><tr v-for="player in totals" :key="player.identity" :class="{ 'your-score': player.identity === 'you' }"><th scope="row">{{ player.name }}</th><td>{{ player.games }}</td><td :class="{ positive: player.score > 0, negative: player.score < 0 }">{{ signedScore(player.score) }} pt</td><td>{{ player.averageRank.toFixed(2) }}</td></tr></tbody></table>
        </div>
        <p class="score-note">対戦相手は対局ごとに変わるため、累計は雀士ごとに集計します。このページで終了した対局が対象です。再読み込みで集計はリセットされます。</p>
      </section>
    </template>
  </section>
</template>
