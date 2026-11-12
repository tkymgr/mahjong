<script setup>
import { ref } from 'vue';
import MahjongGame from './components/MahjongGame.vue';
const gameKey = ref(0);
function handleCreated(game) { window.mahjongGame = game; }
function handleDisposed(game) { if (window.mahjongGame === game) delete window.mahjongGame; }
</script>

<template>
  <main class="page">
    <MahjongGame :key="gameKey" @created="handleCreated" @disposed="handleDisposed" @retry="gameKey++" />
  </main>
</template>
