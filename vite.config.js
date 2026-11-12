import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
