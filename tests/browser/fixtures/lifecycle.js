import { createApp, h, ref } from 'vue';
import MahjongGame from '../../../src/components/MahjongGame.vue';
import '../../../src/style.css';

// Exercise the real component through Vue's public rendering API.
window.games = [];
createApp({
  setup() {
    const visible = ref(true);
    return () => h('main', [
      h('button', { id: 'toggle', onClick: () => { visible.value = !visible.value; } }, '切り替え'),
      visible.value ? h(MahjongGame, { onCreated: game => window.games.push(game) }) : null
    ]);
  }
}).mount('#app');
