import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { pwaBuild } from './scripts/pwa-build.mjs';

export default defineConfig({
  plugins: [vue(),pwaBuild()],
  // dist can also be hosted below a path such as /mahjong/.
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'playcanvas', test: /node_modules[\\/]playcanvas[\\/]/ }] }
      }
    }
  }
});
