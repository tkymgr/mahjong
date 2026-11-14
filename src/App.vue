<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import MahjongGame from './components/MahjongGame.vue';
const gameKey=ref(0),portrait=ref(matchMedia('(orientation: portrait)').matches);
const orientation=matchMedia('(orientation: portrait)');let game=null;
function updateOrientation(){portrait.value=orientation.matches;game?.setOrientationBlocked(portrait.value);}
function handleCreated(value){game=value;window.mahjongGame=value;updateOrientation();}
function handleDisposed(value){if(window.mahjongGame===value)delete window.mahjongGame;if(game===value)game=null;}
onMounted(()=>orientation.addEventListener('change',updateOrientation));
onBeforeUnmount(()=>orientation.removeEventListener('change',updateOrientation));
</script>
<template>
 <main class="page">
  <div class="landscape-game" :class="{'orientation-blocked':portrait}" :inert="portrait" :aria-hidden="portrait">
   <MahjongGame :key="gameKey" @created="handleCreated" @disposed="handleDisposed" @retry="gameKey++" />
  </div>
  <section v-if="portrait" id="portrait-gate" class="portrait-gate" role="status" aria-live="polite">
   <svg width="112" height="90" viewBox="0 0 112 90" aria-hidden="true"><rect x="10" y="33" width="84" height="45" rx="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 42v27M85 52v7M39 18c22-16 49-3 53 10m-12-6 13 7 4-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
   <h1>端末を横向きにしてください</h1><p>横向きにするとゲームを表示します。</p>
  </section>
 </main>
</template>
