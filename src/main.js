import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { registerPwa } from './game/pwa.js';

registerPwa();

createApp(App).mount('#app');
