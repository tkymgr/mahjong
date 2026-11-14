<script setup>
import { computed } from 'vue';
import { pwaState as pwa, installPwa, updatePwa } from '../game/pwa.js';
const props=defineProps({phase:String});
const canUpdate=computed(()=>['title','finished'].includes(props.phase));
</script>
<template>
 <section class="pwa-settings" aria-label="アプリのインストールと更新">
  <template v-if="pwa.production && pwa.supported">
   <button v-if="pwa.installable && !pwa.installed" id="install-app" type="button" @click="installPwa">アプリをインストール</button>
   <p v-if="pwa.installed">アプリとして起動しています。</p>
   <p id="offline-status" role="status">{{ pwa.offlineReady ? 'オフラインで利用できます。' : pwa.error ? 'オフライン準備を完了できませんでした。通信環境を確認して再起動してください。' : 'オフラインで遊ぶための準備中です…' }}</p>
   <button v-if="pwa.updateReady" id="update-app" type="button" :disabled="!canUpdate" @click="updatePwa(phase)">新しいバージョンに更新</button>
   <p v-if="pwa.updateReady && !canUpdate">対局終了後、またはタイトルへ戻ってから更新できます。</p>
   <details v-if="!pwa.installed"><summary>ホーム画面に追加する方法</summary><p>iPhone・iPad：Safariの共有メニューから「ホーム画面に追加」を選びます。</p><p>Android・PC：ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。</p><p>初回のオフライン準備には通信が必要です。</p></details>
  </template>
  <p v-else-if="!pwa.production">ホーム画面への追加とオフライン利用は、公開版でご利用いただけます。</p>
  <p v-else>このブラウザーでは、ホーム画面への追加とオフライン利用を使用できません。</p>
 </section>
</template>
